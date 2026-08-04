/**
 * targetRelevanceFilterService
 * ─────────────────────────────────────────────────────────────────────
 * Fast single-pass relevance gate that decides whether a post is about the
 * client leadership — CM A. Revanth Reddy, Deputy CM Bhatti Vikramarka and
 * the immediate INC Telangana machinery around them.
 *
 * Heuristic first; ambiguous text falls through to an LLM via `llmProvider`.
 *
 * Unlike the AP-era implementation this replaces, the token lists are NOT
 * hardcoded — they are derived from `politicalEntities`, which is itself
 * derived from `politicalData`. Adding a minister to the roster therefore
 * widens this filter automatically instead of silently leaving it stale.
 *
 * Input  : raw post text (string)
 * Output : {
 *            is_relevant: boolean,
 *            confidence:  number 0..1,
 *            stance:      'positive' | 'negative' | 'neutral' | 'unknown',
 *            topic:       short string  (e.g. "Rythu Bharosa", "loan waiver"),
 *            reason:      one-line natural-language explanation,
 *            target:      'primary' | 'secondary' | 'party' | 'unrelated',
 *          }
 *
 * If the LLM is unreachable or returns garbage we fall back to the heuristic,
 * so the pipeline keeps producing data even when the provider is down.
 */

const { chatJson } = require('./llmProvider');
const {
  POLITICAL_ENTITIES,
  PRIMARY_TARGET_KEY,
  SECONDARY_TARGET_KEY,
} = require('../config/politicalEntities');
const { OUR_PARTY, OPPOSITION_PARTIES } = require('../config/politicalData');

const LLM_TIMEOUT = parseInt(process.env.TARGET_FILTER_TIMEOUT_MS || '20000', 10);

const TARGET_ENUM = ['primary', 'secondary', 'party', 'unrelated'];
const STANCE_ENUM = ['positive', 'negative', 'neutral', 'unknown'];

/* ─── heuristic tokens, derived from the entity graph ──────────────
 * HARD  — naming the CM or Deputy CM is unambiguous relevance.
 * SOFT  — the party or a cabinet minister; relevant in context, but a post
 *         mentioning only these may be generic state politics, so it goes to
 *         the LLM rather than being auto-accepted.
 */

const aliasesOf = (key) =>
  (POLITICAL_ENTITIES[key]?.aliases || []).map((a) => a.toLowerCase());

const HARD_TARGET_TOKENS = [
  ...new Set([
    ...aliasesOf(PRIMARY_TARGET_KEY),
    ...aliasesOf(SECONDARY_TARGET_KEY),
    '#revanthreddy', '#cmrevanthreddy', '#telanganacm',
  ]),
];

const SOFT_TARGET_TOKENS = [
  ...new Set([
    ...aliasesOf(OUR_PARTY.id),
    // Cabinet ministers: relevant, but weaker evidence than the CM himself.
    ...Object.entries(POLITICAL_ENTITIES)
      .filter(([key, ent]) =>
        ent.alignment === 'ally' &&
        ent.type === 'person' &&
        key !== PRIMARY_TARGET_KEY &&
        key !== SECONDARY_TARGET_KEY &&
        (ent.role || '').toLowerCase().includes('minister'))
      .flatMap(([, ent]) => (ent.aliases || []).map((a) => a.toLowerCase())),
    // State-government context that reliably co-occurs with the leadership.
    'telangana government', 'telangana cm', 'ts government', 'tg government',
    'telangana cabinet', 'praja palana', 'six guarantees', 'six guarantee',
    'తెలంగాణ ప్రభుత్వం', 'ప్రజాపాలన',
  ]),
];

/**
 * Short tokens would match inside unrelated words ("inc" in "incident"), and
 * this gate runs on every ingested post, so anything under 5 characters is
 * dropped rather than boundary-checked.
 */
const isUsableToken = (t) => t.length >= 5;

const HARD_TOKENS = HARD_TARGET_TOKENS.filter(isUsableToken);
const SOFT_TOKENS = SOFT_TARGET_TOKENS.filter(isUsableToken);

function heuristicMatch(text) {
  const lower = String(text || '').toLowerCase();
  for (const t of HARD_TOKENS) {
    if (lower.includes(t)) return { matched: true, strength: 'hard', token: t };
  }
  for (const t of SOFT_TOKENS) {
    if (lower.includes(t)) return { matched: true, strength: 'soft', token: t };
  }
  return { matched: false };
}

/** Which of the two leaders a hard match landed on. */
const resolveHardTarget = (text) => {
  const lower = String(text || '').toLowerCase();
  const secondaryHit = aliasesOf(SECONDARY_TARGET_KEY)
    .filter(isUsableToken)
    .some((a) => lower.includes(a));
  return secondaryHit ? 'secondary' : 'primary';
};

