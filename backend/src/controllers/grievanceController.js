const GrievanceSource = require('../models/GrievanceSource');
const Grievance = require('../models/Grievance');
const GrievanceSettings = require('../models/GrievanceSettings');
const grievanceService = require('../services/grievanceService');
const { extractAndSaveLocation } = require('../services/grievanceService');
const rapidApiFacebookService = require('../services/rapidApiFacebookService');
const { generateComplaintCode } = require('../services/complaintCodeService');
const {
    applyWorkflowTransition,
    inferWorkflowStatusFromLegacy,
    legacyStatusToWorkflow,
    normalizeWorkflowStatus,
    syncLegacyFieldsFromWorkflow,
    tabToWorkflowQuery,
    canConvertToFir
} = require('../services/grievanceWorkflowService');
const { createAuditLog } = require('../services/auditService');
const cacheService = require('../services/cacheService');
const translationService = require('../services/translationService');
const crypto = require('crypto');
const { ISSUE_LEXICON } = require('../services/mlaReferenceService');

const MAX_SOURCES_PER_PLATFORM = 5;
const TWILIO_ACK_XML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const invalidateGrievanceCaches = async () => {
    await cacheService.invalidatePrefix('grievances:stats:v2');
    await cacheService.invalidatePrefix('grievances:dashboard:v1');
    await cacheService.invalidatePrefix('grievances:sentiment-leaders:');
    await cacheService.invalidatePrefix('grievances:location-stats:v1');
    await cacheService.invalidatePrefix('grievances:list:v1');
    await cacheService.invalidatePrefix('geo:');
    // Bump the list-cache version so a GET already in flight when this ran
    // (e.g. concurrent with a delete) can't write stale pre-delete data back
    // into the cache after invalidatePrefix already cleared it above.
    await cacheService.bumpVersion('grievances:list');
};

const logAudit = async (req, action, resourceType, resourceId, details = null) => {
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    if (!userId || !userEmail) return;

    await createAuditLog(
        {
            id: userId,
            email: userEmail,
            full_name: req.user?.full_name || req.user?.name
        },
        action,
        resourceType,
        resourceId,
        details
    );
};

const normalizePlatform = (value, defaultValue = null) => {
    const normalizedInput = value === undefined || value === null || value === '' ? defaultValue : value;
    if (normalizedInput === null || normalizedInput === undefined) return null;
    const p = String(normalizedInput).trim().toLowerCase();
    if (p === 'fb') return 'facebook';
    return p;
};

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeSearchRegex = (value) => new RegExp(escapeRegex(String(value || '').trim()), 'i');
const normalizeTaggedAccount = (value) => String(value || '').trim().replace(/^@/, '').toLowerCase();

const toIsoStart = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    date.setUTCHours(0, 0, 0, 0);
    return date;
};

const toIsoEnd = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    date.setUTCHours(23, 59, 59, 999);
    return date;
};

const normalizeComplainant = (grievance) => {
    if (grievance.platform === 'whatsapp') {
        return {
            name: grievance.posted_by?.display_name || grievance.complainant_phone || 'WhatsApp User',
            handle: grievance.complainant_phone || grievance.posted_by?.handle || '',
            phone: grievance.complainant_phone || ''
        };
    }

    return {
        name: grievance.posted_by?.display_name || grievance.posted_by?.handle || 'Unknown',
        handle: grievance.posted_by?.handle || '',
        phone: grievance.complainant_phone || ''
    };
};

const normalizeGrievanceForList = (grievanceDoc) => {
    const grievance = grievanceDoc.toObject ? grievanceDoc.toObject() : grievanceDoc;
    const workflowStatus = inferWorkflowStatusFromLegacy(grievance);
    const complainant = normalizeComplainant(grievance);
    const contentText = grievance.content?.full_text || grievance.content?.text || '';
    const sourceSummary = {
        grievance_source_id: grievance.grievance_source_id || null,
        tagged_account: grievance.tagged_account || grievance.source_ref || null
    };

    return {
        ...grievance,
        complaint_code: grievance.complaint_code || grievance.id,
        workflow_status: workflowStatus,
        complainant,
        content_text: contentText,
        escalation_count: grievance.escalation_count || 0,
        can_convert_to_fir: canConvertToFir(grievance),
        source_summary: sourceSummary
    };
};

const mapLegacyFilterStatusToTab = (filterStatus) => {
    const normalized = String(filterStatus || '').trim().toLowerCase();
    if (normalized === 'pending') return 'pending';
    if (normalized === 'escalated') return 'escalated';
    if (normalized === 'closed') return 'closed';
    if (normalized === 'fir') return 'fir';
    return 'all';
};

const buildListQuery = (params = {}, options = {}) => {
    const {
        classification,
        status,
        tagged_account,
        handle,
        posted_by_handle,
        sentiment,
        platform: platformQuery,
        tab,
        filterStatus,
        status_filter,
        search,
        from,
        to,
        source_id,
        category,
        topic,
        grievance_type,
        analysis_category,
        risk_level,
        target_entity,
        location,
        location_city,
        location_district,
        location_constituency
    } = params;

    const { includeTab = true } = options;

    const platform = normalizePlatform(platformQuery, 'all');
    const normalizedTab = String(tab || '').trim().toLowerCase();
    const normalizedFilterStatus = String(filterStatus || status_filter || '').trim().toLowerCase();
    const mappedFilterTab = mapLegacyFilterStatusToTab(normalizedFilterStatus);
    const finalTab = mappedFilterTab !== 'all' ? mappedFilterTab : (normalizedTab || 'all');
    const query = { is_active: true };

    if (classification) query.classification = classification;
    if (status) query['complaint.status'] = status;
    const effectiveTaggedAccount = tagged_account || handle;
    if (effectiveTaggedAccount) {
        const normalized = normalizeTaggedAccount(effectiveTaggedAccount);
        
        // Match @mention, #hashtag, or the term as a keyword
        const mentionRegex = new RegExp(`@${escapeRegex(normalized)}`, 'i');
        const hashtagRegex = new RegExp(`#${escapeRegex(normalized)}`, 'i');
        const keywordRegex = new RegExp(`\\b${escapeRegex(normalized)}\\b`, 'i');
            
        const handleOr = [
            { tagged_account_normalized: normalized },
            { 'content.text': mentionRegex },
            { 'content.full_text': mentionRegex },
            { 'content.text': hashtagRegex },
            { 'content.full_text': hashtagRegex },
            { 'content.text': keywordRegex },
            { 'content.full_text': keywordRegex }
        ];

        if (query.$or) {
            query.$and = [...(query.$and || []), { $or: query.$or }, { $or: handleOr }];
            delete query.$or;
        } else {
            query.$or = handleOr;
        }
    }
    if (posted_by_handle) {
        query['posted_by.handle'] = { $regex: new RegExp(`^@?${escapeRegex(String(posted_by_handle).replace(/^@/, '').trim())}$`, 'i') };
    }
    if (sentiment && ['positive', 'negative', 'neutral', 'moderate'].includes(sentiment.toLowerCase())) {
        const s = sentiment.toLowerCase();
        // 'moderate' is the new label; transitional rows may still carry 'neutral'.
        query['analysis.sentiment'] = (s === 'moderate' || s === 'neutral')
            ? { $in: ['moderate', 'neutral'] }
            : s;
    }
    if (source_id && source_id !== 'all') query.grievance_source_id = source_id;

    if (platform && platform !== 'all') {
        query.platform = platform;
    }
    const effectiveTopic = topic || category || grievance_type || analysis_category;
    if (effectiveTopic && effectiveTopic !== 'all') {
        const topicRegex = new RegExp(`${escapeRegex(effectiveTopic)}`, 'i');
        const topicOr = [
            { 'analysis.grievance_type': topicRegex },
            { 'analysis.category': topicRegex },
            { 'grievance_workflow.category': topicRegex },
            { 'query_workflow.category': topicRegex },
            { 'criticism.category': topicRegex },
            { 'suggestion.category': topicRegex }
        ];
        
        if (query.$or) {
            query.$and = [...(query.$and || []), { $or: query.$or }, { $or: topicOr }];
            delete query.$or;
        } else {
            query.$or = topicOr;
        }
    }

    if (risk_level && ['low', 'medium', 'high', 'critical'].includes(risk_level.toLowerCase())) {
        query['analysis.risk_level'] = risk_level.toLowerCase();
    }

    // Leadership filter — content about the primary/secondary target entity,
    // as resolved by the target-aware political sentiment pipeline. The
    // allowed entity keys are tenant-specific (see config/politicalEntities),
    // so any non-empty value is passed through rather than hardcoding keys.
    if (target_entity && String(target_entity).trim()) {
        query['analysis.target_entity'] = String(target_entity).toLowerCase();
    }

    // Location filters
    const addLocationOrFilter = (rawValue, fields) => {
        if (!rawValue || rawValue === 'all') return;
        const escaped = escapeRegex(rawValue);
        const flexRegex = new RegExp(`${escaped}`, 'i');
        const locationOr = fields.map((field) => ({ [field]: { $regex: flexRegex } }));

        if (query.$or) {
            query.$and = [...(query.$and || []), { $or: query.$or }, { $or: locationOr }];
            delete query.$or;
            return;
        }
        query.$and = [...(query.$and || []), { $or: locationOr }];
    };

    const targetLoc = location || location_city || location_district || location_constituency;
    if (targetLoc) {
        addLocationOrFilter(targetLoc, [
            'detected_location.city',
            'detected_location.district',
            'detected_location.constituency'
        ]);
    }

    if (includeTab) {
        const tabFilter = tabToWorkflowQuery(finalTab);
        Object.assign(query, tabFilter);
    }

    const fromDate = toIsoStart(from);
    const toDate = toIsoEnd(to);
    if (fromDate || toDate) {
        query.post_date = {};
        if (fromDate) query.post_date.$gte = fromDate;
        if (toDate) query.post_date.$lte = toDate;
    }

    if (search) {
        const textRegex = normalizeSearchRegex(search);
        const searchOr = [
            { complaint_code: textRegex },
            { 'content.text': textRegex },
            { 'content.full_text': textRegex },
            { 'posted_by.display_name': textRegex },
            { 'posted_by.handle': textRegex },
            { complainant_phone: textRegex }
        ];

        if (query.$or) {
            query.$and = [{ $or: query.$or }, { $or: searchOr }];
            delete query.$or;
        } else {
            query.$or = searchOr;
        }
    }

    // ─── Target relevance filter ──────────────────────────────────────────
    // Mentions feed should only show content actually about the client
    // leadership / party machinery. We enforce this at query time so anything
    // ingested by legacy paths (keyword sweeps, manual imports, WhatsApp) is
    // filtered out unless it mentions a hard target token. Pass
    // `target_only=false` explicitly to opt out (admin / audit).
    const hasLocationOrTopic = !!(
        params.location ||
        params.location_city ||
        params.location_district ||
        params.location_constituency ||
        params.topic ||
        params.grievance_type ||
        params.category ||
        params.analysis_category
    );
    const bskOnly = String(params.target_only ?? (hasLocationOrTopic ? 'false' : 'true')).toLowerCase() !== 'false';
    if (bskOnly) {
        const { HARD_TOKENS } = require('../services/targetRelevanceFilterService');
        // Build one combined case-insensitive regex from the hard tokens.
        const bskRegex = new RegExp(
            HARD_TOKENS.map((t) => escapeRegex(t)).join('|'),
            'i'
        );
        const bskOr = [
            { 'content.text':            { $regex: bskRegex } },
            { 'content.full_text':       { $regex: bskRegex } },
            { 'posted_by.handle':        { $regex: bskRegex } },
            { 'posted_by.display_name':  { $regex: bskRegex } },
            { tagged_account:            { $regex: bskRegex } },
            // Anything that came through the BSK or Alerts→Mentions pipeline
            // is by construction relevant.
            { tweet_id: { $regex: /^(x:pipe:|alert:)/ } }
        ];

        if (query.$or) {
            query.$and = [...(query.$and || []), { $or: query.$or }, { $or: bskOr }];
            delete query.$or;
        } else if (query.$and) {
            query.$and.push({ $or: bskOr });
        } else {
            query.$or = bskOr;
        }
    }

    return query;
};

