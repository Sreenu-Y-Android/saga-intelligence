const axios = require('axios');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Grievance = require('../models/Grievance');
const GrievanceSource = require('../models/GrievanceSource');
const GrievanceSettings = require('../models/GrievanceSettings');
const Keyword = require('../models/Keyword');
const rapidApiFacebookService = require('./rapidApiFacebookService');
const rapidApiInstagramService = require('./rapidApiInstagramService');
const rapidApiXService = require('./rapidApiXService');
const youtubeService = require('./youtube.service');
const { archiveTwitterMedia } = require('./contentS3Service');
const { generateComplaintCode } = require('./complaintCodeService');
const { syncLegacyFieldsFromWorkflow } = require('./grievanceWorkflowService');
const { yieldToInteractive } = require('./apiPriorityGate');
const { analyzeContent } = require('./analysisService');
const translationService = require('./translationService');
const { OUR_LEADERS, OPPOSITION_LEADERS } = require('../config/politicalData');

const LOCATION_SERVICE_URL = process.env.LOCATION_SERVICE_URL || 'http://178.255.44.130:5003';
const locationExtractionService = require('./locationExtractionService');
const { ALL_TELANGANA_LOCATIONS } = require('../config/telanganaLocations');

// ── City / Town → District mapping for keyword detection ──
const KEYWORD_TO_DISTRICT = {
    // Hyderabad district
    'hyderabad': 'Hyderabad', 'secunderabad': 'Hyderabad', 'begumpet': 'Hyderabad',
    'ameerpet': 'Hyderabad', 'banjara hills': 'Hyderabad', 'jubilee hills': 'Hyderabad',
    'madhapur': 'Hyderabad', 'gachibowli': 'Hyderabad', 'kukatpally': 'Hyderabad',
    'miyapur': 'Hyderabad', 'dilsukhnagar': 'Hyderabad', 'malakpet': 'Hyderabad',
    'nampally': 'Hyderabad', 'charminar': 'Hyderabad', 'mehdipatnam': 'Hyderabad',
    'abids': 'Hyderabad', 'koti': 'Hyderabad', 'shamshabad': 'Hyderabad',
    'lb nagar': 'Hyderabad', 'uppal': 'Hyderabad',
    // Rangareddy district
    'rangareddy': 'Rangareddy', 'ranga reddy': 'Rangareddy', 'ibrahimpatnam': 'Rangareddy',
    'chevella': 'Rangareddy', 'tandur': 'Rangareddy', 'maheshwaram': 'Rangareddy',
    'kandukur': 'Rangareddy', 'kothur': 'Rangareddy', 'farooqnagar': 'Rangareddy',
    'shadnagar': 'Rangareddy',
    // Medchal-Malkajgiri district
    'medchal': 'Medchal-Malkajgiri', 'malkajgiri': 'Medchal-Malkajgiri',
    'kompally': 'Medchal-Malkajgiri', 'alwal': 'Medchal-Malkajgiri',
    'boduppal': 'Medchal-Malkajgiri', 'ghatkesar': 'Medchal-Malkajgiri',
    // Mahabubnagar district
    'mahabubnagar': 'Mahabubnagar', 'mahbubnagar': 'Mahabubnagar',
    'jadcherla': 'Mahabubnagar', 'devarkadra': 'Mahabubnagar',
    'koilkonda': 'Mahabubnagar', 'addakal': 'Mahabubnagar',
    // Narayanpet district
    'narayanpet': 'Narayanpet', 'makthal': 'Narayanpet', 'utkoor': 'Narayanpet',
    // Vikarabad district
    'vikarabad': 'Vikarabad', 'kodangal': 'Vikarabad', 'bomraspet': 'Vikarabad',
    'doultabad': 'Vikarabad', 'parigi': 'Vikarabad', 'mominpet': 'Vikarabad',
    // Wanaparthy district
    'wanaparthy': 'Wanaparthy', 'pebbair': 'Wanaparthy', 'gadwal': 'Wanaparthy',
    // Nagarkurnool district
    'nagarkurnool': 'Nagarkurnool', 'kalwakurthy': 'Nagarkurnool',
    'achampet': 'Nagarkurnool', 'kollapur': 'Nagarkurnool',
    // Warangal district
    'warangal': 'Warangal', 'hanamkonda': 'Warangal', 'kazipet': 'Warangal',
    'narsampet': 'Warangal', 'parkal': 'Warangal', 'wardhannapet': 'Warangal',
    // Karimnagar district
    'karimnagar': 'Karimnagar', 'huzurabad': 'Karimnagar', 'choppadandi': 'Karimnagar',
    'manakondur': 'Karimnagar', 'vemulawada': 'Karimnagar',
    // Nizamabad district
    'nizamabad': 'Nizamabad', 'bodhan': 'Nizamabad', 'armoor': 'Nizamabad',
    // Kamareddy district
    'kamareddy': 'Kamareddy', 'yellareddy': 'Kamareddy', 'banswada': 'Kamareddy',
    // Sircilla district
    'sircilla': 'Rajanna Sircilla',
    // Khammam district
    'khammam': 'Khammam', 'kothagudem': 'Khammam', 'bhadrachalam': 'Khammam',
    'yellandu': 'Khammam', 'sathupalli': 'Khammam', 'madhira': 'Khammam', 'wyra': 'Khammam',
    // Nalgonda district
    'nalgonda': 'Nalgonda', 'miryalaguda': 'Nalgonda', 'devarakonda': 'Nalgonda',
    // Suryapet district
    'suryapet': 'Suryapet', 'kodad': 'Suryapet', 'huzurnagar': 'Suryapet',
    // Medak / Sangareddy / Siddipet
    'medak': 'Medak', 'siddipet': 'Siddipet', 'sangareddy': 'Sangareddy',
    'zaheerabad': 'Sangareddy', 'narayankhed': 'Sangareddy', 'gajwel': 'Siddipet',
    // Adilabad district
    'adilabad': 'Adilabad', 'mancherial': 'Mancherial', 'nirmal': 'Nirmal',
    'bellampalli': 'Mancherial', 'asifabad': 'Adilabad',
    // Jagtial district
    'jagtial': 'Jagtial', 'koratla': 'Jagtial', 'metpally': 'Jagtial',
    // Peddapalli district
    'peddapalli': 'Peddapalli', 'ramagundam': 'Peddapalli', 'godavarikhani': 'Peddapalli',
    // Jangaon district
    'jangaon': 'Jangaon', 'ghanpur': 'Jangaon',
    // Mahabubabad district
    'mahabubabad': 'Mahabubabad', 'dornakal': 'Mahabubabad', 'thorrur': 'Mahabubabad',
    // Yadadri Bhuvanagiri
    'bhongir': 'Yadadri Bhuvanagiri', 'yadagirigutta': 'Yadadri Bhuvanagiri',
    // State reference
    'telangana': 'Hyderabad',
};

// Build a sorted array for multi-word matching (longest first for greedy match)
const KEYWORD_LIST = [...ALL_TELANGANA_LOCATIONS]
    .filter(kw => kw.length >= 3) // skip tiny tokens
    .sort((a, b) => b.length - a.length); // longest first

const MAHABUBNAGAR_ACS = [
    'Kodangal',
    'Narayanpet',
    'Mahbubnagar',
    'Jadcherla',
    'Devarkadra',
    'Makthal',
    'Shadnagar'
];

const MAHABUBNAGAR_AC_ALIASES = {
    'Kodangal': ['kodangal', 'kodangallu'],
    'Narayanpet': ['narayanpet', 'narayanapet'],
    'Mahbubnagar': ['mahbubnagar', 'mahabubnagar', 'mahboobnagar', 'palamoor'],
    'Jadcherla': ['jadcherla', 'jadcharla'],
    'Devarkadra': ['devarkadra', 'devarakadra'],
    'Makthal': ['makthal', 'maktal'],
    'Shadnagar': ['shadnagar', 'shadnager', 'shad nagar']
};

const MAHABUBNAGAR_AC_TO_DISTRICT = {
    'Kodangal': 'Vikarabad',
    'Narayanpet': 'Narayanpet',
    'Mahbubnagar': 'Mahabubnagar',
    'Jadcherla': 'Mahabubnagar',
    'Devarkadra': 'Mahabubnagar',
    'Makthal': 'Narayanpet',
    'Shadnagar': 'Rangareddy'
};

const TELUGU_SCRIPT_REGEX = /[\u0C00-\u0C7F]/;
const TOKEN_BOUNDARY_REGEX = /[^a-z0-9_]/i;
let lastTeluguTranslationWarningAt = 0;
const TELUGU_TRANSLATION_WARNING_THROTTLE_MS = Number(process.env.TELUGU_TRANSLATION_WARNING_THROTTLE_MS || 30000);

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeCompact = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const appendSourceTagOnce = (source, tag) => {
    const tokens = String(source || '')
        .split('+')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!tokens.length) return tag;
    if (!tokens.includes(tag)) tokens.push(tag);
    return tokens.join('+');
};









/**
 * LOCAL keyword-based location detection from text content.
 * Scans each word/phrase against ALL_TELANGANA_LOCATIONS set.
 * Returns { city, district, keyword_matched, confidence, source } or null.
 */


/**
 * Extract location from a grievance's text / user profile and persist it.
 * Refactored to use locationExtractionService.
 */
