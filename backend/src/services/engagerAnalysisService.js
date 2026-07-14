const { v4: uuidv4 } = require('uuid');
const EngagerAnalysis = require('../models/EngagerAnalysis');
const Source = require('../models/Source');
const Alert = require('../models/Alert');
const Content = require('../models/Content');
const { fetchAllUserTweetsSince, fetchTweetRetweeters } = require('./rapidApiXService');
const { beginInteractivePriority, endInteractivePriority } = require('./apiPriorityGate');

const MAX_TWEETS_TO_FETCH = 200;
const MAX_TWEETS_FOR_RETWEETERS = 40; // avoid O(n) API explosion — only scan the top N by retweet count
const RETWEETERS_PER_TWEET_CAP = 200;
// Was fully sequential (1 at a time) — kept modest rather than higher because
// this key is shared app-wide (grievance fetch, X monitor); too much added
// concurrency just collides harder with everyone else's requests once the
// RapidAPI plan's per-second cap is already saturated.
const RETWEETER_FETCH_CONCURRENCY = 3;
const STALE_PROCESSING_MINUTES = 10;
const AUTO_QUEUE_COOLDOWN_DAYS = 7;

/**
 * Runs `worker` over `items` with at most `limit` in flight at once. Plain
 * I/O-bound concurrency (no worker threads needed) — the retweeter fetches
 * below are almost entirely spent waiting on RapidAPI, so running several
 * at once turns a ~40-step sequential wait into ~40/limit waves.
 */
const runWithConcurrency = async (items, limit, worker) => {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      await worker(items[current], current);
    }
  });
  await Promise.all(runners);
};

const normalizeHandle = (handle) => String(handle || '').replace('@', '').trim();
// A "handle" that's actually a raw internal/tweet id leaking through (e.g. a
// mis-resolved user id used as a handle) looks like a bare hex string —
// filter these out rather than let them pollute the accounts list.
const LIKELY_MACHINE_HANDLE_RE = /^[0-9a-f]{12,15}$/i;
const isLikelyMachineHandle = (handle) => LIKELY_MACHINE_HANDLE_RE.test(String(handle || '').trim());

const classifyFrequency = (tweetsRetweeted, tweetsAnalyzed) => {
  const ratio = tweetsAnalyzed > 0 ? tweetsRetweeted / tweetsAnalyzed : 0;
  if (ratio >= 0.5 || tweetsRetweeted >= 10) return 'super-active';
  if (ratio >= 0.25 || tweetsRetweeted >= 5) return 'regular';
  if (tweetsRetweeted >= 2) return 'occasional';
  return 'one-time';
};

const FREQUENCY_ORDER = { 'super-active': 0, regular: 1, occasional: 2, 'one-time': 3 };

/**
 * Fetches every retweeter of one tweet (paginated, capped) and folds them
 * into the shared engagerMap, marking this tweet id against each. Shared by
 * the full-profile scan and the single-post analysis below.
 */
const fetchRetweetersForTweetIntoMap = async (tweetId, engagerMap, retweetersFoundByTweetId = null) => {
  // fetchTweetRetweeters now handles its own pagination (and tries a
  // cascade of endpoint/param variants) up to the requested count, so a
  // single call is enough.
  const { users } = await fetchTweetRetweeters(tweetId, { count: RETWEETERS_PER_TWEET_CAP });
  if (retweetersFoundByTweetId) retweetersFoundByTweetId.set(tweetId, users.length);
  for (const user of users) {
    const key = user.screen_name.toLowerCase();
    const existing = engagerMap.get(key) || {
      handle: user.screen_name,
      name: user.name,
      avatar: user.profile_image_url_https,
      verified: user.verified,
      user_id: user.id,
      tweetIds: new Set()
    };
    existing.name = user.name || existing.name;
    existing.avatar = user.profile_image_url_https || existing.avatar;
    existing.verified = user.verified || existing.verified;
    existing.user_id = user.id || existing.user_id;
    existing.tweetIds.add(tweetId);
    engagerMap.set(key, existing);
  }
};