/**
 * Reusable BSK-relevance `$match` clause for raw aggregations. Mirrors the
 * filter enforced by `buildListQuery` so that stats endpoints (which build
 * their own pipelines) count the same universe of rows that the list
 * endpoint returns. Returns an empty object when `target_only` is explicitly
 * disabled.
 */
const buildBskRelevanceMatch = (params = {}) => {
    const bskOnly = String(params.target_only ?? 'true').toLowerCase() !== 'false';
    if (!bskOnly) return {};
    const { HARD_TOKENS } = require('../services/targetRelevanceFilterService');
    const bskRegex = new RegExp(
        HARD_TOKENS.map((t) => escapeRegex(t)).join('|'),
        'i'
    );
    return {
        $or: [
            { 'content.text':            { $regex: bskRegex } },
            { 'content.full_text':       { $regex: bskRegex } },
            { 'posted_by.handle':        { $regex: bskRegex } },
            { 'posted_by.display_name':  { $regex: bskRegex } },
            { tagged_account:            { $regex: bskRegex } },
            { tweet_id: { $regex: /^(x:pipe:|alert:)/ } }
        ]
    };
};

const workflowTimestampKeys = {
    received: 'received_at',
    reviewed: 'reviewed_at',
    action_taken: 'action_taken_at',
    closed: 'closed_at',
    converted_to_fir: 'fir_converted_at'
};

const ensureWorkflowInitialized = (grievance) => {
    const status = inferWorkflowStatusFromLegacy(grievance);
    syncLegacyFieldsFromWorkflow(grievance, status);
    if (!grievance.workflow_timestamps) grievance.workflow_timestamps = {};
    const tsKey = workflowTimestampKeys[status];
    if (tsKey && !grievance.workflow_timestamps[tsKey]) {
        grievance.workflow_timestamps[tsKey] = grievance.detected_date || grievance.post_date || new Date();
    }
};

const twilioSign = (url, params, authToken) => {
    const sortedKeys = Object.keys(params || {}).sort();
    let payload = url;
    for (const key of sortedKeys) {
        payload += key + params[key];
    }
    return crypto.createHmac('sha1', authToken).update(payload, 'utf8').digest('base64');
};

const safeEqual = (left, right) => {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

const validateTwilioSignature = (req) => {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
        const err = new Error('TWILIO_AUTH_TOKEN is not configured');
        err.code = 'TWILIO_TOKEN_MISSING';
        throw err;
    }

    const provided = req.get('x-twilio-signature');
    if (!provided) return false;

    const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const host = req.get('host');
    const requestUrl = process.env.TWILIO_WEBHOOK_URL || `${forwardedProto}://${host}${req.originalUrl}`;
    const expected = twilioSign(requestUrl, req.body || {}, authToken);

    return safeEqual(provided, expected);
};

const toWhatsAppPhone = (raw) => String(raw || '').replace(/^whatsapp:/i, '').trim();