const extractAndSaveLocation = async (grievanceId, text, postedBy = {}) => {
    try {
        if (!text || !text.trim()) return;

        const locationWithConstituency = await locationExtractionService.extractLocation(text, postedBy);
        if (!locationWithConstituency) return;

        await Grievance.findOneAndUpdate(
            { id: grievanceId },
            {
                $set: {
                    'detected_location.city': locationWithConstituency.city,
                    'detected_location.district': locationWithConstituency.district,
                    'detected_location.constituency': locationWithConstituency.constituency,
                    'detected_location.keyword_matched': locationWithConstituency.keyword_matched,
                    'detected_location.lat': locationWithConstituency.lat,
                    'detected_location.lng': locationWithConstituency.lng,
                    'detected_location.confidence': locationWithConstituency.confidence,
                    'detected_location.source': locationWithConstituency.source,
                }
            }
        );
        console.log(`[GrievanceLocation] Saved for ${grievanceId}: ${locationWithConstituency.city || 'unknown city'} (${locationWithConstituency.source})`);
    } catch (err) {
        console.warn(`[GrievanceLocation] Failed for ${grievanceId}: ${err.message}`);
    }
};

const reprocessMahbubnagarMappedGrievances = async ({
    dryRun = true,
    limit = null,
} = {}) => {
    const acRegexes = MAHABUBNAGAR_ACS.map((ac) => new RegExp(`^\\s*${escapeRegex(ac)}\\s*$`, 'i'));
    const filter = {
        is_active: true,
        $or: [
            { 'detected_location.city': /mahabubnagar|mahbubnagar/i },
            { 'detected_location.district': /mahabubnagar|mahbubnagar/i },
            { 'detected_location.constituency': /mahabubnagar|mahbubnagar/i },
            { 'detected_location.constituency': { $in: acRegexes } }
        ]
    };

    const cursor = Grievance.find(filter)
        .sort({ _id: 1 })
        .select({
            id: 1,
            'content.text': 1,
            'content.full_text': 1,
            detected_location: 1
        })
        .lean()
        .cursor();

    let scanned = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    const rrState = { nextIndex: 0 };

    if (dryRun) {
        const settings = await GrievanceSettings.findOne({ id: 'grievance_settings' }).select({ mahabubnagar_ac_rr_index: 1 }).lean();
        const currentIndex = Number(settings?.mahabubnagar_ac_rr_index || 0);
        rrState.nextIndex = ((currentIndex % MAHABUBNAGAR_ACS.length) + MAHABUBNAGAR_ACS.length) % MAHABUBNAGAR_ACS.length;
    }

    for await (const grievance of cursor) {
        if (limit && scanned >= limit) break;
        scanned += 1;

        try {
            const text = grievance?.content?.full_text || grievance?.content?.text || '';
            const before = {
                city: grievance?.detected_location?.city || null,
                district: grievance?.detected_location?.district || null,
                constituency: grievance?.detected_location?.constituency || null,
                keyword_matched: grievance?.detected_location?.keyword_matched || null,
                lat: grievance?.detected_location?.lat ?? null,
                lng: grievance?.detected_location?.lng ?? null,
                confidence: grievance?.detected_location?.confidence ?? null,
                source: grievance?.detected_location?.source || null
            };

            const after = await locationExtractionService.enrichWithMahbubnagarConstituency(before, text, { dryRun, rrState });
            const changed = (
                before.city !== after.city ||
                before.district !== after.district ||
                before.constituency !== after.constituency ||
                before.keyword_matched !== after.keyword_matched ||
                before.lat !== after.lat ||
                before.lng !== after.lng ||
                Number(before.confidence || 0) !== Number(after.confidence || 0) ||
                before.source !== after.source
            );

            if (!changed) {
                unchanged += 1;
                continue;
            }

            updated += 1;
            if (!dryRun) {
                await Grievance.findOneAndUpdate(
                    { id: grievance.id },
                    {
                        $set: {
                            'detected_location.city': after.city,
                            'detected_location.district': after.district,
                            'detected_location.constituency': after.constituency,
                            'detected_location.keyword_matched': after.keyword_matched,
                            'detected_location.lat': after.lat,
                            'detected_location.lng': after.lng,
                            'detected_location.confidence': after.confidence,
                            'detected_location.source': after.source,
                        }
                    }
                );
            }
        } catch (error) {
            failed += 1;
            console.warn(`[MahbubnagarReprocess] Failed for grievance ${grievance?.id || 'unknown'}: ${error.message}`);
        }
    }

    return {
        dry_run: dryRun,
        scanned,
        updated,
        unchanged,
        failed
    };
};

/**
 * Run the full analysis pipeline on a grievance's text content.
 * Updates the grievance document in-place with analysis results.
 * Runs async (fire-and-forget) so it doesn't block ingestion.
 */
const analyzeGrievanceContent = async (grievanceId, text, platform, postedBy = {}, metadata = {}) => {
    try {
        if (!text || !text.trim()) return;
        const analysisData = await analyzeContent(text, {
            platform: platform || 'x',
            skipForensics: true,
            postedBy: postedBy,
            mentions: metadata.mentions || [],
            taggedAccount: metadata.taggedAccount || null
        });
        if (!analysisData) return;

        // Use dynamically generated sentiment from AI analysis, fallback to neutral
        const sentiment = analysisData.sentiment || 'neutral';
        const loc = analysisData.detected_location;

        const updatedGrievance = await Grievance.findOneAndUpdate(
            { id: grievanceId },
            {
                $set: {
                    'analysis.sentiment': sentiment,
                    'analysis.target_party': analysisData.target_party,
                    'analysis.stance': analysisData.stance,
                    'analysis.risk_level': analysisData.risk_level,
                    'analysis.risk_score': analysisData.risk_score,
                    'analysis.category': analysisData.category,
                    'analysis.grievance_type': analysisData.grievance_type || 'Normal',
                    'analysis.grievance_topic_reasoning': analysisData.grievance_topic_reasoning || '',
                    'analysis.intent': analysisData.intent,
                    'analysis.explanation': analysisData.explanation,
                    'analysis.triggered_keywords': analysisData.triggered_keywords || [],
                    'analysis.violated_policies': analysisData.violated_policies || [],
                    'analysis.legal_sections': analysisData.legal_sections || [],
                    'analysis.reasons': analysisData.reasons || [],
                    'analysis.highlights': analysisData.highlights || [],
                    'analysis.llm_analysis': analysisData.llm_analysis || null,
                    'analysis.forensic_results': analysisData.forensic_results || null,
                    'analysis.analyzed_at': new Date(),
                    // Also save the location if found during analysis
                    ...(loc && {
                        'detected_location.city': loc.city,
                        'detected_location.district': loc.district,
                        'detected_location.constituency': loc.constituency,
                        'detected_location.keyword_matched': loc.keyword_matched,
                        'detected_location.lat': loc.lat,
                        'detected_location.lng': loc.lng,
                        'detected_location.confidence': loc.confidence,
                        'detected_location.source': loc.source,
                    }),
                    // Save linked persons
                    'linked_persons': analysisData.linked_persons || []
                }
            },
            { new: true }
        );

        // --- MEDIA ARCHIVAL (NEW) ---
        if (updatedGrievance && updatedGrievance.content?.media?.length > 0) {
            try {
                console.log(`[GrievanceMedia] Archiving media for ${grievanceId}...`);
                const archivedMedia = await archiveTwitterMedia(
                    updatedGrievance.content.media, 
                    grievanceId, 
                    { postUrl: updatedGrievance.tweet_url }
                );
                if (archivedMedia) {
                    await Grievance.updateOne(
                        { id: grievanceId },
                        { $set: { 'content.media': archivedMedia } }
                    );
                    console.log(`[GrievanceMedia] Successfully archived media for ${grievanceId}`);
                }
            } catch (mediaErr) {
                console.warn(`[GrievanceMedia] Archival failed for ${grievanceId}: ${mediaErr.message}`);
            }
        }
        console.log(`[GrievanceAnalysis] Completed for ${grievanceId}: ${sentiment} (${analysisData.risk_level || 'low'})`);
    } catch (err) {
        console.error(`[GrievanceAnalysis] Failed for ${grievanceId}: ${err.message}`);
    }
};

/**
 * Grievance Service
 * Handles fetching mentions from X, processing grievances, and generating reports
 */

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

const extractMediaFromLegacy = (legacy) => {
    const media = [];
    const mediaEntities = legacy?.extended_entities?.media || legacy?.entities?.media || [];

    for (const m of mediaEntities) {
        const mediaType = m.type || 'photo';
        let mediaUrl = m.media_url_https || m.url;
        let videoUrl = null;

        // For videos and animated_gifs, extract the actual video URL from video_info
        if ((mediaType === 'video' || mediaType === 'animated_gif') && m.video_info?.variants) {
            const mp4Variants = m.video_info.variants
                .filter(v => v.content_type === 'video/mp4')
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

            if (mp4Variants.length > 0) {
                videoUrl = mp4Variants[0].url;
            } else if (m.video_info.variants.length > 0) {
                videoUrl = m.video_info.variants[0].url;
            }
        }

        media.push({
            type: mediaType,
            url: videoUrl || mediaUrl,
            video_url: videoUrl,
            preview_url: m.media_url_https
        });
    }

    return media;
};

