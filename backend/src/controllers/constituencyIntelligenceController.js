/**
 * constituencyIntelligenceController
 * ─────────────────────────────────────────────────────────────────────
 * "Constituency War Room" — party-strategist intelligence across all
 * 119 Telangana assembly constituencies.
 *
 * Aggregates the existing Grievance collection (ingested social mentions +
 * citizen grievances) BY CONSTITUENCY and joins it with the MLA reference
 * dataset to produce a ranked, filterable view of:
 *   • neutral public sentiment per seat (positive/negative/neutral)
 *   • grievance volume & negative-mention pressure
 *   • the top civic issues being raised
 *
 * Sentiment here is NEUTRAL per-constituency (analysis.sentiment), i.e.
 * about the seat/MLA on their own merits — NOT the client-relative score.
 */

const Grievance = require('../models/Grievance');
const {
  getAllMlas,
  getMlaByConstituency,
  normalizeConstituencyKey,
  classifyIssues,
  ISSUE_CATEGORIES,
} = require('../services/mlaReferenceService');
const { getVoterProfileByConstituency } = require('../services/voterProfileService');

/* RBAC helper: clamp a constituency list to the caller's allowed scope. */
const scopeMlaList = (mlas, scope) => {
  if (!scope || scope.canSeeAll) return mlas;
  const allowed = scope.constituencyKeys || new Set();
  return mlas.filter((m) => allowed.has(normalizeConstituencyKey(m.constituency)));
};

const isInScope = (constituency, scope) => {
  if (!scope || scope.canSeeAll) return true;
  return (scope.constituencyKeys || new Set()).has(normalizeConstituencyKey(constituency));
};

/* ─── helpers ─────────────────────────────────────────────────────── */

const buildBaseMatch = (days) => {
  const match = {
    is_active: true,
    'detected_location.constituency': { $exists: true, $nin: [null, ''] },
  };
  const windowDays = Number(days);
  if (Number.isFinite(windowDays) && windowDays > 0) {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    match.post_date = { $gte: since };
  }
  return match;
};

// Sentiment index in [-100, 100]: net positivity share.
const sentimentIndex = (pos, neg, total) =>
  total > 0 ? Math.round(((pos - neg) / total) * 100) : 0;

const SENTIMENT_BUCKET = (idx, total) => {
  if (total === 0) return 'no_data';
  if (idx <= -25) return 'critical';
  if (idx < 0) return 'negative';
  if (idx < 25) return 'mixed';
  return 'positive';
};

/* ─── GET /api/constituency-intel/leaderboard ─────────────────────────
 * Ranked list of every constituency with sentiment + grievance pressure.
 * Query: ?party=INC&alliance=INDIA&district=NALGONDA&sort=negative|volume|index
 *        &order=asc|desc&days=30&limit=200
 */