const buildTwilioMessageUrl = (accountSid, messageSid) => {
    if (!accountSid || !messageSid) return `whatsapp:${messageSid || 'unknown'}`;
    return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}`;
};

const extractWhatsAppMedia = (reqBody) => {
    const media = [];
    const numMedia = Number.parseInt(reqBody?.NumMedia || '0', 10);
    if (!Number.isFinite(numMedia) || numMedia <= 0) return media;

    for (let index = 0; index < numMedia; index += 1) {
        const url = reqBody[`MediaUrl${index}`];
        const type = String(reqBody[`MediaContentType${index}`] || '').toLowerCase();
        if (!url) continue;

        let normalizedType = 'photo';
        if (type.startsWith('video/')) normalizedType = 'video';
        if (type === 'image/gif') normalizedType = 'animated_gif';

        media.push({
            type: normalizedType,
            url,
            video_url: normalizedType === 'video' ? url : undefined,
            preview_url: normalizedType === 'photo' ? url : undefined,
            original_url: url
        });
    }

    return media;
};

const sendTwilioAck = (res, statusCode = 200) => {
    res.set('Content-Type', 'text/xml');
    return res.status(statusCode).send(TWILIO_ACK_XML);
};

/**
 * @desc    Get all grievance sources
 * @route   GET /api/grievances/sources
 * @access  Private
 */
const getSources = async (req, res) => {
    try {
        const platform = normalizePlatform(req.query.platform, 'all');
        const query = {};
        if (platform && platform !== 'all') {
            query.platform = platform;
        }

        const sources = await GrievanceSource.find(query).sort({ created_at: -1 });
        res.status(200).json(sources);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Add a new grievance source (government X account)
 * @route   POST /api/grievances/sources
 * @access  Private
 */
const addSource = async (req, res) => {
    try {
        const { handle, display_name, department, designation, contact_number } = req.body;
        const platform = normalizePlatform(req.body.platform, 'x');

        if (!handle) {
            return res.status(400).json({ message: 'Handle/ID is required' });
        }
        if (!['x', 'facebook'].includes(platform)) {
            return res.status(400).json({ message: 'Platform must be x or facebook' });
        }

        const currentCount = await GrievanceSource.countDocuments({ platform });
        if (currentCount >= MAX_SOURCES_PER_PLATFORM) {
            return res.status(400).json({
                message: `Maximum limit of ${MAX_SOURCES_PER_PLATFORM} ${platform} accounts reached. Remove an existing account to add a new one.`
            });
        }

        // Clean handle based on platform
        let cleanHandle = handle.trim();
        if (platform === 'x') {
            cleanHandle = handle.replace('@', '').trim();
        }

        // Check if already exists (same handle AND same platform)
        const existing = await GrievanceSource.findOne({
            handle: platform === 'x'
                ? { $regex: new RegExp(`^@?${escapeRegex(cleanHandle)}$`, 'i') }
                : { $regex: new RegExp(`^${escapeRegex(cleanHandle)}$`, 'i') },
            platform
        });

        if (existing) {
            return res.status(400).json({ message: 'This account is already added' });
        }

        let profile = null;
        let finalHandle = cleanHandle;

        if (platform === 'x') {
            // Fetch profile from X
            try {
                profile = await grievanceService.fetchUserProfile(cleanHandle);
            } catch (err) {
                console.warn(`Failed to fetch X profile for ${cleanHandle}:`, err.message);
            }
            finalHandle = `@${cleanHandle}`;
        } else if (platform === 'facebook') {
            try {
                profile = await rapidApiFacebookService.fetchPageDetails(cleanHandle);
                if (profile?.id) {
                    finalHandle = profile.id;
                }
            } catch (err) {
                console.warn(`Failed to fetch Facebook profile for ${cleanHandle}:`, err.message);
            }
        }

        const existingByFinalHandle = await GrievanceSource.findOne({
            platform,
            handle: { $regex: new RegExp(`^${escapeRegex(finalHandle)}$`, 'i') }
        });
        if (existingByFinalHandle) {
            return res.status(400).json({ message: 'This account is already added' });
        }

        const source = new GrievanceSource({
            handle: finalHandle,
            display_name: display_name || profile?.name || cleanHandle,
            profile_image_url: profile?.profileImageUrl || profile?.image,
            x_user_id: platform === 'x' ? profile?.id : undefined,
            is_verified: profile?.isVerified || profile?.is_verified || false,
            department: department || 'Government',
            designation,
            contact_number,
            platform,
            created_by: req.user?.id || 'system'
        });

        await source.save();

        await logAudit(req, 'CREATE', 'GRIEVANCE_SOURCE', source.id, `Added grievance source: ${finalHandle} (${platform})`);

        res.status(201).json(source);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Update a grievance source
 * @route   PUT /api/grievances/sources/:id
 * @access  Private
 */
const updateSource = async (req, res) => {
    try {
        const { id } = req.params;
        const { display_name, department, designation, contact_number, is_active } = req.body;

        const source = await GrievanceSource.findOne({ id });
        if (!source) {
            return res.status(404).json({ message: 'Source not found' });
        }

        if (display_name) source.display_name = display_name;
        if (department) source.department = department;
        if (designation !== undefined) source.designation = designation;
        if (contact_number !== undefined) source.contact_number = contact_number;
        if (is_active !== undefined) source.is_active = is_active;

        await source.save();

        await logAudit(req, 'UPDATE', 'GRIEVANCE_SOURCE', source.id, `Updated grievance source: ${source.handle}`);

        res.status(200).json(source);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Delete a grievance source
 * @route   DELETE /api/grievances/sources/:id
 * @access  Private
 */
const deleteSource = async (req, res) => {
    try {
        const { id } = req.params;

        const source = await GrievanceSource.findOne({ id });
        if (!source) {
            return res.status(404).json({ message: 'Source not found' });
        }

        await GrievanceSource.deleteOne({ id });

        await logAudit(req, 'DELETE', 'GRIEVANCE_SOURCE', id, `Deleted grievance source: ${source.handle}`);

        res.status(200).json({ message: 'Source deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Fetch grievances for a specific source
 * @route   POST /api/grievances/sources/:id/fetch
 * @access  Private
 */
const fetchSourceGrievances = async (req, res) => {
    try {
        const { id } = req.params;
        const { start_date, end_date } = req.body;

        const result = await grievanceService.fetchGrievancesForSource(id, start_date, end_date);
        await invalidateGrievanceCaches();

        await logAudit(
            req,
            'FETCH',
            'GRIEVANCE',
            id,
            `Fetched ${result.newGrievances} new grievances for source${start_date ? ` from ${start_date}` : ''}${end_date ? ` to ${end_date}` : ''}`
        );

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Fetch all grievances from all sources
 * @route   POST /api/grievances/fetch-all
 * @access  Private
 */
const fetchAllGrievances = async (req, res) => {
    try {
        const { start_date, end_date } = req.body;

        const result = await grievanceService.fetchAllGrievances(start_date, end_date);
        await invalidateGrievanceCaches();

        await logAudit(
            req,
            'FETCH',
            'GRIEVANCE',
            'all',
            `Fetched ${result.newGrievances} new grievances from all sources${start_date ? ` from ${start_date}` : ''}${end_date ? ` to ${end_date}` : ''}`
        );

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Fetch grievances by searching keywords from Settings
 * @route   POST /api/grievances/fetch-keywords
 * @access  Private
 */
const fetchKeywordGrievances = async (req, res) => {
    try {
        const { platform } = req.body;
        const result = await grievanceService.fetchKeywordGrievances(platform || null);
        await invalidateGrievanceCaches();

        await logAudit(
            req,
            'FETCH',
            'GRIEVANCE',
            'keywords',
            `Keyword fetch: ${result.newGrievances} new grievances from ${result.keywordsSearched} keywords`
        );

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Get all grievances with filtering
 * @route   GET /api/grievances
 * @access  Private
 */
const getGrievances = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 200,
            sort = '-post_date',
            cursor
        } = req.query;

        // Cache only first-page loads (no cursor). Cursor loads only fire
        // when the user actively scrolls and are unique per session.
        const isFirstPage = !cursor;
        const listCacheVersion = await cacheService.getVersion('grievances:list');
        const cacheKey = isFirstPage
            ? `grievances:list:v1:${listCacheVersion}:${JSON.stringify(req.query || {})}`
            : null;
        if (cacheKey) {
            const cached = await cacheService.get(cacheKey);
            if (cached) {
                res.set('Cache-Control', 'private, max-age=10');
                return res.status(200).json(cached);
            }
        }

        // Superadmin / unscoped roles see every grievance in the collection,
        // including legacy rows that lack BSK keywords. This must NOT also
        // resurrect user-deleted rows: deleteGrievance() soft-deletes via
        // is_active=false, so stripping the is_active filter here made every
        // deleted grievance reappear for admin/superadmin logins on the very
        // next fetch. Only drop the is_active filter when the caller
        // explicitly opts in (include_inactive=true) — admin view alone
        // should still default to hiding deleted rows.
        const isAdminView = !!(req.scope && req.scope.canSeeAll);
        const includeInactive = String(req.query.include_inactive || '').toLowerCase() === 'true';
        const queryParams = isAdminView
            ? { ...req.query, target_only: 'false' }
            : req.query;

        const query = buildListQuery(queryParams);
        if (isAdminView && includeInactive) {
            delete query.is_active;
        }

        // Limit search space to 400 most recent grievances for location + civic issue categories
        const hasLocation = queryParams.location_city || queryParams.location_district || queryParams.location_constituency;
        const isCivicCategory = queryParams.analysis_category && ISSUE_LEXICON[queryParams.analysis_category];
        if (hasLocation && isCivicCategory) {
            const baseQueryParams = { ...queryParams };
            delete baseQueryParams.analysis_category;
            const baseQuery = buildListQuery(baseQueryParams);
            if (isAdminView && includeInactive) {
                delete baseQuery.is_active;
            }
            const recentDocs = await Grievance.find(baseQuery)
                .select('_id')
                .sort({ post_date: -1 })
                .limit(400)
                .lean();
            const recentIds = recentDocs.map(d => d._id);
            query._id = { $in: recentIds };
        }

        const limitNum = Math.min(parseInt(limit, 10) || 50, 200); // cap at 200
        const pageNum = parseInt(page, 10);
        const skip = (pageNum - 1) * limitNum;
        const findQuery = { ...query };

        // RBAC row-level scope: clamp results to constituencies the caller is
        // allowed to see. Super-admins / legacy roles pass through untouched.
        if (req.scope && !req.scope.canSeeAll) {
            const { constituencyFilter, mergeFilter } = require('../middleware/scopeMiddleware');
            mergeFilter(findQuery, constituencyFilter(req.scope, { extraFields: ['routing_targets.constituencies'] }));
        }

        // Cursor format: "<post_date_iso>|<id>"
        if (cursor) {
            const [cursorDateRaw, cursorId] = String(cursor).split('|');
            const cursorDate = new Date(cursorDateRaw);
            if (!isNaN(cursorDate.getTime()) && cursorId) {
                findQuery.$or = [
                    { post_date: { $lt: cursorDate } },
                    { post_date: cursorDate, id: { $lt: cursorId } }
                ];
            }
        }

        // Only return fields needed for the list view (skip heavy nested fields)
        const listProjection = {
            id: 1,
            complaint_code: 1,
            tweet_id: 1,
            tagged_account: 1,
            tagged_account_normalized: 1,
            grievance_source_id: 1,
            platform: 1,
            source_ref: 1,
            complainant_phone: 1,
            'posted_by.handle': 1,
            'posted_by.display_name': 1,
            'posted_by.profile_image_url': 1,
            'posted_by.is_verified': 1,
            'posted_by.follower_count': 1,
            'content.text': 1,
            'content.full_text': 1,
            'content.media.type': 1,
            'content.media.url': 1,
            'content.media.preview_url': 1,
            'content.media.video_url': 1,
            'content.media.s3_url': 1,
            'content.media.s3_preview': 1,
            tweet_url: 1,
            engagement: 1,
            post_date: 1,
            detected_date: 1,
            classification: 1,
            workflow_status: 1,
            'complaint.status': 1,
            'complaint.report_number': 1,
            'grievance_workflow.status': 1,
            'grievance_workflow.category': 1,
            'query_workflow.status': 1,
            'query_workflow.category': 1,
            'criticism.category': 1,
            'suggestion.category': 1,
            escalation_count: 1,
            'analysis.sentiment': 1,
            'analysis.grievance_type': 1,
            'analysis.category': 1,
            'analysis.risk_level': 1,
            'analysis.risk_score': 1,
            'analysis.analyzed_at': 1,
            'analysis.llm_analysis': 1,
            'analysis.explanation': 1,
            'analysis.reasons': 1,
            'analysis.violated_policies': 1,
            'analysis.legal_sections': 1,
            'analysis.highlights': 1,
            'analysis.forensic_results': 1,
            'analysis.grievance_topic_reasoning': 1,
            'analysis.intent': 1,
            'detected_location.city': 1,
            'detected_location.district': 1,
            'detected_location.constituency': 1,
            is_active: 1
        };

        // Sentiment pill counts are computed WITHOUT the sentiment filter, so
        // selecting one sentiment still shows the true totals for the other two
        // (otherwise the unselected pills read 0). All other active filters
        // (search, date, platform, location…) are kept.
        const sentimentCountMatch = { ...query };
        delete sentimentCountMatch['analysis.sentiment'];

        const [grievancesRaw, total, sentimentRows] = await Promise.all([
            Grievance.find(findQuery)
                .select(listProjection)
                .sort(cursor ? { post_date: -1, id: -1 } : sort)
                .skip(cursor ? 0 : skip)
                .limit(limitNum + 1)
                .lean(),
            // Run count in parallel (skip for cursor-based loads — frontend already has total)
            cursor ? Promise.resolve(undefined) : Grievance.countDocuments(query),
            // Sentiment breakdown across the current filters minus the sentiment
            // filter, so the pill counts reflect the real per-sentiment totals.
            // Skip on cursor loads since the frontend caches first-page counts.
            cursor
                ? Promise.resolve(undefined)
                : Grievance.aggregate([
                    { $match: sentimentCountMatch },
                    { $group: { _id: '$analysis.sentiment', count: { $sum: 1 } } }
                ])
        ]);

        const hasMore = grievancesRaw.length > limitNum;
        const pageRows = hasMore ? grievancesRaw.slice(0, limitNum) : grievancesRaw;
        const nextCursor = hasMore && pageRows.length > 0
            ? `${new Date(pageRows[pageRows.length - 1].post_date).toISOString()}|${pageRows[pageRows.length - 1].id}`
            : null;

        const grievances = pageRows.map(normalizeGrievanceForList);

        // Bucket sentiment counts. Anything that isn't explicitly positive
        // or negative falls into "neutral" (covers null, "neutral", and
        // any analysis row that hasn't been categorised yet).
        let sentimentCounts;
        if (sentimentRows) {
            sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
            for (const r of sentimentRows) {
                const k = r._id === 'positive' || r._id === 'negative' ? r._id : 'neutral';
                sentimentCounts[k] += r.count || 0;
            }
        }

        const payload = {
            grievances,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: typeof total === 'number' ? Math.ceil(total / limitNum) : undefined,
                hasMore,
                nextCursor,
                ...(sentimentCounts ? { sentiment_counts: sentimentCounts } : {})
            }
        };
        if (cacheKey) {
            await cacheService.set(cacheKey, payload, 20);
            res.set('Cache-Control', 'private, max-age=10');
        }
        res.status(200).json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Get a single grievance
 * @route   GET /api/grievances/:id
 * @access  Private
 */
const getGrievance = async (req, res) => {
    try {
        const { id } = req.params;
        const grievance = await Grievance.findOne({ id });

        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        const payload = grievance.toObject();
        payload.workflow_status = inferWorkflowStatusFromLegacy(payload);
        payload.can_convert_to_fir = canConvertToFir(payload);
        payload.complainant = normalizeComplainant(payload);
        res.status(200).json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Acknowledge a grievance (mark as non-actionable)
 * @route   PUT /api/grievances/:id/acknowledge
 * @access  Private
 */
const acknowledgeGrievance = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, notes } = req.body;

        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        grievance.classification = 'acknowledged';
        grievance.acknowledgment = {
            reason: reason || 'No actionable complaint',
            acknowledged_by: req.user?.id,
            acknowledged_at: new Date(),
            notes
        };
        ensureWorkflowInitialized(grievance);
        applyWorkflowTransition(grievance, 'closed', {
            userId: req.user?.id,
            note: notes || reason || 'Acknowledged by officer'
        });

        await grievance.save();
        await invalidateGrievanceCaches();

        // Update source stats
        await GrievanceSource.findOneAndUpdate(
            { id: grievance.grievance_source_id },
            { $inc: { 'stats.acknowledged': 1 } }
        );

        await logAudit(req, 'ACKNOWLEDGE', 'GRIEVANCE', id, `Acknowledged grievance: ${reason || 'No reason provided'}`);

        res.status(200).json(grievance);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Mark grievance as complaint (requires action)
 * @route   PUT /api/grievances/:id/complaint
 * @access  Private
 */
const markAsComplaint = async (req, res) => {
    try {
        const { id } = req.params;
        const { priority, category, notes } = req.body;

        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        grievance.classification = 'complaint';
        grievance.complaint = {
            ...grievance.complaint,
            priority: priority || 'medium',
            status: 'pending',
            category,
            notes
        };
        ensureWorkflowInitialized(grievance);
        applyWorkflowTransition(grievance, 'reviewed', {
            userId: req.user?.id,
            note: notes || `Marked as complaint (${priority || 'medium'})`
        });

        await grievance.save();
        await invalidateGrievanceCaches();

        // Update source stats
        await GrievanceSource.findOneAndUpdate(
            { id: grievance.grievance_source_id },
            {
                $inc: {
                    'stats.complaints': 1,
                    'stats.pending': 1
                }
            }
        );

        await logAudit(req, 'MARK_COMPLAINT', 'GRIEVANCE', id, `Marked as complaint with priority: ${priority || 'medium'}`);

        res.status(200).json(grievance);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Update complaint status
 * @route   PUT /api/grievances/:id/status
 * @access  Private
 */
const updateComplaintStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, action_taken, notes } = req.body;

        const validStatuses = ['pending', 'sent', 'reviewed', 'case_booked'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        if (grievance.classification !== 'complaint') {
            return res.status(400).json({ message: 'Only complaints can have status updates' });
        }

        ensureWorkflowInitialized(grievance);
        const oldStatus = grievance.complaint.status;
        grievance.complaint.status = status;
        if (action_taken) grievance.complaint.action_taken = action_taken;
        if (notes) grievance.complaint.notes = notes;
        grievance.complaint.action_taken_by = req.user?.id;
        grievance.complaint.action_taken_at = new Date();

        const workflowByLegacyStatus = {
            pending: 'reviewed',
            sent: 'action_taken',
            reviewed: 'closed',
            case_booked: 'converted_to_fir'
        };
        const targetWorkflow = workflowByLegacyStatus[status] || legacyStatusToWorkflow(status);
        applyWorkflowTransition(grievance, targetWorkflow, {
            userId: req.user?.id,
            note: notes || action_taken || `Updated via legacy complaint status: ${status}`
        });

        await grievance.save();
        await invalidateGrievanceCaches();

        // Update source stats
        const updateObj = {};
        if (oldStatus) updateObj[`stats.${oldStatus}`] = -1;
        updateObj[`stats.${status === 'case_booked' ? 'resolved' : status}`] = 1;

        await GrievanceSource.findOneAndUpdate(
            { id: grievance.grievance_source_id },
            { $inc: updateObj }
        );

        await logAudit(req, 'UPDATE_STATUS', 'GRIEVANCE', id, `Updated status from ${oldStatus} to ${status}`);

        res.status(200).json(grievance);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Update grievance workflow status (canonical workflow endpoint)
 * @route   PUT /api/grievances/:id/workflow
 * @access  Private
 */
const updateWorkflowStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { workflow_status: workflowStatusInput, note } = req.body;
        const workflowStatus = normalizeWorkflowStatus(workflowStatusInput);

        if (!workflowStatus) {
            return res.status(400).json({ message: 'Invalid workflow_status' });
        }

        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        ensureWorkflowInitialized(grievance);

        try {
            applyWorkflowTransition(grievance, workflowStatus, {
                userId: req.user?.id,
                note: note || `Workflow updated to ${workflowStatus}`
            });
        } catch (transitionError) {
            if (transitionError.code === 'INVALID_WORKFLOW_TRANSITION' || transitionError.code === 'INVALID_WORKFLOW_STATUS') {
                return res.status(400).json({ message: transitionError.message });
            }
            throw transitionError;
        }

        await grievance.save();
        await invalidateGrievanceCaches();
        await logAudit(req, 'UPDATE_WORKFLOW', 'GRIEVANCE', id, `Workflow updated to ${workflowStatus}`);

        res.status(200).json(normalizeGrievanceForList(grievance));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Convert grievance to FIR
 * @route   POST /api/grievances/:id/convert-to-fir
 * @access  Private
 */
const convertToFir = async (req, res) => {
    try {
        const { id } = req.params;
        const { note, fir_number: firNumberInput } = req.body;
        const firNumber = firNumberInput ? String(firNumberInput).trim() : undefined;

        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        ensureWorkflowInitialized(grievance);
        if (!canConvertToFir(grievance)) {
            return res.status(400).json({ message: 'Grievance is already converted to FIR' });
        }

        try {
            applyWorkflowTransition(grievance, 'converted_to_fir', {
                userId: req.user?.id,
                note: note || 'Converted to FIR',
                firNumber
            });
        } catch (transitionError) {
            if (transitionError.code === 'INVALID_WORKFLOW_TRANSITION') {
                return res.status(400).json({ message: transitionError.message });
            }
            throw transitionError;
        }

        if (firNumber) grievance.fir_number = firNumber;

        await grievance.save();
        await invalidateGrievanceCaches();
        await logAudit(
            req,
            'CONVERT_TO_FIR',
            'GRIEVANCE',
            id,
            `Converted grievance to FIR${firNumber ? ` (${firNumber})` : ''}`
        );

        res.status(200).json(normalizeGrievanceForList(grievance));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Escalate grievance
 * @route   POST /api/grievances/:id/escalate
 * @access  Private
 */
const escalateGrievance = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, note } = req.body;

        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        grievance.escalation_count = (grievance.escalation_count || 0) + 1;
        grievance.escalation_history = grievance.escalation_history || [];
        grievance.escalation_history.push({
            reason: reason || 'Manual escalation',
            note,
            by: req.user?.id,
            at: new Date()
        });

        await grievance.save();
        await invalidateGrievanceCaches();
        await logAudit(req, 'ESCALATE', 'GRIEVANCE', id, reason || 'Manual escalation');

        res.status(200).json({
            id: grievance.id,
            escalation_count: grievance.escalation_count,
            escalation_history: grievance.escalation_history,
            workflow_status: inferWorkflowStatusFromLegacy(grievance)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Public Twilio WhatsApp webhook for grievance intake
 * @route   POST /api/grievances/whatsapp/webhook
 * @access  Public (signature protected)
 */
const ingestWhatsAppWebhook = async (req, res) => {
    try {
        const validSignature = validateTwilioSignature(req);
        if (!validSignature) {
            return res.status(403).json({ message: 'Invalid Twilio signature' });
        }

        const messageSid = String(req.body?.MessageSid || '').trim();
        if (!messageSid) {
            return res.status(400).json({ message: 'MessageSid is required' });
        }

        const existing = await Grievance.findOne({ whatsapp_message_sid: messageSid });
        if (existing) {
            return sendTwilioAck(res, 200);
        }

        const fromPhone = toWhatsAppPhone(req.body?.From);
        const toPhone = toWhatsAppPhone(req.body?.To);
        const accountSid = String(req.body?.AccountSid || '').trim();
        const profileName = String(req.body?.ProfileName || '').trim();
        const bodyText = String(req.body?.Body || '').trim();
        const media = extractWhatsAppMedia(req.body);
        const contentText = bodyText || (media.length > 0 ? '[Media attachment]' : '[Empty message]');
        const now = new Date();

        const grievance = new Grievance({
            complaint_code: await generateComplaintCode(),
            tweet_id: `whatsapp:${messageSid}`,
            tagged_account: toPhone || 'whatsapp',
            platform: 'whatsapp',
            complainant_phone: fromPhone || undefined,
            source_ref: toPhone || req.body?.MessagingServiceSid || 'whatsapp',
            whatsapp_message_sid: messageSid,
            posted_by: {
                handle: fromPhone || `whatsapp_user_${messageSid.slice(-6)}`,
                display_name: profileName || fromPhone || 'WhatsApp User',
                profile_image_url: '',
                is_verified: false,
                follower_count: 0
            },
            content: {
                text: contentText,
                full_text: contentText,
                media
            },
            tweet_url: buildTwilioMessageUrl(accountSid, messageSid),
            engagement: {
                likes: 0,
                retweets: 0,
                replies: 0,
                views: 0,
                quotes: 0
            },
            post_date: now,
            detected_date: now,
            workflow_status: 'received',
            workflow_timestamps: {
                received_at: now
            },
            escalation_count: 0
        });

        syncLegacyFieldsFromWorkflow(grievance, 'received');

        try {
            await grievance.save();
            await invalidateGrievanceCaches();
        } catch (saveError) {
            // Dedupe on concurrent webhook retries.
            if (saveError?.code === 11000) {
                return sendTwilioAck(res, 200);
            }
            throw saveError;
        }

        console.info(`[GrievanceWebhook] Ingested WhatsApp grievance ${grievance.id} (${messageSid})`);
        // Extract and persist location (non-blocking)
        extractAndSaveLocation(grievance.id, contentText, { location: '', bio: '' }).catch(() => { });
        return sendTwilioAck(res, 200);
    } catch (error) {
        if (error.code === 'TWILIO_TOKEN_MISSING') {
            return res.status(500).json({ message: error.message });
        }
        console.error('[GrievanceWebhook] Failed to ingest WhatsApp message:', error.message);
        return res.status(500).json({ message: 'Failed to process webhook' });
    }
};

/**
 * @desc    Generate PDF report for a complaint
 * @route   GET /api/grievances/:id/report
 * @access  Private
 */
const generateReport = async (req, res) => {
    try {
        const { id } = req.params;

        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        if (grievance.classification !== 'complaint') {
            return res.status(400).json({ message: 'Reports can only be generated for complaints' });
        }

        const { buffer, filename, reportNumber } = await grievanceService.generatePDFReport(id);

        await logAudit(req, 'GENERATE_REPORT', 'GRIEVANCE', id, `Generated PDF report: ${reportNumber}`);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Record sharing of report
 * @route   POST /api/grievances/:id/share
 * @access  Private
 */
const recordShare = async (req, res) => {
    try {
        const { id } = req.params;
        const { contact_number, method } = req.body;

        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        if (!grievance.complaint.shared_with) {
            grievance.complaint.shared_with = [];
        }

        grievance.complaint.shared_with.push({
            contact_number,
            shared_at: new Date(),
            shared_by: req.user?.id,
            method: method || 'whatsapp'
        });

        await grievance.save();
        await invalidateGrievanceCaches();

        await logAudit(req, 'SHARE_REPORT', 'GRIEVANCE', id, `Shared report via ${method} to ${contact_number}`);

        res.status(200).json(grievance);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Get grievance statistics
 * @route   GET /api/grievances/stats
 * @access  Private
 */
const getStats = async (req, res) => {
    try {
        const cacheKey = `grievances:stats:v2:${JSON.stringify(req.query || {})}`;
        const cached = await cacheService.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const baseQuery = buildListQuery(req.query, { includeTab: false });

        const [facetRows, activeSources] = await Promise.all([
            Grievance.aggregate([
                { $match: baseQuery },
                {
                    $facet: {
                        total: [{ $count: 'count' }],
                        workflow: [{ $group: { _id: '$workflow_status', count: { $sum: 1 } } }],
                        gWorkflow: [{ $group: { _id: '$grievance_workflow.status', count: { $sum: 1 } } }],
                        classification: [{ $group: { _id: '$classification', count: { $sum: 1 } } }],
                        complaintStatus: [
                            { $match: { classification: 'complaint' } },
                            { $group: { _id: '$complaint.status', count: { $sum: 1 } } }
                        ],
                        byCategory: [
                            {
                                $project: {
                                    cat: {
                                        $setUnion: [
                                            { $cond: [{ $ifNull: ['$grievance_workflow.category', false] }, ['$grievance_workflow.category'], []] },
                                            { $cond: [{ $ifNull: ['$query_workflow.category', false] }, ['$query_workflow.category'], []] },
                                            { $cond: [{ $ifNull: ['$criticism.category', false] }, ['$criticism.category'], []] },
                                            { $cond: [{ $ifNull: ['$suggestion.category', false] }, ['$suggestion.category'], []] }
                                        ]
                                    }
                                }
                            },
                            { $unwind: '$cat' },
                            { $group: { _id: '$cat', count: { $sum: 1 } } }
                        ]
                    }
                }
            ]),
            GrievanceSource.countDocuments({
                is_active: true,
                ...(req.query.platform && req.query.platform !== 'all' ? { platform: normalizePlatform(req.query.platform) } : {})
            })
        ]);

        const facet = facetRows[0] || {};
        const total = facet.total?.[0]?.count || 0;
        const workflowMap = Object.fromEntries((facet.workflow || []).map((i) => [i._id || 'received', i.count]));
        const gWorkflowMap = Object.fromEntries((facet.gWorkflow || []).map((i) => [i._id, i.count]));
        const classMap = Object.fromEntries((facet.classification || []).map((i) => [i._id, i.count]));
        const complaintStatusMap = Object.fromEntries((facet.complaintStatus || []).map((i) => [i._id, i.count]));

        // Count pending: G-workflow PENDING + those without G-workflow that are in legacy pending states
        const gPending = gWorkflowMap['PENDING'] || 0;
        const gEscalated = gWorkflowMap['ESCALATED'] || 0;
        const gClosed = gWorkflowMap['CLOSED'] || 0;
        // Grievances that have no G-workflow status (null/undefined key in gWorkflowMap)
        const noGWorkflowCount = gWorkflowMap[null] || gWorkflowMap[undefined] || gWorkflowMap['null'] || 0;
        // Legacy counts for grievances without G-workflow
        const legacyClosed = workflowMap.closed || 0;
        const legacyFir = workflowMap.converted_to_fir || 0;
        // Legacy pending = those without G-workflow minus legacy closed & fir
        const legacyPending = Math.max(0, noGWorkflowCount - legacyClosed - legacyFir);

        const payload = {
            total,
            total_complaints: total,
            pending: gPending + legacyPending,
            escalated: gEscalated,
            closed: gClosed + legacyClosed,
            converted_to_fir: legacyFir,
            unclassified: classMap.unclassified || 0,
            acknowledged: classMap.acknowledged || 0,
            complaints: classMap.complaint || 0,
            byStatus: {
                pending: complaintStatusMap.pending || 0,
                sent: complaintStatusMap.sent || 0,
                reviewed: complaintStatusMap.reviewed || 0,
                case_booked: complaintStatusMap.case_booked || 0
            },
            byCategory: Object.fromEntries((facet.byCategory || []).map(i => [i._id, i.count])),
            activeSources
        };

        await cacheService.set(cacheKey, payload, 20);
        res.status(200).json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getDashboardStats = async (req, res) => {
    try {
        const bskOnly = String(req.query.target_only ?? 'true').toLowerCase() !== 'false';
        const { constituencyFilter, mergeFilter } = require('../middleware/scopeMiddleware');
        const scopeMatch = req.scope?.canSeeAll ? {} : constituencyFilter(req.scope, { extraFields: ['routing_targets.constituencies'] });
        const scopeKey = req.scope?.canSeeAll
            ? 'all'
            : [...(req.scope?.constituencyKeys || [])].sort().join(',');
        const cacheKey = `grievances:dashboard:v1:bsk=${bskOnly}:scope=${scopeKey}`;
        const cached = await cacheService.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const bskMatch = buildBskRelevanceMatch(req.query);
        const rows = await Grievance.aggregate([
            { $match: mergeFilter({ is_active: true }, mergeFilter({ ...bskMatch }, scopeMatch)) },
            {
                $group: {
                    _id: '$platform',
                    total: { $sum: 1 },
                    resolved: {
                        $sum: {
                            $cond: [{ $eq: ['$workflow_status', 'closed'] }, 1, 0]
                        }
                    },
                    pending: {
                        $sum: {
                            $cond: [{ $in: ['$workflow_status', ['received', 'reviewed', 'action_taken']] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        const byPlatform = { all: { total: 0, pending: 0, resolved: 0 }, x: { total: 0, pending: 0, resolved: 0 }, facebook: { total: 0, pending: 0, resolved: 0 }, whatsapp: { total: 0, pending: 0, resolved: 0 } };
        rows.forEach((r) => {
            const p = r._id || 'x';
            if (!byPlatform[p]) byPlatform[p] = { total: 0, pending: 0, resolved: 0 };
            byPlatform[p].total += r.total || 0;
            byPlatform[p].pending += r.pending || 0;
            byPlatform[p].resolved += r.resolved || 0;
            byPlatform.all.total += r.total || 0;
            byPlatform.all.pending += r.pending || 0;
            byPlatform.all.resolved += r.resolved || 0;
        });

        const payload = {
            byPlatform,
            totals: {
                total: byPlatform.all.total,
                pending: byPlatform.all.pending,
                resolved: byPlatform.all.resolved
            }
        };
        await cacheService.set(cacheKey, payload, 20);
        res.status(200).json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Get grievance settings
 * @route   GET /api/grievances/settings
 * @access  Private
 */
const getSettings = async (req, res) => {
    try {
        let settings = await GrievanceSettings.findOne({ id: 'grievance_settings' });
        if (!settings) {
            settings = await GrievanceSettings.create({ id: 'grievance_settings' });
        }
        res.status(200).json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Update grievance settings
 * @route   PUT /api/grievances/settings
 * @access  Private
 */
const updateSettings = async (req, res) => {
    try {
        const updates = req.body;
        updates.updated_by = req.user?.id;

        let settings = await GrievanceSettings.findOneAndUpdate(
            { id: 'grievance_settings' },
            updates,
            { new: true, upsert: true }
        );

        await logAudit(req, 'UPDATE', 'GRIEVANCE_SETTINGS', 'grievance_settings', 'Updated grievance settings');

        res.status(200).json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Revert grievance to unclassified
 * @route   PUT /api/grievances/:id/revert
 * @access  Private
 */
const revertGrievance = async (req, res) => {
    try {
        const { id } = req.params;

        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        const previousClassification = grievance.classification;
        const previousWorkflow = inferWorkflowStatusFromLegacy(grievance);
        grievance.classification = 'unclassified';
        grievance.acknowledgment = {};
        grievance.complaint = {
            priority: 'medium',
            status: 'pending',
            shared_with: []
        };
        syncLegacyFieldsFromWorkflow(grievance, 'received');
        grievance.workflow_timestamps = grievance.workflow_timestamps || {};
        grievance.workflow_timestamps.received_at = grievance.workflow_timestamps.received_at || new Date();
        grievance.workflow_history = grievance.workflow_history || [];
        grievance.workflow_history.push({
            from: previousWorkflow,
            to: 'received',
            at: new Date(),
            by: req.user?.id,
            note: 'Reverted grievance to received'
        });

        await grievance.save();
        await invalidateGrievanceCaches();

        await logAudit(req, 'REVERT', 'GRIEVANCE', id, `Reverted grievance from ${previousClassification} to unclassified`);

        res.status(200).json(grievance);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Trigger analysis pipeline on a single grievance (or re-analyze)
 * @route   POST /api/grievances/:id/analyze
 * @access  Private
 */
const analyzeGrievance = async (req, res) => {
    try {
        const { id } = req.params;
        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }
        const text = grievance.content?.full_text || grievance.content?.text || '';
        if (!text.trim()) {
            return res.status(400).json({ message: 'Grievance has no text content to analyze' });
        }
        // Run analysis synchronously so caller gets results
        await grievanceService.analyzeGrievanceContent(grievance.id, text, grievance.platform || 'x');
        const updated = await Grievance.findOne({ id });
        const payload = updated.toObject();
        payload.workflow_status = inferWorkflowStatusFromLegacy(payload);
        res.status(200).json({ message: 'Analysis complete', analysis: payload.analysis });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Bulk analyze all grievances that don't have analysis yet
 * @route   POST /api/grievances/analyze-all
 * @access  Private
 */
const analyzeAllGrievances = async (req, res) => {
    try {
        const unanalyzed = await Grievance.find({
            $or: [
                { 'analysis.analyzed_at': { $exists: false } },
                { 'analysis.analyzed_at': null }
            ]
        }).select('id content.text content.full_text platform').lean();

        let queued = 0;
        for (const g of unanalyzed) {
            const text = g.content?.full_text || g.content?.text || '';
            if (text.trim()) {
                grievanceService.analyzeGrievanceContent(g.id, text, g.platform || 'x').catch(() => { });
                queued++;
            }
        }
        res.status(200).json({ message: `Analysis queued for ${queued} grievances`, total: unanalyzed.length, queued });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Get sentiment analytics for dashboard tiles
 * @route   GET /api/grievances/sentiment-analytics
 * @access  Private
 */
const getSentimentAnalytics = async (req, res) => {
    try {
        const bskOnly = String(req.query.target_only ?? 'true').toLowerCase() !== 'false';
        // RBAC: per-user cache key so scoped MLAs don't see the cached statewide payload.
        const scopeKey = req.scope?.canSeeAll
            ? 'all'
            : [...(req.scope?.constituencyKeys || [])].sort().join(',');
        const cacheKey = `grievances:sentiment-analytics:v1:bsk=${bskOnly}:scope=${scopeKey}`;
        const cached = await cacheService.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const bskMatch = buildBskRelevanceMatch(req.query);
        const { constituencyFilter, mergeFilter } = require('../middleware/scopeMiddleware');
        const scopeMatch = req.scope?.canSeeAll ? {} : constituencyFilter(req.scope, { extraFields: ['routing_targets.constituencies'] });

        // 1) Sentiment distribution
        const sentimentRows = await Grievance.aggregate([
            { $match: mergeFilter({ is_active: true, 'analysis.sentiment': { $exists: true, $ne: null } }, mergeFilter({ ...bskMatch }, scopeMatch)) },
            { $group: { _id: '$analysis.sentiment', count: { $sum: 1 } } }
        ]);
        const distribution = { positive: 0, neutral: 0, negative: 0 };
        sentimentRows.forEach(r => {
            if (distribution.hasOwnProperty(r._id)) distribution[r._id] = r.count;
        });

        // 2) Top 5 profiles posting negative content
        const topNegative = await Grievance.aggregate([
            { $match: mergeFilter({ is_active: true, 'analysis.sentiment': 'negative' }, mergeFilter({ ...bskMatch }, scopeMatch)) },
            {
                $group: {
                    _id: '$posted_by.handle',
                    display_name: { $first: '$posted_by.display_name' },
                    profile_image_url: { $first: '$posted_by.profile_image_url' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 5 },
            {
                $project: {
                    _id: 0,
                    handle: '$_id',
                    display_name: 1,
                    profile_image_url: 1,
                    count: 1
                }
            }
        ]);

        const payload = { distribution, topNegative };
        await cacheService.set(cacheKey, payload, 30);
        res.status(200).json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Get top profiles by grievance sentiment across all platforms
 * @route   GET /api/grievances/sentiment-leaders
 * @access  Private
 */
const getSentimentLeaders = async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 100));
        const cacheKey = `grievances:sentiment-leaders:v1:${limit}`;
        const cached = await cacheService.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const buildLeaderboard = async (sentimentValue) => {
            const rows = await Grievance.aggregate([
                {
                    $match: {
                        is_active: true,
                        'analysis.sentiment': sentimentValue,
                        'posted_by.handle': { $exists: true, $ne: null, $ne: '' }
                    }
                },
                {
                    $addFields: {
                        handle_normalized: {
                            $toLower: {
                                $trim: {
                                    input: {
                                        $replaceAll: {
                                            input: { $ifNull: ['$posted_by.handle', ''] },
                                            find: '@',
                                            replacement: ''
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $match: {
                        handle_normalized: { $nin: ['', 'unknown'] }
                    }
                },
                {
                    $group: {
                        _id: {
                            platform: '$platform',
                            handle: '$handle_normalized'
                        },
                        handle: { $first: '$posted_by.handle' },
                        display_name: { $first: '$posted_by.display_name' },
                        profile_image_url: { $first: '$posted_by.profile_image_url' },
                        platform: { $first: '$platform' },
                        post_count: { $sum: 1 },
                        latest_post_date: { $max: '$post_date' }
                    }
                },
                { $sort: { post_count: -1, latest_post_date: -1 } },
                { $limit: limit },
                {
                    $project: {
                        _id: 0,
                        handle: 1,
                        display_name: 1,
                        profile_image_url: 1,
                        platform: 1,
                        post_count: 1,
                        latest_post_date: 1
                    }
                }
            ]);

            return rows.map((row, index) => ({
                ...row,
                rank: index + 1,
                sentiment: sentimentValue
            }));
        };

        const [positive, negative, neutral] = await Promise.all([
            buildLeaderboard('positive'),
            buildLeaderboard('negative'),
            buildLeaderboard('neutral')
        ]);

        const payload = {
            leaders: {
                positive,
                negative,
                moderate: neutral
            }
        };

        await cacheService.set(cacheKey, payload, 60);
        return res.status(200).json(payload);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getDistinctTopics = async (req, res) => {
    try {
        const topics = await Grievance.distinct('analysis.grievance_type', {
            is_active: true,
            'analysis.grievance_type': { $exists: true, $ne: null, $ne: '', $nin: ['Normal', 'Not a Grievance'] }
        });
        topics.sort();
        res.status(200).json({ topics });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getDistinctCategories = async (req, res) => {
    try {
        const categories = await Grievance.distinct('analysis.category', {
            is_active: true,
            'analysis.category': { $exists: true, $ne: null, $ne: '' }
        });
        categories.sort();
        res.status(200).json({ categories });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getCategoryAnalytics = async (req, res) => {
    try {
        const bskOnly = String(req.query.target_only ?? 'true').toLowerCase() !== 'false';
        const { constituencyFilter, mergeFilter } = require('../middleware/scopeMiddleware');
        const scopeMatch = req.scope?.canSeeAll ? {} : constituencyFilter(req.scope, { extraFields: ['routing_targets.constituencies'] });
        const scopeKey = req.scope?.canSeeAll
            ? 'all'
            : [...(req.scope?.constituencyKeys || [])].sort().join(',');
        const cacheKey = `grievances:category-analytics:v2:bsk=${bskOnly}:scope=${scopeKey}`;
        const cached = await cacheService.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const bskMatch = buildBskRelevanceMatch(req.query);

        const [categoryRows, topicRows] = await Promise.all([
            Grievance.aggregate([
                { $match: mergeFilter({ is_active: true, 'analysis.analyzed_at': { $exists: true }, 'analysis.category': { $exists: true, $ne: null, $ne: '' } }, mergeFilter({ ...bskMatch }, scopeMatch)) },
                { $group: { _id: '$analysis.category', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Grievance.aggregate([
                { $match: mergeFilter({ is_active: true, 'analysis.analyzed_at': { $exists: true } }, mergeFilter({ ...bskMatch }, scopeMatch)) },
                {
                    $project: {
                        topic: {
                            $let: {
                                vars: {
                                    gt: { $trim: { input: { $ifNull: ['$analysis.grievance_type', ''] } } },
                                    cat: { $trim: { input: { $ifNull: ['$analysis.category', ''] } } }
                                },
                                in: {
                                    $cond: [
                                        { $gt: [{ $strLenCP: '$$gt' }, 0] },
                                        '$$gt',
                                        {
                                            $cond: [
                                                { $gt: [{ $strLenCP: '$$cat' }, 0] },
                                                '$$cat',
                                                'Normal'
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    }
                },
                { $group: { _id: '$topic', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        ]);

        const payload = {
            categories: categoryRows.map(r => ({ name: r._id, count: r.count })),
            topics: topicRows.map(r => ({ name: r._id, count: r.count }))
        };

        await cacheService.set(cacheKey, payload, 20);
        res.status(200).json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Get aggregated map stats (counts, sentiment, categories) per location keyword.
 * Searches both detected_location fields AND full text for location keywords.
 * Returns accurate counts matching what the search-based grievance page shows.
 */
const getMapGrievances = async (req, res) => {
    try {
        const { days = 365, scope = 'all' } = req.query;
        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));
        const karimnagarScope = ['sangrur', 'karimnagar'].includes(String(scope || '').toLowerCase());

        // Karimnagar Lok Sabha PC assembly segments
        const karimnagarAcKeywords = ['karimnagar', 'choppadandi', 'vemulawada', 'sircilla', 'manakondur', 'husnabad', 'huzurabad'];
        const acAliasMap = {
            'karimnagar': 'karimnagar',
            'karimnagar city': 'karimnagar',
            'karimnagar urban': 'karimnagar',
            'karimnagar rural': 'karimnagar',
            'choppadandi': 'choppadandi',
            'choppadandi (sc)': 'choppadandi',
            'vemulawada': 'vemulawada',
            'sircilla': 'sircilla',
            'rajanna sircilla': 'sircilla',
            'manakondur': 'manakondur',
            'manakondur (sc)': 'manakondur',
            'thimmapur': 'manakondur',
            'husnabad': 'husnabad',
            'huzurabad': 'huzurabad',
            'jammikunta': 'huzurabad'
        };

        // All Telangana location keywords (mirror of frontend CITY_TO_AC + CITY_TO_DISTRICT keys)
        const allLocationKeywords = [
            'karimnagar', 'choppadandi', 'vemulawada', 'sircilla', 'rajanna sircilla',
            'manakondur', 'husnabad', 'huzurabad', 'jammikunta', 'thimmapur',
            'hyderabad', 'secunderabad', 'rangareddy', 'medchal', 'malkajgiri',
            'warangal', 'hanamkonda', 'khammam', 'kothagudem', 'bhadrachalam',
            'nizamabad', 'kamareddy', 'mahbubnagar', 'nalgonda', 'suryapet',
            'siddipet', 'sangareddy', 'medak', 'adilabad', 'nirmal',
            'mancherial', 'asifabad', 'mahabubabad', 'jangaon', 'bhupalpally',
            'wanaparthy', 'nagarkurnool', 'gadwal', 'vikarabad', 'narayanpet',
            'mulugu', 'yadadri', 'bhuvanagiri', 'jagtial', 'peddapalli'
        ];
        let locationKeywords = karimnagarScope ? karimnagarAcKeywords : allLocationKeywords;

        // RBAC row-level scope: a scoped MLA/MP user only sees their own seat
        // on the map. We collapse the keyword list to their assigned
        // constituency name(s); the downstream aggregator already keys results
        // by keyword, so this naturally restricts the response.
        if (req.scope && !req.scope.canSeeAll) {
            const allowed = (req.scope.constituencies || []).map((c) => String(c).toLowerCase());
            if (allowed.length === 0) {
                return res.status(200).json({ locations: {} });
            }
            locationKeywords = allowed;
        }

        // Use only detected/tagged location fields (no text/keyword fallback).
        const results = {};

        const baseMatch = karimnagarScope
            ? {
                is_active: true,
                post_date: { $gte: since },
                $or: [
                    { 'detected_location.city': /karimnagar|choppadandi|vemulawada|sircilla|manakondur|husnabad|huzurabad/i },
                    { 'detected_location.district': /karimnagar|rajanna sircilla|siddipet|jagtial|peddapalli/i },
                    { 'detected_location.constituency': /karimnagar|choppadandi|vemulawada|sircilla|manakondur|husnabad|huzurabad/i }
                ]
            }
            : {
                is_active: true,
                post_date: { $gte: since }
            };

        // Strict Karimnagar-only tagged aggregation (no keyword scanning).
        if (karimnagarScope) {
            const rows = await Grievance.aggregate([
                { $match: baseMatch },
                {
                    $addFields: {
                        _constituency: {
                            $let: {
                                vars: {
                                    const: { $toLower: { $trim: { input: { $ifNull: ['$detected_location.constituency', ''] } } } },
                                    city: { $toLower: { $trim: { input: { $ifNull: ['$detected_location.city', ''] } } } },
                                    dist: { $toLower: { $trim: { input: { $ifNull: ['$detected_location.district', ''] } } } }
                                },
                                in: {
                                    $cond: [
                                        { $gt: [{ $strLenCP: '$$const' }, 0] },
                                        '$$const',
                                        {
                                            $cond: [
                                                { $gt: [{ $strLenCP: '$$city' }, 0] },
                                                '$$city',
                                                '$$dist'
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: '$_constituency',
                        count: { $sum: 1 },
                        positive: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'positive'] }, 1, 0] } },
                        negative: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'negative'] }, 1, 0] } },
                        neutral: { $sum: { $cond: [{ $in: ['$analysis.sentiment', ['neutral', 'moderate']] }, 1, 0] } },
                        categories: {
                            $push: {
                                $cond: [
                                    { $eq: ['$analysis.sentiment', 'negative'] },
                                    {
                                        $let: {
                                            vars: {
                                                gt: { $trim: { input: { $ifNull: ['$analysis.grievance_type', ''] } } },
                                                cat: { $trim: { input: { $ifNull: ['$analysis.category', ''] } } }
                                            },
                                            in: {
                                                $cond: [
                                                    { $gt: [{ $strLenCP: '$$gt' }, 0] },
                                                    '$$gt',
                                                    {
                                                        $cond: [
                                                            { $gt: [{ $strLenCP: '$$cat' }, 0] },
                                                            '$$cat',
                                                            'Normal'
                                                        ]
                                                    }
                                                ]
                                            }
                                        }
                                    },
                                    null
                                ]
                            }
                        }
                    }
                }
            ]);

            const results = {};
            const karimnagarTotal = { count: 0, positive: 0, negative: 0, neutral: 0, categories: [] };

            for (const row of rows) {
                const catMap = {};
                (row.categories || []).forEach((c) => { if (c) catMap[c] = (catMap[c] || 0) + 1; });
                const rowCategories = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

                karimnagarTotal.count += row.count || 0;
                karimnagarTotal.positive += row.positive || 0;
                karimnagarTotal.negative += row.negative || 0;
                karimnagarTotal.neutral += row.neutral || 0;
                karimnagarTotal.categories = karimnagarTotal.categories.concat(rowCategories);

                const canonical = acAliasMap[row._id] || null;
                if (!canonical) continue;
                if (!results[canonical]) {
                    results[canonical] = { count: 0, total: 0, positive: 0, negative: 0, neutral: 0, categories: [] };
                }
                results[canonical].total += row.count || 0;
                results[canonical].count += row.count || 0;
                results[canonical].positive += row.positive || 0;
                results[canonical].negative += row.negative || 0;
                results[canonical].neutral += row.neutral || 0;
                results[canonical].categories = results[canonical].categories.concat(rowCategories);
            }

            Object.values(results).forEach((entry) => {
                const catMap = {};
                (entry.categories || []).forEach(([cat, cnt]) => { catMap[cat] = (catMap[cat] || 0) + cnt; });
                entry.categories = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
            });

            const totalCatMap = {};
            (karimnagarTotal.categories || []).forEach(([cat, cnt]) => { totalCatMap[cat] = (totalCatMap[cat] || 0) + cnt; });
            const karimnagarAggregate = {
                count: karimnagarTotal.count,
                total: karimnagarTotal.count,
                positive: karimnagarTotal.positive,
                negative: karimnagarTotal.negative,
                neutral: karimnagarTotal.neutral,
                categories: Object.entries(totalCatMap).sort((a, b) => b[1] - a[1])
            };
            results.karimnagar = karimnagarAggregate;

            return res.status(200).json({ locations: results });
        }

        await Promise.all(locationKeywords.map(async (keyword) => {
            const escapedKw = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const boundaryPattern = `(^|[^a-z0-9])${escapedKw}([^a-z0-9]|$)`;

            const agg = await Grievance.aggregate([
                {
                    $match: {
                        ...baseMatch
                    }
                },
                {
                    $addFields: {
                        _mapDetectedMatch: {
                            $or: [
                                { $regexMatch: { input: { $ifNull: ['$detected_location.city', ''] }, regex: boundaryPattern, options: 'i' } },
                                { $regexMatch: { input: { $ifNull: ['$detected_location.district', ''] }, regex: boundaryPattern, options: 'i' } },
                                { $regexMatch: { input: { $ifNull: ['$detected_location.constituency', ''] }, regex: boundaryPattern, options: 'i' } }
                            ]
                        },
                        _mapHasDetectedLocation: {
                            $or: [
                                { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$detected_location.city', ''] } } } }, 0] },
                                { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$detected_location.district', ''] } } } }, 0] },
                                { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$detected_location.constituency', ''] } } } }, 0] }
                            ]
                        }
                    }
                },
                {
                    $match: {
                        $expr: {
                            $and: ['$_mapHasDetectedLocation', '$_mapDetectedMatch']
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 },
                        positive: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'positive'] }, 1, 0] } },
                        negative: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'negative'] }, 1, 0] } },
                        neutral: { $sum: { $cond: [{ $in: ['$analysis.sentiment', ['neutral', 'moderate']] }, 1, 0] } },
                        categories: {
                            $push: {
                                $cond: [
                                    { $eq: ['$analysis.sentiment', 'negative'] },
                                    {
                                        $let: {
                                            vars: {
                                                gt: { $trim: { input: { $ifNull: ['$analysis.grievance_type', ''] } } },
                                                cat: { $trim: { input: { $ifNull: ['$analysis.category', ''] } } }
                                            },
                                            in: {
                                                $cond: [
                                                    { $gt: [{ $strLenCP: '$$gt' }, 0] },
                                                    '$$gt',
                                                    {
                                                        $cond: [
                                                            { $gt: [{ $strLenCP: '$$cat' }, 0] },
                                                            '$$cat',
                                                            'Normal'
                                                        ]
                                                    }
                                                ]
                                            }
                                        }
                                    },
                                    null
                                ]
                            }
                        }
                    }
                }
            ]);

            if (agg.length > 0 && agg[0].negative > 0) {
                const row = agg[0];
                const catMap = {};
                (row.categories || []).forEach(c => { if (c) catMap[c] = (catMap[c] || 0) + 1; });
                const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

                results[keyword] = {
                    count: row.negative,
                    total: row.count,
                    positive: row.positive,
                    negative: row.negative,
                    neutral: row.neutral,
                    categories: topCats
                };
            }
        }));

        res.status(200).json({ locations: results });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// State location database — imported from dedicated module
const { isStateLocation } = require('../config/stateLocations');

/**
 * Get unique detected locations with grievance counts.
 * Used by the frontend location filter dropdown.
 * Returns ONLY state-related cities, districts and constituencies.
 */
const getLocationStats = async (req, res) => {
    try {
        const cacheKey = 'grievances:location-stats:v1';
        const cached = await cacheService.get(cacheKey);
        if (cached) {
            res.set('Cache-Control', 'private, max-age=30');
            return res.status(200).json(cached);
        }

        const baseMatch = { is_active: true };

        const [cityAgg, districtAgg, constituencyAgg] = await Promise.all([
            Grievance.aggregate([
                {
                    $match: {
                        ...baseMatch,
                        'detected_location.city': { $exists: true, $ne: null, $ne: '' }
                    }
                },
                {
                    $group: {
                        _id: { $toLower: '$detected_location.city' },
                        city: { $first: '$detected_location.city' },
                        count: { $sum: 1 },
                        district: { $first: '$detected_location.district' },
                        constituency: { $first: '$detected_location.constituency' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 500 }
            ]),
            Grievance.aggregate([
                {
                    $match: {
                        ...baseMatch,
                        'detected_location.district': { $exists: true, $ne: null, $ne: '' }
                    }
                },
                {
                    $group: {
                        _id: { $toLower: '$detected_location.district' },
                        district: { $first: '$detected_location.district' },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 200 }
            ]),
            Grievance.aggregate([
                {
                    $match: {
                        ...baseMatch,
                        'detected_location.constituency': { $exists: true, $ne: null, $ne: '' }
                    }
                },
                {
                    $group: {
                        _id: { $toLower: '$detected_location.constituency' },
                        constituency: { $first: '$detected_location.constituency' },
                        count: { $sum: 1 },
                        district: { $first: '$detected_location.district' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 200 }
            ])
        ]);

        // Filter to state-only locations
        const apCities = cityAgg.filter(c => isStateLocation(c.city) || isStateLocation(c.district));
        const apDistricts = districtAgg.filter(d => isStateLocation(d.district));
        const apConstituencies = constituencyAgg.filter(c => isStateLocation(c.constituency) || isStateLocation(c.district));

        const payload = {
            cities: apCities.map(c => ({ city: c.city, count: c.count, district: c.district, constituency: c.constituency })),
            districts: apDistricts.map(d => ({ district: d.district, count: d.count })),
            constituencies: apConstituencies.map(c => ({ constituency: c.constituency, count: c.count, district: c.district }))
        };
        await cacheService.set(cacheKey, payload, 120);
        res.set('Cache-Control', 'private, max-age=30');
        res.status(200).json(payload);
    } catch (error) {
        console.error('[getLocationStats] Error:', error.message);
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Get location-scoped grievance summary using same list-query semantics
 * @route   GET /api/grievances/location-summary
 * @access  Private
 */
const getLocationSummary = async (req, res) => {
    try {
        const locationValue = String(req.query.location_city || req.query.location || 'karimnagar').trim();
        const params = {
            ...req.query,
            location_city: locationValue
        };
        const query = buildListQuery(params, { includeTab: true });

        const [total, sentimentRows, categoryRows] = await Promise.all([
            Grievance.countDocuments(query),
            Grievance.aggregate([
                { $match: query },
                { $group: { _id: '$analysis.sentiment', count: { $sum: 1 } } }
            ]),
            Grievance.aggregate([
                {
                    $match: {
                        ...query,
                        'analysis.sentiment': 'negative'
                    }
                },
                {
                    $project: {
                        topic: {
                            $let: {
                                vars: {
                                    gt: { $trim: { input: { $ifNull: ['$analysis.grievance_type', ''] } } },
                                    cat: { $trim: { input: { $ifNull: ['$analysis.category', ''] } } }
                                },
                                in: {
                                    $cond: [
                                        { $gt: [{ $strLenCP: '$$gt' }, 0] },
                                        '$$gt',
                                        {
                                            $cond: [
                                                { $gt: [{ $strLenCP: '$$cat' }, 0] },
                                                '$$cat',
                                                'Normal'
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    }
                },
                { $group: { _id: '$topic', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ])
        ]);

        const sentiment = { positive: 0, negative: 0, neutral: 0 };
        sentimentRows.forEach((r) => {
            if (Object.prototype.hasOwnProperty.call(sentiment, r._id)) {
                sentiment[r._id] = r.count;
            }
        });

        res.status(200).json({
            location: locationValue.toUpperCase(),
            total,
            positive: sentiment.positive,
            negative: sentiment.negative,
            neutral: sentiment.neutral,
            categories: categoryRows.map((r) => [r._id, r.count])
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Translate grievance content
 * @route   POST /api/grievances/translate
 * @access  Private
 */
const translateGrievanceContent = async (req, res) => {
    try {
        const { text, target = 'en' } = req.body;

        if (!text) {
            return res.status(400).json({ message: 'Text to translate is required' });
        }

        const translatedText = await translationService.translate(text, target);

        res.status(200).json({
            translatedText,
            originalText: text
        });
    } catch (error) {
        console.error('[GrievanceController] Translation Error:', error.message);
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Delete grievance (soft delete)
 * @route   DELETE /api/grievances/:id
 * @access  Private
 */
const deleteGrievance = async (req, res) => {
    try {
        const { id } = req.params;

        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        grievance.is_active = false;
        await grievance.save();

        await logAudit(req, 'DELETE', 'GRIEVANCE', id, 'Deleted grievance');
        await invalidateGrievanceCaches();

        res.status(200).json({ message: 'Grievance deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Manually override risk level and/or sentiment of a grievance's analysis.
 *          Risk score is auto-derived from the chosen level using the same
 *          bands the LLM prompt uses (low: 20, medium: 50, high: 75, critical: 92).
 *          Sentiment overrides are respected verbatim — no auto-negative when the
 *          caller explicitly provides a sentiment.
 * @route   PUT /api/grievances/:id/risk-level
 * @access  Private
 */
const RISK_LEVEL_SCORE_MAP = {
    low: 20,
    medium: 50,
    high: 75,
    critical: 92
};
// 'neutral' accepted as legacy alias; 'moderate' is the canonical label.
const ALLOWED_GRIEVANCE_SENTIMENTS = ['positive', 'negative', 'moderate', 'neutral'];

const updateGrievanceRiskLevel = async (req, res) => {
    try {
        const { id } = req.params;
        const hasLevel = req.body?.risk_level !== undefined && req.body?.risk_level !== null && String(req.body.risk_level).trim() !== '';
        const hasSentiment = req.body?.sentiment !== undefined && req.body?.sentiment !== null && String(req.body.sentiment).trim() !== '';
        const rawLevel = hasLevel ? String(req.body.risk_level).trim().toLowerCase() : null;
        const rawSentiment = hasSentiment ? String(req.body.sentiment).trim().toLowerCase() : null;

        if (!hasLevel && !hasSentiment) {
            return res.status(400).json({ message: 'Provide risk_level and/or sentiment to update.' });
        }
        if (rawLevel && !RISK_LEVEL_SCORE_MAP.hasOwnProperty(rawLevel)) {
            return res.status(400).json({
                message: `Invalid risk_level. Must be one of: ${Object.keys(RISK_LEVEL_SCORE_MAP).join(', ')}`
            });
        }
        if (rawSentiment && !ALLOWED_GRIEVANCE_SENTIMENTS.includes(rawSentiment)) {
            return res.status(400).json({
                message: `Invalid sentiment. Must be one of: ${ALLOWED_GRIEVANCE_SENTIMENTS.join(', ')}`
            });
        }

        const grievance = await Grievance.findOne({ id });
        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        const previousLevel = grievance.analysis?.risk_level || null;
        const previousScore = grievance.analysis?.risk_score ?? null;
        const previousSentiment = grievance.analysis?.sentiment || null;

        const updateDoc = {
            'analysis.analyzed_at': grievance.analysis?.analyzed_at || new Date()
        };

        if (rawLevel) {
            const newScore = RISK_LEVEL_SCORE_MAP[rawLevel];
            updateDoc['analysis.risk_level'] = rawLevel;
            updateDoc['analysis.risk_score'] = newScore;
            if (grievance.analysis?.llm_analysis) {
                updateDoc['analysis.llm_analysis.score'] = newScore;
            }
        }

        if (rawSentiment) {
            // Normalize legacy 'neutral' input to canonical 'moderate' before saving.
            const sentimentToSave = rawSentiment === 'neutral' ? 'moderate' : rawSentiment;
            updateDoc['analysis.sentiment'] = sentimentToSave;
            if (grievance.analysis?.llm_analysis) {
                updateDoc['analysis.llm_analysis.sentiment'] = sentimentToSave;
            }
        }

        const updated = await Grievance.findOneAndUpdate(
            { id },
            { $set: updateDoc },
            { new: true }
        );

        await invalidateGrievanceCaches();

        await logAudit(
            req,
            'update_analysis',
            'grievance',
            id,
            {
                from: { risk_level: previousLevel, risk_score: previousScore, sentiment: previousSentiment },
                to: {
                    risk_level: rawLevel || previousLevel,
                    risk_score: rawLevel ? RISK_LEVEL_SCORE_MAP[rawLevel] : previousScore,
                    sentiment: rawSentiment || previousSentiment
                }
            }
        );

        return res.status(200).json({
            message: 'Analysis updated',
            analysis: updated.analysis
        });
    } catch (error) {
        console.error('[updateGrievanceRiskLevel]', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Import a single tweet by URL or numeric id and run the full
//          BSK analysis pipeline (RapidAPI ChatGPT-42 sentiment, topic classification).
// @route   POST /api/grievances/import-tweet
// @access  Private
const importTweetByUrl = async (req, res) => {
    try {
        const { url_or_id } = req.body || {};
        if (!url_or_id || !String(url_or_id).trim()) {
            return res.status(400).json({ message: 'url_or_id is required' });
        }
        const raw = String(url_or_id).trim();

        // Accept full X / Twitter URLs OR plain numeric ids.
        const idMatch = raw.match(/status\/(\d{6,25})/) || raw.match(/^(\d{6,25})$/);
        if (!idMatch) {
            return res.status(400).json({ message: 'Could not parse a tweet id from the input.' });
        }
        const tweetId = idMatch[1];

        const rapidApiX = require('../services/rapidApiXService');
        const tweet = await rapidApiX.fetchTweetDetail(tweetId);
        if (!tweet || !tweet.id) {
            return res.status(404).json({ message: 'Tweet not found or RapidAPI returned no detail.' });
        }

        const canonicalId = `x:manual:${tweet.id}`;
        const Grievance = require('../models/Grievance');
        const existing = await Grievance.findOne({ tweet_id: canonicalId }).select({ _id: 1 });
        if (existing) {
            return res.status(200).json({ imported: false, message: 'Tweet already in feed.', tweet_id: canonicalId });
        }

        const post = {
            tweet_id: canonicalId,
            text: tweet.text || '',
            url: tweet.url || `https://x.com/${tweet.author_handle || 'i'}/status/${tweet.id}`,
            created_at: tweet.created_at,
            author: {
                handle: tweet.author_handle || 'x_user',
                display_name: tweet.author || tweet.author_handle || 'X User',
                profile_image_url: tweet.author_avatar || '',
                is_verified: !!tweet.verified,
                follower_count: 0,
            },
            media: tweet.media || [],
            engagement: {
                likes:    parseInt(tweet.metrics?.like)    || 0,
                retweets: parseInt(tweet.metrics?.retweet) || 0,
                replies:  parseInt(tweet.metrics?.reply)   || 0,
                views:    parseInt(tweet.metrics?.views)   || 0,
                quotes:   parseInt(tweet.metrics?.quote)   || 0,
            },
        };

        const { createGrievanceFromPost } = require('../services/grievanceService');
        const created = await createGrievanceFromPost(post, 'x', 'manual_import');
        if (!created) {
            return res.status(500).json({ message: 'Failed to create grievance.' });
        }
        return res.status(201).json({ imported: true, tweet_id: canonicalId, grievance_id: created.id || created._id });
    } catch (err) {
        console.error('[importTweetByUrl] error:', err);
        return res.status(500).json({ message: err.message || 'Import failed' });
    }
};