const extractTweetSnapshot = (tweetResult) => {
    if (!tweetResult) return null;

    // Handle TweetWithVisibilityResults wrapper
    let result = tweetResult;
    if (result.__typename === 'TweetWithVisibilityResults' && result.tweet) {
        result = result.tweet;
    }
    if (result.__typename === 'TweetUnavailable' || result.__typename === 'TweetTombstone') return null;

    const legacy = result.legacy;
    if (!legacy?.id_str) return null;

    const userResult = result.core?.user_results?.result;
    const userLegacy = userResult?.legacy || {};

    let createdAt = null;
    try {
        if (legacy.created_at) {
            const parsed = new Date(legacy.created_at);
            if (!isNaN(parsed)) createdAt = parsed;
        }
    } catch (e) {
        createdAt = null;
    }

    const handle = userLegacy.screen_name || userResult?.core?.screen_name || 'unknown';
    const tweetUrl = handle && handle !== 'unknown'
        ? `https://x.com/${handle}/status/${legacy.id_str}`
        : `https://x.com/i/web/status/${legacy.id_str}`;

    const noteText = result.note_tweet?.note_tweet_results?.result?.text;
    const text = noteText || legacy.full_text || legacy.text || '';

    return {
        tweet_id: legacy.id_str,
        tweet_url: tweetUrl,
        posted_by: {
            handle,
            display_name: userLegacy.name || userResult?.core?.name || userResult?.legacy?.name || (handle !== 'unknown' ? handle : 'Unknown User'),
            profile_image_url: userLegacy.profile_image_url_https || userResult?.avatar?.image_url,
            is_verified: userResult?.is_blue_verified || userLegacy.verified || false
        },
        content: {
            text,
            full_text: text,
            media: extractMediaFromLegacy(legacy)
        },
        post_date: createdAt
    };
};

const getTimelineEntriesFromSearchResponse = (data) => {
    const instructions = data?.result?.timeline?.instructions ||
        data?.timeline?.instructions ||
        data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
        [];

    return instructions.find(i => i.type === 'TimelineAddEntries')?.entries ||
        instructions[0]?.entries ||
        [];
};

const fetchTweetById = async (tweetId, cache = null) => {
    const key = String(tweetId || '').trim();
    if (!key) return null;
    if (cache && cache.has(key)) return cache.get(key);

    let snapshot = null;

    // Attempt 1: provider-specific tweet endpoint (if available)
    const endpointAttempts = [
        { path: '/tweet', params: { id: key } },
        { path: '/tweet', params: { tweet_id: key } },
        { path: '/tweet-details', params: { id: key } },
        { path: '/tweet-details', params: { tweet_id: key } }
    ];

    for (const attempt of endpointAttempts) {
        try {
            const res = await axios.get(`https://${process.env.RAPIDAPI_HOST}${attempt.path}`, {
                params: attempt.params,
                headers: getRapidApiHeaders()
            });

            const tweetResult = res.data?.result?.tweet ||
                res.data?.result?.tweet_results?.result ||
                res.data?.tweet_results?.result ||
                res.data?.result;

            snapshot = extractTweetSnapshot(tweetResult);
            if (snapshot) break;
        } catch (e) {
            // continue
        }
    }

    // Attempt 2: fallback to search by URL operator
    if (!snapshot) {
        try {
            const searchQuery = `url:\"/status/${key}\"`;
            const res = await axios.get(`https://${process.env.RAPIDAPI_HOST}/search`, {
                params: { query: searchQuery, type: 'Latest', count: 10 },
                headers: getRapidApiHeaders()
            });

            const entries = getTimelineEntriesFromSearchResponse(res.data);
            for (const entry of entries) {
                if (entry.entryId?.startsWith('cursor-')) continue;
                let tweetResult = entry.content?.itemContent?.tweet_results?.result;
                if (!tweetResult) continue;

                // unwrap
                if (tweetResult.__typename === 'TweetWithVisibilityResults' && tweetResult.tweet) {
                    tweetResult = tweetResult.tweet;
                }
                const legacy = tweetResult?.legacy;
                if (!legacy?.id_str) continue;
                if (legacy.id_str !== key) continue;

                snapshot = extractTweetSnapshot(tweetResult);
                if (snapshot) break;
            }
        } catch (e) {
            snapshot = null;
        }
    }

    if (cache) cache.set(key, snapshot);
    return snapshot;
};

/**
 * Fetch user profile to get user ID
 */
const fetchUserProfile = async (handle) => {
    try {
        const cleanHandle = handle.replace('@', '').trim();

        const userResponse = await axios.get(`https://${process.env.RAPIDAPI_HOST}/user`, {
            params: { username: cleanHandle },
            headers: getRapidApiHeaders()
        });

        let result = null;
        if (userResponse.data?.result?.data?.user?.result) {
            result = userResponse.data.result.data.user.result;
        } else if (userResponse.data?.data?.user?.result) {
            result = userResponse.data.data.user.result;
        } else if (userResponse.data?.result) {
            result = userResponse.data.result;
        }

        if (!result) return null;

        return {
            id: result.rest_id,
            name: result.legacy?.name,
            screenName: result.legacy?.screen_name,
            isVerified: result.is_blue_verified || result.legacy?.verified || false,
            profileImageUrl: result.avatar?.image_url || result.legacy?.profile_image_url_https
        };
    } catch (error) {
        return null;
    }
};

/**
 * Format date to YYYY-MM-DD for Twitter search query
 */
const formatDateForSearch = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Search for tweets mentioning a specific account using the search endpoint
 * @param {string} handle - Twitter handle to search mentions for
 * @param {number} limit - Maximum number of tweets to fetch
 * @param {string} startDate - Start date for search (YYYY-MM-DD)
 * @param {string} endDate - End date for search (YYYY-MM-DD)
 */
const searchMentions = async (handle, limit = 50, startDate = null, endDate = null) => {
    try {
        const cleanHandle = handle.replace('@', '').trim();

        // Build search query with date filters
        let searchQuery = `@${cleanHandle}`;

        // Calculate days range to adjust limit
        let daysRange = 1;
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            daysRange = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        }

        // Increase limit based on date range (more days = need more tweets)
        const adjustedLimit = Math.min(100, Math.max(limit, daysRange * 20));

        // Add date filter using Twitter's since: operator only
        // Twitter search works best with just since: (until: can cause issues)
        if (startDate) {
            const formattedStart = formatDateForSearch(startDate);
            if (formattedStart) {
                searchQuery += ` since:${formattedStart}`;
            }
        }



        const response = await axios.get(`https://${process.env.RAPIDAPI_HOST}/search`, {
            params: {
                query: searchQuery,
                type: 'Latest',
                count: adjustedLimit
            },
            headers: getRapidApiHeaders()
        });


        // Log raw response structure for debugging
        if (response.data) {
        }

        // Parse the timeline entries - handle multiple response structures
        const instructions = response.data?.result?.timeline?.instructions ||
            response.data?.timeline?.instructions ||
            response.data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
            [];

        const timelineEntries = instructions.find(i => i.type === 'TimelineAddEntries')?.entries ||
            instructions[0]?.entries ||
            [];


        const tweets = [];
        const processedIds = new Set();
        const parentTweetCache = new Map();

        for (const entry of timelineEntries) {
            // Skip cursor entries
            if (entry.entryId?.startsWith('cursor-')) continue;

            let tweetResult = entry.content?.itemContent?.tweet_results?.result;
            if (!tweetResult) continue;

            // Handle TweetWithVisibilityResults wrapper
            if (tweetResult.__typename === 'TweetWithVisibilityResults' && tweetResult.tweet) {
                tweetResult = tweetResult.tweet;
            }

            // Skip unavailable tweets
            if (tweetResult.__typename === 'TweetUnavailable' || tweetResult.__typename === 'TweetTombstone') {
                continue;
            }

            const legacy = tweetResult.legacy;
            if (!legacy) continue;

            // Skip duplicates
            if (processedIds.has(legacy.id_str)) continue;
            processedIds.add(legacy.id_str);

            // Extract user info
            const userResult = tweetResult.core?.user_results?.result;
            const userLegacy = userResult?.legacy || {};

            // Verify this tweet actually mentions the target account
            const mentions = legacy.entities?.user_mentions || [];
            const isMentioned = mentions.some(m =>
                m.screen_name?.toLowerCase() === cleanHandle.toLowerCase()
            );
            const textContainsMention = legacy.full_text?.toLowerCase().includes(`@${cleanHandle.toLowerCase()}`);

            if (!isMentioned && !textContainsMention) {
                continue;
            }

            let media = extractMediaFromLegacy(legacy);

            // Repost (retweet) context
            let repostedFrom = null;
            let retweetResult = legacy.retweeted_status_result?.result;
            if (retweetResult && retweetResult.__typename === 'TweetWithVisibilityResults' && retweetResult.tweet) {
                retweetResult = retweetResult.tweet;
            }
            if (retweetResult) {
                repostedFrom = extractTweetSnapshot(retweetResult);
                // Retweets often don't have media on the wrapper tweet; pull from original.
                if ((!media || media.length === 0) && repostedFrom?.content?.media?.length) {
                    media = repostedFrom.content.media;
                }
            }

            // Quote tweet context
            let quoted = null;
            let rawQuote = tweetResult?.quoted_status_result?.result || tweetResult?.quoted_status_result;
            if (rawQuote && (rawQuote.result || rawQuote.tweet)) {
                rawQuote = rawQuote.result || rawQuote.tweet;
            }
            if (rawQuote && rawQuote.__typename === 'TweetWithVisibilityResults' && rawQuote.tweet) {
                rawQuote = rawQuote.tweet;
            }
            if (rawQuote) {
                quoted = extractTweetSnapshot(rawQuote);
            } else if (legacy.quoted_status_id_str) {
                quoted = await fetchTweetById(legacy.quoted_status_id_str, parentTweetCache);
            }

            // Reply context (original post)
            const inReplyToId = legacy.in_reply_to_status_id_str;
            const inReplyToHandle = legacy.in_reply_to_screen_name;

            let inReplyTo = null;
            if (inReplyToId) {
                inReplyTo = await fetchTweetById(inReplyToId, parentTweetCache);
                if (!inReplyTo) {
                    const fallbackUrl = inReplyToHandle
                        ? `https://x.com/${inReplyToHandle}/status/${inReplyToId}`
                        : `https://x.com/i/web/status/${inReplyToId}`;
                    inReplyTo = {
                        tweet_id: String(inReplyToId),
                        tweet_url: fallbackUrl,
                        posted_by: { handle: inReplyToHandle || undefined },
                        content: {},
                        post_date: null
                    };
                }
            }

            // Parse date safely
            let createdAt = new Date();
            try {
                if (legacy.created_at) {
                    const parsed = new Date(legacy.created_at);
                    if (!isNaN(parsed)) {
                        createdAt = parsed;
                    }
                }
            } catch (e) {
            }

            const screenName = userLegacy.screen_name || userResult?.core?.screen_name || 'unknown';
            const tweetUrl = `https://x.com/${screenName}/status/${legacy.id_str}`;

            const context = {
                ...(inReplyTo ? { in_reply_to: inReplyTo } : {}),
                ...(repostedFrom ? { reposted_from: repostedFrom } : {}),
                ...(quoted ? { quoted } : {})
            };

            tweets.push({
                tweet_id: legacy.id_str,
                text: legacy.full_text,
                url: tweetUrl,
                created_at: createdAt,
                author: {
                    handle: screenName,
                    display_name: userLegacy.name || userResult?.core?.name || userResult?.legacy?.name || (screenName !== 'unknown' ? screenName : 'Unknown User'),
                    profile_image_url: userLegacy.profile_image_url_https || userResult?.avatar?.image_url,
                    is_verified: userResult?.is_blue_verified || userLegacy.verified || false,
                    follower_count: userLegacy.followers_count || 0
                },
                media,
                context: Object.keys(context).length > 0 ? context : undefined,
                engagement: {
                    likes: legacy.favorite_count || 0,
                    retweets: legacy.retweet_count || 0,
                    replies: legacy.reply_count || 0,
                    views: parseInt(tweetResult.views?.count || '0', 10),
                    quotes: legacy.quote_count || 0
                }
            });
        }

        return tweets;
    } catch (error) {
        if (error.response) {
        }
        return [];
    }
};