const getLeaderboard = async (req, res) => {
  try {
    const { party, alliance, district, sort = 'negative', order, days, limit } = req.query;

    const agg = await Grievance.aggregate([
      { $match: buildBaseMatch(days) },
      {
        $group: {
          _id: '$detected_location.constituency',
          total: { $sum: 1 },
          positive: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'positive'] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'negative'] }, 1, 0] } },
          neutral: { $sum: { $cond: [{ $in: ['$analysis.sentiment', ['neutral', 'moderate']] }, 1, 0] } },
          high_priority: {
            $sum: { $cond: [{ $in: ['$complaint.priority', ['high', 'critical']] }, 1, 0] },
          },
        },
      },
    ]);

    // Index aggregation results by normalized constituency key.
    const statsByKey = new Map();
    for (const row of agg) {
      statsByKey.set(normalizeConstituencyKey(row._id), row);
    }

    // Start from the full MLA roster so every seat appears, even with 0 data.
    // RBAC: non-super-admin scoped users see only their assigned constituencies.
    const roster = scopeMlaList(getAllMlas(), req.scope);
    let rows = roster.map((mla) => {
      const stat = statsByKey.get(mla.key) || { total: 0, positive: 0, negative: 0, neutral: 0, high_priority: 0 };
      const total = stat.total || 0;
      const idx = sentimentIndex(stat.positive, stat.negative, total);
      return {
        constituency: mla.constituency,
        key: mla.key,
        mla: mla.mla,
        party: mla.party,
        alliance: mla.alliance,
        criminalCases: mla.criminalCases ?? null,
        grievances: total,
        positive: stat.positive || 0,
        negative: stat.negative || 0,
        neutral: stat.neutral || 0,
        high_priority: stat.high_priority || 0,
        negative_share: total > 0 ? Math.round((stat.negative / total) * 100) : 0,
        sentiment_index: idx,
        bucket: SENTIMENT_BUCKET(idx, total),
      };
    });

    // Filters
    if (party) rows = rows.filter((r) => String(r.party).toUpperCase() === String(party).toUpperCase());
    if (alliance) rows = rows.filter((r) => String(r.alliance).toUpperCase() === String(alliance).toUpperCase());

    // Sorting
    const dir = order === 'asc' ? 1 : -1;
    const sorters = {
      negative: (a, b) => (a.negative - b.negative) || (a.negative_share - b.negative_share),
      volume: (a, b) => a.grievances - b.grievances,
      index: (a, b) => a.sentiment_index - b.sentiment_index,
      priority: (a, b) => a.high_priority - b.high_priority,
    };
    const sorter = sorters[sort] || sorters.negative;
    rows.sort((a, b) => sorter(a, b) * dir);

    const max = Number(limit);
    if (Number.isFinite(max) && max > 0) rows = rows.slice(0, max);

    return res.json({
      success: true,
      count: rows.length,
      window_days: Number(days) || null,
      sort,
      order: order === 'asc' ? 'asc' : 'desc',
      data: rows,
    });
  } catch (err) {
    console.error('[constituencyIntel] leaderboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to build leaderboard' });
  }
};

/* ─── GET /api/constituency-intel/summary ─────────────────────────────
 * State-level rollup: party-wise sentiment, hotspot count, top issues.
 */
const getSummary = async (req, res) => {
  try {
    const { days } = req.query;
    const baseMatch = buildBaseMatch(days);

    const [byParty, totals, recentNeg] = await Promise.all([
      // Party-wise sentiment via constituency join done in JS below.
      Grievance.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: '$detected_location.constituency',
            positive: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'positive'] }, 1, 0] } },
            negative: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'negative'] }, 1, 0] } },
            total: { $sum: 1 },
          },
        },
      ]),
      Grievance.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            positive: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'positive'] }, 1, 0] } },
            negative: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'negative'] }, 1, 0] } },
            neutral: { $sum: { $cond: [{ $in: ['$analysis.sentiment', ['neutral', 'moderate']] }, 1, 0] } },
          },
        },
      ]),
      // Sample of recent negative grievance text for statewide issue trends.
      Grievance.find({ ...baseMatch, 'analysis.sentiment': 'negative' })
        .select('content.text analysis.category')
        .sort({ post_date: -1 })
        .limit(1500)
        .lean(),
    ]);

    // Party-wise rollup (join constituency → party).
    const partyAgg = {};
    let hotspots = 0;
    for (const row of byParty) {
      const mla = getMlaByConstituency(row._id);
      const party = mla?.party || 'UNKNOWN';
      if (!partyAgg[party]) partyAgg[party] = { party, seats: 0, grievances: 0, positive: 0, negative: 0 };
      partyAgg[party].seats += 1;
      partyAgg[party].grievances += row.total;
      partyAgg[party].positive += row.positive;
      partyAgg[party].negative += row.negative;
      const idx = sentimentIndex(row.positive, row.negative, row.total);
      if (row.total >= 5 && idx <= -25) hotspots += 1;
    }
    const partyBreakdown = Object.values(partyAgg).map((p) => ({
      ...p,
      sentiment_index: sentimentIndex(p.positive, p.negative, p.grievances),
    })).sort((a, b) => b.grievances - a.grievances);

    // Statewide top issues from recent negative sample.
    const issueCounts = Object.fromEntries(ISSUE_CATEGORIES.map((c) => [c, 0]));
    for (const g of recentNeg) {
      for (const cat of classifyIssues(g?.content?.text)) issueCounts[cat] += 1;
    }
    const topIssues = Object.entries(issueCounts)
      .filter(([, n]) => n > 0)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count);

    const t = totals[0] || { total: 0, positive: 0, negative: 0, neutral: 0 };

    return res.json({
      success: true,
      window_days: Number(days) || null,
      totals: {
        ...t,
        sentiment_index: sentimentIndex(t.positive, t.negative, t.total),
        constituencies_with_data: byParty.length,
        hotspots,
      },
      party_breakdown: partyBreakdown,
      top_issues: topIssues,
    });
  } catch (err) {
    console.error('[constituencyIntel] summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to build summary' });
  }
};

