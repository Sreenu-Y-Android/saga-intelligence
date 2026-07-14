const axios = require('axios');
const Alert = require('../models/Alert');
const Content = require('../models/Content');
const { createAuditLog } = require('../services/auditService');
const { fetchTweetDetail } = require('../services/rapidApiXService');
const YouTubeService = require('../services/youtube.service');
const { fetchInstagramPostDetail } = require('../services/rapidApiInstagramService');
const { analyzeContent } = require('../services/analysisService');
const { archiveContentMedia, archiveTwitterMedia } = require('../services/contentS3Service');
const cacheService = require('../services/cacheService');
const translationService = require('../services/translationService');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');
const { isSpecialUser } = require('../config/specialAccess');

const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeIdentifier = (platform, identifier) => {
  if (!identifier) return '';
  const id = String(identifier).trim();

  switch (String(platform).toLowerCase()) {
    case 'x':
    case 'twitter':
      return id.replace(/^@/, '').toLowerCase();
    case 'youtube':
    case 'instagram':
      return id.toLowerCase();
    default:
      return id;
  }
};

const mediaHasS3Gaps = (media = []) => {
  if (!Array.isArray(media) || media.length === 0) return false;
  return media.some((item) => {
    const hasSource = Boolean(item?.video_url || item?.url);
    return hasSource && !item?.s3_url;
  });
};

const archiveAlertMediaForContent = async (contentDetails = {}) => {
  const platform = String(contentDetails.platform || '').toLowerCase();
  const contentId = contentDetails.id;
  if (!contentId || !['x', 'instagram'].includes(platform)) return;

  const media = Array.isArray(contentDetails.media) ? contentDetails.media : [];
  const quotedMedia = Array.isArray(contentDetails?.quoted_content?.media) ? contentDetails.quoted_content.media : [];

  if (!mediaHasS3Gaps(media) && (platform !== 'x' || !mediaHasS3Gaps(quotedMedia))) {
    return;
  }

  try {
    const patch = {};

    if (platform === 'x') {
      if (mediaHasS3Gaps(media)) {
        patch.media = await archiveTwitterMedia(media, contentDetails.content_id || contentId, {
          postUrl: contentDetails.content_url
        });
      }
      if (mediaHasS3Gaps(quotedMedia)) {
        patch.quoted_content = {
          ...(contentDetails.quoted_content || {}),
          media: await archiveTwitterMedia(
            quotedMedia,
            `${contentDetails.content_id || contentId}_quoted_${contentDetails?.quoted_content?.author_handle || 'unknown'}`,
            { postUrl: contentDetails.content_url }
          )
        };
      }
      const effectiveMedia = patch.media || media;
      patch.is_media_archived = effectiveMedia.length > 0 && !mediaHasS3Gaps(effectiveMedia);
    } else if (platform === 'instagram' && mediaHasS3Gaps(media)) {
      patch.media = await archiveContentMedia(media, contentDetails.content_id || contentId, {
        useUniqueFileName: true,
        replaceOriginalUrls: false
      });
      patch.is_media_archived = patch.media.length > 0 && !mediaHasS3Gaps(patch.media);
    }

    if (Object.keys(patch).length > 0) {
      await Content.updateOne({ id: contentId }, { $set: patch });
    }
  } catch (error) {
    console.warn(`[Alerts] Media archive retry failed for ${platform}:${contentDetails.content_id || contentId} - ${error.message}`);
  }
};

const queueAlertMediaArchival = (alerts = []) => {
  const candidates = (Array.isArray(alerts) ? alerts : [])
    .map((a) => a?.content_details)
    .filter((content) => content && (content.platform === 'x' || content.platform === 'instagram'))
    .slice(0, 10);

  if (candidates.length === 0) return;

  Promise.allSettled(candidates.map((content) => archiveAlertMediaForContent(content)))
    .catch(() => {
      // Intentionally swallow background errors.
    });
};

const getCacheKey = (prefix, params) => {
  const ordered = Object.keys(params || {})
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  return `${prefix}:${JSON.stringify(ordered)}`;
};

const readCache = async (key) => cacheService.get(key);
const writeCache = async (key, value, ttl = 20) => cacheService.set(key, value, ttl);
const clearAlertCache = async () => {
  await cacheService.invalidatePrefix('alerts:list:v2');
  await cacheService.invalidatePrefix('alerts:stats:v2');
  await cacheService.invalidatePrefix('dashboard:v2');
  await cacheService.invalidatePrefix('alert_summary');
  await cacheService.invalidatePrefix('unread_count');
};