const isWithinDateRange = (dateValue, startDate, endDate) => {
    const d = new Date(dateValue);
    if (isNaN(d)) return false;

    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
    }

    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
    }

    return true;
};

const toSafeDate = (value, fallback = new Date()) => {
    const d = value ? new Date(value) : null;
    return d && !isNaN(d) ? d : fallback;
};

const toSafeHandle = (value, fallback = 'unknown') => {
    const v = String(value || '').trim();
    if (!v) return fallback;
    return v.replace(/\s+/g, '_').replace(/[^\w.-]/g, '').toLowerCase() || fallback;
};

const normalizeFacebookMedia = (mediaArray = []) => {
    if (!Array.isArray(mediaArray)) return [];

    return mediaArray
        .map((item) => {
            if (!item) return null;

            if (typeof item === 'string') {
                const guessedType = /\.(mp4|webm|mov)(\?|$)/i.test(item) ? 'video' : 'photo';
                return {
                    type: guessedType,
                    url: item,
                    video_url: guessedType === 'video' ? item : undefined,
                    preview_url: guessedType === 'photo' ? item : undefined
                };
            }

            const url = item.url || item.src || item.video || item.image || item.image_url || item.thumbnail || item.preview;
            if (!url) return null;

            const rawType = String(item.type || item.media_type || '').toLowerCase();
            const isVideo = rawType.includes('video') || /\.(mp4|webm|mov)(\?|$)/i.test(url);

            return {
                type: isVideo ? 'video' : 'photo',
                url,
                video_url: isVideo ? (item.video || url) : undefined,
                preview_url: item.preview || item.thumbnail || item.image || (isVideo ? undefined : url)
            };
        })
        .filter(Boolean);
};

const archiveTwitterMediaSafe = async (mediaItems, contentId, archiveMediaFn = archiveTwitterMedia, options = {}) => {
    if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
        return { media: [], failures: 0 };
    }

    try {
        const archived = await archiveMediaFn(mediaItems, contentId, options);
        const failures = archived.filter((item) => (item?.url || item?.video_url) && !item?.s3_url).length;
        return { media: archived, failures };
    } catch (error) {
        console.error(`[Grievance] Failed to archive media for ${contentId}: ${error.message}`);
        return { media: mediaItems, failures: mediaItems.length };
    }
};

const archiveMentionMediaForStorage = async (mention, archiveMediaFn = archiveTwitterMedia) => {
    const prepared = { ...mention };
    let failures = 0;

    // Pass tweet URL so the Python service (yt-dlp) can download videos from the page
    const tweetUrl = mention.url || (mention.tweet_id ? `https://x.com/i/status/${mention.tweet_id}` : undefined);
    const mainArchive = await archiveTwitterMediaSafe(mention.media, mention.tweet_id, archiveMediaFn, { postUrl: tweetUrl });
    prepared.media = mainArchive.media;
    failures += mainArchive.failures;

    if (mention.context && typeof mention.context === 'object') {
        const contextCopy = { ...mention.context };
        const contextKeys = ['in_reply_to', 'reposted_from', 'quoted'];

        for (const key of contextKeys) {
            const contextPost = mention.context[key];
            if (!contextPost?.content || !Array.isArray(contextPost.content.media) || contextPost.content.media.length === 0) continue;

            // Use context post's tweet_url for video downloads
            const contextTweetUrl = contextPost.tweet_url ||
                (contextPost.tweet_id ? `https://x.com/i/status/${contextPost.tweet_id}` : undefined);

            const contextArchive = await archiveTwitterMediaSafe(
                contextPost.content.media,
                `${mention.tweet_id}_${key}_${contextPost.tweet_id || 'unknown'}`,
                archiveMediaFn,
                { postUrl: contextTweetUrl }
            );

            failures += contextArchive.failures;
            contextCopy[key] = {
                ...contextPost,
                content: {
                    ...contextPost.content,
                    media: contextArchive.media
                }
            };
        }

        prepared.context = contextCopy;
    }

    prepared.upload_failures = failures;
    return prepared;
};

const upsertXGrievancesForSource = async (source, startDate = null, endDate = null, deps = {}) => {
    const searchMentionsFn = deps.searchMentionsFn || searchMentions;
    const GrievanceModel = deps.GrievanceModel || Grievance;
    const archiveMentionFn = deps.archiveMentionFn || archiveMentionMediaForStorage;
    const archiveMediaFn = deps.archiveMediaFn || archiveTwitterMedia;
    const complaintCodeFn = deps.complaintCodeFn || generateComplaintCode;

    const mentions = await searchMentionsFn(source.handle, 100, startDate, endDate);
    const relevanceTerms = await getRelevanceTerms();
    let newCount = 0;
    let skippedIrrelevant = 0;

    for (const mention of mentions) {
        const postDate = toSafeDate(mention.created_at);
        if ((startDate || endDate) && !isWithinDateRange(postDate, startDate, endDate)) continue;

        const existing = await GrievanceModel.findOne({ tweet_id: mention.tweet_id });
        if (existing) continue;

        // Strict: only a real handle mention or a tracked keyword lets a post through —
        // no language/script leniency for anything else.
        if (!textMatchesAnyKeyword(mention.text, relevanceTerms)) {
            skippedIrrelevant += 1;
            continue;
        }

        const preparedMention = await archiveMentionFn(mention, archiveMediaFn);
        if (preparedMention.upload_failures > 0) {
            console.warn(`[Grievance] Partial media archive failure for tweet ${mention.tweet_id}: ${preparedMention.upload_failures} item(s)`);
        }

        const grievance = new GrievanceModel({
            complaint_code: await complaintCodeFn(),
            tweet_id: preparedMention.tweet_id,
            tagged_account: source.handle,
            tagged_account_normalized: String(source.handle || '').replace(/^@/, '').toLowerCase(),
            grievance_source_id: source.id,
            platform: 'x',
            posted_by: {
                handle: preparedMention.author.handle,
                display_name: preparedMention.author.display_name,
                profile_image_url: preparedMention.author.profile_image_url,
                is_verified: preparedMention.author.is_verified,
                follower_count: preparedMention.author.follower_count
            },
            content: {
                text: preparedMention.text,
                full_text: preparedMention.text,
                media: preparedMention.media
            },
            context: preparedMention.context,
            tweet_url: preparedMention.url,
            engagement: preparedMention.engagement,
            post_date: postDate,
            detected_date: new Date(),
            workflow_status: 'received',
            workflow_timestamps: {
                received_at: new Date()
            },
            escalation_count: 0
        });

        syncLegacyFieldsFromWorkflow(grievance, 'received');

        await grievance.save();
        // Sequential analysis: complete before moving to next grievance
        await analyzeGrievanceContent(grievance.id, preparedMention.text, 'x');
        // Extract and persist location from text
        await extractAndSaveLocation(grievance.id, preparedMention.text, preparedMention.author);
        // Stagger delay to reduce model load
        if (mentions.length > 1) await new Promise(r => setTimeout(r, 2000));
        newCount += 1;
    }

    if (skippedIrrelevant > 0) {
        console.log(`[Grievance][${source.handle}] Skipped ${skippedIrrelevant} irrelevant mention(s) (ASCII-art/off-topic-language noise)`);
    }

    return { newCount, totalFetched: mentions.length };
};

