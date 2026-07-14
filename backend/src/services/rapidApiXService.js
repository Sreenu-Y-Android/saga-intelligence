const axios = require('axios');

const getRapidApiHeaders = () => {
    const apiKey = process.env.RAPIDAPI_KEY;
    const apiHost = process.env.RAPIDAPI_HOST;

    if (!apiKey || !apiHost) {
        throw new Error('RAPIDAPI_KEY or RAPIDAPI_HOST is not configured');
    }

    return {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': apiHost
    };
};


const rapidRequestX = async (config, retryCount = 0) => {
    const maxRetries = 2; // Allow up to 2 retries (3 attempts total)
    const baseDelay = 5000; // 5 seconds base delay for 429s

    // Prioritize dedicated Twitter/X project keys if they exist in env
    let apiKey = (process.env.RAPIDAPI_TWITTER_KEY || process.env.RAPIDAPI_X_KEY || process.env.RAPIDAPI_KEY || '').trim();
    let apiHost = (process.env.RAPIDAPI_TWITTER_HOST || process.env.RAPIDAPI_X_HOST || process.env.RAPIDAPI_HOST || 'twitter241.p.rapidapi.com').trim();

    // ROTATION LOGIC: If first attempt failed, or explicitly forced
    if ((retryCount > 0 || config.forceSecondary) && process.env.GOOGLE_AI_MODE_RAPIDAPI_KEY) {
        if (config.forceSecondary && retryCount === 0) {
            console.warn(`[RapidAPI] 🔄 FORCED secondary key (GOOGLE_AI_MODE_RAPIDAPI_KEY)...`);
        } else {
            console.warn(`[RapidAPI] 🔄 (Attempt ${retryCount + 1}) Rotating to secondary key (GOOGLE_AI_MODE_RAPIDAPI_KEY)...`);
        }
        apiKey = (process.env.GOOGLE_AI_MODE_RAPIDAPI_KEY || '').trim();
    }

    // FAILSAFE: Only block if it's explicitly known to be wrong and we have a better fallback
    // (User's snippet shows they are using a key starting with 41d35abfb for X, so we MUST allow it)


    // DEBUG: Log credentials to identify 403 cause
    console.log(`[RapidAPI DEBUG] Key: ${apiKey.substring(0, 10)}... Host: ${apiHost}`);

    try {
        const response = await axios({
            ...config,
            headers: {
                ...config.headers,
                'x-rapidapi-key': apiKey,
                'x-rapidapi-host': apiHost
            },
            timeout: 30000 // 30s timeout
        });
        return response;
    } catch (error) {
        const status = error.response?.status;
        const msg = String(error.response?.data?.message || error.response?.data?.error || error.message || '').toLowerCase();

        // 429 (Rate Limit) - Always retry with backoff. Jittered so that
        // concurrent callers sharing this key (grievance fetch, X monitor,
        // engager analysis) don't all retry on the exact same tick and
        // re-trip the per-second cap together.
        if (status === 429 && retryCount < maxRetries) {
            const delay = baseDelay * (retryCount + 1) + Math.floor(Math.random() * 2000);
            console.warn(`[RapidAPI] ⏳ Rate limited (429). Retrying in ${(delay / 1000).toFixed(1)}s... (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, delay));
            return rapidRequestX(config, retryCount + 1);
        }

        if (status !== 200) {
            console.error(`[RapidAPI] ❌ Request failed (${status}): ${msg}. Response Body:`, JSON.stringify(error.response?.data || 'No body'));
        }

        throw error;
    }
};

const userIdCache = new Map();

const pickBestVideoVariant = (variants = []) => {
    if (!Array.isArray(variants) || variants.length === 0) return null;

    // Prefer HLS, then highest bitrate MP4
    let bestVariant = variants.find(v => v.content_type === 'application/x-mpegURL');
    if (!bestVariant) {
        bestVariant = variants
            .filter(v => v.content_type === 'video/mp4')
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    }
    return bestVariant || null;
};

const getMediaUrlCandidates = (media) => {
    const primary = media?.media_url_https || media?.media_url || media?.url || media?.image_url || media?.image?.url;
    const preview = media?.media_url_https || media?.media_url || media?.preview_image_url || media?.thumbnail_url || media?.image_url || media?.image?.url || primary;
    return { primary, preview };
};

const normalizeMediaItem = (media) => {
    if (!media) return null;

    let type = media.type || media.media_type || 'photo';
    const { primary, preview } = getMediaUrlCandidates(media);
    let url = primary;

    if (!type && media.video_info) type = 'video';

    if (media.type === 'video' || media.type === 'animated_gif' || type === 'video' || type === 'animated_gif') {
        type = media.type || type;

        const variant = pickBestVideoVariant(media.video_info?.variants || []);
        if (variant?.url) {
            url = variant.url;
        } else if (media.video_url) {
            url = media.video_url;
        } else if (media.player_stream_url) {
            url = media.player_stream_url;
        } else if (media.url && media.url !== primary) {
            url = media.url;
        }
    }

    if (!url) return null;

    return { type, url, preview: preview || url };
};

const fetchUserProfile = async (handle) => {
    try {
        const cleanHandle = handle.replace('@', '').trim();
        console.log(`[RapidAPI] Fetching profile for ${cleanHandle}...`);

        const userResponse = await rapidRequestX({
            method: 'get',
            url: `https://${process.env.RAPIDAPI_HOST}/user`,
            params: { username: cleanHandle }
        });

        if (userResponse.data?.errors || userResponse.data?.error) {
            throw new Error(`RapidAPI Error: ${JSON.stringify(userResponse.data.errors || userResponse.data.error)}`);
        }

        let result = null;
        if (userResponse.data?.result?.data?.user?.result) {
            result = userResponse.data.result.data.user.result;
        } else if (userResponse.data?.data?.user?.result) {
            result = userResponse.data.data.user.result;
        } else if (userResponse.data?.result) {
            result = userResponse.data.result;
        }

        if (!result) return null;

        const userId = result.rest_id;
        const freshVerified = result.is_blue_verified || result.legacy?.verified || false;
        const freshImage = result.avatar?.image_url ||
            result.legacy?.profile_image_url_https ||
            result.profile_image_url_https;

        // Update cache
        if (userId) userIdCache.set(cleanHandle, userId);
        userIdCache.set(cleanHandle + '_meta', { isVerified: freshVerified, profileImageUrl: freshImage });

        return {
            id: userId,
            isVerified: freshVerified,
            profileImageUrl: freshImage,
            name: result.legacy?.name,
            screenName: result.legacy?.screen_name
        };
    } catch (error) {
        console.warn(`[RapidAPI] Profile fetch failed for ${handle}:`, error.message);
        return null;
    }
};