/**
 * Trigger the Alerts → Mentions LLM-gated (RapidAPI ChatGPT-42) promotion
 * pipeline. Reads the next N unprocessed alerts, runs each through the BSK
 * relevance gate, and promotes the relevant ones into the Mentions /
 * Grievance collection.
 *
 * Body (all optional):
 *   { limit?, since?, status?, platform?, dryRun?, fast? }
 */
const intakeFromAlerts = async (req, res) => {
    try {
        const { runBatch } = require('../services/alertsToMentionsService');
        const stats = await runBatch({
            limit:       Math.min(parseInt(req.body?.limit, 10) || 50, 500),
            since:       req.body?.since || null,
            status:      req.body?.status || null,
            platform:    req.body?.platform || null,
            dryRun:      !!req.body?.dryRun,
            allowLLM:    !req.body?.fast
        });
        return res.json({ ok: true, stats });
    } catch (err) {
        console.error('[intakeFromAlerts] failed:', err.message);
        return res.status(500).json({ ok: false, error: err.message || 'failed' });
    }
};

module.exports = {
    importTweetByUrl,
    intakeFromAlerts,
    getSources,
    addSource,
    updateSource,
    deleteSource,
    fetchSourceGrievances,
    fetchAllGrievances,
    fetchKeywordGrievances,
    getGrievances,
    getGrievance,
    translateGrievanceContent,
    deleteGrievance,
    acknowledgeGrievance,
    markAsComplaint,
    updateComplaintStatus,
    updateWorkflowStatus,
    convertToFir,
    escalateGrievance,
    ingestWhatsAppWebhook,
    generateReport,
    recordShare,
    getStats,
    getDashboardStats,
    getSettings,
    updateSettings,
    revertGrievance,
    analyzeGrievance,
    analyzeAllGrievances,
    updateGrievanceRiskLevel,
    getSentimentAnalytics,
    getSentimentLeaders,
    getDistinctTopics,
    getDistinctCategories,
    getCategoryAnalytics,
    getMapGrievances,
    getLocationStats,
    getLocationSummary
};