const upsertFacebookGrievancesForSource = async (source, startDate = null, endDate = null) => {
    const posts = await rapidApiFacebookService.fetchPagePosts(source.handle, 40, source.display_name);
    // The page's own posts are kept unconditionally (this is the tracked
    // official source itself). Public comments are search-like noise the
    // same way X mentions are, so they go through the same relevance check.
    const relevanceTerms = await getRelevanceTerms();
    let newCount = 0;
    let totalFetched = 0;

    for (const post of posts) {
        const postId = String(post?.id || '').trim();
        if (!postId) continue;

        const postDate = toSafeDate(post.created_at);
        if ((startDate || endDate) && !isWithinDateRange(postDate, startDate, endDate)) continue;

        totalFetched += 1;

        const canonicalPostId = `facebook:post:${postId}`;
        const existingPost = await Grievance.findOne({ tweet_id: canonicalPostId });
        const postUrl = post.url || `https://facebook.com/${postId}`;
        const postMedia = normalizeFacebookMedia(post.media);
        const postAuthorHandle = toSafeHandle(post.author_id || post.author_name);
        const postAuthorName = post.author_name || source.display_name || source.handle;
        const postText = String(post.text || '').trim() || '[Facebook post without text]';

        if (!existingPost) {
            const grievance = new Grievance({
                complaint_code: await generateComplaintCode(),
                tweet_id: canonicalPostId,
                tagged_account: source.handle,
                tagged_account_normalized: String(source.handle || '').replace(/^@/, '').toLowerCase(),
                grievance_source_id: source.id,
                platform: 'facebook',
                posted_by: {
                    handle: postAuthorHandle,
                    display_name: postAuthorName,
                    profile_image_url: '',
                    is_verified: false,
                    follower_count: 0
                },
                content: {
                    text: postText,
                    full_text: postText,
                    media: postMedia
                },
                tweet_url: postUrl,
                engagement: {
                    likes: post.engagement?.likes || 0,
                    retweets: post.engagement?.shares || 0,
                    replies: post.engagement?.comments || 0,
                    views: post.engagement?.views || 0,
                    quotes: 0
                },
                post_date: postDate,
                detected_date: new Date(),
                workflow_status: 'received',
                workflow_timestamps: {
                    received_at: new Date()
                },
                escalation_count: 0
            });

            syncLegacyFieldsFromWorkflow(grievance, 'received');
            await grievance.save();
            // Sequential analysis: complete before moving to next
            await analyzeGrievanceContent(grievance.id, postText, 'facebook');
            // Extract and persist location from text
            await extractAndSaveLocation(grievance.id, postText, { location: '', bio: '' });
            // Stagger delay to reduce model load
            await new Promise(r => setTimeout(r, 2000));
            newCount += 1;
        }

        const comments = await rapidApiFacebookService.fetchPostComments(postId, 50);

        for (const comment of comments) {
            const commentId = String(comment?.id || '').trim();
            if (!commentId) continue;

            const commentDate = toSafeDate(comment.created_at, postDate);
            if ((startDate || endDate) && !isWithinDateRange(commentDate, startDate, endDate)) continue;
            const commentText = String(comment.text || '').trim() || '[Facebook comment without text]';

            totalFetched += 1;

            const canonicalCommentId = `facebook:comment:${commentId}`;
            const existingComment = await Grievance.findOne({ tweet_id: canonicalCommentId });
            if (existingComment) continue;

            if (!textMatchesAnyKeyword(commentText, relevanceTerms)) {
                console.log(`[Grievance][FB] Skipping irrelevant comment ${commentId} — no known keyword/candidate found in text`);
                continue;
            }

            const commentUrl = postUrl.includes('?')
                ? `${postUrl}&comment_id=${encodeURIComponent(commentId)}`
                : `${postUrl}?comment_id=${encodeURIComponent(commentId)}`;

            const grievance = new Grievance({
                complaint_code: await generateComplaintCode(),
                tweet_id: canonicalCommentId,
                tagged_account: source.handle,
                tagged_account_normalized: String(source.handle || '').replace(/^@/, '').toLowerCase(),
                grievance_source_id: source.id,
                platform: 'facebook',
                posted_by: {
                    handle: toSafeHandle(comment.author_id || comment.author_name),
                    display_name: comment.author_name || 'Facebook User',
                    profile_image_url: comment.author_image || '',
                    is_verified: false,
                    follower_count: 0
                },
                content: {
                    text: commentText,
                    full_text: commentText,
                    media: []
                },
                context: {
                    in_reply_to: {
                        tweet_id: canonicalPostId,
                        tweet_url: postUrl,
                        posted_by: {
                            handle: postAuthorHandle,
                            display_name: postAuthorName,
                            profile_image_url: '',
                            is_verified: false
                        },
                        content: {
                            text: postText,
                            full_text: postText,
                            media: postMedia
                        },
                        post_date: postDate
                    }
                },
                tweet_url: commentUrl,
                engagement: {
                    likes: comment.likes || 0,
                    retweets: 0,
                    replies: comment.replies_count || 0,
                    views: 0,
                    quotes: 0
                },
                post_date: commentDate,
                detected_date: new Date(),
                workflow_status: 'received',
                workflow_timestamps: {
                    received_at: new Date()
                },
                escalation_count: 0
            });

            syncLegacyFieldsFromWorkflow(grievance, 'received');
            await grievance.save();
            // Sequential analysis: complete before moving to next
            await analyzeGrievanceContent(grievance.id, commentText, 'facebook');
            // Extract and persist location from comment text
            await extractAndSaveLocation(grievance.id, commentText, { location: '', bio: '' });
            // Stagger delay to reduce model load
            await new Promise(r => setTimeout(r, 2000));
            newCount += 1;
        }
    }

    return { newCount, totalFetched };
};

const upsertGrievancesForSource = async (source, startDate = null, endDate = null) => {
    const platform = (source.platform || 'x').toLowerCase();
    if (platform === 'facebook') {
        return upsertFacebookGrievancesForSource(source, startDate, endDate);
    }
    return upsertXGrievancesForSource(source, startDate, endDate);
};

/**
 * Fetch and process grievances for all active sources with optional date filter
 */
const fetchAllGrievances = async (startDate = null, endDate = null) => {
    try {
        const sources = await GrievanceSource.find({ is_active: true });
        let totalNew = 0;

        // --- Source-based fetching (mentions via @handle) ---
        for (const source of sources) {
            // Pause between sources while a Frequent Engagers analysis is
            // actively using the shared RapidAPI key — this is a background
            // batch job, that's interactive and user-waited-on.
            await yieldToInteractive();
            const result = await upsertGrievancesForSource(source, startDate, endDate);
            totalNew += result.newCount;

            await GrievanceSource.findOneAndUpdate(
                { id: source.id },
                {
                    $inc: { total_grievances: result.newCount },
                    last_fetched: new Date()
                }
            );
        }

        // --- Keyword-based X/Twitter fetching ---
        // Delegates to fetchKeywordGrievances, which enforces textMatchesAnyKeyword()
        // relevance filtering — X "Top" search routinely returns loosely-related
        // results that never actually contain the searched term.
        let keywordNew = 0;
        try {
            const xResult = await fetchKeywordGrievances('x');
            keywordNew = xResult?.newGrievances || 0;
            console.log(`[FetchAll][X-Keywords] Total new from keywords: ${keywordNew}`);
        } catch (kwErr) {
            console.error(`[FetchAll][X-Keywords] Keyword fetch failed: ${kwErr.message}`);
        }

        // --- Keyword-based Facebook fetching ---
        let fbKeywordNew = 0;
        try {
            const fbResult = await fetchKeywordGrievances('facebook');
            fbKeywordNew = fbResult?.newGrievances || 0;
            console.log(`[FetchAll][FB-Keywords] Total new from keywords: ${fbKeywordNew}`);
        } catch (fbErr) {
            console.error(`[FetchAll][FB-Keywords] Keyword fetch failed: ${fbErr.message}`);
        }

        totalNew += keywordNew + fbKeywordNew;
        return { newGrievances: totalNew, fromSources: totalNew - keywordNew - fbKeywordNew, fromKeywords: keywordNew + fbKeywordNew };
    } catch (error) {
        throw error;
    }
};

/**
 * Fetch grievances for a specific source with optional date filter
 */
const fetchGrievancesForSource = async (sourceId, startDate = null, endDate = null) => {
    try {
        const source = await GrievanceSource.findOne({ id: sourceId });
        if (!source) {
            throw new Error('Source not found');
        }

        const result = await upsertGrievancesForSource(source, startDate, endDate);

        await GrievanceSource.findOneAndUpdate(
            { id: sourceId },
            {
                $inc: { total_grievances: result.newCount },
                last_fetched: new Date()
            }
        );

        return { newGrievances: result.newCount, total: result.totalFetched };
    } catch (error) {
        throw error;
    }
};

/**
 * Generate unique report number
 */