// @desc    Get alerts
// @route   GET /api/alerts
// @access  Private
const getAlerts = async (req, res) => {
  try {
    const {
      status,
      risk_level,
      search,
      platform,
      startDate,
      endDate,
      alert_type,
      keyword,
      category,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    // Status Filter
    if (status && status !== 'all') {
      query.status = status;
    } else if (!status) {
      query.status = 'active';
    }

    // Source ID Filter (for POI specific alerts)
    if (req.query.source_id) {
      // Handle lookup logic if needed, but usually content_id -> content -> source_id
      // However, standard alerts don't have direct source_id usually, they link to content.
      // But let's check if Alert model has source_id or we need to filter via content lookup.
      // Looking at updateAlert, it seems we can add source_id to alert, OR we rely on content.
      // The efficient way for existing alerts is looking up via content's source_id.
      // BUT, for new architecture, we might want to filter by the source of the content.
      // existing implementation of getAlerts does lookup.
    }

    // Simplest approach: We will handle source_id filtering AFTER lookup or during aggregation if possible.
    // For now, let's pass it to the aggregation match if we use aggregation.


    // Risk Level Filter
    if (risk_level && risk_level !== 'all') query.risk_level = risk_level;

    // Platform Filter
    if (platform && platform !== 'all') query.platform = platform;

    // Alert Type (Category) Filter
    if (alert_type && alert_type !== 'all') {
      if (alert_type === 'risk') {
        query.alert_type = { $in: ['keyword_risk', 'ai_risk', null] };
      } else {
        query.alert_type = alert_type;
      }
    }

    // Date Range Filter
    if (startDate || endDate) {
      query.created_at = {};
      if (startDate) query.created_at.$gte = new Date(startDate);
      if (endDate) query.created_at.$lte = new Date(endDate);
    }

    const includeStats = String(req.query.includeStats || '').toLowerCase() === 'true';
    const cursor = req.query.cursor;
    let pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    // Support page-encoded cursor for aggregation path (format: "p:N")
    if (cursor && cursor.startsWith('p:')) {
      const cursorPage = parseInt(cursor.substring(2), 10);
      if (!isNaN(cursorPage) && cursorPage > 0) pageNum = cursorPage;
    }

    const skip = (pageNum - 1) * limitNum;
    const hasSearch = search && search.trim();
    const hasKeyword = keyword && keyword !== 'all';
    const hasCategory = category && category !== 'all';

    // Pre-resolve category / keyword / source_id filters into content_id sets
    // to avoid expensive $lookup pipelines that blow the 32 MB sort memory limit.
    const Source = require('../models/Source');

    const cacheKey = getCacheKey('alerts:list:v2', {
      ...req.query,
      includeStats,
      cursor: cursor || ''
    });
    const cachedResponse = await readCache(cacheKey);
    if (cachedResponse) return res.status(200).json(cachedResponse);

    // ---------- Pre-resolve category → content IDs ----------
    if (hasCategory) {
      // 1. Find sources matching the category
      const catSources = await Source.find({ category }).select('id').lean();
      const catSourceIds = catSources.map(s => s.id);

      if (catSourceIds.length === 0) {
        // No sources for this category → return empty immediately
        const emptyPayload = {
          alerts: [],
          pagination: { total: 0, page: pageNum, totalPages: 0, hasMore: false, nextCursor: null }
        };
        if (includeStats) emptyPayload.stats = await buildAlertStats({ ...req.query, search: hasSearch ? search : '' });
        return res.status(200).json(emptyPayload);
      }

      // 2. Find content IDs belonging to those sources
      const catContents = await Content.find({ source_id: { $in: catSourceIds } }).select('id').lean();
      const catContentIds = catContents.map(c => c.id);

      // Also match alerts that have source_category directly
      // Combine: content_id in catContentIds OR source_category === category
      if (catContentIds.length > 0) {
        query.$or = [
          { content_id: { $in: catContentIds } },
          { source_category: category }
        ];
      } else {
        query.source_category = category;
      }
    }

    // ---------- Pre-resolve source_id filter ----------
    if (req.query.source_id) {
      const sid = req.query.source_id;
      const mongoose = require('mongoose');

      const possibleSourceIds = [sid];
      if (mongoose.Types.ObjectId.isValid(sid)) {
        const sourceRecord = await Source.findById(sid).select('id').lean();
        if (sourceRecord?.id) possibleSourceIds.push(sourceRecord.id);
      }

      const sidContents = await Content.find({ source_id: { $in: possibleSourceIds } }).select('id').lean();
      const sidContentIds = sidContents.map(c => c.id);

      if (sidContentIds.length > 0) {
        query.content_id = { ...(query.content_id || {}), $in: sidContentIds };
      } else {
        // No content for this source → empty
        const emptyPayload = {
          alerts: [],
          pagination: { total: 0, page: pageNum, totalPages: 0, hasMore: false, nextCursor: null }
        };
        if (includeStats) emptyPayload.stats = await buildAlertStats({ ...req.query, search: hasSearch ? search : '' });
        return res.status(200).json(emptyPayload);
      }
    }

    // ---------- Pre-resolve keyword filter ----------
    if (hasKeyword) {
      const kw = String(keyword).trim().toLowerCase();
      const kwContents = await Content.find({
        'risk_factors.keyword': { $regex: `^${escapeRegex(kw)}`, $options: 'i' }
      }).select('id').lean();
      const kwContentIds = kwContents.map(c => c.id);

      // Match alerts with keyword in normalized array OR content with keyword risk_factor
      const kwOr = [{ matched_keywords_normalized: kw }];
      if (kwContentIds.length > 0) kwOr.push({ content_id: { $in: kwContentIds } });

      if (query.$or) {
        // Combine with existing $or (from category) using $and
        query.$and = query.$and || [];
        query.$and.push({ $or: query.$or });
        query.$and.push({ $or: kwOr });
        delete query.$or;
      } else {
        query.$or = kwOr;
      }
    }

    const needsLookup = !!hasSearch; // Only search still needs $lookup (for content text)

    let alerts = [];
    let hasMore = false;
    let nextCursor = null;
    let total;

    if (needsLookup) {
      // Lightweight aggregation: only $lookup content for text search, no source lookup
      const pipeline = [{ $match: { ...query } }];

      pipeline.push(
        {
          $lookup: {
            from: 'contents',
            localField: 'content_id',
            foreignField: 'id',
            pipeline: [{ $project: { id: 1, text: 1, translated_text: 1, scraped_content: 1 } }],
            as: 'content_data'
          }
        },
        { $unwind: { path: '$content_data', preserveNullAndEmptyArrays: true } }
      );

      const terms = search.trim().split(/[\s,]+/).filter(Boolean);
      const searchRegex = terms.length > 0
        ? { $regex: terms.map(t => escapeRegex(t)).join('|'), $options: 'i' }
        : { $regex: escapeRegex(search), $options: 'i' };
      pipeline.push({
        $match: {
          $or: [
            { title: searchRegex },
            { description: searchRegex },
            { author: searchRegex },
            { 'content_data.text': searchRegex },
            { 'content_data.translated_text': searchRegex },
            { 'content_data.scraped_content': searchRegex }
          ]
        }
      });

      // Strip the heavy content_data before sort to save memory
      pipeline.push({ $project: { content_data: 0 } });

      // Count via a separate query-style: use two pipelines
      // Pipeline 1: count
      const countPipeline = [...pipeline, { $count: 'total' }];
      // Pipeline 2: paginated data
      const dataPipeline = [...pipeline, { $sort: { created_at: -1, id: -1 } }, { $skip: skip }, { $limit: limitNum }];

      const [countResult, dataResult] = await Promise.all([
        Alert.aggregate(countPipeline).allowDiskUse(true),
        Alert.aggregate(dataPipeline).allowDiskUse(true)
      ]);

      alerts = dataResult || [];
      total = countResult?.[0]?.total || 0;
      hasMore = pageNum * limitNum < total;
      if (hasMore) {
        nextCursor = `p:${pageNum + 1}`;
      }
    } else {
      if (cursor && !cursor.startsWith('p:')) {
        const [cursorDateRaw, cursorId] = String(cursor).split('|');
        const cursorDate = new Date(cursorDateRaw);
        if (!isNaN(cursorDate.getTime()) && cursorId) {
          const cursorCondition = {
            $or: [
              { created_at: { $lt: cursorDate } },
              { created_at: cursorDate, id: { $lt: cursorId } }
            ]
          };
          // Merge without overwriting existing $or/$and from pre-resolved filters
          query.$and = query.$and || [];
          if (query.$or) {
            query.$and.push({ $or: query.$or });
            delete query.$or;
          }
          query.$and.push(cursorCondition);
          if (query.$and.length === 0) delete query.$and;
        }
      }

      const useDateCursor = cursor && !cursor.startsWith('p:');

      const rows = await Alert.find(query)
        .sort({ created_at: -1, id: -1 })
        .skip(useDateCursor ? 0 : skip)
        .limit(limitNum + 1)
        .lean();

      hasMore = rows.length > limitNum;
      alerts = hasMore ? rows.slice(0, limitNum) : rows;
      if (hasMore && alerts.length > 0) {
        const last = alerts[alerts.length - 1];
        nextCursor = `${new Date(last.created_at).toISOString()}|${last.id}`;
      }
      if (!cursor) total = await Alert.countDocuments(query);
    }

    // Join content + source for only visible rows
    const contentIds = Array.from(new Set(alerts.map((a) => a.content_id || a.content_ref_id).filter(Boolean)));
    const contents = await Content.find({ id: { $in: contentIds } })
      .select('id platform content_type content_url text author_handle published_at engagement media is_deleted deleted_at is_expired expired_at availability_status is_repost original_author original_author_name original_author_avatar quoted_content url_cards thumbnails risk_factors risk_level source_id translated_text scraped_content')
      .lean();
    const contentMap = new Map(contents.map((c) => [c.id, c]));

    const sourceIds = Array.from(new Set(contents.map((c) => c.source_id).filter(Boolean)));
    const sources = await Source.find({ id: { $in: sourceIds } })
      .select('id profile_image_url is_verified display_name identifier category')
      .lean();
    const sourceMap = new Map(sources.map((s) => [s.id, s]));

    // Fetch analysis for all content IDs
    const Analysis = require('../models/Analysis');
    const analyses = await Analysis.find({ content_id: { $in: contentIds } }).lean();
    const analysisMap = new Map();
    // Use a map of content_id -> last analysis (most recent)
    analyses.forEach(a => {
      const current = analysisMap.get(a.content_id);
      const hasForensics = a.forensic_results && Array.isArray(a.forensic_results) && a.forensic_results.length > 0;

      if (!current) {
        analysisMap.set(a.content_id, a);
      } else {
        const currentHasForensics = current.forensic_results && Array.isArray(current.forensic_results) && current.forensic_results.length > 0;

        // Prefer one with forensics, or if both/neither, take the more recent one
        if (hasForensics && !currentHasForensics) {
          analysisMap.set(a.content_id, a);
        } else if (hasForensics === currentHasForensics) {
          if (new Date(a.analyzed_at) > new Date(current.analyzed_at)) {
            analysisMap.set(a.content_id, a);
          }
        }
      }
    });

    const hydrated = alerts.map((alert) => {
      const content = contentMap.get(alert.content_id || alert.content_ref_id);
      if (content && analysisMap.has(content.id)) {
        content.analysis = analysisMap.get(content.id);
      }
      const source = content ? sourceMap.get(content.source_id) : null;
      return {
        ...alert,
        content_details: content || null,
        source_meta: source
          ? {
            profile_image_url: source.profile_image_url,
            is_verified: source.is_verified,
            name: source.display_name,
            handle: source.identifier
          }
          : null
      };
    });

    queueAlertMediaArchival(hydrated);

    const responsePayload = {
      alerts: hydrated,
      pagination: {
        total,
        page: pageNum,
        totalPages: typeof total === 'number' ? Math.ceil(total / limitNum) : undefined,
        hasMore,
        nextCursor
      }
    };

    if (includeStats) {
      responsePayload.stats = await buildAlertStats({
        ...req.query,
        search: hasSearch ? search : ''
      });
    }

    await writeCache(cacheKey, responsePayload, 20);
    res.status(200).json(responsePayload);

  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update alert
// @route   PUT /api/alerts/:id
// @access  Private
const updateAlert = async (req, res) => {
  try {
    const { status, notes, source_id } = req.body;
    const alert = await Alert.findOne({ id: req.params.id });

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    const updateDoc = {
      status,
      acknowledged_by: req.user.id,
      acknowledged_at: new Date()
    };

    if (notes) updateDoc.notes = notes;
    if (source_id !== undefined) updateDoc.source_id = source_id; // Allow linking to source

    const updatedAlert = await Alert.findOneAndUpdate(
      { id: req.params.id },
      updateDoc,
      { new: true }
    );

    await clearAlertCache();
    // --- ML FEEDBACK LOOP ---
    // If status changed to false positive, record it for model retraining
    if (status && status !== alert.status && (status === 'false_positive' || status === 'escalated')) {
      try {
        const feedbackService = require('../services/feedbackService');
        const Content = require('../models/Content');

        // Fetch full content text
        const content = await Content.findOne({
          $or: [{ id: alert.content_id }, { content_id: alert.content_id }]
        });

        if (content && content.text) {
          // Pass the alert's actual risk level so feedbackService can
          // determine the correct training label
          await feedbackService.recordFeedback({
            text: content.text,
            category: alert.category_id || alert.category || 'Normal',
            legal_sections: alert.legal_sections,
            review_status: status,
            current_risk: alert.risk_level || 'low'
          });
        }
      } catch (fbError) {
        console.error('[AlertController] Feedback recording failed:', fbError);
        // Don't block the response
      }
    }

    await createAuditLog(req.user, 'update', 'alert', req.params.id, { status, source_id });

    res.status(200).json(updatedAlert);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Maps the 3-way sentiment editor to the field that actually drives the
// positive/moderate/negative badge shown on alert cards (risk_level).
const SENTIMENT_TO_RISK_LEVEL = {
  positive: 'low',
  neutral: 'medium',
  negative: 'high'
};

/**
 * @desc    Directly edit an alert's intention/sentiment classification
 *          (positive/moderate/negative) by setting its risk_level
 * @route   PUT /api/alerts/:id/sentiment
 * @access  Private (restricted to special account)
 */
const updateAlertSentiment = async (req, res) => {
  if (!isSpecialUser(req.user)) {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const { sentiment } = req.body;
    const riskLevel = SENTIMENT_TO_RISK_LEVEL[sentiment];

    if (!riskLevel) {
      return res.status(400).json({ message: 'Invalid sentiment value' });
    }

    const alert = await Alert.findOneAndUpdate(
      { id: req.params.id },
      { risk_level: riskLevel },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    await clearAlertCache();
    await createAuditLog(req.user, 'edit_sentiment', 'alert', req.params.id, { sentiment, risk_level: riskLevel });

    res.status(200).json({ id: alert.id, risk_level: alert.risk_level });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Permanently delete an alert
 * @route   DELETE /api/alerts/:id
 * @access  Private (restricted to special account)
 */
const deleteAlert = async (req, res) => {
  if (!isSpecialUser(req.user)) {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const deleted = await Alert.findOneAndDelete({ id: req.params.id });

    if (!deleted) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    await clearAlertCache();
    await createAuditLog(req.user, 'delete', 'alert', req.params.id, { deleted: true });

    res.status(200).json({ id: req.params.id, deleted: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get alert stats
// @route   GET /api/alerts/stats
// @access  Private
const buildAlertStats = async (params = {}) => {
  const { risk_level, search, platform, startDate, endDate, alert_type, keyword, category } = params;
  const query = {};

  if (risk_level && risk_level !== 'all') query.risk_level = risk_level;
  if (platform && platform !== 'all') query.platform = platform;
  if (alert_type && alert_type !== 'all') {
    if (alert_type === 'risk') query.alert_type = { $in: ['keyword_risk', 'ai_risk', null] };
    else query.alert_type = alert_type;
  }
  if (startDate || endDate) {
    query.created_at = {};
    if (startDate) query.created_at.$gte = new Date(startDate);
    if (endDate) query.created_at.$lte = new Date(endDate);
  }
  const hasKeyword = keyword && keyword !== 'all';
  const hasCategory = category && category !== 'all';
  const hasSearch = search && search.trim();

  const Source = require('../models/Source');

  // Pre-resolve category → content IDs (avoids $lookup in pipeline)
  if (hasCategory) {
    const catSources = await Source.find({ category }).select('id').lean();
    const catSourceIds = catSources.map(s => s.id);
    if (catSourceIds.length === 0) {
      return { active: 0, acknowledged: 0, escalated: 0, resolved: 0, false_positive: 0, escalated_pending_report: 0 };
    }
    const catContents = await Content.find({ source_id: { $in: catSourceIds } }).select('id').lean();
    const catContentIds = catContents.map(c => c.id);
    if (catContentIds.length > 0) {
      query.$or = [{ content_id: { $in: catContentIds } }, { source_category: category }];
    } else {
      query.source_category = category;
    }
  }

  // Pre-resolve keyword → content IDs
  if (hasKeyword) {
    const kw = String(keyword).trim().toLowerCase();
    const kwContents = await Content.find({
      'risk_factors.keyword': { $regex: `^${escapeRegex(kw)}`, $options: 'i' }
    }).select('id').lean();
    const kwContentIds = kwContents.map(c => c.id);
    const kwOr = [{ matched_keywords_normalized: kw }];
    if (kwContentIds.length > 0) kwOr.push({ content_id: { $in: kwContentIds } });
    if (query.$or) {
      query.$and = query.$and || [];
      query.$and.push({ $or: query.$or });
      query.$and.push({ $or: kwOr });
      delete query.$or;
    } else {
      query.$or = kwOr;
    }
  }

  const needsLookup = !!hasSearch;

  const basePipeline = [{ $match: { ...query } }];

  if (needsLookup) {
    basePipeline.push(
      {
        $lookup: {
          from: 'contents',
          localField: 'content_id',
          foreignField: 'id',
          pipeline: [{ $project: { id: 1, text: 1, translated_text: 1, scraped_content: 1 } }],
          as: 'content_data'
        }
      },
      { $unwind: { path: '$content_data', preserveNullAndEmptyArrays: true } }
    );

    const terms = search.trim().split(/[\s,]+/).filter(Boolean);
    const searchRegex = terms.length > 0
      ? { $regex: terms.map(t => escapeRegex(t)).join('|'), $options: 'i' }
      : { $regex: escapeRegex(search), $options: 'i' };
    basePipeline.push({
      $match: {
        $or: [
          { title: searchRegex },
          { description: searchRegex },
          { author: searchRegex },
          { 'content_data.text': searchRegex },
          { 'content_data.translated_text': searchRegex },
          { 'content_data.scraped_content': searchRegex }
        ]
      }
    });

    // Drop heavy joined data before grouping
    basePipeline.push({ $project: { content_data: 0 } });
  }

  const [statusResult, pendingResult] = await Promise.all([
    Alert.aggregate([
      ...basePipeline,
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    Alert.aggregate([
      ...basePipeline,
      { $match: { status: 'escalated' } },
      {
        $lookup: {
          from: 'reports',
          let: { alertId: '$id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$alert_id', '$$alertId'] } } },
            { $limit: 1 }
          ],
          as: 'report_exists'
        }
      },
      { $match: { report_exists: { $size: 0 } } },
      { $count: 'count' }
    ])
  ]);

  const stats = { active: 0, acknowledged: 0, escalated: 0, resolved: 0, false_positive: 0, escalated_pending_report: 0 };
  statusResult.forEach((item) => {
    if (item._id && Object.prototype.hasOwnProperty.call(stats, item._id)) stats[item._id] = item.count;
  });
  stats.escalated_pending_report = pendingResult?.[0]?.count || 0;
  return stats;
};

const getAlertStats = async (req, res) => {
  try {
    const statsCacheKey = getCacheKey('alerts:stats:v2', req.query || {});
    const cachedStats = await readCache(statsCacheKey);
    if (cachedStats) return res.status(200).json(cachedStats);

    const stats = await buildAlertStats(req.query || {});
    await writeCache(statsCacheKey, stats, 20);
    res.status(200).json(stats);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get unread alerts count
// @route   GET /api/alerts/unread
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const unreadCacheKey = 'unread_count:v2';
    const cachedUnread = await readCache(unreadCacheKey);
    if (cachedUnread) return res.status(200).json(cachedUnread);

    const [count, latestAlert] = await Promise.all([
      Alert.countDocuments({ is_read: false }),
      Alert.findOne({ is_read: false })
        .sort({ created_at: -1 })
        .select('title risk_level description id')
        .lean()
    ]);

    const payload = { count, latest_alert: latestAlert };
    await writeCache(unreadCacheKey, payload, 20);
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark all alerts as read
// @route   PUT /api/alerts/read
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    await Alert.updateMany(
      { is_read: false },
      { $set: { is_read: true } }
    );
    await clearAlertCache();
    res.status(200).json({ message: 'All alerts marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single alert by ID
// @route   GET /api/alerts/:id
// @access  Private
const getAlertById = async (req, res) => {
  try {
    const alert = await Alert.findOne({ id: req.params.id });

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    // Manual lookup for content details if needed by frontend
    // Alternatively, use an aggregate pipeline like in getAlerts
    const result = await Alert.aggregate([
      { $match: { id: req.params.id } },
      {
        $lookup: {
          from: 'contents',
          localField: 'content_id',
          foreignField: 'id',
          as: 'content_data'
        }
      },
      {
        $unwind: {
          path: '$content_data',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'sources',
          localField: 'content_data.source_id',
          foreignField: 'id',
          as: 'source_data'
        }
      },
      {
        $unwind: {
          path: '$source_data',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'analyses',
          let: {
            alertAnalysisId: '$analysis_id',
            contentId: '$content_id'
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$id', '$$alertAnalysisId'] },
                    { $eq: ['$content_id', '$$contentId'] }
                  ]
                }
              }
            },
            // Sort to prefer records WITH forensic_results, and then by latest timestamp
            {
              $addFields: {
                hasForensics: {
                  $cond: { if: { $gt: [{ $size: { $ifNull: ['$forensic_results', []] } }, 0] }, then: 1, else: 0 }
                }
              }
            },
            { $sort: { hasForensics: -1, analyzed_at: -1, created_at: -1 } },
            { $limit: 1 }
          ],
          as: 'analysis_data'
        }
      },
      {
        $addFields: {
          content_details: {
            id: '$content_data.id',
            platform: '$content_data.platform',
            content_type: '$content_data.content_type',
            content_url: '$content_data.content_url',
            text: '$content_data.text',
            author_handle: '$content_data.author_handle',
            published_at: '$content_data.published_at',
            media: '$content_data.media',
            is_deleted: '$content_data.is_deleted',
            deleted_at: '$content_data.deleted_at',
            is_expired: '$content_data.is_expired',
            expired_at: '$content_data.expired_at',
            availability_status: '$content_data.availability_status',
            risk_level: '$content_data.risk_level',
            analysis: { $arrayElemAt: ['$analysis_data', 0] }
          },
          source_meta: {
            profile_image_url: '$source_data.profile_image_url',
            is_verified: '$source_data.is_verified',
            name: '$source_data.display_name',
            handle: '$source_data.identifier'
          }
        }
      },
      { $project: { analysis_data: 0, content_data: 0, source_data: 0 } }
    ]);

    const responsePayload = result[0];
    if (responsePayload?.content_details) {
      queueAlertMediaArchival([responsePayload]);
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Investigate a link (One-off check)
// @route   POST /api/alerts/investigate
// @access  Private
const fs = require('fs');
const path = require('path');

const resolveShortenedUrl = async (url, maxRedirects = 3) => {
  if (maxRedirects === 0) return url;
  try {
    const res = await axios.head(url, {
      maxRedirects: 0,
      validateStatus: (status) => status >= 300 && status < 400,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const location = res.headers.location;
    if (location) {
      const nextUrl = location.startsWith('http') ? location : new URL(location, url).href;
      return await resolveShortenedUrl(nextUrl, maxRedirects - 1);
    }
  } catch (e) {
    // If HEAD fails or No redirect, return original
  }
  return url;
};

const fetchGenericLinkMetadata = async (url) => {
  try {
    console.log(`[Investigation] Fetching generic metadata for: ${url}`);
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const title = $('title').text() || $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || 'Unknown Title';
    const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || $('meta[name="twitter:description"]').attr('content') || '';
    const author = $('meta[name="author"]').attr('content') || $('meta[property="og:site_name"]').attr('content') || new URL(url).hostname;
    const thumbnail = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '';

    return {
      title,
      text: description || title,
      description,
      author,
      platform: 'web',
      media: thumbnail ? [{ type: 'photo', url: thumbnail }] : [],
      created_at: new Date()
    };
  } catch (error) {
    console.warn(`[Investigation] Generic metadata fetch failed for ${url}:`, error.message);
    return null;
  }
};

const investigateLink = async (req, res) => {
  try {
    const { url } = req.body;
    const Source = require('../models/Source');

    console.log(`[Investigation] ENTRY: POST /api/alerts/investigate with URL: ${url}`);
    if (!url) return res.status(400).json({ message: 'URL is required' });

    // Resolve shortened links (t.co, bit.ly etc)
    let resolvedUrl = url;
    if (url.includes('t.co') || url.includes('bit.ly') || url.includes('tinyurl.com')) {
      const resolved = await resolveShortenedUrl(url);
      if (resolved !== url) {
        console.log(`[Investigation] Resolved ${url} to ${resolved}`);
        resolvedUrl = resolved;
      }
    }

    console.log(`[Investigation] Starting on-demand check for: ${resolvedUrl} (User: ${req.user?.email || 'unknown'})`);

    let platform = '';
    let contentId = '';
    let metadata = null;

    // 1. Identify Platform & ID
    if (resolvedUrl.includes('x.com') || resolvedUrl.includes('twitter.com')) {
      platform = 'x';
      // Match status ID which is typically numbers at the end of path or before query
      const match = resolvedUrl.match(/status\/(\d+)/);
      if (match) {
        contentId = match[1];
      } else {
        // Fallback: search for numbers that look like a tweet ID (long sequence)
        const longIdMatch = resolvedUrl.match(/\/(\d{15,})/);
        if (longIdMatch) contentId = longIdMatch[1];
      }
      console.log(`[Investigation] Detected X link, ID: ${contentId}`);
    } else if (resolvedUrl.includes('youtube.com') || resolvedUrl.includes('youtu.be')) {
      platform = 'youtube';
      const match = resolvedUrl.match(/(?:v=|v\/|vi\/|u\/\w\/|embed\/|shorts\/|e\/|youtu.be\/|v=)([^#&?]*).*/);
      if (match) contentId = match[1];
      console.log(`[Investigation] Detected YouTube link, ID: ${contentId}`);
    } else if (resolvedUrl.includes('instagram.com')) {
      platform = 'instagram';
      // Multi-format Instagram shortcode extraction
      const match = resolvedUrl.match(/\/(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/);
      if (match) contentId = match[1];
      console.log(`[Investigation] Detected Instagram link, shortcode: ${contentId}`);
    }

    if (!platform || !contentId) {
      console.log(`[Investigation] URL not a primary social link: ${resolvedUrl}. Attempting generic fetch...`);
      platform = 'web';
      contentId = `web_${Buffer.from(resolvedUrl).toString('base64').substring(0, 16)}`;
    }

    // 2. Fetch Metadata
    try {
      if (platform === 'x') {
        metadata = await fetchTweetDetail(contentId);
      } else if (platform === 'youtube') {
        const details = await YouTubeService.getVideoDetails([contentId]);
        if (details && details.length > 0) metadata = details[0];
      } else if (platform === 'instagram') {
        metadata = await fetchInstagramPostDetail(contentId);
        if (metadata) {
          // Normalize Instagram metadata for analysis
          metadata.text = metadata.text || '';
          metadata.title = `Instagram Post by ${metadata.author_handle}`;
        }
      } else if (platform === 'web') {
        metadata = await fetchGenericLinkMetadata(resolvedUrl);
      }
    } catch (fetchError) {
      console.log(`[Investigation] Metadata fetch failed for ${platform}:${contentId}: ${fetchError.message}`);
      return res.status(500).json({ message: `Service error while fetching ${platform} data: ${fetchError.message}` });
    }

    if (!metadata) {
      console.error(`[Investigation] ❌ CRITICAL: No metadata returned for ${platform}:${contentId}. URL was: ${resolvedUrl}`);
      return res.status(404).json({
        message: `Could not fetch details for this ${platform} link. The post might be private, deleted, or the API limit reached.`,
        debug: { platform, contentId, resolvedUrl }
      });
    }

    console.log(`[Investigation] Successfully fetched metadata for ${platform}:${contentId}. Content length: ${metadata.text?.length || 0}`);
    console.log(`[Investigation] Calling analyzeContent for ID: ${contentId}`);

    // 3. Analyze Content
    let analysis;
    const manualAnalysisId = uuidv4();
    try {
      analysis = await analyzeContent(metadata.text || metadata.description || metadata.title, {
        platform,
        content_id: contentId,
        content: {
          ...metadata,
          media: metadata.media || (platform === 'youtube' ? [{ url: resolvedUrl, type: 'video' }] : [])
        },
        analysisId: manualAnalysisId,
        skipForensics: true
      });
      console.log(`[Investigation] Analysis completed for ID: ${contentId}. Risk: ${analysis.risk_level}`);
    } catch (analysisError) {
      console.log(`[Investigation] Analysis failed for ID: ${contentId}: ${analysisError.message}`);
      // Fallback analysis object
      analysis = {
        risk_level: 'low',
        risk_score: 10,
        intent: 'unknown',
        reasons: [`Analysis failed: ${analysisError.message}`]
      };
    }

    // 4. Save Content Record (permanent)
    let contentRecord;
    try {
      // Check if content already exists
      contentRecord = await Content.findOne({ platform, content_id: contentId });

      if (!contentRecord) {
        // Create new content record
        contentRecord = await Content.create({
          platform,
          content_id: contentId,
          content_url: resolvedUrl,
          text: metadata.text || metadata.description || metadata.title,
          author: metadata.author || metadata.channelTitle || 'Unknown',
          author_handle: metadata.author_handle || metadata.channelId || 'unknown',
          published_at: metadata.created_at || metadata.publishedAt || new Date(),
          media: metadata.media || [],
          risk_score: analysis.risk_score || 0,
          risk_level: analysis.risk_level || 'low',
          threat_intent: analysis.intent,
          threat_reasons: analysis.reasons || [],
          engagement: metadata.metrics || metadata.statistics || {}
        });
        console.log(`[Investigation] Created new Content record: ${contentRecord.id}`);
      } else {
        console.log(`[Investigation] Found existing Content record: ${contentRecord.id}`);
      }
    } catch (contentError) {
      console.error(`[Investigation] Failed to save Content record:`, contentError.message);
      // Continue anyway, we can still create the alert
    }

    // 5. Check if author is already in Sources (monitoring status)
    let is_monitored = false;
    let existingSource = null; // Declare outside try-catch so it's accessible later
    try {
      const authorHandle = metadata.author_handle || metadata.channelId || metadata.author;
      const normalizedHandle = normalizeIdentifier(platform, authorHandle);
      const platformKeys = platform === 'x' || platform === 'twitter' ? ['x', 'twitter'] : [platform];
      const handleVariants = new Set([
        authorHandle,
        normalizedHandle,
        normalizedHandle ? `@${normalizedHandle}` : null,
        authorHandle ? `@${authorHandle}` : null
      ].filter(Boolean));
      const identifiersToCheck = Array.from(handleVariants);
      console.log(`[Investigation] Checking monitoring status for platform: ${platformKeys.join(',')}, identifier: ${normalizedHandle}`);

      existingSource = await Source.findOne({
        platform: { $in: platformKeys },
        identifier: { $in: identifiersToCheck }
      });

      if (existingSource) {
        is_monitored = true;
        console.log(`[Investigation] ✓ Author is monitored. Source ID: ${existingSource.id}`);
      } else {
        console.log(`[Investigation] ✗ Author is NOT monitored. No matching source found.`);
      }
    } catch (sourceError) {
      console.warn(`[Investigation] Failed to check monitoring status:`, sourceError.message);
    }

    // 6. Create permanent Alert record
    let alertRecord;
    try {
      alertRecord = await Alert.create({
        content_id: contentRecord?.id || contentId,
        content_ref_id: contentRecord?.id || null,
        source_id: existingSource?.id || null, // Link to source if monitored
        source_category: existingSource?.category || null,
        title: metadata.title || metadata.text?.substring(0, 100) || 'Investigated Post',
        description: metadata.description || metadata.text || '',
        content_url: resolvedUrl,
        platform,
        author: metadata.author || metadata.channelTitle || 'Unknown',
        author_handle: metadata.author_handle || metadata.channelId,
        matched_keywords_normalized: (analysis?.highlights || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean),
        risk_level: analysis.risk_level || 'low',
        status: 'active',
        alert_type: 'ai_risk',
        is_investigation: true,
        threat_details: {
          intent: analysis.intent || 'unknown',
          reasons: analysis.reasons || [],
          highlights: analysis.highlights || [],
          risk_score: analysis.risk_score || 0
        },
        legal_sections: analysis.legal_sections || [],
        violated_policies: analysis.violated_policies || [],
        classification_explanation: analysis.explanation || '',
        ml_analysis: analysis.ml_analysis || null,
        llm_analysis: analysis.llm_analysis || null
      });
      console.log(`[Investigation] Created new Alert record: ${alertRecord.id}${existingSource ? ` linked to Source: ${existingSource.id}` : ''}`);
    } catch (alertError) {
      console.error(`[Investigation] Failed to create Alert record:`, alertError.message);
      // Return error if we can't create the alert
      return res.status(500).json({ message: 'Failed to save investigation results to database' });
    }

    // 7. Return Alert with monitoring status
    const responseAlert = {
      id: alertRecord.id,
      content_id: contentRecord?.id || contentId,
      title: alertRecord.title,
      description: alertRecord.description,
      risk_level: alertRecord.risk_level,
      threat_details: alertRecord.threat_details,
      platform: alertRecord.platform,
      author: alertRecord.author,
      author_handle: alertRecord.author_handle,
      created_at: alertRecord.created_at,
      status: alertRecord.status,
      is_investigation: true,
      is_monitored,
      content_details: {
        content_type: metadata.content_type || (platform === 'instagram' ? 'post' : undefined),
        text: metadata.text || metadata.description || metadata.title,
        author_handle: metadata.author_handle || metadata.channelId,
        media: metadata.media || (metadata.thumbnails ? [{ url: metadata.thumbnails.high?.url || metadata.thumbnails.default?.url }] : []),
        engagement: metadata.metrics || metadata.statistics,
        url: resolvedUrl,
        content_url: contentRecord?.content_url || resolvedUrl,
        is_deleted: contentRecord?.is_deleted || false,
        deleted_at: contentRecord?.deleted_at || null,
        is_expired: contentRecord?.is_expired || false,
        expired_at: contentRecord?.expired_at || null,
        availability_status: contentRecord?.availability_status || 'available',
        analysis: analysis || null
      }
    };

    await clearAlertCache();
    console.log(`[Investigation] Completed successfully for ${platform}:${contentId}. Risk: ${analysis.risk_level}, Monitored: ${is_monitored}`);
    res.status(200).json(responseAlert);
  } catch (error) {
    console.error('[Investigation] Critical failure:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get lightweight alert counts per status (no $lookup, ultra-fast)
// @route   GET /api/alerts/summary
// @access  Private
const getAlertSummary = async (req, res) => {
  try {
    const summaryCacheKey = 'alert_summary:v2';
    const cached = await readCache(summaryCacheKey);
    if (cached) return res.status(200).json(cached);

    const [statusCounts, unreadCount] = await Promise.all([
      Alert.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Alert.countDocuments({ is_read: false })
    ]);

    const summary = { active: 0, acknowledged: 0, escalated: 0, resolved: 0, false_positive: 0, unread: unreadCount };
    statusCounts.forEach(item => {
      if (item._id && summary.hasOwnProperty(item._id)) summary[item._id] = item.count;
    });

    await writeCache(summaryCacheKey, summary, 20);
    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Translate alert content
// @route   POST /api/alerts/translate
// @access  Private
const translateAlertContent = async (req, res) => {
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
    console.error('[AlertController] Translation Error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get dashboard stats grouped by platform in a single call (ultra-fast, no $lookup)
// @route   GET /api/alerts/dashboard-stats
// @access  Private
const getDashboardStats = async (req, res) => {
  try {
    const dashCacheKey = 'dashboard:v2:alerts';
    const cached = await readCache(dashCacheKey);
    if (cached) return res.status(200).json(cached);

    const platforms = ['twitter', 'x', 'youtube', 'facebook', 'instagram', 'whatsapp'];
    const statuses = ['active', 'acknowledged', 'escalated', 'false_positive'];

    // Single aggregation: group by platform + status
    const [statusByPlatform, pendingReports, velocityByPlatform] = await Promise.all([
      Alert.aggregate([
        { $group: { _id: { platform: '$platform', status: '$status' }, count: { $sum: 1 } } }
      ]).allowDiskUse(true),

      // Escalated alerts without reports
      Alert.aggregate([
        { $match: { status: 'escalated' } },
        {
          $lookup: {
            from: 'reports',
            let: { alertId: '$id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$alert_id', '$$alertId'] } } },
              { $project: { _id: 1 } },
              { $limit: 1 }
            ],
            as: 'report_exists'
          }
        },
        { $match: { report_exists: { $size: 0 } } },
        { $group: { _id: '$platform', count: { $sum: 1 } } }
      ]),

      // Velocity/viral alerts by platform
      Alert.aggregate([
        { $match: { alert_type: 'velocity', status: 'active' } },
        { $group: { _id: '$platform', count: { $sum: 1 } } }
      ])
    ]);

    // Normalize x -> twitter
    const normPlatform = (p) => (p === 'x' ? 'twitter' : p);

    // Build result
    const initCounts = () => ({ active: 0, acknowledged: 0, escalated: 0, false_positive: 0 });
    const byPlatform = { all: initCounts() };
    platforms.forEach(p => { byPlatform[normPlatform(p)] = byPlatform[normPlatform(p)] || initCounts(); });

    statusByPlatform.forEach(({ _id, count }) => {
      const plat = normPlatform(_id.platform);
      const status = _id.status;
      if (!statuses.includes(status)) return;
      if (!byPlatform[plat]) byPlatform[plat] = initCounts();
      byPlatform[plat][status] = (byPlatform[plat][status] || 0) + count;
      byPlatform.all[status] = (byPlatform.all[status] || 0) + count;
    });

    // Pending report counts
    const pendingByPlatform = { all: 0 };
    pendingReports.forEach(({ _id, count }) => {
      const plat = normPlatform(_id);
      pendingByPlatform[plat] = (pendingByPlatform[plat] || 0) + count;
      pendingByPlatform.all += count;
    });

    // Viral counts
    const viralByPlatform = { all: 0 };
    velocityByPlatform.forEach(({ _id, count }) => {
      const plat = normPlatform(_id);
      viralByPlatform[plat] = (viralByPlatform[plat] || 0) + count;
      viralByPlatform.all += count;
    });

    const result = { byPlatform, pendingByPlatform, viralByPlatform };
    await writeCache(dashCacheKey, result, 20);
    res.status(200).json(result);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Check for similar escalated alerts
const getSimilarEscalatedAlerts = async (req, res) => {
  console.log('--- getSimilarEscalatedAlerts CALLED ---');
  try {
    const { text } = req.body;
    console.log('Checking text length:', text ? text.length : 'N/A');

    if (!text) return res.status(400).json({ message: 'Text is required' });

    // Call ML Service for Model-Based Similarity (TF-IDF/Embeddings on Training Data)
    try {
      const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8006';
      const mlRes = await axios.post(`${mlServiceUrl}/similar-escalated`, { text });
      // console.log('ML Service Response:', mlRes.data);

      const { is_similar, score, matched_text } = mlRes.data;
      let responseAlerts = [];

      if (is_similar && matched_text) {
        // Find the Alert in DB that corresponds to this matched text (Optional Best Effort)
        const Content = require('../models/Content');
        const matchingContent = await Content.findOne({ text: matched_text }).select('content_id');

        if (matchingContent) {
          const foundAlert = await Alert.findOne({
            content_id: matchingContent.content_id,
            status: 'escalated'
          }).select('id created_at status title');

          if (foundAlert) {
            responseAlerts.push({
              id: foundAlert.id,
              text: matched_text,
              timestamp: foundAlert.created_at,
              title: foundAlert.title || 'Escalated Alert',
              score: score,
              is_db_record: true
            });
          }
        }

        // Always return the ML detection even if DB lookup fails
        if (responseAlerts.length === 0) {
          responseAlerts.push({
            id: 'ml_memory_detection',
            text: matched_text,
            timestamp: new Date(),
            title: 'Historical Model Data',
            score: score,
            is_training_data: true
          });
        }
      }

      return res.status(200).json({
        similarCount: responseAlerts.length,
        alerts: responseAlerts,
        ml_score: score || 0,
        matched_text: matched_text || null
      });

    } catch (mlErr) {
      console.error('ML Service Error:', mlErr.message);
      return res.status(200).json({ similarCount: 0, alerts: [], error: 'ML Service Unavailable' });
    }
  } catch (error) {
    console.error('Error checking similar escalated alerts:', error);
    res.status(500).json({ message: 'Server error check similarity' });
  }
};

module.exports = {
  getAlerts,
  getAlertById,
  updateAlert,
  updateAlertSentiment,
  deleteAlert,
  getAlertStats,
  getAlertSummary,
  getDashboardStats,
  getUnreadCount,
  markAllAsRead,
  investigateLink,
  translateAlertContent,
  getSimilarEscalatedAlerts
};