/* ─── GET /api/constituency-intel/:constituency ───────────────────────
 * Per-seat detail: MLA bio + neutral sentiment + top issues +
 * recent negative mentions (evidence).
 */
const getConstituencyDetail = async (req, res) => {
  try {
    const { constituency } = req.params;
    const { days } = req.query;
    const decoded = decodeURIComponent(constituency || '');
    const mla = getMlaByConstituency(decoded);

    // RBAC: scoped users can only fetch detail for their own seat.
    if (!isInScope(decoded, req.scope)) {
      return res.status(403).json({
        success: false,
        code: 'CONSTITUENCY_FORBIDDEN',
        message: 'You are not authorized to view this constituency',
      });
    }

    const baseMatch = {
      ...buildBaseMatch(days),
      'detected_location.constituency': mla ? new RegExp(`^${mla.constituency}$`, 'i') : decoded,
    };

    const [counts, recent] = await Promise.all([
      Grievance.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            positive: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'positive'] }, 1, 0] } },
            negative: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'negative'] }, 1, 0] } },
            neutral: { $sum: { $cond: [{ $in: ['$analysis.sentiment', ['neutral', 'moderate']] }, 1, 0] } },
            high_priority: { $sum: { $cond: [{ $in: ['$complaint.priority', ['high', 'critical']] }, 1, 0] } },
          },
        },
      ]),
      Grievance.find(baseMatch)
        .select('content.text analysis.sentiment posted_by.handle posted_by.display_name platform post_date tweet_id')
        .sort({ post_date: -1 })
        .limit(400)
        .lean(),
    ]);

    const c = counts[0] || { total: 0, positive: 0, negative: 0, neutral: 0, high_priority: 0 };

    // Top issues from this seat's grievance text.
    const issueCounts = Object.fromEntries(ISSUE_CATEGORIES.map((cat) => [cat, 0]));
    for (const g of recent) {
      for (const cat of classifyIssues(g?.content?.text)) issueCounts[cat] += 1;
    }
    const topIssues = Object.entries(issueCounts)
      .filter(([, n]) => n > 0)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count);

    const recentNegative = recent
      .filter((g) => g?.analysis?.sentiment === 'negative')
      .slice(0, 15)
      .map((g) => ({
        text: g?.content?.text || '',
        handle: g?.posted_by?.handle || null,
        display_name: g?.posted_by?.display_name || null,
        platform: g.platform,
        post_date: g.post_date,
        tweet_id: g.tweet_id,
      }));

    return res.json({
      success: true,
      window_days: Number(days) || null,
      mla: mla || { constituency: decoded },
      sentiment: {
        ...c,
        sentiment_index: sentimentIndex(c.positive, c.negative, c.total),
        bucket: SENTIMENT_BUCKET(sentimentIndex(c.positive, c.negative, c.total), c.total),
      },
      top_issues: topIssues,
      recent_negative: recentNegative,
    });
  } catch (err) {
    console.error('[constituencyIntel] detail error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to build constituency detail' });
  }
};