const generateReportNumber = async () => {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);

    // Get count of reports generated today
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const count = await Grievance.countDocuments({
        'complaint.report_number': { $exists: true, $ne: null },
        'complaint.action_taken_at': { $gte: startOfDay, $lte: endOfDay }
    });

    const serial = String(count + 1).padStart(3, '0');
    return `X-GRV-${day}-${month}-${year}-${serial}`;
};

/**
 * Generate PDF report for a grievance
 */
const generatePDFReport = async (grievanceId) => {
    try {
        const grievance = await Grievance.findOne({ id: grievanceId });
        if (!grievance) {
            throw new Error('Grievance not found');
        }

        // Generate report number if not exists
        if (!grievance.complaint.report_number) {
            grievance.complaint.report_number = await generateReportNumber();
            grievance.complaint.action_taken_at = new Date();
            await grievance.save();
        }

        const settings = await GrievanceSettings.findOne({ id: 'grievance_settings' });
        const reportSettings = settings?.report_settings || {};

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));

        // Header
        doc.fontSize(18).font('Helvetica-Bold')
            .text(reportSettings.header_text || 'OFFICIAL GRIEVANCE REPORT', { align: 'center' });

        doc.moveDown();
        doc.fontSize(12).font('Helvetica')
            .text(`Report Number: ${grievance.complaint.report_number}`, { align: 'center' });
        doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { align: 'center' });

        doc.moveDown(2);

        // Complaint Details Table
        doc.fontSize(14).font('Helvetica-Bold').text('COMPLAINT DETAILS');
        doc.moveDown(0.5);

        // Draw table
        const tableTop = doc.y;
        const tableLeft = 50;
        const colWidth = 250;

        const drawRow = (label, value, y) => {
            doc.font('Helvetica-Bold').fontSize(10).text(label, tableLeft, y, { width: 150 });
            doc.font('Helvetica').fontSize(10).text(value || 'N/A', tableLeft + 160, y, { width: colWidth });
        };

        let currentY = tableTop;
        const rowHeight = 25;

        drawRow('Posted By:', `@${grievance.posted_by.handle}`, currentY);
        currentY += rowHeight;

        drawRow('Post Date & Time:', new Date(grievance.post_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), currentY);
        currentY += rowHeight;

        drawRow('Detected Date & Time:', new Date(grievance.detected_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), currentY);
        currentY += rowHeight;

        drawRow('Tagged Account:', grievance.tagged_account, currentY);
        currentY += rowHeight;

        drawRow('Platform:', 'X (Twitter)', currentY);
        currentY += rowHeight;

        drawRow('Priority:', (grievance.complaint.priority || 'Medium').toUpperCase(), currentY);
        currentY += rowHeight;

        drawRow('Status:', (grievance.complaint.status || 'Pending').replace('_', ' ').toUpperCase(), currentY);
        currentY += rowHeight;

        doc.moveDown(2);

        // Post Content
        doc.fontSize(14).font('Helvetica-Bold').text('POST CONTENT');
        doc.moveDown(0.5);

        doc.rect(tableLeft, doc.y, 500, 100).stroke();
        const contentY = doc.y + 10;
        doc.fontSize(10).font('Helvetica').text(grievance.content.text, tableLeft + 10, contentY, {
            width: 480,
            height: 80
        });

        doc.y = contentY + 90;
        doc.moveDown();

        // Engagement Stats
        if (reportSettings.include_engagement_stats !== false) {
            doc.fontSize(14).font('Helvetica-Bold').text('ENGAGEMENT METRICS');
            doc.moveDown(0.5);

            const eng = grievance.engagement || {};
            doc.fontSize(10).font('Helvetica');
            doc.text(`Likes: ${eng.likes || 0}  |  Retweets: ${eng.retweets || 0}  |  Replies: ${eng.replies || 0}  |  Views: ${eng.views || 0}`);
        }

        doc.moveDown(2);

        // Action Details
        if (grievance.complaint.action_taken) {
            doc.fontSize(14).font('Helvetica-Bold').text('ACTION DETAILS');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica').text(grievance.complaint.action_taken);
        }

        // Footer
        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica')
            .text(reportSettings.footer_text || 'This is a system-generated report.', { align: 'center' });

        doc.text(`Tweet URL: ${grievance.tweet_url}`, { align: 'center' });

        doc.end();

        return new Promise((resolve, reject) => {
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(chunks);
                resolve({
                    buffer: pdfBuffer,
                    filename: `${grievance.complaint.report_number}.pdf`,
                    reportNumber: grievance.complaint.report_number
                });
            });
            doc.on('error', reject);
        });
    } catch (error) {
        throw error;
    }
};

/**
 * Get grievance statistics
 */