/* ─── LLM gate ─────────────────────────────────────────────────── */

const oppositionSummary = OPPOSITION_PARTIES
  .map((p) => `${p.name} (${p.leaders.map((l) => l.shortName).slice(0, 3).join(', ')})`)
  .join('; ');

async function askLLM(postText) {
  const prompt = `You are filtering social-media posts for an ${OUR_PARTY.full_name} (${OUR_PARTY.name}) media-monitoring system in ${OUR_PARTY.state}.

The primary subject is ${POLITICAL_ENTITIES[PRIMARY_TARGET_KEY].canonical}, ${POLITICAL_ENTITIES[PRIMARY_TARGET_KEY].role}.
The secondary subject is ${POLITICAL_ENTITIES[SECONDARY_TARGET_KEY].canonical}, ${POLITICAL_ENTITIES[SECONDARY_TARGET_KEY].role}.
${OUR_PARTY.name} is the ${OUR_PARTY.role} party in ${OUR_PARTY.state}. The opposition is: ${oppositionSummary}.

POST (verbatim, may be English / Telugu / Hindi / Urdu or transliterated):
"""
${String(postText || '').slice(0, 800)}
"""

Decide whether this post is meaningfully about the ${OUR_PARTY.state} Chief Minister, the Deputy Chief
Minister, or the immediate ${OUR_PARTY.name} state machinery around them. A post that merely mentions
${OUR_PARTY.state} politics generically is NOT relevant. A post that targets, defends, mocks, praises, or
reports on the ${OUR_PARTY.name} leadership IS relevant — including opposition attacks on them.

Map the "target" field: "primary" = the Chief Minister, "secondary" = the Deputy Chief Minister,
"party" = ${OUR_PARTY.name} / state-government machinery, "unrelated" = none of these.

Reply with EXACTLY one JSON object on a single line, no prose, no markdown:
{"is_relevant": true|false, "confidence": 0.0-1.0, "stance": "positive"|"negative"|"neutral"|"unknown", "target": "primary"|"secondary"|"party"|"unrelated", "topic": "short label", "reason": "one short sentence"}`;

  try {
    return await chatJson({
      prompt,
      temperature: 0.1,
      maxTokens: 400,
      timeoutMs: LLM_TIMEOUT,
    });
  } catch (err) {
    return { __error: err.message || 'llm call failed' };
  }
}

/* ─── public API ─────────────────────────────────────────────── */

async function checkRelevance(postText, { allowLLM = true } = {}) {
  const text = String(postText || '').trim();
  if (!text) {
    return {
      is_relevant: false, confidence: 0, stance: 'unknown',
      target: 'unrelated', topic: '', reason: 'empty text',
    };
  }

  // 1. Heuristic fast-path — naming the leadership needs no LLM.
  const heur = heuristicMatch(text);
  if (heur.matched && heur.strength === 'hard') {
    return {
      is_relevant: true,
      confidence: 0.95,
      stance: 'unknown',
      target: resolveHardTarget(text),
      topic: 'name match',
      reason: `Matched token "${heur.token}"`,
      heuristic: true,
    };
  }

  // 2. LLM gate (skippable for speed-only runs).
  if (!allowLLM) {
    return heur.matched
      ? { is_relevant: true, confidence: 0.55, stance: 'unknown', target: 'party', topic: 'soft match', reason: `Soft token "${heur.token}"`, heuristic: true }
      : { is_relevant: false, confidence: 0.05, stance: 'unknown', target: 'unrelated', topic: '', reason: 'no token, llm skipped', heuristic: true };
  }

  const llm = await askLLM(text);
  if (!llm || llm.__error) {
    // Fall back to the heuristic so ingestion keeps working when the LLM is down.
    return heur.matched
      ? { is_relevant: true, confidence: 0.5, stance: 'unknown', target: 'party', topic: 'soft match (llm down)', reason: `LLM unreachable; soft heuristic on "${heur.token}"`, heuristic: true, llm_error: llm?.__error }
      : { is_relevant: false, confidence: 0.1, stance: 'unknown', target: 'unrelated', topic: '', reason: 'no match + llm unreachable', heuristic: true, llm_error: llm?.__error };
  }

  // Sanitise LLM output.
  return {
    is_relevant: !!llm.is_relevant,
    confidence: Math.max(0, Math.min(1, Number(llm.confidence) || 0)),
    stance: STANCE_ENUM.includes(llm.stance) ? llm.stance : 'unknown',
    target: TARGET_ENUM.includes(llm.target) ? llm.target : 'unrelated',
    topic: String(llm.topic || '').slice(0, 80),
    reason: String(llm.reason || '').slice(0, 200),
    heuristic: false,
  };
}

module.exports = {
  checkRelevance,
  heuristicMatch,
  HARD_TOKENS,
  SOFT_TOKENS,
  TARGET_ENUM,
};
