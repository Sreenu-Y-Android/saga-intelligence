const axios = require('axios');

const INSTAGRAM_DEFAULT_HOST = 'instagram120.p.rapidapi.com';

// ─── Key Health Tracking (single-key mode) ────────────────────────────────
// We keep lightweight health state even in single-key mode so transient
// failures can still use the same backoff/cooldown behavior.
const keyHealth = new Map(); // key-string → { cooldownUntil, failures, lastUsed, totalCalls }

const getInstagramRapidApiKeys = () => {
    const primaryKey = String(process.env.RAPIDAPI_INSTAGRAM_KEY || '').trim();
    if (primaryKey) return [primaryKey];

    // Backward compatibility: if legacy comma-separated keys are present,
    // use only the first key in single-key mode.
    const legacyKeysStr = String(process.env.RAPIDAPI_INSTAGRAM_KEYS || process.env.RAPIDAPI_KEY || '');
    const firstLegacyKey = legacyKeysStr.split(',').map(k => k.trim()).find(Boolean);
    return firstLegacyKey ? [firstLegacyKey] : [];
};

const getInstagramRapidApiHost = () => {
    return process.env.RAPIDAPI_INSTAGRAM_HOST || INSTAGRAM_DEFAULT_HOST;
};

// ─── Key Health Helpers ────────────────────────────────────────────────────
const getKeyState = (key) => {
    if (!keyHealth.has(key)) {
        keyHealth.set(key, { cooldownUntil: 0, failures: 0, lastUsed: 0, totalCalls: 0 });
    }
    return keyHealth.get(key);
};

const isKeyAvailable = (key) => {
    const state = getKeyState(key);
    return Date.now() >= state.cooldownUntil;
};

const markKeySuccess = (key) => {
    const state = getKeyState(key);
    state.failures = 0;
    state.lastUsed = Date.now();
    state.totalCalls++;
};

const markKeyFailed = (key, isRateLimit = false) => {
    const state = getKeyState(key);
    state.failures++;
    state.lastUsed = Date.now();
    state.totalCalls++;

    if (isRateLimit) {
        // Exponential cooldown: 60s, 120s, 240s, max 10min
        const cooldownMs = Math.min(60000 * Math.pow(2, state.failures - 1), 600000);
        state.cooldownUntil = Date.now() + cooldownMs;
        console.warn(`[Instagram] 🔑 Key ${key.substring(0, 8)}... rate-limited. Cooldown ${Math.round(cooldownMs / 1000)}s (failure #${state.failures})`);
    } else {
        // Non-rate-limit errors get a shorter cooldown
        const cooldownMs = Math.min(10000 * state.failures, 120000);
        state.cooldownUntil = Date.now() + cooldownMs;
    }
};

/**
 * Pick the best available key. Prioritizes keys that:
 *  1. Are NOT in cooldown
 *  2. Have the fewest recent failures
 *  3. Were least recently used (spread load)
 */
const pickBestKey = () => {
    const keys = getInstagramRapidApiKeys();
    if (keys.length === 0) return null;

    // First pass: find all available keys (not in cooldown)
    const available = keys.filter(k => isKeyAvailable(k));

    if (available.length > 0) {
        // Sort by failures ASC, then lastUsed ASC (least recently used first)
        available.sort((a, b) => {
            const sa = getKeyState(a);
            const sb = getKeyState(b);
            if (sa.failures !== sb.failures) return sa.failures - sb.failures;
            return sa.lastUsed - sb.lastUsed;
        });
        return available[0];
    }

    // All keys in cooldown — pick the one whose cooldown expires soonest
    const sorted = [...keys].sort((a, b) => {
        return getKeyState(a).cooldownUntil - getKeyState(b).cooldownUntil;
    });

    const soonest = sorted[0];
    const waitMs = getKeyState(soonest).cooldownUntil - Date.now();
    console.warn(`[Instagram] ⚠️ All keys in cooldown. Nearest available in ${Math.round(waitMs / 1000)}s (key ${soonest.substring(0, 8)}...)`);
    return soonest;
};

/**
 * Get a status summary of all keys (useful for debugging / health endpoint).
 */