const fetchUserTweets = async (handle, limit = 20) => {
    try {
        const cleanHandle = handle.replace('@', '').trim();
        console.log(`[RapidAPI] Fetching tweets for ${cleanHandle}...`);

        let userId = userIdCache.get(cleanHandle);

        if (!userId) {
            const userResponse = await rapidRequestX({
                method: 'get',
                url: `https://${process.env.RAPIDAPI_HOST}/user`,
                params: { username: cleanHandle }
            });

            if (userResponse.data?.errors || userResponse.data?.error) {
                const errMsg = JSON.stringify(userResponse.data.errors || userResponse.data.error);
                console.warn(`[RapidAPI] API returned errors for ${cleanHandle}: ${errMsg}`);
                // return null instead of throwing to allow other sources to proceed
                return null;
            }

            let result = null;

            if (userResponse.data?.result?.data?.user?.result) {
                result = userResponse.data.result.data.user.result;
            } else if (userResponse.data?.result?.data?.userResult?.result) {
                result = userResponse.data.result.data.userResult.result;
            } else if (userResponse.data?.data?.user?.result) {
                result = userResponse.data.data.user.result;
            } else if (userResponse.data?.result?.rest_id) {
                result = userResponse.data.result;
            } else if (userResponse.data?.user?.result) {
                result = userResponse.data.user.result;
            } else if (userResponse.data?.rest_id) {
                result = userResponse.data;
            } else {
                console.warn(`[RapidAPI] User structure mismatch for ${cleanHandle}. Response:`, JSON.stringify(userResponse.data).substring(0, 500));
            }

            if (!result || !result.rest_id) {
                console.warn(`[RapidAPI] User identification failed for: ${handle}`);
                return [];
            }

            userId = result.rest_id;
            userIdCache.set(cleanHandle, userId);

            const freshVerified = result.is_blue_verified || result.legacy?.verified || false;
            const freshImage = result.avatar?.image_url ||
                result.legacy?.profile_image_url_https ||
                result.profile_image_url_https;
            userIdCache.set(cleanHandle + '_meta', { isVerified: freshVerified, profileImageUrl: freshImage });
        }

        const tweetsResponse = await rapidRequestX({
            method: 'get',
            url: `https://${process.env.RAPIDAPI_HOST}/user-tweets`,
            params: { user: userId, count: limit }
        });

        const timelineEntries = tweetsResponse.data.result.timeline.instructions
            .find(i => i.type === 'TimelineAddEntries')?.entries || [];

        // Initialize with cached metadata
        const cachedMeta = userIdCache.get(cleanHandle + '_meta');
        let isVerified = cachedMeta?.isVerified || false;
        let profileImageUrl = cachedMeta?.profileImageUrl || null;

        const tweets = [];
        for (const entry of timelineEntries) {
            const rawTweet = entry.content?.itemContent?.tweet_results?.result;
            const normalized = normalizeTweet(rawTweet, cleanHandle);
            if (normalized) {
                tweets.push(normalized);
                // Backup metadata extraction
                if (!profileImageUrl && normalized.author_avatar) profileImageUrl = normalized.author_avatar;
                if (normalized.verified !== undefined) isVerified = normalized.verified;
            }
        }

        console.log(`[RapidAPI] Fetched ${timelineEntries.length} entries, processed ${tweets.length} tweets for @${cleanHandle}`);

        return {
            tweets,
            userData: { isVerified, profileImageUrl }
        };


    } catch (error) {
        console.error(`[RapidAPI] Error fetching tweets for ${handle}:`, error.message);
        return { tweets: [], userData: {} }; // Return empty structure on error matches return type
    }
};