/** Seeds the engager map from the handle's latest completed analysis, if any. */
const seedEngagerMapFromPrevious = async (handleLower) => {
  const previous = await EngagerAnalysis.findOne({ handle_lower: handleLower, status: 'completed' })
    .sort({ analyzed_at: -1 });

  const engagerMap = new Map();
  if (previous) {
    for (const engager of previous.engagers) {
      engagerMap.set(engager.handle.toLowerCase(), {
        handle: engager.handle,
        name: engager.name,
        avatar: engager.avatar,
        verified: engager.verified,
        user_id: engager.user_id,
        tweetIds: new Set(engager.tweet_ids || [])
      });
    }
  }
  return { previous, engagerMap };
};

/**
 * Marks any `processing` record older than STALE_PROCESSING_MINUTES as failed.
 * Guards against a crashed/killed background job leaving the single-flight
 * lock stuck forever.
 */
const cleanupEngagerAnalysisState = async () => {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000);
  await EngagerAnalysis.updateMany(
    { status: 'processing', analyzed_at: { $lt: cutoff } },
    { status: 'failed', error: 'Timed out (stale processing record)' }
  );

  // Bogus records (handle is actually a raw id, no data ever collected) —
  // safe to drop outright rather than let them clutter the accounts list.
  await EngagerAnalysis.deleteMany({
    handle_lower: { $regex: LIKELY_MACHINE_HANDLE_RE },
    status: { $in: ['failed', 'processing'] },
    tweets_analyzed: 0,
    unique_retweeters: 0,
    total_retweet_events: 0
  });
};

/**
 * Validates the request and either reuses/creates a `processing` record, or
 * reports why it can't start (another handle already processing).
 * Does NOT run the actual fetch — call executeAnalysisWork after this
 * resolves with status 'started'.
 */
const prepareAnalysisRecord = async (handle, periodDays = 30, sourceId = null) => {
  const cleanHandle = normalizeHandle(handle);
  if (!cleanHandle || !/^[A-Za-z0-9_]{1,15}$/.test(cleanHandle)) {
    return { status: 'invalid', message: 'Invalid X handle' };
  }
  const handleLower = cleanHandle.toLowerCase();

  await cleanupEngagerAnalysisState();

  const anyProcessing = await EngagerAnalysis.findOne({ status: 'processing' });
  if (anyProcessing && anyProcessing.handle_lower !== handleLower) {
    return { status: 'blocked', blocked_by: anyProcessing.handle, message: `Analysis already running for @${anyProcessing.handle}` };
  }
  if (anyProcessing && anyProcessing.handle_lower === handleLower) {
    return { status: 'already_processing', handle: cleanHandle, analysisId: anyProcessing.id };
  }

  // Reuse the best existing record for this handle (prefer the last
  // completed one, so its history seeds the new run) instead of creating a
  // new row every time — and clean up any duplicates already sitting around
  // from before this de-dupe existed.
  const allRecords = await EngagerAnalysis.find({ handle_lower: handleLower }).sort({ analyzed_at: -1 });
  let record;
  if (allRecords.length > 0) {
    record = allRecords.find((r) => r.status === 'completed') || allRecords[0];
    const toDelete = allRecords.filter((r) => r.id !== record.id);
    if (toDelete.length > 0) {
      await EngagerAnalysis.deleteMany({ id: { $in: toDelete.map((r) => r.id) } });
    }
    record.status = 'processing';
    record.analyzed_at = new Date();
    record.period_days = periodDays;
    if (sourceId) record.source_id = sourceId;
    record.error = null;
    await record.save();
  } else {
    record = await EngagerAnalysis.create({
      id: uuidv4(),
      handle: cleanHandle,
      handle_lower: handleLower,
      source_id: sourceId,
      period_days: periodDays,
      status: 'processing',
      analyzed_at: new Date()
    });
  }

  return { status: 'started', handle: cleanHandle, analysisId: record.id };
};

