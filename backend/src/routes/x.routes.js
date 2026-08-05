const express = require('express');
const router = express.Router();
const multer = require('multer');
const mediaAnalyzerService = require('../services/mediaAnalyzerService');
const rapidApiXService = require('../services/rapidApiXService');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/authMiddleware');
const { loadScope } = require('../middleware/scopeMiddleware');
const { requireAnyPageAccess } = require('../middleware/rbacMiddleware');
const {
    prepareAnalysisRecord,
    executeAnalysisWork,
    getLatestAnalysis,
    getAnalysisHistory,
    getAnalysisById,
    getAnalyzedHandles,
    getPendingCount,
    getAllAnalyses,
    getTopEngagers,
    autoQueueNewHandles
} = require('../services/engagerAnalysisService');
const xActionService = require('../services/xActionService');
const cacheService = require('../services/cacheService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.use(protect, loadScope, requireAnyPageAccess(['/x-monitor']));

// Keep legacy call sites but preserve authenticated user identity.
const mockUser = (req, res, next) => {
    if (!req.user) {
        req.user = {
            id: 'unknown',
            email: 'unknown@local',
            full_name: 'Unknown User'
        };
    }
    req.user.name = req.user.name || req.user.full_name || req.user.email || req.user.id;
    next();
};

const logAction = async (user, action, resourceType, resourceId, details) => {
    try {
        await AuditLog.create({
            user_id: user.id,
            user_email: user.email,
            user_name: user.name,
            action: action,
            resource_type: resourceType,
            resource_id: resourceId,
            details: details
        });
    } catch (error) {
        console.error('Audit Log Error:', error);
    }
};

const RAPID_ENDPOINT_ALIASES = {
    // User Endpoint
    'user/by-username': 'user',
    'users/by-ids': 'users',
    'users/by-ids-v2': 'users-v2',
    'user/replies': 'user-replies',
    'user/replies-v2': 'user-replies-v2',
    'user/media': 'user-media',
    'user/tweets': 'user-tweets',
    'user/followings': 'user-followings',
    'user/following-ids': 'user-following-ids',
    'user/followers': 'user-followers',
    'user/verified-followers': 'user-verified-followers',
    'user/followers-ids': 'user-followers-ids',
    'user/highlights': 'user-highlights',
    'user/about': 'user-about',

    // Posts Endpoint
    'post/comments': 'tweet-comments',
    'post/comments-v2': 'tweet-comments-v2',
    'post/quotes': 'tweet-quotes',
    'post/retweets': 'tweet-retweets',
    'tweet/details-v2': 'tweet-details',
    'tweets/details-by-ids': 'tweets',
    'tweets/details-by-ids-v2': 'tweets-v2',

    // Explore Endpoint
    'explore/search': 'search',
    'explore/search-v2': 'search-v2',
    'explore/search-v3': 'search-v3',
    'explore/autocomplete': 'auto-complete',

    // Lists Endpoint
    'lists/search': 'search-lists',
    'lists/details': 'list-details',
    'lists/timeline': 'list-timeline',
    'lists/followers': 'list-followers',
    'lists/members': 'list-members',

    // Community Endpoint
    'community/search': 'search-community',
    'community/topics': 'community-topics',
    'community/timeline': 'community-timeline',
    'community/popular': 'community-popular',
    'community/members': 'community-members',
    'community/members-v2': 'community-members-v2',
    'community/moderators': 'community-moderators',
    'community/tweets': 'community-tweets',
    'community/about': 'community-about',
    'community/details': 'community-details',

    // Trends Endpoint
    'trends/locations': 'trends-available',
    'trends/by-location': 'trends'
};

const proxyRapidEndpoint = async (endpoint, req, res) => {
    try {
        const data = await rapidApiXService.rapidGet(endpoint, req.query);
        res.json(data);
    } catch (error) {
        res.status(500).json({
            error: 'RapidAPI request failed',
            message: error.message
        });
    }
};

// --- X / TWITTER VIDEO DOWNLOAD ---
router.post('/download-video', mockUser, async (req, res) => {
    try {
        const { content_url, media_url, tweet_url, content_id } = req.body;
        const mediaUrl = media_url || content_url || tweet_url;

        if (!mediaUrl) {
            return res.status(400).json({ error: 'media_url is required' });
        }

        console.log(`Initiating X video download for: ${mediaUrl}`);

        const result = await mediaAnalyzerService.downloadVideo(mediaUrl);

        await logAction(req.user, 'download_video', 'content', content_id || result.video_id, {
            media_url: mediaUrl,
            video_id: result.video_id,
            filename: result.filename
        });

        res.json({
            success: true,
            video_id: result.video_id,
            filename: result.filename,
            download_url: result.download_url,
            title: result.title,
            duration_seconds: result.duration_seconds
        });
    } catch (error) {
        console.error('X video download error:', error);
        res.status(error.statusCode || 500).json({
            error: error.message || 'Failed to download video'
        });
    }
});

// Get video download URL (if already downloaded)
router.get('/video-url/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const downloadUrl = mediaAnalyzerService.getVideoDownloadUrl(videoId);
        res.json({ download_url: downloadUrl });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get video URL' });
    }
});