const searchUsers = async (query) => {
    try {
        console.log(`[RapidAPI] Searching users for: ${query}`);
        const cleanQuery = query.replace('@', '').trim();

        const extractUsersFromEntries = (entries) => {
            const users = [];
            for (const entry of entries) {
                const userResult = entry?.content?.itemContent?.user_results?.result ||
                    entry?.content?.itemContent?.userDisplayType?.user_results?.result ||
                    entry?.content?.itemContent?.user_result?.result;

                if (!userResult) continue;
                const legacy = userResult.legacy || {};
                const core = userResult.core || {};
                // API now puts name/screen_name in core, not legacy
                const screenName = core.screen_name || legacy.screen_name || '';
                if (!screenName) continue;

                users.push({
                    id: userResult.rest_id,
                    name: core.name || legacy.name || cleanQuery,
                    screen_name: screenName,
                    description: userResult.profile_bio?.description || legacy.description || '',
                    profile_image_url: userResult.avatar?.image_url || legacy.profile_image_url_https || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
                    followers_count: legacy.followers_count || 0,
                    friends_count: legacy.friends_count || 0,
                    verified: userResult.is_blue_verified || userResult.verification?.verified || legacy.verified || false,
                    platform: 'x'
                });
            }
            return users;
        };

        // Use type: 'People' (the API requires this, not section: 'people')
        try {
            const searchResponse = await rapidRequestX({
                method: 'get',
                url: `https://${process.env.RAPIDAPI_HOST}/search`,
                params: {
                    query: cleanQuery,
                    type: 'People',
                    count: 30
                }
            });

            // Parse search results - handle multiple response structures
            const instructions = searchResponse.data?.result?.timeline?.instructions ||
                searchResponse.data?.timeline?.instructions ||
                searchResponse.data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
                [];
            const entries = instructions.find(i => i.type === 'TimelineAddEntries')?.entries ||
                instructions[0]?.entries || [];

            const users = extractUsersFromEntries(entries);

            if (users.length > 0) {
                console.log(`[RapidAPI] Found ${users.length} users matching "${query}"`);
                return users;
            }
        } catch (searchError) {
            console.warn(`[RapidAPI] Search endpoint failed, falling back to exact lookup:`, searchError.message);
        }

        // Fallback: Try exact username lookup
        const response = await rapidRequestX({
            method: 'get',
            url: `https://${process.env.RAPIDAPI_HOST}/user`,
            params: { username: cleanQuery }
        });

        const result = response.data?.result?.data?.user?.result ||
            response.data?.data?.user?.result ||
            response.data?.result;

        if (result) {
            const legacy = result.legacy || {};
            const core = result.core || {};

            return [{
                id: result.rest_id,
                name: core.name || legacy.name || cleanQuery,
                screen_name: core.screen_name || legacy.screen_name || cleanQuery,
                description: result.profile_bio?.description || legacy.description || '',
                profile_image_url: result.avatar?.image_url || legacy.profile_image_url_https || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
                followers_count: legacy.followers_count || 0,
                friends_count: legacy.friends_count || 0,
                verified: result.is_blue_verified || result.verification?.verified || legacy.verified || false,
                platform: 'x'
            }];
        }

        return [];
    } catch (error) {
        console.warn(`[RapidAPI] User search failed for ${query}:`, error.message);
        return [];
    }
};

const resolveUser = (userResult) => {
    if (!userResult) return null;

    // Handle UserUnavailable / Tombstone
    if (userResult.__typename === 'UserUnavailable' || userResult.__typename === 'UserTombstone') {
        return null;
    }

    // Step 1: Deep Unwrapping Loop
    // This finds the "User" object (which contains legacy/core) if we pass it a wrapper or a Tweet
    let raw = userResult;
    for (let i = 0; i < 6; i++) {
        if (!raw || typeof raw !== 'object') break;

        // Common wrappers
        if (raw.result && typeof raw.result === 'object') raw = raw.result;
        else if (raw.user_results?.result) raw = raw.user_results.result;
        else if (raw.core?.user_results?.result) raw = raw.core.user_results.result;
        else if (raw.author_results?.result) raw = raw.author_results.result; // Seen in some v2 APIs
        else if (raw.user && typeof raw.user === 'object' && (raw.user.id || raw.user.rest_id)) raw = raw.user;
        else if (raw.data?.user) raw = raw.data.user;
        else if (raw.core && typeof raw.core === 'object' && (raw.core.screen_name || raw.core.name)) break;
        else break;
    }

    // Secondary unwrapping for TweetWithVisibilityResults style
    if (raw && (raw.__typename === 'UserWithVisibilityResults' || raw.__typename === 'User') && raw.user) {
        raw = raw.user;
    }

    if (!raw) return null;

    // Step 2: Extract core/legacy fields
    // Some APIs put 'core' and 'legacy' inside another 'core' or 'result'
    const legacy = raw.legacy || raw.core?.legacy || {};
    const core = raw.core || {};

    // Prioritize core (new API structure / Mathematical unicode names) then legacy then top-level
    const name = core.name || legacy.name || raw.name || core.screen_name || legacy.screen_name || raw.screen_name || 'Unknown User';
    const screen_name = core.screen_name || legacy.screen_name || raw.screen_name || 'unknown';

    // Avatar resolution with multiple fallbacks
    const avatar = core.avatar?.image_url ||
        legacy.profile_image_url_https ||
        raw.avatar?.image_url ||
        raw.profile_image_url_https ||
        'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png';

    const verified = core.is_blue_verified || legacy.verified || raw.is_blue_verified || raw.verified || false;

    if (!screen_name || screen_name === 'unknown') {
        // Log locally if we can't find a handle in a non-null object
        if (raw.id_str || raw.rest_id) {
            console.warn('[RapidAPI] Could not resolve screen_name for user ID:', raw.rest_id || raw.id_str);
        }
        return null;
    }

    return {
        name: name,
        screen_name: screen_name,
        profile_image_url_https: avatar,
        verified,
        id: raw.rest_id || raw.id_str || raw.id
    };
};

/**
 * Unifies normalization of a raw tweet result from any RapidAPI endpoint into a standard format.
 * Handles: full text (note tweets), media, quoted content, reposts/retweets, and robust author resolution.
 */