/**
 * Does the actual work: fetch tweets, fetch retweeters for the top ones,
 * classify engagers, merge with prior history for this handle, save.
 * Intended to be invoked without awaiting from the route handler (fire and
 * forget) — callers poll GET /engager-analysis-all or /latest for progress.
 */
const executeAnalysisWork = async (analysisId, handle, periodDays = 30) => {
  const cleanHandle = normalizeHandle(handle);
  const handleLower = cleanHandle.toLowerCase();

  // Give this interactively-triggered analysis priority over the grievance
  // fetch / source monitor background loops for the shared RapidAPI key.
  beginInteractivePriority();
  try {
    const sinceDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const tweets = await fetchAllUserTweetsSince(cleanHandle, { sinceDate, maxTweets: MAX_TWEETS_TO_FETCH });

    // fetchAllUserTweetsSince swallows its own errors and returns [] rather
    // than throwing — without this check, a resolution/fetch failure was
    // silently saved as a "completed" analysis with 0 tweets and 0 engagers
    // instead of surfacing as a failure the user could see and retry.
    if (!tweets || tweets.length === 0) {
      await EngagerAnalysis.findOneAndUpdate(
        { id: analysisId },
        { status: 'failed', error: 'Could not fetch tweets for this handle — it may be private, suspended, or unresolvable.' }
      );
      console.warn(`[EngagerAnalysis] No tweets found for @${cleanHandle}`);
      return;
    }

    const topTweets = [...tweets]
      .sort((a, b) => (Number(b.metrics?.retweet) || 0) - (Number(a.metrics?.retweet) || 0))
      .slice(0, MAX_TWEETS_FOR_RETWEETERS);

    // Seed from the latest completed analysis for this handle so repeated
    // runs accumulate history instead of losing it.
    const { engagerMap } = await seedEngagerMapFromPrevious(handleLower);

    const retweetersFoundByTweetId = new Map();
    await runWithConcurrency(topTweets, RETWEETER_FETCH_CONCURRENCY, async (tweet) => {
      // Bail out if this run got reaped by cleanupEngagerAnalysisState (stale
      // timeout) while still in flight — no point burning more API quota on
      // a job the UI has already given up on.
      const still = await EngagerAnalysis.exists({ id: analysisId, status: 'processing' });
      if (!still) return;
      await fetchRetweetersForTweetIntoMap(tweet.id, engagerMap, retweetersFoundByTweetId);
    });

    const tweetsAnalyzedCount = topTweets.length;
    const summary = { 'super-active': 0, regular: 0, occasional: 0, 'one-time': 0 };

    const engagers = Array.from(engagerMap.values()).map((e) => {
      const tweetIdsArr = Array.from(e.tweetIds);
      const frequency = classifyFrequency(tweetIdsArr.length, tweetsAnalyzedCount);
      summary[frequency] += 1;
      return {
        handle: e.handle,
        name: e.name,
        avatar: e.avatar,
        verified: e.verified,
        user_id: e.user_id,
        tweets_retweeted: tweetIdsArr.length,
        tweet_ids: tweetIdsArr,
        frequency
      };
    }).sort((a, b) => {
      const orderDiff = FREQUENCY_ORDER[a.frequency] - FREQUENCY_ORDER[b.frequency];
      if (orderDiff !== 0) return orderDiff;
      return b.tweets_retweeted - a.tweets_retweeted;
    });

    const totalRetweetEvents = engagers.reduce((sum, e) => sum + e.tweets_retweeted, 0);

    // Don't resurrect a run that cleanupEngagerAnalysisState already reaped
    // as stale — the UI has moved on and may have started a new run for a
    // different handle under the (now-freed) single-flight lock.
    const stillProcessing = await EngagerAnalysis.exists({ id: analysisId, status: 'processing' });
    if (!stillProcessing) {
      console.warn(`[EngagerAnalysis] @${cleanHandle} finished after being reaped as stale — discarding result`);
      return;
    }

    await EngagerAnalysis.findOneAndUpdate(
      { id: analysisId },
      {
        status: 'completed',
        analyzed_at: new Date(),
        tweets_analyzed: tweetsAnalyzedCount,
        total_retweet_events: totalRetweetEvents,
        unique_retweeters: engagers.length,
        summary,
        engagers,
        tweets: topTweets.map((t) => ({
          id: t.id,
          text: t.text,
          url: t.url,
          created_at: t.created_at,
          retweet_count: Number(t.metrics?.retweet) || 0,
          retweeters_found: retweetersFoundByTweetId.get(t.id) || 0
        }))
      }
    );

    console.log(`[EngagerAnalysis] Completed @${cleanHandle}: ${engagers.length} unique engagers across ${tweetsAnalyzedCount} tweets`);
  } catch (error) {
    console.error(`[EngagerAnalysis] Failed for @${cleanHandle}:`, error.message);
    await EngagerAnalysis.findOneAndUpdate({ id: analysisId }, { status: 'failed', error: error.message });
  } finally {
    endInteractivePriority();
  }
};