const getKeyHealthStatus = () => {
    const keys = getInstagramRapidApiKeys();
    return keys.map((k, i) => {
        const state = getKeyState(k);
        const available = isKeyAvailable(k);
        return {
            index: i,
            key: k.substring(0, 8) + '...',
            available,
            failures: state.failures,
            totalCalls: state.totalCalls,
            cooldownRemaining: available ? 0 : Math.round((state.cooldownUntil - Date.now()) / 1000)
        };
    });
};

// ─── Core Request Function (single-key mode) ───────────────────────────────
const rapidPost = async (path, data, _retryCount = 0) => {
    const keys = getInstagramRapidApiKeys();
    if (keys.length === 0) throw new Error('No RapidAPI Instagram keys configured');

    const maxRetries = 2; // single key + one retry for transient errors
    if (_retryCount >= maxRetries) {
        throw new Error(`[Instagram] Request failed after ${_retryCount} retries for ${path}`);
    }

    const key = pickBestKey();
    if (!key) throw new Error('[Instagram] No API keys available');

    const host = getInstagramRapidApiHost();

    // If key is still in cooldown, wait for it (short sleep)
    const state = getKeyState(key);
    if (Date.now() < state.cooldownUntil) {
        const waitMs = state.cooldownUntil - Date.now();
        if (waitMs > 0 && waitMs <= 30000) {
            //console.log(`[Instagram] Waiting ${Math.round(waitMs / 1000)}s for key ${key.substring(0, 8)}... cooldown`);
            await new Promise(r => setTimeout(r, waitMs));
        }
    }

    try {
        const response = await axios.post(`https://${host}${path}`, data, {
            headers: {
                'x-rapidapi-key': key,
                'x-rapidapi-host': host,
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30s timeout
        });

        markKeySuccess(key);
        return response;
    } catch (error) {
        const status = error.response?.status;
        const msg = String(error.response?.data?.message || error.response?.data?.error || error.message || '').toLowerCase();

        // Identify rate-limit scenarios
        const isRateLimit = status === 429 ||
            (status === 403 && (msg.includes('quota') || msg.includes('limit') || msg.includes('exceeded') || msg.includes('rate'))) ||
            msg.includes('too many requests') ||
            msg.includes('rate limit');

        // Identify 'not subscribed' — key is invalid for this API, skip to next key
        const isNotSubscribed = status === 403 && (msg.includes('not subscribed') || msg.includes('subscription'));

        // Identify server errors (worth retrying with same or different key)
        const isServerError = status >= 500 && status < 600;

        if (isRateLimit) {
            markKeyFailed(key, true);
            console.warn(`[Instagram] 🔄 Rate limited on key ${key.substring(0, 8)}... Retrying... (attempt ${_retryCount + 1}/${maxRetries})`);
            return rapidPost(path, data, _retryCount + 1);
        }

        if (isNotSubscribed) {
            markKeyFailed(key, false);
            throw new Error('[Instagram] RapidAPI key is not subscribed to the configured Instagram API host.');
        }

        if (isServerError) {
            markKeyFailed(key, false);
            console.warn(`[Instagram] 🔄 Server error ${status} on key ${key.substring(0, 8)}... Retrying... (attempt ${_retryCount + 1}/${maxRetries})`);
            // Brief delay before retry on server error
            await new Promise(r => setTimeout(r, 2000));
            return rapidPost(path, data, _retryCount + 1);
        }

        // 404 = endpoint doesn't exist — not a key issue, don't penalise the key
        if (status === 404) {
            console.error(`[Instagram] RapidAPI Error (${path}): ${status} — Endpoint '${path}' does not exist`);
            throw error;
        }

        // Non-recoverable error (4xx other than 429/403-rate/404) — don't retry
        markKeyFailed(key, false);
        console.error(`[Instagram] RapidAPI Error (${path}): ${status} — ${error.response?.data?.message || error.message}`);
        throw error;
    }
};

// ─── Convenience GET wrapper (some endpoints use GET) ──────────────────────
const rapidGet = async (path, params = {}, _retryCount = 0) => {
    const keys = getInstagramRapidApiKeys();
    if (keys.length === 0) throw new Error('No RapidAPI Instagram keys configured');

    const maxRetries = 2;
    if (_retryCount >= maxRetries) {
        throw new Error(`[Instagram] GET request failed after ${_retryCount} retries for ${path}`);
    }

    const key = pickBestKey();
    if (!key) throw new Error('[Instagram] No API keys available');

    const host = getInstagramRapidApiHost();

    const state = getKeyState(key);
    if (Date.now() < state.cooldownUntil) {
        const waitMs = state.cooldownUntil - Date.now();
        if (waitMs > 0 && waitMs <= 30000) {
            //console.log(`[Instagram] Waiting ${Math.round(waitMs / 1000)}s for key ${key.substring(0, 8)}... cooldown`);
            await new Promise(r => setTimeout(r, waitMs));
        }
    }

    try {
        const response = await axios.get(`https://${host}${path}`, {
            params,
            headers: {
                'x-rapidapi-key': key,
                'x-rapidapi-host': host
            },
            timeout: 30000
        });

        markKeySuccess(key);
        return response;
    } catch (error) {
        const status = error.response?.status;
        const msg = String(error.response?.data?.message || error.response?.data?.error || error.message || '').toLowerCase();

        const isRateLimit = status === 429 ||
            (status === 403 && (msg.includes('quota') || msg.includes('limit') || msg.includes('exceeded') || msg.includes('rate'))) ||
            msg.includes('too many requests') || msg.includes('rate limit');

        const isNotSubscribed = status === 403 && (msg.includes('not subscribed') || msg.includes('subscription'));

        const isServerError = status >= 500 && status < 600;

        if (isRateLimit) {
            markKeyFailed(key, true);
            //console.warn(`[Instagram] 🔄 GET Rate limited. Rotating... (attempt ${_retryCount + 1}/${maxRetries})`);
            return rapidGet(path, params, _retryCount + 1);
        }

        if (isNotSubscribed) {
            markKeyFailed(key, false);
            throw new Error('[Instagram] RapidAPI key is not subscribed to the configured Instagram API host.');
        }

        if (isServerError) {
            markKeyFailed(key, false);
            await new Promise(r => setTimeout(r, 2000));
            return rapidGet(path, params, _retryCount + 1);
        }

        // 404 = endpoint doesn't exist — not a key issue
        if (status === 404) {
            throw error;
        }

        markKeyFailed(key, false);
        throw error;
    }
};

// ─── Public API Methods ────────────────────────────────────────────────────

/**
 * Fetch latest posts for a given username.
 * Includes fallback: if POST /api/instagram/posts fails, tries alternative endpoints.
 */
const fetchUserPosts = async (username, maxId = "") => {
    const endpoints = [
        { method: 'POST', path: '/api/instagram/posts', data: { username, maxId } },
        { method: 'POST', path: '/api/instagram/user/posts', data: { username, maxId } },
        { method: 'POST', path: '/api/instagram/media', data: { username } }
    ];

    for (const ep of endpoints) {
        try {
            //console.log(`[Instagram] Fetching posts for ${username} via ${ep.method} ${ep.path}`);
            const response = ep.method === 'POST'
                ? await rapidPost(ep.path, ep.data)
                : await rapidGet(ep.path, ep.data);

            if (response?.data) {
                //console.log(`[Instagram] ✅ Posts fetched for ${username} via ${ep.path}`);
                return response.data;
            }
        } catch (error) {
            //console.warn(`[Instagram] ⚠️ ${ep.path} failed for ${username}: ${error.message}`);
            // Continue to next endpoint
        }
    }

    //console.error(`[Instagram] ❌ All endpoints failed for posts of ${username}`);
    return null;
};

/**
 * Fetch profile information for a given username.
 * Multiple endpoint fallbacks.
 */
const fetchUserProfile = async (username) => {
    const endpoints = [
        { method: 'POST', path: '/api/instagram/userInfo', data: { username } },
        { method: 'POST', path: '/api/instagram/user/info', data: { username } },
        { method: 'POST', path: '/api/instagram/profile', data: { username } }
    ];

    for (const ep of endpoints) {
        try {
            //console.log(`[Instagram] Fetching profile for ${username} via ${ep.method} ${ep.path}`);
            const response = ep.method === 'POST'
                ? await rapidPost(ep.path, ep.data)
                : await rapidGet(ep.path, ep.data);

            if (response?.data) {
                //console.log(`[Instagram] ✅ Profile fetched for ${username} via ${ep.path}`);
                return response.data;
            }
        } catch (error) {
            //console.warn(`[Instagram] ⚠️ ${ep.path} failed for ${username}: ${error.message}`);
        }
    }

    //console.error(`[Instagram] ❌ All endpoints failed for profile of ${username}`);
    return null;
};

/**
 * Fetch stories for a given username.
 * Stories are ephemeral (24h) so we need to poll regularly.
 */
const fetchUserStories = async (username) => {
    const endpoints = [
        { method: 'POST', path: '/api/instagram/stories', data: { username } },
        { method: 'POST', path: '/api/instagram/user/stories', data: { username } },
        { method: 'POST', path: '/api/instagram/story', data: { username } },
        { method: 'POST', path: '/api/instagram/highlights', data: { username } }
    ];

    for (const ep of endpoints) {
        try {
            //console.log(`[Instagram] Fetching stories for ${username} via ${ep.method} ${ep.path}`);
            const response = ep.method === 'POST'
                ? await rapidPost(ep.path, ep.data)
                : await rapidGet(ep.path, ep.data);

            if (response?.data) {
                //console.log(`[Instagram] ✅ Stories fetched for ${username} via ${ep.path}`);
                return response.data;
            }
        } catch (error) {
            //console.warn(`[Instagram] ⚠️ ${ep.path} failed for ${username} stories: ${error.message}`);
            // Continue to next endpoint
        }
    }

    //console.error(`[Instagram] ❌ All endpoints failed for stories of ${username}`);
    return null;
};

/**
 * Fetch detailed information for a specific Instagram post/reel.
 * Multiple fallback strategies: shortcode-based, then URL-based.
 */
const fetchInstagramPostDetail = async (shortcode) => {
    const endpoints = [
        { method: 'POST', path: '/api/instagram/postInfo', data: { shortcode } },
        { method: 'POST', path: '/api/instagram/post/info', data: { shortcode } },
        { method: 'POST', path: '/api/instagram/media/info', data: { shortcode } }
    ];

    for (const ep of endpoints) {
        try {
            const response = ep.method === 'POST'
                ? await rapidPost(ep.path, ep.data)
                : await rapidGet(ep.path, ep.data);

            const data = response?.data?.data || response?.data;
            if (!data) continue;

            return {
                id: data.id || shortcode,
                text: data.caption?.text || data.text || '',
                author: data.user?.full_name || data.owner?.full_name || 'Instagram User',
                author_handle: data.user?.username || data.owner?.username || 'instagram',
                author_avatar: data.user?.profile_pic_url || data.owner?.profile_pic_url || '',
                created_at: data.taken_at ? new Date(data.taken_at * 1000) : new Date(),
                media: data.carousel_media || (data.image_versions2 ? [{ url: data.image_versions2.candidates?.[0]?.url, type: 'photo' }] : []),
                metrics: {
                    likes: data.like_count || 0,
                    comments: data.comment_count || 0,
                    views: data.view_count || data.play_count || data.video_play_count || 0
                }
            };
        } catch (error) {
            //console.warn(`[Instagram] ⚠️ Post detail ${ep.path} failed for ${shortcode}: ${error.message}`);
        }
    }

    //console.error(`[Instagram] ❌ All endpoints failed for post detail ${shortcode}`);
    return null;
};

/**
 * Search Instagram users by query.
 * Tries dedicated search endpoints, falls back to direct profile lookup.
 */
const searchUsers = async (query) => {
    const cleanQuery = String(query || '').trim().replace(/^@/, '');
    if (!cleanQuery) return [];

    // instagram120 API has no search endpoint — only direct profile lookup
    try {
        const profileData = await fetchUserProfile(cleanQuery);
        if (profileData) {
            // Response may nest user data under .data, .result[0].user, .user, or at top level
            const resultArr = profileData.result || profileData.results;
            const raw = Array.isArray(resultArr) ? (resultArr[0]?.user || resultArr[0]) : null;
            const user = raw || profileData.data || profileData.user || profileData;
            if (user.username || user.full_name) {
                console.log(`[Instagram] Found user profile: ${user.username}`);
                return [{
                    id: user.pk || user.pk_id || user.id || '',
                    name: user.full_name || user.username || cleanQuery,
                    screen_name: user.username || cleanQuery,
                    description: user.biography || user.bio_text || user.bio || '',
                    profile_image_url: user.profile_pic_url || user.profile_pic_url_hd || user.hd_profile_pic_url_info?.url || '',
                    followers_count: user.follower_count || user.edge_followed_by?.count || 0,
                    following_count: user.following_count || user.edge_follow?.count || 0,
                    posts_count: user.media_count || user.edge_owner_to_timeline_media?.count || 0,
                    verified: user.is_verified || false,
                    platform: 'instagram'
                }];
            }
        }
    } catch (err) {
        console.warn(`[Instagram] Profile lookup failed for '${cleanQuery}':`, err.message);
    }

    return [];
};

/**
 * Search Instagram posts by keyword.
 * Tries hashtag/tag search endpoints, which is the closest to keyword search on Instagram.
 */
const IG_DEFAULT_LIMIT = Math.max(1, Math.min(100, parseInt(process.env.IG_SEARCH_PAGE_SIZE || '50', 10)));
const searchPosts = async (query, limit = IG_DEFAULT_LIMIT) => {
    const cleanQuery = String(query || '').trim().replace(/^#/, '');
    if (!cleanQuery) return [];

    // instagram120 API has no hashtag/search endpoint — fetch posts from the user matching the query
    try {
        const rawPosts = await fetchUserPosts(cleanQuery);
        if (!rawPosts) return [];

        // Response nests posts under .result.edges or .items
        const edges = rawPosts.result?.edges || rawPosts.edges || rawPosts.items || (Array.isArray(rawPosts) ? rawPosts : []);
        if (!Array.isArray(edges) || edges.length === 0) return [];

        const normalized = edges.slice(0, limit).map(p => {
            const node = p.node || p;
            return {
                id: node.id || node.pk || node.code || node.shortcode || '',
                text: node.caption?.text || node.edge_media_to_caption?.edges?.[0]?.node?.text || node.text || '',
                author: node.user?.full_name || node.owner?.full_name || cleanQuery,
                author_handle: node.user?.username || node.owner?.username || cleanQuery,
                author_avatar: node.user?.profile_pic_url || node.owner?.profile_pic_url || '',
                url: (node.shortcode || node.code)
                    ? `https://www.instagram.com/p/${node.shortcode || node.code}/`
                    : '',
                created_at: node.taken_at
                    ? new Date(node.taken_at * 1000).toISOString()
                    : (node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : new Date().toISOString()),
                media: node.image_versions2
                    ? [{ url: node.image_versions2.candidates?.[0]?.url, type: 'photo' }]
                    : (node.display_url ? [{ url: node.display_url, type: 'photo' }]
                    : (node.thumbnail_src ? [{ url: node.thumbnail_src, type: 'photo' }] : [])),
                metrics: {
                    likes: node.like_count || node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
                    comments: node.comment_count || node.edge_media_to_comment?.count || 0,
                    views: node.view_count || node.play_count || node.video_view_count || 0
                },
                platform: 'instagram'
            };
        }).filter(p => p.id);

        if (normalized.length > 0) {
            console.log(`[Instagram] Found ${normalized.length} posts for user '${cleanQuery}'`);
        }
        return normalized;
    } catch (err) {
        console.warn(`[Instagram] Posts lookup failed for '${cleanQuery}':`, err.message);
    }

    return [];
};

module.exports = {
    fetchUserPosts,
    fetchUserStories,
    fetchUserProfile,
    fetchInstagramPostDetail,
    searchUsers,
    searchPosts,
    getKeyHealthStatus,
    getInstagramRapidApiKeys
};