const normalizeTweet = (tweetResult, fallbackHandle = 'unknown') => {
    if (!tweetResult) return null;

    let tweet = tweetResult;
    // Unwrap generic wrappers
    for (let i = 0; i < 6; i++) {
        if (!tweet || typeof tweet !== 'object') break;

        if (tweet.result) tweet = tweet.result;
        else if (tweet.tweet) tweet = tweet.tweet;
        else if (tweet.tweetResult) tweet = tweet.tweetResult;
        else if (tweet.tweet_results?.result) tweet = tweet.tweet_results.result;
        else if (tweet.data && typeof tweet.data === 'object') tweet = tweet.data;
        else if (tweet.__typename === 'TweetWithVisibilityResults' && tweet.tweet) tweet = tweet.tweet;
        else break;
    }

    if (tweet.__typename === 'TweetUnavailable' || tweet.__typename === 'TweetTombstone') {
        return null;
    }

    // Twitter241 sometimes returns tweets without a `legacy` envelope (newer GraphQL shape).
    // Fall back to top-level fields so we don't silently drop every tweet.
    let legacy = tweet.legacy;
    if (!legacy) {
        const hasTopLevelTweetFields = !!(
            tweet.full_text || tweet.text || tweet.created_at ||
            tweet.entities || tweet.extended_entities || tweet.id_str || tweet.rest_id
        );
        if (hasTopLevelTweetFields) {
            legacy = {
                full_text: tweet.full_text || tweet.text || '',
                created_at: tweet.created_at,
                entities: tweet.entities || {},
                extended_entities: tweet.extended_entities,
                id_str: tweet.id_str || tweet.rest_id,
                conversation_id_str: tweet.conversation_id_str,
                in_reply_to_status_id_str: tweet.in_reply_to_status_id_str,
                in_reply_to_screen_name: tweet.in_reply_to_screen_name,
                user_id_str: tweet.user_id_str,
                lang: tweet.lang,
                favorite_count: tweet.favorite_count ?? tweet.like_count ?? 0,
                retweet_count: tweet.retweet_count ?? 0,
                reply_count: tweet.reply_count ?? 0,
                quote_count: tweet.quote_count ?? 0,
                bookmark_count: tweet.bookmark_count ?? 0,
                retweeted_status_result: tweet.retweeted_status_result,
                quoted_status_id_str: tweet.quoted_status_id_str,
                is_quote_status: !!tweet.quoted_status_id_str || !!tweet.quoted_status_result
            };
        } else {
            console.warn(`[RapidAPI] normalizeTweet: dropping entry — no legacy & no top-level fields. typename=${tweet.__typename || 'n/a'} keys=${Object.keys(tweet || {}).slice(0, 8).join(',')}`);
            return null;
        }
    }

    // Helper to extract user raw from various possible locations in a tweet object
    const extractUserRaw = (obj) => {
        if (!obj) return null;
        return obj.core?.user_results?.result ||
            obj.user_results?.result ||
            obj.author ||
            obj.user ||
            obj.result?.user_results?.result ||
            obj.result?.user ||
            obj.author_results?.result ||
            obj.result?.author_results?.result ||
            (obj.legacy || obj.screen_name || obj.core ? obj : null);
    };

    // Recursively resolve author to handle nested retweets
    const resolveAuthorRecursive = (obj) => {
        if (!obj) return null;
        const resolved = resolveUser(extractUserRaw(obj));

        // Check for nested retweet structure
        let retweet = obj.retweeted_status_result?.result ||
            obj.result?.retweeted_status_result?.result ||
            obj.legacy?.retweeted_status_result?.result;

        if (retweet) {
            const nested = resolveAuthorRecursive(retweet);
            // Prioritize original author if successfully resolved
            if (nested && nested.screen_name !== 'unknown') return nested;
        }
        return resolved;
    };

    // 1. Resolve Main Author
    const mainUser = resolveAuthorRecursive(tweet) || {
        name: fallbackHandle,
        screen_name: fallbackHandle,
        profile_image_url_https: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
        verified: false
    };


    // 2. Handle Reposts / Retweets
    let retweetResult = legacy.retweeted_status_result?.result;
    if (retweetResult && retweetResult.result) retweetResult = retweetResult.result;
    if (retweetResult && retweetResult.tweet) retweetResult = retweetResult.tweet;

    const isRepost = !!retweetResult;
    let targetLegacy = legacy;
    let originalAuthor = null;
    let originalAuthorName = null;
    let originalAuthorAvatar = null;

    if (isRepost && retweetResult.legacy) {
        targetLegacy = retweetResult.legacy;

        let origUserRaw = retweetResult.core?.user_results?.result ||
            retweetResult.author ||
            retweetResult.user;

        const origUser = resolveUser(origUserRaw);
        if (origUser) {
            originalAuthor = origUser.screen_name;
            originalAuthorName = origUser.name;
            originalAuthorAvatar = origUser.profile_image_url_https;
        }
    }

    // 3. Extract Text (Handling Note Tweets / Long Posts)
    const targetNoteTweet = retweetResult?.note_tweet || tweet.note_tweet;
    const noteTweetText = targetNoteTweet?.note_tweet_results?.result?.text;
    let fullText = noteTweetText || targetLegacy.full_text || targetLegacy.text || '';

    // 4. Extract Quotes
    let quotedContent = null;
    let rawQuote = retweetResult?.quoted_status_result?.result ||
        retweetResult?.legacy?.quoted_status_result?.result ||
        tweet.quoted_status_result?.result ||
        tweet.quoted_status_result ||
        legacy.quoted_status_result?.result ||
        legacy.quoted_status_result;

    if (rawQuote) {
        // Handle wrappers for Quote
        let unwrappedQuote = rawQuote;
        for (let i = 0; i < 5; i++) {
            if (unwrappedQuote.result) unwrappedQuote = unwrappedQuote.result;
            else if (unwrappedQuote.tweet) unwrappedQuote = unwrappedQuote.tweet;
            else if (unwrappedQuote.tweet_results?.result) unwrappedQuote = unwrappedQuote.tweet_results.result;
            else if (unwrappedQuote.__typename === 'TweetWithVisibilityResults' && unwrappedQuote.tweet) unwrappedQuote = unwrappedQuote.tweet;
            else break;
        }

        // Check if the quote itself is a retweet, and if so, use the original tweet
        let targetQuote = unwrappedQuote;
        const qRetweetResult = unwrappedQuote.retweeted_status_result?.result ||
            unwrappedQuote.legacy?.retweeted_status_result?.result;

        if (qRetweetResult) {
            let unwrappedOrig = qRetweetResult;
            for (let i = 0; i < 3; i++) {
                if (unwrappedOrig.result) unwrappedOrig = unwrappedOrig.result;
                else if (unwrappedOrig.tweet) unwrappedOrig = unwrappedOrig.tweet;
                else break;
            }
            if (unwrappedOrig && unwrappedOrig.legacy) {
                targetQuote = unwrappedOrig;
            }
        }

        if (targetQuote.legacy) {
            const qLegacy = targetQuote.legacy;
            const qUser = resolveUser(extractUserRaw(targetQuote)) || {
                name: 'Unknown',
                screen_name: 'unknown',
                profile_image_url_https: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'
            };

            const qNoteTweet = targetQuote.note_tweet;
            let qText = qNoteTweet?.note_tweet_results?.result?.text || qLegacy.full_text || qLegacy.text || '';

            const qEntities = qLegacy.extended_entities || qLegacy.entities;
            const qMediaRaw = (qEntities?.media || []);
            const qMedia = qMediaRaw.map(normalizeMediaItem).filter(Boolean);

            quotedContent = {
                text: qText,
                author_name: qUser.name,
                author_handle: qUser.screen_name,
                profile_image_url: qUser.profile_image_url_https,
                media: qMedia,
                created_at: qLegacy.created_at ? new Date(qLegacy.created_at) : null
            };
        }
    }

    // NEW FALLBACK: Extract handle from permalink URL if quoted data is missing or incomplete
    if ((!quotedContent || quotedContent.author_handle === 'unknown') && (targetLegacy.is_quote_status || tweet.is_quote_status)) {
        const permalink = targetLegacy.quoted_status_permalink || tweet.quoted_status_permalink;
        if (permalink) {
            const urlStr = permalink.expanded || permalink.url || permalink.display || '';
            let authorHandle = null;

            if (urlStr) {
                const parts = urlStr.split('/').filter(Boolean);
                const xIndex = parts.findIndex(p => p.includes('twitter.com') || p.includes('x.com'));
                if (xIndex !== -1 && parts[xIndex + 1]) {
                    authorHandle = parts[xIndex + 1].split('?')[0];
                }
            }

            if (authorHandle && authorHandle !== 'status' && authorHandle !== 'i') {
                if (!quotedContent) {
                    quotedContent = {
                        text: '',
                        author_name: authorHandle,
                        author_handle: authorHandle,
                        profile_image_url: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
                        media: [],
                        created_at: null
                    };
                } else if (quotedContent.author_handle === 'unknown') {
                    quotedContent.author_handle = authorHandle;
                    if (quotedContent.author_name === 'Unknown') quotedContent.author_name = authorHandle;
                }
            }
        }
    }

    // 5. Extract Media
    const rawMediaMap = new Map();
    const addMediaItems = (items) => {
        if (!Array.isArray(items)) return;
        items.forEach(m => {
            const key = m.media_key || m.id_str || m.media_url_https || m.media_url || m.url;
            if (key) rawMediaMap.set(key, m);
        });
    };

    if (targetLegacy.extended_entities?.media) addMediaItems(targetLegacy.extended_entities.media);
    else if (targetLegacy.entities?.media) addMediaItems(targetLegacy.entities.media);

    if (targetNoteTweet?.note_tweet_results?.result?.media?.inline_media) {
        addMediaItems(targetNoteTweet.note_tweet_results.result.media.inline_media);
    }

    // Fallback search in high level buckets
    if (tweet.extended_entities?.media) addMediaItems(tweet.extended_entities.media);

    const media = Array.from(rawMediaMap.values()).map(normalizeMediaItem).filter(Boolean);

    // 6. Extract URL Cards
    const urlCards = [];
    const urlEntities = targetLegacy.entities?.urls || [];
    for (const urlEntity of urlEntities) {
        if (urlEntity.expanded_url && !urlEntity.expanded_url.includes('twitter.com') && !urlEntity.expanded_url.includes('x.com')) {
            urlCards.push({
                url: urlEntity.url,
                expanded_url: urlEntity.unwound_url || urlEntity.expanded_url,
                display_url: urlEntity.display_url,
                title: urlEntity.title,
                description: urlEntity.description,
                image: urlEntity.images?.[0]?.url || urlEntity.image
            });
        }
    }

    // 7. Clean Text
    let cleanText = fullText;
    const urlsToRemove = [];
    if (targetLegacy.extended_entities?.media) targetLegacy.extended_entities.media.forEach(m => urlsToRemove.push(m.url));
    if (targetLegacy.quoted_status_permalink?.url) urlsToRemove.push(targetLegacy.quoted_status_permalink.url);
    urlsToRemove.forEach(u => { if (u) cleanText = cleanText.replace(u, ''); });
    cleanText = cleanText.trim();

    return {
        id: targetLegacy.id_str,
        text: cleanText || fullText,
        url: `https://x.com/${mainUser.screen_name}/status/${targetLegacy.id_str}`,
        created_at: targetLegacy.created_at ? new Date(targetLegacy.created_at) : null,
        media,
        url_cards: urlCards,
        is_repost: isRepost,
        author: mainUser.name,
        author_handle: mainUser.screen_name,
        author_avatar: mainUser.profile_image_url_https,
        verified: mainUser.verified,
        original_author: originalAuthor,

        original_author_name: originalAuthorName,
        original_author_avatar: originalAuthorAvatar,
        quoted_content: quotedContent,
        raw_data: tweetResult,
        metrics: {
            like: (targetLegacy.favorite_count || 0).toString(),
            retweet: (targetLegacy.retweet_count || 0).toString(),
            reply: (targetLegacy.reply_count || 0).toString(),
            views: (tweet.views?.count || 0).toString(),
            quote: (targetLegacy.quote_count || 0).toString()
        }
    };
};