/**
 * Resolves an Alert -> its author handle + the specific tweet it's about,
 * using our own stored Content doc (avoids an extra external API call just
 * for text/url/retweet-count metadata we already have).
 */
const resolveTweetSnapshotFromAlert = async (alertId) => {
  const alert = await Alert.findOne({ id: alertId });
  if (!alert) return { error: 'not_found', message: 'Alert not found' };
  if (alert.platform !== 'x') {
    return { error: 'unsupported_platform', message: 'Frequent Engagers is only available for X/Twitter posts' };
  }

  const handle = normalizeHandle(alert.author_handle);
  if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    return { error: 'invalid', message: 'Alert has no valid author handle' };
  }

  const content = await Content.findOne({
    $or: [{ id: alert.content_id }, { content_id: alert.content_id }]
  });

  const tweet = {
    id: content?.content_id || alert.content_id,
    text: content?.text || alert.description || '',
    url: content?.content_url || alert.content_url || '',
    created_at: content?.published_at || alert.created_at,
    retweet_count: Number(content?.engagement?.retweets) || 0
  };
  if (!tweet.id) return { error: 'not_found', message: 'Could not resolve the tweet for this alert' };

  return { handle, tweet, sourceId: alert.source_id || null };
};

/**
 * Prepare-phase for a single-post analysis: resolves the alert to a
 * handle+tweet, then reuses the same single-flight lock as the full-profile
 * scan (one analysis running at a time, keyed by handle).
 */
const preparePostAnalysis = async (alertId) => {
  const resolved = await resolveTweetSnapshotFromAlert(alertId);
  if (resolved.error) return { status: resolved.error, message: resolved.message };

  const prepared = await prepareAnalysisRecord(resolved.handle, 30, resolved.sourceId);
  return { ...prepared, tweet_id: resolved.tweet.id, tweet: prepared.status === 'started' ? resolved.tweet : undefined };
};

/**
 * Does the work for a single-post analysis: fetches retweeters for exactly
 * one tweet and folds them into the same per-handle EngagerAnalysis record
 * used by full-profile scans — so frequency tiers build up across every post
 * of this handle that's ever been analyzed via an alert, without ever
 * fetching the handle's entire timeline.
 */