const getGrievanceStats = async () => {
    try {
        const total = await Grievance.countDocuments({ is_active: true });
        const unclassified = await Grievance.countDocuments({ classification: 'unclassified', is_active: true });
        const acknowledged = await Grievance.countDocuments({ classification: 'acknowledged', is_active: true });
        const complaints = await Grievance.countDocuments({ classification: 'complaint', is_active: true });

        const pending = await Grievance.countDocuments({
            classification: 'complaint',
            'complaint.status': 'pending',
            is_active: true
        });
        const sent = await Grievance.countDocuments({
            classification: 'complaint',
            'complaint.status': 'sent',
            is_active: true
        });
        const reviewed = await Grievance.countDocuments({
            classification: 'complaint',
            'complaint.status': 'reviewed',
            is_active: true
        });
        const caseBooked = await Grievance.countDocuments({
            classification: 'complaint',
            'complaint.status': 'case_booked',
            is_active: true
        });
        const workflowPending = await Grievance.countDocuments({
            is_active: true,
            workflow_status: { $in: ['received', 'reviewed', 'action_taken'] }
        });
        const workflowClosed = await Grievance.countDocuments({
            is_active: true,
            workflow_status: 'closed'
        });
        const workflowFir = await Grievance.countDocuments({
            is_active: true,
            workflow_status: 'converted_to_fir'
        });

        const sources = await GrievanceSource.countDocuments({ is_active: true });

        return {
            total,
            total_complaints: total,
            unclassified,
            acknowledged,
            complaints,
            pending: workflowPending,
            closed: workflowClosed,
            converted_to_fir: workflowFir,
            byStatus: {
                pending,
                sent,
                reviewed,
                case_booked: caseBooked
            },
            activeSources: sources
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Generate 3 search variants from a keyword:
 *  - @handle variant (mention)
 *  - #hashtag variant
 *  - plain text variant (stripped of @ and #)
 */
const generateKeywordVariants = (keyword) => {
    const raw = keyword.trim();
    if (!raw) return [];
    // Strip leading @ or # to get the base term
    const base = raw.replace(/^[@#]+/, '').trim();
    if (!base) return [];
    const variants = new Set();
    variants.add(`@${base}`);       // as handle/mention
    variants.add(`#${base}`);       // as hashtag
    variants.add(base);             // as plain text
    return [...variants];
};

/**
 * Search X for tweets matching a keyword query.
 */
const searchXByKeyword = async (query, limit = 50) => {
    try {
        if (!query.trim()) return [];
        const response = await axios.get(`https://${process.env.RAPIDAPI_HOST}/search`, {
            params: { query: query.trim(), type: 'Latest', count: Math.min(100, limit) },
            headers: getRapidApiHeaders()
        });

        const instructions = response.data?.result?.timeline?.instructions ||
            response.data?.timeline?.instructions ||
            response.data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];
        const timelineEntries = instructions.find(i => i.type === 'TimelineAddEntries')?.entries ||
            instructions[0]?.entries || [];

        const tweets = [];
        const processedIds = new Set();
        const parentTweetCache = new Map();

        for (const entry of timelineEntries) {
            if (entry.entryId?.startsWith('cursor-')) continue;
            let tweetResult = entry.content?.itemContent?.tweet_results?.result;
            if (!tweetResult) continue;
            if (tweetResult.__typename === 'TweetWithVisibilityResults' && tweetResult.tweet) tweetResult = tweetResult.tweet;
            if (tweetResult.__typename === 'TweetUnavailable' || tweetResult.__typename === 'TweetTombstone') continue;
            const legacy = tweetResult.legacy;
            if (!legacy || processedIds.has(legacy.id_str)) continue;
            processedIds.add(legacy.id_str);

            const userResult = tweetResult.core?.user_results?.result;
            const userLegacy = userResult?.legacy || {};
            let media = extractMediaFromLegacy(legacy);

            let repostedFrom = null;
            let retweetResult = legacy.retweeted_status_result?.result;
            if (retweetResult && retweetResult.__typename === 'TweetWithVisibilityResults' && retweetResult.tweet) retweetResult = retweetResult.tweet;
            if (retweetResult) {
                repostedFrom = extractTweetSnapshot(retweetResult);
                if ((!media || media.length === 0) && repostedFrom?.content?.media?.length) media = repostedFrom.content.media;
            }

            let quoted = null;
            let rawQuote = tweetResult?.quoted_status_result?.result || tweetResult?.quoted_status_result;
            if (rawQuote && (rawQuote.result || rawQuote.tweet)) rawQuote = rawQuote.result || rawQuote.tweet;
            if (rawQuote && rawQuote.__typename === 'TweetWithVisibilityResults' && rawQuote.tweet) rawQuote = rawQuote.tweet;
            if (rawQuote) quoted = extractTweetSnapshot(rawQuote);
            else if (legacy.quoted_status_id_str) quoted = await fetchTweetById(legacy.quoted_status_id_str, parentTweetCache);

            let inReplyTo = null;
            if (legacy.in_reply_to_status_id_str) {
                inReplyTo = await fetchTweetById(legacy.in_reply_to_status_id_str, parentTweetCache);
                if (!inReplyTo) {
                    inReplyTo = {
                        tweet_id: String(legacy.in_reply_to_status_id_str),
                        tweet_url: legacy.in_reply_to_screen_name
                            ? `https://x.com/${legacy.in_reply_to_screen_name}/status/${legacy.in_reply_to_status_id_str}`
                            : `https://x.com/i/web/status/${legacy.in_reply_to_status_id_str}`,
                        posted_by: { handle: legacy.in_reply_to_screen_name || undefined },
                        content: {}, post_date: null
                    };
                }
            }

            let createdAt = new Date();
            try { if (legacy.created_at) { const p = new Date(legacy.created_at); if (!isNaN(p)) createdAt = p; } } catch (e) { }
            const screenName = userLegacy.screen_name || userResult?.core?.screen_name || 'unknown';
            const context = {
                ...(inReplyTo ? { in_reply_to: inReplyTo } : {}),
                ...(repostedFrom ? { reposted_from: repostedFrom } : {}),
                ...(quoted ? { quoted } : {})
            };
            const noteText = tweetResult.note_tweet?.note_tweet_results?.result?.text;
            const text = noteText || legacy.full_text || legacy.text || '';

            tweets.push({
                tweet_id: legacy.id_str,
                text, url: `https://x.com/${screenName}/status/${legacy.id_str}`,
                created_at: createdAt,
                author: { handle: screenName, display_name: userLegacy.name || screenName, profile_image_url: userLegacy.profile_image_url_https || userResult?.avatar?.image_url, is_verified: userResult?.is_blue_verified || userLegacy.verified || false, follower_count: userLegacy.followers_count || 0 },
                media, context: Object.keys(context).length > 0 ? context : undefined,
                engagement: { likes: legacy.favorite_count || 0, retweets: legacy.retweet_count || 0, replies: legacy.reply_count || 0, views: parseInt(tweetResult.views?.count || '0', 10), quotes: legacy.quote_count || 0 }
            });
        }
        return tweets;
    } catch (error) {
        console.error(`[X-KeywordSearch] Failed for "${query}": ${error.message}`);
        return [];
    }
};

/**
 * Create a Grievance doc from a generic post object (platform-agnostic).
 */
const createGrievanceFromPost = async (post, platform, taggedKeyword) => {
    const existing = await Grievance.findOne({ tweet_id: post.tweet_id });
    if (existing) return null;

    const postDate = toSafeDate(post.created_at);

    // Sanitize media — ensure all URLs are plain strings (FB sometimes sends {uri, height, width})
    const sanitizedMedia = (post.media || []).map(m => {
        const url = typeof m === 'string' ? m : (typeof m.url === 'string' ? m.url : (m.url?.uri || m.uri || m.src || ''));
        const previewUrl = typeof m.preview_url === 'string' ? m.preview_url : (m.preview_url?.uri || url);
        const videoUrl = typeof m.video_url === 'string' ? m.video_url : (m.video_url?.uri || undefined);
        return { type: m.type || 'photo', url: String(url || ''), preview_url: String(previewUrl || ''), ...(videoUrl ? { video_url: String(videoUrl) } : {}) };
    }).filter(m => m.url);

    const textContent = post.text || '(no text)';

    const grievance = new Grievance({
        complaint_code: await generateComplaintCode(),
        tweet_id: post.tweet_id,
        tagged_account: taggedKeyword,
        tagged_account_normalized: String(taggedKeyword || '').replace(/^@/, '').toLowerCase(),
        platform,
        posted_by: {
            handle: post.author?.handle || post.author?.author_handle || 'unknown',
            display_name: post.author?.display_name || post.author?.handle || 'Unknown',
            profile_image_url: post.author?.profile_image_url || '',
            is_verified: post.author?.is_verified || false,
            follower_count: post.author?.follower_count || 0
        },
        content: {
            text: textContent,
            full_text: textContent,
            media: sanitizedMedia
        },
        context: post.context,
        tweet_url: post.url || '',
        engagement: post.engagement || { likes: 0, retweets: 0, replies: 0, views: 0, quotes: 0 },
        post_date: postDate,
        detected_date: new Date(),
        workflow_status: 'received',
        workflow_timestamps: { received_at: new Date() },
        escalation_count: 0
    });

    syncLegacyFieldsFromWorkflow(grievance, 'received');
    await grievance.save();
    await analyzeGrievanceContent(grievance.id, post.text || '', platform);
    // Extract and persist location
    await extractAndSaveLocation(grievance.id, post.text || '', post.author || {});
    return grievance;
};

/**
 * Fetch content from Facebook, Instagram, and YouTube
 * matching keywords from the Keyword model.
 * @param {string|null} platformFilter - 'facebook', 'instagram', 'youtube', or null for all
 */
/**
 * Search APIs (X "Top" search, YouTube, Facebook) routinely return semantically
 * "related" results that never actually contain the searched term — retweets
 * of a reply, recommended videos, near-miss matches, etc. Relevance is checked
 * against the FULL known-keyword universe, not just the single term that was
 * searched — a hit is kept if it contains that term, any other active Settings
 * keyword, or any tracked candidate's name/handle (ours or opposition). This
 * avoids discarding genuinely relevant posts that happen to match a different
 * known term than the one that triggered the search.
 */
const buildCandidateRelevanceTerms = () => {
    const terms = new Set();
    for (const leader of [...OUR_LEADERS, ...OPPOSITION_LEADERS]) {
        if (leader.name) terms.add(leader.name);
        if (leader.shortName) terms.add(leader.shortName);
        (leader.handles_normalized || []).forEach((h) => h && terms.add(h));
    }
    return [...terms];
};

// NFC-normalize before comparing so Telugu text typed/stored in a different
// Unicode composition (decomposed matras, etc.) than the scraped post text
// still matches instead of silently failing an `includes()` check.
const normalizeForMatch = (value) => String(value || '').normalize('NFC').toLowerCase();

const textMatchesAnyKeyword = (text, terms) => {
    if (!text || !terms?.length) return false;
    const normalizedText = normalizeForMatch(text);
    return terms.some((term) => {
        const t = normalizeForMatch(term).trim();
        if (!t) return false;
        return normalizedText.includes(t) ||
            normalizedText.includes(`@${t}`) ||
            normalizedText.includes(`#${t}`);
    });
};

/** Shared relevance universe: active Settings keywords + every tracked candidate. */
const getRelevanceTerms = async () => {
    const keywords = await Keyword.find({ is_active: true }).select('keyword').lean();
    return [...new Set([
        ...keywords.map((k) => k.keyword).filter(Boolean),
        ...buildCandidateRelevanceTerms()
    ])];
};


const fetchKeywordGrievances = async (platformFilter = null) => {
    try {
        const keywords = await Keyword.find({ is_active: true });

        if (keywords.length === 0) {
            console.log('[KeywordFetch] No active keywords configured');
            return { newGrievances: 0, keywordsSearched: 0 };
        }

        const runFB = !platformFilter || platformFilter === 'facebook';
        const runIG = !platformFilter || platformFilter === 'instagram';
        const runYT = !platformFilter || platformFilter === 'youtube';
        const runX = !platformFilter || platformFilter === 'x' || platformFilter === 'twitter';
        console.log(`[KeywordFetch] Platforms: FB=${runFB} IG=${runIG} YT=${runYT} X=${runX}`);

        // Relevance universe: every active Settings keyword + every tracked
        // candidate's name/handle (ours + opposition). A search hit is kept if
        // it matches ANY of these, not just the single term that was searched.
        const relevanceTerms = [...new Set([
            ...keywords.map((k) => k.keyword).filter(Boolean),
            ...buildCandidateRelevanceTerms()
        ])];
        console.log(`[KeywordFetch] Relevance universe: ${relevanceTerms.length} terms (${keywords.length} settings keywords + candidates)`);

        let totalNew = 0;
        let keywordsSearched = 0;
        const seenTweetIds = new Set();

        for (const kw of keywords) {
            // Pause between keywords while a Frequent Engagers analysis is
            // actively using the shared RapidAPI key.
            await yieldToInteractive();
            const rawKeyword = (kw.keyword || '').trim();
            if (!rawKeyword) continue;
            keywordsSearched++;

            const variants = generateKeywordVariants(rawKeyword);
            const baseKeyword = rawKeyword.replace(/^[@#]+/, '').trim();
            console.log(`[KeywordFetch] Keyword: "${rawKeyword}" → variants: ${variants.join(', ')}`);

            // Run selected platforms in parallel for speed
            const platformResults = await Promise.allSettled([
                // ── Facebook (all 3 variants) ──
                (async () => {
                    if (!runFB) return 0;
                    let count = 0;
                    for (const variant of variants) {
                        try {
                            console.log(`[KeywordFetch][FB] Searching: "${variant}"`);
                            const fbPosts = await rapidApiFacebookService.searchPosts(variant, 20);
                            console.log(`[KeywordFetch][FB] Found ${fbPosts.length} for "${variant}"`);

                            for (const fbPost of fbPosts) {
                                const postId = String(fbPost.id || '').trim();
                                if (!postId) continue;
                                const canonicalId = `facebook:keyword:${postId}`;
                                if (seenTweetIds.has(canonicalId)) continue;
                                seenTweetIds.add(canonicalId);

                                if (!textMatchesAnyKeyword(fbPost.text, relevanceTerms)) {
                                    console.log(`[KeywordFetch][FB] Skipping irrelevant post ${postId} — no known keyword/candidate found in text`);
                                    continue;
                                }

                                const fbMedia = (fbPost.media || []).map(m => {
                                    if (typeof m === 'string') {
                                        const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(m);
                                        return { type: isVideo ? 'video' : 'photo', url: m, video_url: isVideo ? m : undefined, preview_url: !isVideo ? m : undefined };
                                    }
                                    // Handle FB objects like {uri, height, width, id}
                                    const url = typeof m.url === 'string' ? m.url : (m.uri || m.src || '');
                                    const isVideo = m.type === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(String(url));
                                    return { type: isVideo ? 'video' : 'photo', url: String(url), preview_url: String(m.preview || m.thumbnail || url), ...(isVideo ? { video_url: String(url) } : {}) };
                                }).filter(m => m.url);

                                const post = {
                                    tweet_id: canonicalId,
                                    text: fbPost.text || '',
                                    url: fbPost.url || `https://facebook.com/${postId}`,
                                    created_at: fbPost.created_at,
                                    author: { handle: fbPost.author_handle || fbPost.author || 'facebook_user', display_name: fbPost.author || 'Facebook User', profile_image_url: fbPost.author_avatar || '', is_verified: false, follower_count: 0 },
                                    media: fbMedia,
                                    engagement: { likes: fbPost.metrics?.likes || 0, retweets: fbPost.metrics?.shares || 0, replies: fbPost.metrics?.comments || 0, views: fbPost.metrics?.views || 0, quotes: 0 }
                                };
                                const created = await createGrievanceFromPost(post, 'facebook', rawKeyword);
                                if (created) count++;
                            }
                        } catch (err) {
                            console.error(`[KeywordFetch][FB] Error for "${variant}": ${err.message}`);
                        }
                    }
                    return count;
                })(),

                // ── X / Twitter (all 3 variants) ──
                (async () => {
                    if (!runX) return 0;
                    let count = 0;
                    for (const variant of variants) {
                        try {
                            console.log(`[KeywordFetch][X] Searching: "${variant}"`);
                            const xTweets = await rapidApiXService.searchTweets(variant);
                            console.log(`[KeywordFetch][X] Found ${xTweets.length} for "${variant}"`);

                            for (const tweet of xTweets) {
                                const canonicalId = `x:keyword:${tweet.id}`;
                                if (seenTweetIds.has(canonicalId)) continue;
                                seenTweetIds.add(canonicalId);

                                if (!textMatchesAnyKeyword(tweet.text, relevanceTerms)) {
                                    console.log(`[KeywordFetch][X] Skipping irrelevant tweet ${tweet.id} — no known keyword/candidate found in text`);
                                    continue;
                                }

                                const post = {
                                    tweet_id: canonicalId,
                                    text: tweet.text || '',
                                    url: tweet.url || `https://x.com/${tweet.author_handle}/status/${tweet.id}`,
                                    created_at: tweet.created_at,
                                    author: {
                                        handle: tweet.author_handle || 'x_user',
                                        display_name: tweet.author || tweet.author_handle || 'X User',
                                        profile_image_url: tweet.author_avatar || '',
                                        is_verified: tweet.verified || false,
                                        follower_count: 0
                                    },
                                    media: tweet.media || [],
                                    engagement: {
                                        likes: parseInt(tweet.metrics?.like) || 0,
                                        retweets: parseInt(tweet.metrics?.retweet) || 0,
                                        replies: parseInt(tweet.metrics?.reply) || 0,
                                        views: parseInt(tweet.metrics?.views) || 0,
                                        quotes: parseInt(tweet.metrics?.quote) || 0
                                    }
                                };
                                const created = await createGrievanceFromPost(post, 'x', rawKeyword);
                                if (created) count++;
                            }
                        } catch (err) {
                            console.error(`[KeywordFetch][X] Error for "${variant}": ${err.message}`);
                        }
                    }
                    return count;
                })(),

                // ── Instagram (username-based — API only fetches by exact IG username) ──
                (async () => {
                    if (!runIG) return 0;
                    // Instagram API only works with exact usernames, not general text queries.
                    // Only attempt if the keyword looks like a handle (@username or single word, no spaces)
                    const igUsername = baseKeyword.replace(/\s+/g, '');
                    if (baseKeyword.includes(' ') && !rawKeyword.startsWith('@')) {
                        console.log(`[KeywordFetch][IG] Skipping "${baseKeyword}"(not a username)`);
                        return 0;
                    }
                    let count = 0;
                    try {
                        console.log(`[KeywordFetch][IG] Fetching posts for user: "${igUsername}"`);
                        const igPosts = await rapidApiInstagramService.searchPosts(igUsername, 20);
                        console.log(`[KeywordFetch][IG] Found ${igPosts.length} for "${igUsername}"`);

                        for (const igPost of igPosts) {
                            const postId = String(igPost.id || '').trim();
                            if (!postId) continue;
                            const canonicalId = `instagram: keyword:${postId} `;
                            if (seenTweetIds.has(canonicalId)) continue;
                            seenTweetIds.add(canonicalId);

                            if (!textMatchesAnyKeyword(igPost.text, relevanceTerms)) {
                                console.log(`[KeywordFetch][IG] Skipping irrelevant post ${postId} — no known keyword/candidate found in text`);
                                continue;
                            }

                            const igMedia = (igPost.media || []).map(m => ({
                                type: m.type || 'photo', url: m.url, preview_url: m.url
                            }));

                            const post = {
                                tweet_id: canonicalId,
                                text: igPost.text || '',
                                url: igPost.url || '',
                                created_at: igPost.created_at,
                                author: { handle: igPost.author_handle || igUsername, display_name: igPost.author || igUsername, profile_image_url: igPost.author_avatar || '', is_verified: false, follower_count: 0 },
                                media: igMedia,
                                engagement: { likes: igPost.metrics?.likes || 0, retweets: 0, replies: igPost.metrics?.comments || 0, views: igPost.metrics?.views || 0, quotes: 0 }
                            };
                            const created = await createGrievanceFromPost(post, 'instagram', rawKeyword);
                            if (created) count++;
                        }
                    } catch (err) {
                        console.error(`[KeywordFetch][IG] Error for "${igUsername}": ${err.message} `);
                    }
                    return count;
                })(),

                // ── YouTube (all 3 variants) ──
                (async () => {
                    if (!runYT) return 0;
                    let count = 0;
                    for (const variant of variants) {
                        try {
                            console.log(`[KeywordFetch][YT] Searching: "${variant}"`);
                            const ytVideos = await youtubeService.searchVideos(variant);
                            console.log(`[KeywordFetch][YT] Found ${(ytVideos || []).length} for "${variant}"`);

                            for (const video of (ytVideos || [])) {
                                const videoId = video.id;
                                if (!videoId) continue;
                                const canonicalId = `youtube: keyword:${videoId} `;
                                if (seenTweetIds.has(canonicalId)) continue;
                                seenTweetIds.add(canonicalId);

                                const text = `${video.title || ''} \n\n${video.description || ''} `.trim();

                                if (!textMatchesAnyKeyword(text, relevanceTerms)) {
                                    console.log(`[KeywordFetch][YT] Skipping irrelevant video ${videoId} — no known keyword/candidate found in title/description`);
                                    continue;
                                }

                                const thumbnail = video.thumbnails?.high?.url || video.thumbnails?.medium?.url || video.thumbnails?.default?.url || '';

                                const post = {
                                    tweet_id: canonicalId,
                                    text,
                                    url: `https://www.youtube.com/watch?v=${videoId}`,
                                    created_at: video.publishedAt,
                                    author: { handle: video.channelId || 'youtube_channel', display_name: video.channelTitle || 'YouTube Channel', profile_image_url: '', is_verified: false, follower_count: 0 },
                                    media: thumbnail ? [{ type: 'photo', url: thumbnail, preview_url: thumbnail }] : [],
                                    engagement: { likes: video.statistics?.likeCount || 0, retweets: 0, replies: video.statistics?.commentCount || 0, views: video.statistics?.viewCount || 0, quotes: 0 }
                                };
                                const created = await createGrievanceFromPost(post, 'youtube', rawKeyword);
                                if (created) count++;
                            }
                        } catch (err) {
                            console.error(`[KeywordFetch][YT] Error for "${variant}": ${err.message}`);
                        }
                    }
                    return count;
                })()
            ]);

            // Sum results from all platforms
            for (const result of platformResults) {
                if (result.status === 'fulfilled') totalNew += result.value;
            }
        }

        console.log(`[KeywordFetch] Complete: ${totalNew} new posts from ${keywordsSearched} keywords`);
        return { newGrievances: totalNew, keywordsSearched };
    } catch (error) {
        console.error(`[KeywordFetch] Error: ${error.message}`);
        throw error;
    }
};

module.exports = {
    fetchUserProfile,
    searchMentions,
    fetchAllGrievances,
    fetchGrievancesForSource,
    generateReportNumber,
    generatePDFReport,
    getGrievanceStats,
    analyzeGrievanceContent,
    extractAndSaveLocation,
    reprocessMahbubnagarMappedGrievances,
    fetchKeywordGrievances,
    textMatchesAnyKeyword,
    getRelevanceTerms,
    __private: {
        archiveMentionMediaForStorage,
        upsertXGrievancesForSource
    }
};