const searchTweets = async (query) => {
    try {
        // Only ingest tweets between MIN and MAX days old (default: 30-90 days)
        const maxDays = Number(process.env.MONITOR_LOOKBACK_MAX_DAYS || 90);
        const minDays = Number(process.env.MONITOR_LOOKBACK_MIN_DAYS || 30);
        const safeMaxDays = Number.isFinite(maxDays) && maxDays > 0 ? maxDays : 90;
        const safeMinDays = Number.isFinite(minDays) && minDays >= 0 ? minDays : 30;
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - safeMaxDays);
        const sinceDate = weekAgo.toISOString().split('T')[0];
        const upperCutoff = Date.now() - (safeMinDays * 24 * 60 * 60 * 1000);

        console.log(`[RapidAPI] Searching tweets for: ${query} since:${sinceDate}`);

        // Try Top results first (more relevant), then Latest if empty
        const extractTweets = (responseData) => {
            const instructions = responseData?.result?.timeline?.instructions ||
                responseData?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
                responseData?.timeline?.instructions ||
                [];
            const entries = instructions.find(i => i.type === 'TimelineAddEntries')?.entries ||
                instructions[0]?.entries || [];
            const tweets = [];
            for (const entry of entries) {
                // Standard tweet entry
                const rawTweet = entry.content?.itemContent?.tweet_results?.result;
                if (rawTweet) {
                    const normalized = normalizeTweet(rawTweet);
                    if (normalized && !tweets.some(t => t.id === normalized.id)) {
                        tweets.push(normalized);
                    }
                }
                // Module entries (Top search returns user modules + tweet modules)
                if (entry.content?.items) {
                    for (const item of entry.content.items) {
                        const nestedTweet = item?.item?.itemContent?.tweet_results?.result;
                        if (nestedTweet) {
                            const normalized = normalizeTweet(nestedTweet);
                            if (normalized && !tweets.some(t => t.id === normalized.id)) {
                                tweets.push(normalized);
                            }
                        }
                    }
                }
            }
            return tweets;
        };

        // Try Top results first for better relevance
        const response = await rapidRequestX({
            method: 'get',
            url: `https://${process.env.RAPIDAPI_HOST}/search`,
            params: { query: `${query} since:${sinceDate}`, type: 'Top', count: 40 }
        });

        let tweets = extractTweets(response.data);

        // If Top returned too few, also try Latest
        if (tweets.length < 5) {
            try {
                const latestResp = await rapidRequestX({
                    method: 'get',
                    url: `https://${process.env.RAPIDAPI_HOST}/search`,
                    params: { query: `${query} since:${sinceDate}`, type: 'Latest', count: 40 }
                });
                const latestTweets = extractTweets(latestResp.data);
                for (const t of latestTweets) {
                    if (!tweets.some(existing => existing.id === t.id)) {
                        tweets.push(t);
                    }
                }
            } catch {
                // Latest failed, use what we have from Top
            }
        }

        // If still empty, try without date filter
        if (tweets.length === 0) {
            try {
                const noDateResp = await rapidRequestX({
                    method: 'get',
                    url: `https://${process.env.RAPIDAPI_HOST}/search`,
                    params: { query, type: 'Top', count: 40 }
                });
                tweets = extractTweets(noDateResp.data);
            } catch {
                // All attempts failed
            }
        }

        const beforeUpperFilter = tweets.length;
        tweets = tweets.filter(t => {
            const created = t.created_at ? new Date(t.created_at).getTime() : NaN;
            return Number.isFinite(created) ? created <= upperCutoff : true;
        });
        if (tweets.length < beforeUpperFilter) {
            console.log(`[RapidAPI] "${query}": lookback ${safeMinDays}-${safeMaxDays}d dropped ${beforeUpperFilter - tweets.length}/${beforeUpperFilter} (too recent)`);
        }

        console.log(`[RapidAPI] Found ${tweets.length} tweets for "${query}"`);
        return tweets;
    } catch (error) {
        console.error('[RapidAPI] Search Tweets Error:', error.message);
        return [];
    }
};