const executePostAnalysisWork = async (analysisId, handle, tweet) => {
  const cleanHandle = normalizeHandle(handle);
  const handleLower = cleanHandle.toLowerCase();

  beginInteractivePriority();
  try {
    const { previous, engagerMap } = await seedEngagerMapFromPrevious(handleLower);

    const tweetsMap = new Map();
    for (const t of previous?.tweets || []) {
      tweetsMap.set(t.id, { id: t.id, text: t.text, url: t.url, created_at: t.created_at, retweet_count: t.retweet_count });
    }
    tweetsMap.set(tweet.id, tweet);

    await fetchRetweetersForTweetIntoMap(tweet.id, engagerMap);

    const tweetsAnalyzedCount = tweetsMap.size;
    const summary = { 'super-active': 0, regular: 0, occasional: 0, 'one-time': 0 };

    const engagers = Array.from(engagerMap.values()).map((e) => {
      const tweetIdsArr = Array.from(e.tweetIds);
      const frequency = classifyFrequency(tweetIdsArr.length, tweetsAnalyzedCount);
      summary[frequency] += 1;
      return {
        handle: e.handle,
        name: e.name,
        avatar: e.avatar,
        verified: e.verified,
        user_id: e.user_id,
        tweets_retweeted: tweetIdsArr.length,
        tweet_ids: tweetIdsArr,
        frequency
      };
    }).sort((a, b) => {
      const orderDiff = FREQUENCY_ORDER[a.frequency] - FREQUENCY_ORDER[b.frequency];
      if (orderDiff !== 0) return orderDiff;
      return b.tweets_retweeted - a.tweets_retweeted;
    });

    const totalRetweetEvents = engagers.reduce((sum, e) => sum + e.tweets_retweeted, 0);

    await EngagerAnalysis.findOneAndUpdate(
      { id: analysisId },
      {
        status: 'completed',
        analyzed_at: new Date(),
        tweets_analyzed: tweetsAnalyzedCount,
        total_retweet_events: totalRetweetEvents,
        unique_retweeters: engagers.length,
        summary,
        engagers,
        tweets: Array.from(tweetsMap.values())
      }
    );

    console.log(`[EngagerAnalysis] Completed post-analysis for @${cleanHandle} tweet ${tweet.id}: ${engagers.filter(e => e.tweet_ids.includes(tweet.id)).length} retweeters, ${engagers.length} total known engagers`);
  } catch (error) {
    console.error(`[EngagerAnalysis] Post-analysis failed for @${cleanHandle} tweet ${tweet?.id}:`, error.message);
    await EngagerAnalysis.findOneAndUpdate({ id: analysisId }, { status: 'failed', error: error.message });
  } finally {
    endInteractivePriority();
  }
};