/* ─── GET /api/constituency-intel/:constituency/narrative ─────────────
 * Social-media narrative intelligence for one seat: platform-wide sentiment,
 * conversation-volume trend, platform mix, trending topics/hashtags,
 * top influencers, narrative themes, and rule-based insights.
 * All figures are aggregated from the Grievance collection (ingested social
 * mentions) scoped to this constituency — real, not illustrative.
 */
const getConstituencyNarrative = async (req, res) => {
  try {
    const { constituency } = req.params;
    const { days } = req.query;
    const decoded = decodeURIComponent(constituency || '');
    const mla = getMlaByConstituency(decoded);

    if (!isInScope(decoded, req.scope)) {
      return res.status(403).json({ success: false, code: 'CONSTITUENCY_FORBIDDEN', message: 'Not authorized to view this constituency' });
    }

    const windowDays = Number(days) > 0 ? Number(days) : 30;
    const since = new Date(Date.now() - windowDays * 86400000);
    const prevSince = new Date(Date.now() - 2 * windowDays * 86400000);
    const constFilter = mla ? new RegExp(`^${mla.constituency}$`, 'i') : decoded;

    const baseMatch = { is_active: true, 'detected_location.constituency': constFilter, post_date: { $gte: since } };
    const prevMatch = { is_active: true, 'detected_location.constituency': constFilter, post_date: { $gte: prevSince, $lt: since } };

    const sentimentGroup = {
      _id: null,
      total: { $sum: 1 },
      positive: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'positive'] }, 1, 0] } },
      negative: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'negative'] }, 1, 0] } },
      neutral: { $sum: { $cond: [{ $in: ['$analysis.sentiment', ['neutral', 'moderate']] }, 1, 0] } },
    };

    const [curAgg, prevAgg, volume, platforms, influencers, recent] = await Promise.all([
      Grievance.aggregate([{ $match: baseMatch }, { $group: sentimentGroup }]),
      Grievance.aggregate([{ $match: prevMatch }, { $group: sentimentGroup }]),
      Grievance.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$post_date' } },
            count: { $sum: 1 },
            positive: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'positive'] }, 1, 0] } },
            negative: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'negative'] }, 1, 0] } },
            neutral: { $sum: { $cond: [{ $in: ['$analysis.sentiment', ['neutral', 'moderate']] }, 1, 0] } },
          }
        },
        { $sort: { _id: 1 } },
      ]),
      Grievance.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$platform', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Grievance.aggregate([
        { $match: { ...baseMatch, 'posted_by.handle': { $nin: [null, ''] } } },
        {
          $group: {
            _id: '$posted_by.handle',
            display_name: { $first: '$posted_by.display_name' },
            followers: { $max: '$posted_by.follower_count' },
            verified: { $max: { $cond: ['$posted_by.is_verified', 1, 0] } },
            posts: { $sum: 1 },
            reach: { $sum: '$engagement.views' },
          },
        },
        { $sort: { followers: -1, reach: -1 } },
        { $limit: 8 },
      ]),
      Grievance.find(baseMatch)
        .select('content.text analysis.category analysis.grievance_type analysis.sentiment')
        .sort({ post_date: -1 })
        .limit(600)
        .lean(),
    ]);

    const cur = curAgg[0] || { total: 0, positive: 0, negative: 0, neutral: 0 };
    const prev = prevAgg[0] || { total: 0, positive: 0, negative: 0, neutral: 0 };
    const pct = (n, t) => (t > 0 ? Math.round((n / t) * 100) : 0);
    // Sentiment score 0-100 (positive weight 1, neutral 0.5).
    const scoreOf = (s) => (s.total > 0 ? Math.round(((s.positive + 0.5 * s.neutral) / s.total) * 100) : 0);
    const curScore = scoreOf(cur);
    const prevScore = scoreOf(prev);

    // Topics: merge classified categories + extracted hashtags.
    const topicCounts = {};
    const hashtagCounts = {};
    const HASHTAG_RE = /#[\wऀ-ॿఀ-౿]+/g;
    const bySentimentCat = { positive: {}, negative: {}, neutral: {} };
    for (const g of recent) {
      const cat = g?.analysis?.grievance_type || g?.analysis?.category;
      if (cat) topicCounts[cat] = (topicCounts[cat] || 0) + 1;
      const sent = g?.analysis?.sentiment === 'negative' ? 'negative'
        : g?.analysis?.sentiment === 'positive' ? 'positive' : 'neutral';
      if (cat) bySentimentCat[sent][cat] = (bySentimentCat[sent][cat] || 0) + 1;
      const text = g?.content?.text || '';
      const tags = text.match(HASHTAG_RE) || [];
      for (const t of tags) {
        const k = t.toLowerCase();
        hashtagCounts[k] = (hashtagCounts[k] || 0) + 1;
      }
    }
    const topList = (obj, n) => Object.entries(obj).map(([k, v]) => ({ name: k, count: v })).sort((a, b) => b.count - a.count).slice(0, n);
    const topTopics = topList(topicCounts, 6);
    const trendingHashtags = topList(hashtagCounts, 6);
    const topCatOf = (sent) => topList(bySentimentCat[sent], 1)[0] || null;

    const PLATFORM_LABELS = { x: 'X (Twitter)', twitter: 'X (Twitter)', facebook: 'Facebook', youtube: 'YouTube', instagram: 'Instagram', whatsapp: 'WhatsApp', rss: 'Web Articles' };
    const platformMix = platforms.map((p) => ({
      platform: p._id || 'unknown',
      label: PLATFORM_LABELS[p._id] || (p._id || 'Unknown'),
      count: p.count,
      pct: pct(p.count, cur.total),
    }));

    // Rule-based (non-LLM) insights derived from the real aggregates.
    const insights = [];
    if (topTopics.length) insights.push(`Top conversation drivers: ${topTopics.slice(0, 3).map((t) => t.name).join(', ')}.`);
    if (cur.total > 0) {
      const delta = curScore - prevScore;
      if (delta !== 0) insights.push(`Sentiment score ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} pts vs previous ${windowDays}d (now ${curScore}/100).`);
    }
    if (platformMix.length) insights.push(`Most conversation on ${platformMix[0].label} (${platformMix[0].pct}%).`);
    const negTop = topCatOf('negative');
    if (negTop && pct(cur.negative, cur.total) >= 25) insights.push(`Elevated negative sentiment — “${negTop.name}” is the main driver; consider a response.`);
    if (cur.total === 0) insights.push('No social mentions detected for this constituency in the selected window.');

    return res.json({
      success: true,
      constituency: mla ? mla.constituency : decoded,
      mla: mla ? { name: mla.mla, party: mla.party, alliance: mla.alliance } : null,
      window_days: windowDays,
      sentiment: {
        total: cur.total,
        positive: cur.positive, negative: cur.negative, neutral: cur.neutral,
        positive_pct: pct(cur.positive, cur.total),
        negative_pct: pct(cur.negative, cur.total),
        neutral_pct: pct(cur.neutral, cur.total),
        score: curScore,
        score_change: curScore - prevScore,
      },
      volume_trend: volume.map((v) => ({
        date: v._id,
        count: v.count,
        total: v.count,
        positive: v.positive || 0,
        negative: v.negative || 0,
        neutral: v.neutral || 0,
      })),
      platforms: platformMix,
      top_topics: topTopics,
      trending_hashtags: trendingHashtags,
      narratives: {
        positive: topCatOf('positive'),
        negative: topCatOf('negative'),
        neutral: topCatOf('neutral'),
      },
      top_influencers: influencers.map((i) => ({
        handle: i._id,
        display_name: i.display_name || i._id,
        followers: i.followers || 0,
        verified: !!i.verified,
        posts: i.posts,
        reach: i.reach || 0,
      })),
      ai_insights: insights,
    });
  } catch (err) {
    console.error('[constituencyIntel] narrative error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to build narrative intelligence' });
  }
};