const fs = require('fs');
const path = require('path');

const fetchTweetDetail = async (tweetId, options = {}) => {
    const log = (msg) => console.log(`[Investigation] ${msg}`);
    const key = String(tweetId || '').trim();
    if (!key) {
        log('Error: Empty tweet ID provided');
        return null;
    }

    try {
        log(`Fetching details for tweet ${key}...`);

        const endpointAttempts = [
            { path: '/tweet-v2', params: { pid: key } },
            { path: '/tweet', params: { pid: key } },
            { path: '/tweet-details', params: { tweet_id: key } },
            { path: '/tweet', params: { id: key } },
            { path: '/tweet-details', params: { id: key } },
            { path: '/tweet', params: { tweet_id: key } }
        ];

        let tweetData = null;

        for (const attempt of endpointAttempts) {
            try {
                const response = await rapidRequestX({
                    method: 'get',
                    url: `https://${process.env.RAPIDAPI_HOST}${attempt.path}`,
                    params: attempt.params,
                    forceSecondary: options.forceSecondary
                });

                // DEBUG: Log keys to see structure
                if (response.data) {
                    const topKeys = Object.keys(response.data);
                    log(`Response keys for ${attempt.path}: ${topKeys.join(', ')}`);
                    if (response.data.result) log(`Result keys: ${Object.keys(response.data.result).join(', ')}`);
                }

                // Robust extraction based on known twitter241 and related schemas
                let result = response.data?.result || response.data?.data || response.data;

                // Aggressive unwrapping for deeply nested RapidAPI structures
                for (let i = 0; i < 6; i++) {
                    if (!result || typeof result !== 'object') break;
                    if (result.tweetResult) result = result.tweetResult;
                    else if (result.tweet) result = result.tweet;
                    else if (result.result) result = result.result;
                    else if (result.tweet_results?.result) result = result.tweet_results.result;
                    else if (result.data && typeof result.data === 'object') result = result.data;
                    else break;
                }

                // Check if we found valid data
                if (result && (result.legacy || result.data?.legacy || result.rest_id)) {
                    tweetData = result;
                    log(`Successfully fetched tweet ${key} via ${attempt.path}`);
                    break;
                } else if (result) {
                    log(`Found data for ${attempt.path} but it lacked legacy/rest_id. Keys: ${Object.keys(result).join(', ')}`);
                }
            } catch (e) {
                // Only log if it's not a 404
                if (e.response?.status !== 404) {
                    log(`Attempt error for ${attempt.path}: ${e.response?.status || e.message}`);
                }
            }
        }

        // 2. Search Fallback (if no direct fetch worked)
        if (!tweetData) {
            try {
                const searchQuery = `url:\"/status/${key}\"`;
                log(`Direct fetch failed for ${key}, trying search fallback with query: ${searchQuery}...`);
                // Search for the ID directly which is very reliable for many APIs
                const searchRes = await rapidRequestX({
                    method: 'get',
                    url: `https://${process.env.RAPIDAPI_HOST}/search`,
                    params: { query: searchQuery, type: 'Latest', count: 10 },
                    forceSecondary: options.forceSecondary
                });

                const instructions = searchRes.data?.result?.timeline?.instructions ||
                    searchRes.data?.timeline?.instructions ||
                    searchRes.data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];

                const entries = instructions.find(i => i.type === 'TimelineAddEntries')?.entries ||
                    instructions[0]?.entries || [];

                const processEntry = (entry) => {
                    let result = entry.content?.itemContent?.tweet_results?.result;
                    if (!result) return null;

                    // Unwrap TweetWithVisibilityResults
                    if (result.__typename === 'TweetWithVisibilityResults' && result.tweet) {
                        result = result.tweet;
                    }

                    // 1. Check top-level ID
                    if (result.rest_id === key || result.legacy?.id_str === key || result.id_str === key) {
                        return result;
                    }

                    // 2. Check Quoted Status
                    let quote = result.quoted_status_result?.result || result.quoted_status_result;
                    if (quote) {
                        if (quote.result || quote.tweet) quote = quote.result || quote.tweet;
                        if (quote.__typename === 'TweetWithVisibilityResults' && quote.tweet) quote = quote.tweet;

                        if (quote.rest_id === key || quote.legacy?.id_str === key || quote.id_str === key) {
                            log(`Found tweet ${key} INSIDE quoted_status_result`);
                            return quote;
                        }
                    }

                    // 3. Check Retweeted Status
                    let retweet = result.legacy?.retweeted_status_result?.result || result.legacy?.retweeted_status_result;
                    if (retweet) {
                        if (retweet.result || retweet.tweet) retweet = retweet.result || retweet.tweet;
                        if (retweet.__typename === 'TweetWithVisibilityResults' && retweet.tweet) retweet = retweet.tweet;

                        if (retweet.rest_id === key || retweet.legacy?.id_str === key || retweet.id_str === key) {
                            log(`Found tweet ${key} INSIDE retweeted_status_result`);
                            return retweet;
                        }
                    }

                    return null;
                };

                for (const entry of entries) {
                    tweetData = processEntry(entry);
                    if (tweetData) break;
                }

                // If still not found, try a broader search for the ID as a string
                if (!tweetData) {
                    log(`Specific URL search failed for ${key}, trying keyword search fallback (count: 20)...`);
                    const broadRes = await rapidRequestX({
                        method: 'get',
                        url: `https://${process.env.RAPIDAPI_HOST}/search`,
                        params: { query: key, type: 'Latest', count: 20 },
                        forceSecondary: options.forceSecondary
                    });

                    const broadInstructions = broadRes.data?.result?.timeline?.instructions ||
                        broadRes.data?.timeline?.instructions ||
                        broadRes.data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];

                    const broadEntries = broadInstructions.find(i => i.type === 'TimelineAddEntries')?.entries ||
                        broadInstructions[0]?.entries || [];

                    for (const entry of broadEntries) {
                        tweetData = processEntry(entry);
                        if (tweetData) break;
                    }
                }
            } catch (e) {
                log(`Search fallback failed for ${key}: ${e.response?.status || e.message}`);
            }
        }

        // 3. Final Fallback: Retry with secondary key if enabled and no data yet
        if (!tweetData && process.env.GOOGLE_AI_MODE_RAPIDAPI_KEY && !options.forceSecondary) {
            log(`Still no data. Retrying entire flow with GOOGLE_AI_MODE_RAPIDAPI_KEY...`);
            return await fetchTweetDetail(tweetId, { ...options, forceSecondary: true });
        }

        if (!tweetData) return null;

        const normalized = normalizeTweet(tweetData);
        return normalized;

    } catch (error) {
        console.error(`[RapidAPI] Final Fetch Tweet Detail Error for ${tweetId}:`, error.message);
        return null;
    }
};