const getAllAnalyses = async () => {
  return EngagerAnalysis.aggregate([
    { $sort: { analyzed_at: -1 } },
    { $group: { _id: '$handle_lower', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { analyzed_at: -1 } },
    { $project: { engagers: 0, tweets: 0 } }
  ]);
};

const getLatestAnalysis = async (handle) => {
  const handleLower = normalizeHandle(handle).toLowerCase();
  return EngagerAnalysis.findOne({ handle_lower: handleLower }).sort({ analyzed_at: -1 });
};

const getAnalysisById = async (id) => EngagerAnalysis.findOne({ id });

/**
 * Aggregated engagement ranking across every handle's latest completed
 * analysis. Streams via a cursor (sorted so each handle's docs are
 * adjacent, taking only the first — the latest) instead of materializing
 * every analysis document into memory via .aggregate(), which gets
 * expensive once there are many handles with large engager lists.
 */
const getTopEngagers = async (limit = 50) => {
  const engagerMap = new Map();

  const cursor = EngagerAnalysis.find(
    {},
    { handle_lower: 1, handle: 1, analyzed_at: 1, status: 1, engagers: 1 }
  )
    .sort({ handle_lower: 1, analyzed_at: -1 })
    .lean()
    .cursor();

  let currentHandle = null;
  let consumedForHandle = false;

  for await (const row of cursor) {
    const sourceHandle = normalizeHandle(row?.handle_lower);
    if (!sourceHandle) continue;

    if (sourceHandle !== currentHandle) {
      currentHandle = sourceHandle;
      consumedForHandle = false;
    }
    if (consumedForHandle) continue;
    if (row?.status !== 'completed') continue;
    consumedForHandle = true;

    for (const engager of row.engagers || []) {
      const key = engager.handle.toLowerCase();
      const existing = engagerMap.get(key) || {
        handle: engager.handle,
        name: engager.name,
        avatar: engager.avatar,
        verified: engager.verified,
        total_engagements: 0,
        accounts_engaged: new Set(),
        top_frequency: 'one-time'
      };
      existing.total_engagements += engager.tweets_retweeted;
      existing.accounts_engaged.add(row.handle);
      if (FREQUENCY_ORDER[engager.frequency] < FREQUENCY_ORDER[existing.top_frequency]) {
        existing.top_frequency = engager.frequency;
      }
      engagerMap.set(key, existing);
    }
  }

  return Array.from(engagerMap.values())
    .map((e) => ({
      handle: e.handle,
      name: e.name,
      avatar: e.avatar,
      verified: e.verified,
      total_engagements: e.total_engagements,
      accounts_engaged_count: e.accounts_engaged.size,
      top_frequency: e.top_frequency
    }))
    .sort((a, b) => b.total_engagements - a.total_engagements)
    .slice(0, limit);
};

/** Past runs for one handle (for a history view). */
const getAnalysisHistory = async (handle, limit = 20) => {
  const handleLower = normalizeHandle(handle).toLowerCase();
  if (!handleLower) return [];
  return EngagerAnalysis.find({ handle_lower: handleLower })
    .sort({ analyzed_at: -1 })
    .limit(limit)
    .select('id handle display_name avatar analyzed_at status period_days tweets_analyzed unique_retweeters total_retweet_events summary error')
    .lean();
};

/** Count of analyses currently processing (drives frontend polling indicators). */
const getPendingCount = async () => {
  await cleanupEngagerAnalysisState();
  return EngagerAnalysis.countDocuments({ status: 'processing' });
};

/**
 * Finds monitored X sources that haven't been analyzed in the cooldown
 * window and starts (at most) one analysis, respecting the single-flight
 * lock. Not wired into a scheduler by default — call on demand or from an
 * operator-triggered cron if desired.
 */
const autoQueueNewHandles = async () => {
  await cleanupEngagerAnalysisState();

  const alreadyProcessing = await EngagerAnalysis.findOne({ status: 'processing' });
  if (alreadyProcessing) {
    return { queued: false, reason: `Already processing @${alreadyProcessing.handle}` };
  }

  const cooldownCutoff = new Date(Date.now() - AUTO_QUEUE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const sources = await Source.find({ platform: 'x', is_active: true });

  for (const source of sources) {
    const handle = normalizeHandle(source.identifier);
    if (!handle) continue;

    const latest = await getLatestAnalysis(handle);
    if (latest && latest.analyzed_at > cooldownCutoff && latest.status !== 'failed') continue;

    const prepared = await prepareAnalysisRecord(handle, 30, source.id);
    if (prepared.status === 'started') {
      executeAnalysisWork(prepared.analysisId, handle, 30);
      return { queued: true, handle };
    }
  }

  return { queued: false, reason: 'No handles due for re-analysis' };
};

/**
 * Distinct X handles seen as the author of an Alert — used by the Alerts
 * page to bulk-queue Frequent Engagers analyses without typing each handle
 * in by hand.
 */
const getDistinctAlertHandles = async () => {
  const raw = await Alert.distinct('author_handle', {
    platform: 'x',
    author_handle: { $nin: [null, '', 'unknown'] }
  });

  const seen = new Map();
  for (const value of raw) {
    const clean = normalizeHandle(value);
    if (!clean || !/^[A-Za-z0-9_]{1,15}$/.test(clean)) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  }

  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
};

module.exports = {
  prepareAnalysisRecord,
  executeAnalysisWork,
  preparePostAnalysis,
  executePostAnalysisWork,
  cleanupEngagerAnalysisState,
  getAllAnalyses,
  getLatestAnalysis,
  getAnalysisById,
  getAnalysisHistory,
  getPendingCount,
  getTopEngagers,
  autoQueueNewHandles,
  getDistinctAlertHandles
};
