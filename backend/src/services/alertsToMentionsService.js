/**
 * alertsToMentionsService
 * ───────────────────────────────────────────────────────────────────────
 * Alerts → Mentions promotion pipeline.
 *
 *   Alerts (DB)  ──►  target relevance gate  ──►  Mentions (Grievances)
 *
 * For every Alert that has not yet been evaluated by the relevance gate, this
 * service:
 *
 *   1. Resolves the alert's underlying text + media + author (joining
 *      Content / Source as needed).
 *   2. Runs the resolved text through `targetRelevanceFilterService.checkRelevance`,
 *      which uses a heuristic short-circuit and falls through to a RapidAPI
 *      ChatGPT-42 JSON gate for ambiguous text.
 *   3. If the gate marks `is_relevant=true` with confidence ≥ MIN_CONFIDENCE,
 *      the alert is promoted to the Grievance (Mentions) collection via
 *      the shared `createGrievanceFromPost` helper — so the promoted record
 *      flows through the same downstream analysis as anything else in
 *      Mentions (location extraction, complaint code, workflow init, …).
 *   4. The alert is stamped with `relevance_pipeline.processed=true` plus the
 *      gate verdict (decision, target, stance, topic, confidence, reason).
 *      This stamp is the only idempotency marker — the service is safe to
 *      run repeatedly.
 *
 * The service is invoked from:
 *   • the in-process scheduler in `src/index.js` (every 15 min)
 *   • the CLI runner `scripts/alerts_to_mentions.js` (cron / manual)
 *   • the authenticated HTTP route `POST /api/grievances/intake-from-alerts`
 *
 * All three call `runBatch(opts)`.
 */
const Alert = require('../models/Alert');
const Content = require('../models/Content');
const Source = require('../models/Source');
const Grievance = require('../models/Grievance');
const { checkRelevance } = require('./targetRelevanceFilterService');
const { createGrievanceFromPost } = require('./grievanceService');

const MIN_CONFIDENCE = Number(process.env.ALERT_PROMOTE_MIN_CONF || 0.25);
const DEFAULT_BATCH  = Number(process.env.ALERT_PROMOTE_BATCH    || 200);

/* ─── helpers ─────────────────────────────────────────────────────── */

const norm = (v) => (v == null ? '' : String(v));

/**
 * Build the canonical tweet_id used to de-dup the alert-derived Grievance
 * against the existing collection. Uses the alert's id when present so a
 * single alert maps to a single grievance regardless of replays.
 */
const canonicalIdForAlert = (alert) => `alert:${alert.id || alert._id}`;

/**
 * Find the text that the relevance gate should evaluate. Prefer the full Content
 * document text, then the alert's own description (set on creation when no
 * Content row exists), then any cached llm_analysis.summary as a last resort.
 */
const resolveCandidateText = (alert, content) => {
    const candidates = [
        content?.text,
        content?.scraped_content,
        alert?.description,
        alert?.title,
        alert?.llm_analysis?.summary,
        alert?.llm_analysis?.text
    ];
    for (const c of candidates) {
        const s = norm(c).trim();
        if (s.length >= 5) return s;
    }
    return '';
};

/**
 * Build the post-shaped object expected by `createGrievanceFromPost`. The
 * Grievance pipeline already knows how to ingest this shape — keeping the
 * same contract means downstream analysis, media archival, complaint-code
 * generation, etc. all light up automatically.
 */
const buildPostFromAlert = (alert, content, source, relevance) => {
    const platform = alert.platform || content?.platform || 'x';
    const handle = alert.author_handle
        || content?.author_handle
        || source?.identifier
        || norm(alert.author).toLowerCase().replace(/\s+/g, '_')
        || 'x_user';
    const displayName = alert.author
        || content?.author
        || source?.display_name
        || handle;

    return {
        tweet_id: canonicalIdForAlert(alert),
        text: resolveCandidateText(alert, content) || norm(alert.title),
        url: alert.content_url || content?.content_url || '',
        created_at: alert.created_at || content?.published_at || new Date(),
        author: {
            handle,
            display_name: displayName,
            profile_image_url: content?.original_author_avatar || source?.profile_image_url || '',
            is_verified: !!(source?.is_verified || content?.is_verified),
            follower_count: source?.statistics?.subscriber_count || 0
        },
        media: Array.isArray(content?.media) ? content.media : [],
        engagement: {
            likes:    content?.engagement?.likes    || 0,
            retweets: content?.engagement?.retweets || 0,
            replies:  content?.engagement?.replies  || 0,
            views:    content?.engagement?.views    || 0,
            quotes:   content?.engagement?.quotes   || 0
        },
        relevance_pipeline: {
            source: 'alerts_to_mentions',
            alert_id: alert.id,
            intake_tag: `alert:${alert.id}`,
            relevance
        }
    };
};

/**
 * Stamp the pipeline verdict on the Alert. We always set `processed=true`
 * so the next batch run never reconsiders the same alert.
 */
const stampAlert = async (alertId, patch) => {
    await Alert.updateOne(
        { id: alertId },
        {
            $set: {
                relevance_pipeline: {
                    processed: true,
                    processed_at: new Date(),
                    ...patch
                }
            }
        }
    );
};

/* ─── core: process a single alert ────────────────────────────────── */

/**
 * Evaluate one alert through the relevance gate and (if relevant) promote it to
 * Mentions. Returns a small result envelope describing what happened.
 *
 *   { decision: 'promoted' | 'rejected' | 'skipped' | 'error',
 *     grievance_id?, relevance?, error? }
 */