/**
 * Fetches tweets for a handle, paginating via cursor until either `sinceDate` is
 * passed (tweets older than it are dropped and pagination stops) or `maxTweets`
 * is reached. Used by engagerAnalysisService to build the pool of tweets to
 * scan for retweeters.
 */
const fetchAllUserTweetsSince = async (handle, { sinceDate = null, maxTweets = 200 } = {}) => {
    const cleanHandle = handle.replace('@', '').trim();
    const allTweets = [];

    try {
        let userId = userIdCache.get(cleanHandle);
        if (!userId) {
            const userResponse = await rapidRequestX({
                method: 'get',
                url: `https://${process.env.RAPIDAPI_HOST}/user`,
                params: { username: cleanHandle }
            });
            const result = userResponse.data?.result?.data?.user?.result ||
                userResponse.data?.data?.user?.result ||
                userResponse.data?.result;
            if (!result?.rest_id) {
                console.warn(`[RapidAPI] Could not resolve user id for ${cleanHandle}`);
                return allTweets;
            }
            userId = result.rest_id;
            userIdCache.set(cleanHandle, userId);
        }

        let cursor = null;
        let keepGoing = true;

        while (keepGoing && allTweets.length < maxTweets) {
            const params = { user: userId, count: 40 };
            if (cursor) params.cursor = cursor;

            const response = await rapidRequestX({
                method: 'get',
                url: `https://${process.env.RAPIDAPI_HOST}/user-tweets`,
                params
            });

            const instructions = response.data?.result?.timeline?.instructions || [];
            const entries = instructions.find(i => i.type === 'TimelineAddEntries')?.entries || [];

            let pageTweetCount = 0;
            let nextCursor = null;

            for (const entry of entries) {
                const entryType = entry.content?.entryType;
                if (entryType === 'TimelineTimelineCursor') {
                    if (entry.content?.cursorType === 'Bottom') nextCursor = entry.content?.value || null;
                    continue;
                }

                const rawTweet = entry.content?.itemContent?.tweet_results?.result;
                if (!rawTweet) continue;

                const normalized = normalizeTweet(rawTweet, cleanHandle);
                if (!normalized) continue;

                if (sinceDate && normalized.created_at && normalized.created_at < sinceDate) {
                    keepGoing = false;
                    continue;
                }

                allTweets.push(normalized);
                pageTweetCount++;
                if (allTweets.length >= maxTweets) { keepGoing = false; break; }
            }

            if (!nextCursor || pageTweetCount === 0) keepGoing = false;
            cursor = nextCursor;
        }

        console.log(`[RapidAPI] fetchAllUserTweetsSince(@${cleanHandle}): collected ${allTweets.length} tweets`);
        return allTweets;
    } catch (error) {
        console.error(`[RapidAPI] fetchAllUserTweetsSince failed for ${handle}:`, error.message);
        return allTweets;
    }
};