// Generic RapidAPI proxy for any GET endpoint (provide ?endpoint=path)
router.get('/rapid', async (req, res) => {
    const { endpoint } = req.query;
    if (!endpoint) {
        return res.status(400).json({ error: 'endpoint query parameter is required' });
    }
    return proxyRapidEndpoint(endpoint, req, res);
});

// Aliased RapidAPI endpoints for convenience
Object.entries(RAPID_ENDPOINT_ALIASES).forEach(([alias, endpoint]) => {
    router.get(`/rapid/${alias}`, async (req, res) => proxyRapidEndpoint(endpoint, req, res));
});

// ─── On-Demand Engager Analysis ──────────────────────────────────────────────

router.post('/engager-analysis', async (req, res) => {
    try {
        const { handle, period_days: periodDays = 30, source_id: sourceId } = req.body;
        if (!handle) return res.status(400).json({ error: 'handle is required' });
        const safePeriod = Math.max(1, Math.min(Number(periodDays) || 30, 90));
        const prepResult = await prepareAnalysisRecord(handle, { periodDays: safePeriod, sourceId });
        if (prepResult.status === 'already_processing') return res.json({ status: 'already_processing', handle: prepResult.handle });
        if (prepResult.status === 'blocked') return res.json({ status: 'blocked', handle: prepResult.handle, blocked_by: prepResult.blocked_by });
        const cleanHandle = String(handle).replace(/^@/, '').trim().toLowerCase();
        executeAnalysisWork(prepResult.analysisId, cleanHandle, safePeriod, prepResult.analysis).catch(err => {
            console.error(`[EngagerAnalysis] Background analysis failed for ${cleanHandle}:`, err.message);
        });
        return res.json({ status: 'started', handle: cleanHandle });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to start engager analysis', message: error.message });
    }
});

router.get('/engager-analysis/latest', async (req, res) => {
    try {
        const { handle } = req.query;
        if (!handle) return res.status(400).json({ error: 'handle query param is required' });
        const analysis = await getLatestAnalysis(handle);
        if (!analysis) return res.status(404).json({ error: 'No analysis found for this handle' });
        return res.json(analysis);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch analysis', message: error.message });
    }
});

router.get('/engager-analysis/history', async (req, res) => {
    try {
        const { handle } = req.query;
        if (!handle) return res.status(400).json({ error: 'handle query param is required' });
        const history = await getAnalysisHistory(handle, 20);
        return res.json({ handle, analyses: history });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch analysis history', message: error.message });
    }
});

router.get('/engager-analysis/:id', async (req, res) => {
    try {
        const analysis = await getAnalysisById(req.params.id);
        if (!analysis) return res.status(404).json({ error: 'Analysis not found' });
        return res.json(analysis);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch analysis', message: error.message });
    }
});

router.get('/engager-analysis-handles', async (req, res) => {
    try {
        const handles = await getAnalyzedHandles();
        return res.json({ handles });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch analyzed handles', message: error.message });
    }
});

router.get('/engager-analysis-pending', async (req, res) => {
    try {
        const count = await getPendingCount();
        return res.json({ count });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch pending count', message: error.message });
    }
});

router.get('/engager-analysis-all', async (req, res) => {
    try {
        const analyses = await getAllAnalyses();
        return res.json({ analyses });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch analyses', message: error.message });
    }
});