/* ─── internal: full analytics bundle for ONE seat ────────────────────
 * Reuses the exact same aggregations that power the detail + narrative
 * endpoints, packaged into a single object so the head-to-head compare
 * endpoint can fetch two seats in one request. Every figure is derived
 * live from the Grievance collection — nothing illustrative.
 */
const analyzeSeat = async (rawConstituency, days) => {
  const decoded = decodeURIComponent(rawConstituency || '');
  const mla = getMlaByConstituency(decoded);
  const constName = mla ? mla.constituency : decoded;

  const windowDays = Number(days) > 0 ? Number(days) : 90;
  const since = new Date(Date.now() - windowDays * 86400000);
  const prevSince = new Date(Date.now() - 2 * windowDays * 86400000);
  const constFilter = mla ? new RegExp(`^${mla.constituency}$`, 'i') : decoded;

  const baseMatch = { is_active: true, 'detected_location.constituency': constFilter, post_date: { $gte: since } };
  const prevMatch = { is_active: true, 'detected_location.constituency': constFilter, post_date: { $gte: prevSince, $lt: since } };

  const countsGroup = {
    _id: null,
    total: { $sum: 1 },
    positive: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'positive'] }, 1, 0] } },
    negative: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'negative'] }, 1, 0] } },
    neutral: { $sum: { $cond: [{ $in: ['$analysis.sentiment', ['neutral', 'moderate']] }, 1, 0] } },
    high_priority: { $sum: { $cond: [{ $in: ['$complaint.priority', ['high', 'critical']] }, 1, 0] } },
    reach: { $sum: '$engagement.views' },
  };

  const [curAgg, prevAgg, volume, platforms, influencers, recent] = await Promise.all([
    Grievance.aggregate([{ $match: baseMatch }, { $group: countsGroup }]),
    Grievance.aggregate([{ $match: prevMatch }, { $group: countsGroup }]),
    Grievance.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$post_date' } },
          count: { $sum: 1 },
          positive: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'positive'] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $eq: ['$analysis.sentiment', 'negative'] }, 1, 0] } },
          neutral: { $sum: { $cond: [{ $in: ['$analysis.sentiment', ['neutral', 'moderate']] }, 1, 0] } },
        }
      },
      { $sort: { _id: 1 } },
    ]),
    Grievance.aggregate([
      { $match: baseMatch },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Grievance.aggregate([
      { $match: { ...baseMatch, 'posted_by.handle': { $nin: [null, ''] } } },
      {
        $group: {
          _id: '$posted_by.handle',
          display_name: { $first: '$posted_by.display_name' },
          followers: { $max: '$posted_by.follower_count' },
          verified: { $max: { $cond: ['$posted_by.is_verified', 1, 0] } },
          posts: { $sum: 1 },
          reach: { $sum: '$engagement.views' },
        },
      },
      { $sort: { followers: -1, reach: -1 } },
      { $limit: 6 },
    ]),
    Grievance.find(baseMatch)
      .select('content.text analysis.category analysis.grievance_type analysis.sentiment')
      .sort({ post_date: -1 })
      .limit(600)
      .lean(),
  ]);

  const cur = curAgg[0] || { total: 0, positive: 0, negative: 0, neutral: 0, high_priority: 0, reach: 0 };
  const prev = prevAgg[0] || { total: 0, positive: 0, negative: 0, neutral: 0 };
  const pct = (n, t) => (t > 0 ? Math.round((n / t) * 100) : 0);
  const idx = sentimentIndex(cur.positive, cur.negative, cur.total);
  // Social sentiment score 0-100 (positive weight 1, neutral 0.5).
  const scoreOf = (s) => (s.total > 0 ? Math.round(((s.positive + 0.5 * s.neutral) / s.total) * 100) : 0);
  const curScore = scoreOf(cur);
  const prevScore = scoreOf(prev);

  // Top civic issues from this seat's grievance text.
  const issueCounts = Object.fromEntries(ISSUE_CATEGORIES.map((c) => [c, 0]));
  const topicCounts = {};
  const hashtagCounts = {};
  const HASHTAG_RE = /#[\wऀ-ॿఀ-౿]+/g;
  for (const g of recent) {
    for (const cat of classifyIssues(g?.content?.text)) issueCounts[cat] += 1;
    const cat = g?.analysis?.grievance_type || g?.analysis?.category;
    if (cat) topicCounts[cat] = (topicCounts[cat] || 0) + 1;
    const tags = (g?.content?.text || '').match(HASHTAG_RE) || [];
    for (const t of tags) {
      const k = t.toLowerCase();
      hashtagCounts[k] = (hashtagCounts[k] || 0) + 1;
    }
  }
  const topList = (obj, n) => Object.entries(obj)
    .map(([k, v]) => ({ name: k, count: v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
  const topIssues = Object.entries(issueCounts)
    .filter(([, n]) => n > 0)
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count);

  const PLATFORM_LABELS = { x: 'X (Twitter)', twitter: 'X (Twitter)', facebook: 'Facebook', youtube: 'YouTube', instagram: 'Instagram', whatsapp: 'WhatsApp' };
  const platformMix = platforms.map((p) => ({
    platform: p._id || 'unknown',
    label: PLATFORM_LABELS[p._id] || (p._id || 'Unknown'),
    count: p.count,
    pct: pct(p.count, cur.total),
  }));

  // Voter profile (static ECI data) — demographics + 2024 election result.
  const voter = getVoterProfileByConstituency(decoded);
  const e2024 = voter?.election_2024 || {};

  return {
    constituency: constName,
    key: normalizeConstituencyKey(constName),
    mla: mla ? {
      name: mla.mla,
      party: mla.party,
      alliance: mla.alliance,
      criminalCases: mla.criminalCases ?? null,
      education: mla.education ?? null,
      assets: mla.assets ?? null,
    } : { name: null, party: null, alliance: null },
    window_days: windowDays,
    sentiment: {
      total: cur.total,
      positive: cur.positive,
      negative: cur.negative,
      neutral: cur.neutral,
      high_priority: cur.high_priority,
      reach: cur.reach || 0,
      positive_pct: pct(cur.positive, cur.total),
      negative_pct: pct(cur.negative, cur.total),
      neutral_pct: pct(cur.neutral, cur.total),
      sentiment_index: idx,
      bucket: SENTIMENT_BUCKET(idx, cur.total),
      score: curScore,
      score_change: curScore - prevScore,
    },
    top_issues: topIssues,
    top_topics: topList(topicCounts, 6),
    trending_hashtags: topList(hashtagCounts, 6),
    volume_trend: volume.map((v) => ({
      date: v._id,
      count: v.count,
      total: v.count,
      positive: v.positive || 0,
      negative: v.negative || 0,
      neutral: v.neutral || 0,
    })),
    platforms: platformMix,
    top_influencers: influencers.map((i) => ({
      handle: i._id,
      display_name: i.display_name || i._id,
      followers: i.followers || 0,
      verified: !!i.verified,
      posts: i.posts,
      reach: i.reach || 0,
    })),
    voter: voter ? {
      electors_total: voter.electors_total ?? null,
      electors_male: voter.electors_male ?? null,
      electors_female: voter.electors_female ?? null,
      vote_share_2024: e2024.winner ? e2024.winner.vote_pct : null,
      margin_2024: e2024.margin ?? null,
    } : null,
  };
};

/* ─── GET /api/constituency-intel/compare ─────────────────────────────
 * Head-to-head comparison of two constituencies/candidates.
 * Query: ?a=Kodangal&b=Gajwel&days=90
 * Returns each seat's full analytics bundle plus a computed, per-metric
 * "who's ahead" head-to-head and an overall verdict.
 */
const getComparison = async (req, res) => {
  try {
    const { a, b, days } = req.query;
    if (!a || !b) {
      return res.status(400).json({ success: false, message: 'Both ?a and ?b constituencies are required' });
    }
    const decodedA = decodeURIComponent(a);
    const decodedB = decodeURIComponent(b);
    if (normalizeConstituencyKey(decodedA) === normalizeConstituencyKey(decodedB)) {
      return res.status(400).json({ success: false, message: 'Pick two different constituencies to compare' });
    }

    // NOTE: Intentional product decision — the head-to-head compare is open to
    // every authenticated user, including seat-scoped ones (e.g. an MLA
    // comparing their own seat against a rival). It exposes only AGGREGATE
    // sentiment/issues/narrative for the two seats (the same class of figures
    // shown on the profile), never row-level grievances or restricted data,
    // so it does not widen access to sensitive per-record content.
    const [seatA, seatB] = await Promise.all([
      analyzeSeat(decodedA, days),
      analyzeSeat(decodedB, days),
    ]);

    // Per-metric head-to-head. dir = 'higher' means a bigger value wins.
    const metricDefs = [
      { key: 'sentiment_index', label: 'Sentiment Index', dir: 'higher', a: seatA.sentiment.sentiment_index, b: seatB.sentiment.sentiment_index, unit: '' },
      { key: 'positive_pct', label: 'Positive Share', dir: 'higher', a: seatA.sentiment.positive_pct, b: seatB.sentiment.positive_pct, unit: '%' },
      { key: 'negative_pct', label: 'Negative Share', dir: 'lower', a: seatA.sentiment.negative_pct, b: seatB.sentiment.negative_pct, unit: '%' },
      { key: 'score', label: 'Social Sentiment Score', dir: 'higher', a: seatA.sentiment.score, b: seatB.sentiment.score, unit: '/100' },
      { key: 'total', label: 'Conversation Volume', dir: 'higher', a: seatA.sentiment.total, b: seatB.sentiment.total, unit: '' },
      { key: 'reach', label: 'Total Reach', dir: 'higher', a: seatA.sentiment.reach, b: seatB.sentiment.reach, unit: '' },
      { key: 'high_priority', label: 'High-Priority Grievances', dir: 'lower', a: seatA.sentiment.high_priority, b: seatB.sentiment.high_priority, unit: '' },
      { key: 'criminalCases', label: 'Clean Record (fewer cases)', dir: 'lower', a: seatA.mla.criminalCases, b: seatB.mla.criminalCases, unit: '' },
    ];

    let aWins = 0;
    let bWins = 0;
    const head_to_head = metricDefs.map((m) => {
      const av = Number.isFinite(Number(m.a)) ? Number(m.a) : null;
      const bv = Number.isFinite(Number(m.b)) ? Number(m.b) : null;
      let winner = 'tie';
      if (av != null && bv != null && av !== bv) {
        const aBetter = m.dir === 'higher' ? av > bv : av < bv;
        winner = aBetter ? 'a' : 'b';
      } else if (av != null && bv == null) {
        winner = 'a';
      } else if (bv != null && av == null) {
        winner = 'b';
      }
      // Only sentiment/reputation metrics count toward the overall verdict;
      // raw volume is buzz, not necessarily "better", so it's shown but neutral.
      const countsToward = m.key !== 'total' && m.key !== 'reach';
      if (countsToward && winner === 'a') aWins += 1;
      if (countsToward && winner === 'b') bWins += 1;
      return { ...m, a: av, b: bv, winner, counts_toward_verdict: countsToward };
    });

    const overall = aWins === bWins ? 'tie' : (aWins > bWins ? 'a' : 'b');

    return res.json({
      success: true,
      window_days: seatA.window_days,
      a: seatA,
      b: seatB,
      head_to_head,
      verdict: { overall, a_wins: aWins, b_wins: bWins },
    });
  } catch (err) {
    console.error('[constituencyIntel] compare error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to build comparison' });
  }
};

module.exports = {
  getLeaderboard,
  getSummary,
  getConstituencyDetail,
  getConstituencyNarrative,
  getComparison,
};