/**
 * Fetches retweeters of a single tweet (one page). Pass the `cursor` returned
 * from a previous call to page through the full list.
 */
const getTimelineEntriesForRetweeters = (data) => {
    const instructions = data?.result?.timeline?.instructions ||
        data?.timeline?.instructions ||
        [];
    const entries = [];
    for (const instruction of instructions) {
        if (Array.isArray(instruction?.entries)) entries.push(...instruction.entries);
        if (Array.isArray(instruction?.moduleItems)) entries.push(...instruction.moduleItems);
    }
    return entries;
};

const extractBottomCursor = (entries = []) => {
    for (const entry of entries) {
        const cursorType = entry?.content?.cursorType || entry?.cursorType;
        const value = entry?.content?.value || entry?.value;
        const entryId = entry?.entryId || entry?.entry_id || '';
        if ((cursorType === 'Bottom' || /cursor-bottom/i.test(String(entryId))) && value) {
            return value;
        }
    }
    return null;
};

/**
 * Fetches every retweeter of one tweet, paginated up to `count`. Tries a
 * cascade of endpoint/param-name variants — different RapidAPI provider
 * versions expect different param names for the same /retweets endpoint,
 * and silently returning [] on a param mismatch was producing "completed"
 * analyses with 0 engagers even when the tweet genuinely had retweets.
 */
const fetchTweetRetweeters = async (tweetId, options = {}) => {
    const key = String(tweetId || '').trim();
    if (!key) return { users: [], nextCursor: null };
    const count = options.count || 100;

    const attempts = [
        { path: 'retweets', baseParams: { pid: key } },
        { path: 'retweets', baseParams: { tweet_id: key } },
        { path: 'retweets', baseParams: { id: key } },
        { path: 'tweet-retweets', baseParams: { pid: key } }
    ];

    for (const attempt of attempts) {
        try {
            const users = [];
            const seenHandles = new Set();
            let cursor = options.cursor || null;
            let page = 0;
            const maxPages = Math.max(1, Math.ceil(count / 100));

            while (users.length < count && page < maxPages) {
                page += 1;
                const params = { ...attempt.baseParams, count: Math.min(count, 100) };
                if (cursor) params.cursor = cursor;

                const response = await rapidRequestX({
                    method: 'get',
                    url: `https://${process.env.RAPIDAPI_HOST}/${attempt.path}`,
                    params
                });

                const entries = getTimelineEntriesForRetweeters(response.data);
                let addedThisPage = 0;

                for (const entry of entries) {
                    const userResult = entry?.content?.itemContent?.user_results?.result ||
                        entry?.content?.itemContent?.user_result?.result ||
                        entry?.item?.itemContent?.user_results?.result ||
                        entry?.user_results?.result ||
                        null;

                    const resolved = resolveUser(userResult);
                    if (!resolved?.screen_name) continue;

                    const handleKey = resolved.screen_name.toLowerCase();
                    if (seenHandles.has(handleKey)) continue;
                    seenHandles.add(handleKey);

                    users.push(resolved);
                    addedThisPage += 1;
                    if (users.length >= count) break;
                }

                cursor = extractBottomCursor(entries);
                if (!cursor || addedThisPage === 0) break;
            }

            if (users.length > 0) {
                return { users, nextCursor: null };
            }
        } catch (error) {
            console.warn(`[RapidAPI] Retweeters fetch attempt failed for tweet ${key} via ${attempt.path}:`, error.message);
        }
    }

    return { users: [], nextCursor: null };
};

module.exports = { fetchUserTweets, searchUsers, searchTweets, fetchUserProfile, fetchTweetDetail, normalizeTweet, fetchAllUserTweetsSince, fetchTweetRetweeters };