router.post('/engager-analysis-auto-queue', async (req, res) => {
    try {
        const result = await autoQueueNewHandles();
        return res.json(result || { status: 'idle' });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to trigger engager auto-queue', message: error.message });
    }
});

router.get('/engager-top', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 200, 500);
        
        const cacheKey = `x:top-engagers:${limit}`;
        const cached = await cacheService.get(cacheKey);
        if (cached) {
            return res.json({ engagers: cached });
        }

        const engagers = await getTopEngagers(limit);
        await cacheService.set(cacheKey, engagers, 900); // Cache for 15 mins

        return res.json({ engagers });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch top engagers', message: error.message });
    }
});

// ─── X Bulk Actions ────────────────────────────────────────────────────────────

// Scraper login: username + password via agent-twitter-client (no API plan needed — fixes 402)
router.post('/actions/accounts/add-scraper', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
        const account = await xActionService.addAccountScraper(username.trim(), password, email?.trim() || '', req.user?.email || 'system');
        return res.json({ success: true, account: { username: account.username, display_name: account.display_name, profile_image_url: account.profile_image_url, status: account.status } });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Cookie-based login — bypasses broken username/password flow
router.post('/actions/accounts/add-cookies', async (req, res) => {
    try {
        const { username, cookieText } = req.body;
        if (!username || !cookieText) return res.status(400).json({ error: 'username and cookieText are required' });
        const account = await xActionService.addAccountCookies(username.trim(), cookieText, req.user?.email || 'system');
        return res.json({ success: true, account: { username: account.username, display_name: account.display_name, profile_image_url: account.profile_image_url, status: account.status } });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Direct add: paste Access Token + Secret from developer portal (no PIN/OAuth flow needed)
router.post('/actions/accounts/add-direct', async (req, res) => {
    try {
        const { accessToken, accessTokenSecret } = req.body;
        if (!accessToken || !accessTokenSecret) {
            return res.status(400).json({ error: 'accessToken and accessTokenSecret are required' });
        }
        const account = await xActionService.addAccountDirect(accessToken.trim(), accessTokenSecret.trim(), req.user?.email || 'system');
        return res.json({ success: true, account: { username: account.username, display_name: account.display_name, profile_image_url: account.profile_image_url, status: account.status } });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// OAuth: initiate PIN-based login (works with Desktop app type — no callback URL needed)
router.get('/actions/oauth/connect-pin', async (req, res) => {
    try {
        const { oauthUrl, oauthToken } = await xActionService.initiateOAuthPin();
        return res.json({ oauthUrl, oauthToken });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// OAuth: verify PIN entered by user (exchanges PIN for access tokens)
router.post('/actions/oauth/verify-pin', async (req, res) => {
    try {
        const { oauthToken, pin } = req.body;
        if (!oauthToken || !pin) return res.status(400).json({ error: 'oauthToken and pin are required' });
        const account = await xActionService.handleOAuthCallback(oauthToken, pin.trim(), req.user?.email || 'system');
        return res.json({ success: true, account: { username: account.username, display_name: account.display_name, profile_image_url: account.profile_image_url, status: account.status } });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// OAuth: initiate callback-based login (requires Web App type in X developer portal)
router.get('/actions/oauth/connect', async (req, res) => {
    try {
        const callbackUrl = `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/x/actions/oauth/callback`;
        const { oauthUrl, oauthToken } = await xActionService.initiateOAuth(callbackUrl);
        return res.json({ oauthUrl, oauthToken });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// OAuth: callback (X redirects here after user grants access)
router.get('/actions/oauth/callback', async (req, res) => {
    try {
        const { oauth_token, oauth_verifier } = req.query;
        if (!oauth_token || !oauth_verifier) {
            return res.status(400).send('<script>window.close();</script><p>OAuth failed: missing parameters.</p>');
        }
        const account = await xActionService.handleOAuthCallback(oauth_token, oauth_verifier, 'system');
        return res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:40px;">
            <h2 style="color:#16a34a;">✓ @${account.username} connected!</h2>
            <p>You can close this window.</p>
            <script>
                if (window.opener) { window.opener.postMessage({ type: 'X_OAUTH_SUCCESS', username: '${account.username}' }, '*'); }
                setTimeout(() => window.close(), 1500);
            </script>
            </body></html>
        `);
    } catch (err) {
        return res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:40px;">
            <h2 style="color:#dc2626;">✗ Connection failed</h2>
            <p>${err.message}</p>
            <script>setTimeout(() => window.close(), 3000);</script>
            </body></html>
        `);
    }
});

// List all connected X accounts
router.get('/actions/accounts', async (req, res) => {
    try {
        const accounts = await xActionService.listAccounts();
        return res.json({ accounts });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Remove a connected X account
router.delete('/actions/accounts/:username', async (req, res) => {
    try {
        await xActionService.removeAccount(req.params.username);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Get filtered X posts from DB for bulk selection
router.get('/actions/posts', async (req, res) => {
    try {
        const { sentiment, keyword, dateFrom, dateTo, riskLevel, handle, source, limit, page } = req.query;
        const result = await xActionService.getFilteredPosts({
            sentiment, keyword, dateFrom, dateTo, riskLevel, handle, source,
            limit: parseInt(limit) || 50,
            page: parseInt(page) || 1
        });
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Execute bulk action (retweet / reply) — supports file uploads for media
// Accepts either accountUsername (single) or accountUsernames (JSON array, multi-account mode)
router.post('/actions/bulk', upload.array('media', 4), async (req, res) => {
    try {
        const { accountUsername, accountUsernames: accountUsernamesRaw, actionType, tweetIds, replyText, tweetUrls, tweetTexts } = req.body;

        if (!accountUsername && !accountUsernamesRaw) return res.status(400).json({ error: 'accountUsername or accountUsernames is required' });
        if (!actionType) return res.status(400).json({ error: 'actionType is required' });
        if (!tweetIds) return res.status(400).json({ error: 'tweetIds is required' });

        const ids = Array.isArray(tweetIds) ? tweetIds : JSON.parse(tweetIds);
        const urls = tweetUrls ? (typeof tweetUrls === 'string' ? JSON.parse(tweetUrls) : tweetUrls) : {};
        const texts = tweetTexts ? (typeof tweetTexts === 'string' ? JSON.parse(tweetTexts) : tweetTexts) : {};
        const mediaBuffers = (req.files || []).map(f => f.buffer);
        const mediaMimeTypes = (req.files || []).map(f => f.mimetype);

        // Multi-account mode
        if (accountUsernamesRaw) {
            const usernames = typeof accountUsernamesRaw === 'string' ? JSON.parse(accountUsernamesRaw) : accountUsernamesRaw;
            const result = await xActionService.executeBulkActionMulti({
                accountUsernames: usernames,
                actionType,
                tweetIds: ids,
                replyText,
                mediaBuffers,
                mediaMimeTypes,
                tweetUrls: urls,
                tweetTexts: texts,
                executedBy: req.user?.email || 'unknown'
            });
            return res.json(result);
        }

        // Single-account mode
        const result = await xActionService.executeBulkAction({
            accountUsername,
            actionType,
            tweetIds: ids,
            replyText,
            mediaBuffers,
            mediaMimeTypes,
            tweetUrls: urls,
            tweetTexts: texts,
            executedBy: req.user?.email || 'unknown'
        });

        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Delete a post from the Content collection — sreenu@gmail.com only
router.delete('/actions/posts/:contentId', async (req, res) => {
    if (req.user?.email !== 'sreenu@gmail.com') return res.status(403).json({ error: 'Forbidden' });
    try {
        await xActionService.deletePost(req.params.contentId);
        return res.json({ success: true });
    } catch (err) {
        return res.status(err.message === 'Post not found' ? 404 : 500).json({ error: err.message });
    }
});

// Edit a post's text / sentiment / risk_level — sreenu@gmail.com only
router.patch('/actions/posts/:contentId', async (req, res) => {
    if (req.user?.email !== 'sreenu@gmail.com') return res.status(403).json({ error: 'Forbidden' });
    try {
        const doc = await xActionService.updatePost(req.params.contentId, req.body);
        return res.json({ success: true, post: doc });
    } catch (err) {
        return res.status(err.message === 'Post not found' ? 404 : 500).json({ error: err.message });
    }
});

// Get bulk action history
router.get('/actions/history', async (req, res) => {
    try {
        const { batchId, accountUsername, page, limit } = req.query;
        const result = await xActionService.getActionHistory({
            batchId,
            accountUsername,
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 50
        });
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