const processAlert = async (alert, { dryRun = false, allowLLM = true } = {}) => {
    if (!alert) return { decision: 'skipped', reason: 'no alert' };
    if (alert.relevance_pipeline?.processed) {
        return { decision: 'skipped', reason: 'already processed' };
    }

    // Pull joined Content + Source so the text passed to the gate is as
    // rich as possible (alerts often only store a short description).
    let content = null;
    let source = null;
    try {
        if (alert.content_id) {
            content = await Content.findOne({ id: alert.content_id }).lean();
        }
        if (alert.source_id) {
            source = await Source.findOne({ id: alert.source_id }).lean();
        }
    } catch (_) { /* keep going with whatever we have */ }

    const candidateText = resolveCandidateText(alert, content);
    if (!candidateText) {
        if (!dryRun) {
            await stampAlert(alert.id, {
                decision: 'rejected',
                reason: 'no candidate text resolvable from alert/content'
            });
        }
        return { decision: 'rejected', reason: 'empty text' };
    }

    // Run the gate.
    let relevance;
    try {
        relevance = await checkRelevance(candidateText, { allowLLM });
    } catch (err) {
        return { decision: 'error', error: err.message || 'gate failed' };
    }

    const passes = !!relevance?.is_relevant && Number(relevance.confidence || 0) >= MIN_CONFIDENCE;

    if (!passes) {
        if (!dryRun) {
            await stampAlert(alert.id, {
                decision: 'rejected',
                confidence: relevance?.confidence ?? null,
                stance:     relevance?.stance     ?? null,
                target:     relevance?.target     ?? null,
                topic:      relevance?.topic      ?? null,
                reason:     relevance?.reason     ?? 'below confidence threshold',
                heuristic:  !!relevance?.heuristic
            });
        }
        return { decision: 'rejected', relevance };
    }

    if (dryRun) {
        return { decision: 'promoted', relevance, dryRun: true };
    }

    // De-dup against an existing grievance for this alert (idempotent retry).
    const canonicalId = canonicalIdForAlert(alert);
    const already = await Grievance.findOne({ tweet_id: canonicalId }).select('id').lean();
    if (already) {
        await stampAlert(alert.id, {
            decision: 'promoted',
            grievance_id: already.id,
            confidence: relevance.confidence,
            stance: relevance.stance,
            target: relevance.target,
            topic: relevance.topic,
            reason: relevance.reason,
            heuristic: !!relevance.heuristic
        });
        return { decision: 'promoted', grievance_id: already.id, relevance, deduped: true };
    }

    // Promote.
    const post = buildPostFromAlert(alert, content, source, relevance);
    let created;
    try {
        created = await createGrievanceFromPost(post, post.author?.handle ? (alert.platform || 'x') : 'x', `alert:${alert.id}`);
    } catch (err) {
        return { decision: 'error', error: err.message || 'createGrievanceFromPost failed' };
    }

    await stampAlert(alert.id, {
        decision: 'promoted',
        grievance_id: created?.id || null,
        confidence: relevance.confidence,
        stance: relevance.stance,
        target: relevance.target,
        topic: relevance.topic,
        reason: relevance.reason,
        heuristic: !!relevance.heuristic
    });

    return { decision: 'promoted', grievance_id: created?.id || null, relevance };
};

/* ─── core: batch runner ──────────────────────────────────────────── */

/**
 * Run the pipeline over the next `limit` unprocessed alerts.
 *
 *   opts:
 *     limit       — max alerts to evaluate this run (default 50)
 *     since       — Date; restricts to alerts created on/after this point
 *     status      — only alerts with this status (default: any)
 *     platform    — only alerts from this platform (e.g. 'x')
 *     dryRun      — don't write anything; just return verdicts
 *     allowLLM    — pass false to use heuristic-only mode (no RapidAPI call)
 *
 * Returns a `stats` envelope identical in shape to relevance_pipeline.
 */
const runBatch = async (opts = {}) => {
    const {
        limit       = DEFAULT_BATCH,
        since       = null,
        status      = null,
        platform    = null,
        dryRun      = false,
        allowLLM = true
    } = opts;

    const query = { 'relevance_pipeline.processed': { $ne: true } };
    if (status)   query.status = status;
    if (platform) query.platform = platform;
    if (since)    query.created_at = { $gte: new Date(since) };

    const alerts = await Alert.find(query)
        .sort({ created_at: -1, id: -1 })
        .limit(limit)
        .lean();

    const stats = {
        scanned:    alerts.length,
        promoted:   0,
        rejected:   0,
        skipped:    0,
        errors:     0,
        by_target:  { primary: 0, secondary: 0, party: 0, unrelated: 0 },
        by_stance:  { positive: 0, negative: 0, neutral: 0, unknown: 0 },
        sample:     []
    };

    for (const a of alerts) {
        try {
            const result = await processAlert(a, { dryRun, allowLLM });
            if (result.decision === 'promoted') {
                stats.promoted += 1;
                const tgt = result.relevance?.target || 'unrelated';
                const stn = result.relevance?.stance || 'unknown';
                stats.by_target[tgt] = (stats.by_target[tgt] || 0) + 1;
                stats.by_stance[stn] = (stats.by_stance[stn] || 0) + 1;
                if (stats.sample.length < 10) {
                    stats.sample.push({
                        alert_id: a.id,
                        decision: 'promoted',
                        grievance_id: result.grievance_id || null,
                        target: tgt,
                        stance: stn,
                        confidence: result.relevance?.confidence ?? null
                    });
                }
            } else if (result.decision === 'rejected') {
                stats.rejected += 1;
            } else if (result.decision === 'error') {
                stats.errors += 1;
            } else {
                stats.skipped += 1;
            }
        } catch (err) {
            stats.errors += 1;
        }
    }

    return stats;
};

module.exports = {
    processAlert,
    runBatch,
    canonicalIdForAlert,
    MIN_CONFIDENCE
};
