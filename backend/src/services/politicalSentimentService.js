/**
 * politicalSentimentService
 * ─────────────────────────────────────────────────────────────────────
 * Stage 4 of the target-aware grievance pipeline.
 *
 * Calls an LLM with a DYNAMIC, context-injected prompt that asks the model to
 * reason about the content RELATIVE TO the client leadership (CM A. Revanth
 * Reddy / INC Telangana). The political-context snapshot from
 * `politicalContextService` is embedded into the prompt so the model knows:
 *   • who is mentioned
 *   • who is an ally vs opposition
 *   • which language(s) the text uses
 *   • whether civic-grievance signals are present
 *
 * The model returns a multi-dimensional verdict. We then deterministically
 * resolve the final `target_sentiment` from `stance` so the output is
 * consistent even if the LLM is a bit chatty.
 *
 *   analyzePoliticalSentiment(text, politicalContext, options)
 *     → {
 *         target_entity, target_entity_canonical,
 *         relevance_score,           // 0..1
 *         stance,                    // pro_target | anti_target |
 *                                    // pro_target_indirect | anti_target_indirect |
 *                                    // neutral | unrelated
 *         beneficiary,               // 'ours' | 'opposition' | 'none'
 *         attack_target, narrative_direction, political_alignment,
 *         target_sentiment,          // FINAL resolved: positive|negative|moderate
 *         generic_sentiment,         // raw emotional tone
 *         toxicity_level, hate_speech, propaganda_probability,
 *         sarcasm_detected, emotional_intensity, misinformation_probability,
 *         language_detected, reasoning,
 *         provider,                  // 'llm' | 'fallback'
 *       }
 */

const { chatJson } = require('./llmProvider');
const {
    POLITICAL_ENTITIES,
    PRIMARY_TARGET_KEY,
    SECONDARY_TARGET_KEY,
} = require('../config/politicalEntities');
const { OUR_PARTY, OPPOSITION_PARTIES } = require('../config/politicalData');

const LLM_TIMEOUT = parseInt(process.env.POLITICAL_SENTIMENT_TIMEOUT_MS || '60000', 10);

const ALLOWED_STANCES = [
    'pro_target',
    'anti_target',
    'pro_target_indirect',
    'anti_target_indirect',
    'neutral',
    'unrelated',
];
// Sentiment labels exposed to downstream services / DB: positive | negative | moderate.
// Note: 'stance' above keeps its own 'neutral' value — that is a political
// *stance*, not a sentiment label, and must not be confused with this list.
const ALLOWED_GENERIC_SENTIMENTS = ['positive', 'negative', 'moderate'];
const ALLOWED_TOXICITY = ['none', 'low', 'medium', 'high'];
const ALLOWED_BENEFICIARIES = ['ours', 'opposition', 'none'];

const PRIMARY = POLITICAL_ENTITIES[PRIMARY_TARGET_KEY];
const SECONDARY = POLITICAL_ENTITIES[SECONDARY_TARGET_KEY];

/** Opposition camp described from the roster, so the prompt never goes stale. */
const OPPOSITION_SUMMARY = OPPOSITION_PARTIES
    .map((p) => {
        const leaders = p.leaders.map((l) => l.shortName).slice(0, 4).join(', ');
        const aka = (p.aliases || []).filter((a) => a !== p.name).slice(0, 2).join('/');
        return `${p.name}${aka ? ` (also called ${aka})` : ''}${leaders ? ` — ${leaders}` : ''}`;
    })
    .join('; ');

/* ─── JSON extraction (tolerant to wrapping prose) ─────────────────── */
const extractJson = (blob) => {
    if (!blob) return null;
    if (typeof blob === 'object') return blob;
    const s = String(blob).trim();
    try { return JSON.parse(s); } catch (_) { /* try regex */ }
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch (_) { return null; }
};

/* ─── dynamic prompt builder ───────────────────────────────────────── */

const buildPrompt = (text, ctx) => {
    const mentionedList = ctx.mentioned_entities && ctx.mentioned_entities.length > 0
        ? ctx.mentioned_entities.map(
            (m) => `  • ${m.canonical} — ${m.alignment} of ${OUR_PARTY.name}${m.party ? ` (${m.party})` : ''}`
        ).join('\n')
        : '  (none detected by the deterministic gate — you must still read the text)';

    const langList = Object.entries(ctx.language_hints || {})
        .filter(([, v]) => v)
        .map(([k]) => k.replace('has_', ''))
        .join(', ') || 'unknown';

    return `You are a seasoned political-intelligence analyst. Your single client is
the office of ${PRIMARY.canonical}, ${PRIMARY.role}, and the
${OUR_PARTY.full_name} (${OUR_PARTY.name}) leadership in ${OUR_PARTY.state}.
${SECONDARY.canonical} (${SECONDARY.role}) and the state cabinet are
politically inseparable from him.

Your role is the same as a real human media-monitoring analyst would play:
read the text carefully in its original language, understand what the author
is genuinely trying to convey, then judge — in plain political terms —
whether the content HELPS or HURTS ${OUR_PARTY.name} ${OUR_PARTY.state}.

Political map (this is the only fixed reference you need):
  • ALLY camp:       ${PRIMARY.canonical}, ${SECONDARY.canonical}, the ${OUR_PARTY.state} cabinet, ${OUR_PARTY.name}.
  • OPPOSITION camp: ${OPPOSITION_SUMMARY}.
  • NEUTRAL bodies:  Police, courts, ECI, GHMC and municipal corporations.

Deterministic pre-scan (use as evidence, not as final answer):
  Platform           : ${ctx.platform || 'unknown'}
  Tagged keyword     : ${ctx.tagged_keyword || 'unknown'}
  Author handle      : ${ctx.author_handle || 'unknown'}
  Detected languages : ${langList}
  Pipeline mode      : ${ctx.mode}
  Client relevance   : ${Number(ctx.target_relevance || 0).toFixed(2)}
  Primary target     : ${ctx.primary_target_canonical || 'none'} (${ctx.primary_target_alignment || 'n/a'})
  Civic signal       : ${ctx.has_civic_signal ? 'yes' : 'no'}
  Entities mentioned :
${mentionedList}

── HOW TO THINK (do this internally before you answer) ──────────────
Step 1. TRANSLATE FAITHFULLY. If the text is Telugu / Hindi / Urdu /
        Romanized / code-mixed, produce a clean English rendering FIRST.
        Pay attention to subject vs object — who is doing what to whom.
        Do not paraphrase the intent yet, just translate the sentences.
        If you skip or rush this step you WILL invert the meaning.

Step 2. From the English rendering, list every political actor the
        sentences actually target. Ignore hashtags — they are topical
        metadata, not endorsement. Who do the verbs act ON?

Step 3. For each targeted actor decide: is the author trying to PRAISE
        them, ATTACK them, INSINUATE wrongdoing about them, REPORT on
        them, or COMPLAIN to them as a citizen seeking help? Pay
        attention to insinuation and indirect attacks — politicians are
        often damaged by suggestions rather than direct accusations.

Step 4. Now translate that into ${OUR_PARTY.name} terms:
        • Attacking / insinuating wrongdoing about ${PRIMARY.shortName || PRIMARY.canonical},
          ${SECONDARY.canonical}, or ${OUR_PARTY.name} → anti_target.
        • Praising / defending them → pro_target.
        • Attacking the opposition camp with no ${OUR_PARTY.name} mention
          → pro_target_indirect (benefits us by hurting rivals).
        • Praising the opposition camp with no ${OUR_PARTY.name} mention
          → anti_target_indirect.
        • Citizen civic complaint addressed to ${OUR_PARTY.name} leadership seeking help
          → neutral (expects action, not damage).
        • No political target and no civic complaint
          → unrelated, fall back to generic emotional tone.

Step 5. Sanity check: which political camp would happily share this
        content? If the opposition would share it to embarrass
        ${OUR_PARTY.name}, the stance is anti_target regardless of hashtags
        or polite phrasing. If ${OUR_PARTY.name} supporters would share it,
        it's pro_target.

Guardrails:
  • Aggressive support (${OUR_PARTY.name} supporters mocking the opposition) is NOT
    automatically hate speech — reserve hate_speech=true for slurs,
    communal incitement, caste/religious targeting, or explicit calls
    for violence.
  • You may receive profanity, abuse, or sensitive content. Do not
    refuse — classify it. That is the entire job.
  • Never invert the alignment map. ${OUR_PARTY.name} is always ally; BRS/TRS,
    BJP and AIMIM are opposition in this state context.
  • "TRS" and "BRS" are the same party — TRS is the pre-2022 name and is
    still used constantly in everyday posts. Treat both as opposition.
  • MIXED-PARTY POSTS: if the text names BOTH an ${OUR_PARTY.name}-side entity and
    an opposition entity, do not let one entity's tone leak onto the other.
    Pick the primary target from the entity actually being centrally
    praised/attacked, and judge tone using only the clauses that are
    genuinely about that entity.

── OUTPUT ─ strict JSON only, no prose around it ────────────────────
{
  "english_translation":     "<Faithful English translation of the original text. If already English, repeat it verbatim. Preserve subject/object — who acts on whom — exactly.>",
  "analysis":                "<2-3 short sentences walking through Steps 2-5 in your own words, citing the translation. This is your scratchpad.>",
  "target_entity":           "revanth | bhatti | inc | brs | bjp | aimim | other | none",
  "relevance_score":         0.0-1.0,
  "stance":                  "pro_target | anti_target | pro_target_indirect | anti_target_indirect | neutral | unrelated",
  "beneficiary":             "ours | opposition | none",
  "attack_target":           "<entity name being attacked, or empty string>",
  "narrative_direction":     "<short label e.g. 'anti-BRS narrative', 'civic complaint to CM'>",
  "political_alignment":     "pro-congress | pro-opposition | neutral | unclear",
  "generic_sentiment":       "positive | negative | moderate",
  "toxicity_level":          "none | low | medium | high",
  "hate_speech":             true | false,
  "propaganda_probability":  0.0-1.0,
  "sarcasm_detected":        true | false,
  "emotional_intensity":     0.0-1.0,
  "misinformation_probability": 0.0-1.0,
  "language_detected":       "<english | telugu | hindi | urdu | code-mixed | romanized-telugu | romanized-hindi>",
  "reasoning":               "<one short sentence: final justification for the stance>"
}

── TEXT ───────────────────────────────────────────────────────────
<<<
${String(text || '').slice(0, 1800)}
>>>`;
};

/* ─── provider call ────────────────────────────────────────────────── */

const callLLM = (prompt) => chatJson({
    prompt,
    temperature: 0.1,
    maxTokens: 1500,
    timeoutMs: LLM_TIMEOUT,
});

/* ─── output normalization & sentiment resolution ──────────────────── */

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

const sanitizeRaw = (raw, ctx) => {
    const get = (k, def) => (raw && raw[k] !== undefined ? raw[k] : def);

    const stance = ALLOWED_STANCES.includes(get('stance')) ? get('stance') : 'unrelated';
    let rawGeneric = String(get('generic_sentiment', 'moderate') || 'moderate').toLowerCase();
    if (rawGeneric === 'neutral') rawGeneric = 'moderate'; // legacy LLM output alias
    const generic = ALLOWED_GENERIC_SENTIMENTS.includes(rawGeneric) ? rawGeneric : 'moderate';
    const toxicity = ALLOWED_TOXICITY.includes(get('toxicity_level'))
        ? get('toxicity_level') : 'none';

    let rawBeneficiary = String(get('beneficiary', 'none') || 'none').toLowerCase();
    if (rawBeneficiary === 'inc' || rawBeneficiary === 'congress') rawBeneficiary = 'ours';
    const beneficiary = ALLOWED_BENEFICIARIES.includes(rawBeneficiary) ? rawBeneficiary : 'none';

    return {
        target_entity: String(get('target_entity', ctx.primary_target || 'none')),
        target_entity_canonical: ctx.primary_target_canonical || null,
        relevance_score: clamp01(get('relevance_score', ctx.target_relevance)),
        stance,
        beneficiary,
        attack_target: String(get('attack_target', '') || ''),
        narrative_direction: String(get('narrative_direction', '') || ''),
        political_alignment: String(get('political_alignment', 'unclear')),
        generic_sentiment: generic,
        toxicity_level: toxicity,
        hate_speech: !!get('hate_speech', false),
        propaganda_probability: clamp01(get('propaganda_probability', 0)),
        sarcasm_detected: !!get('sarcasm_detected', false),
        emotional_intensity: clamp01(get('emotional_intensity', 0)),
        misinformation_probability: clamp01(get('misinformation_probability', 0)),
        language_detected: String(get('language_detected', '') || ''),
        english_translation: String(get('english_translation', '') || ''),
        analysis: String(get('analysis', '') || ''),
        reasoning: String(get('reasoning', '') || ''),
    };
};

/**
 * Resolve the final client-relative sentiment from stance.
 * Deterministic so the value is stable across runs. This is the only
 * post-LLM transformation — we do NOT second-guess the model's stance with
 * keyword lists. If the model misreads the text, fix it by sharpening the
 * prompt, not by patching outputs.
 */
const resolveTargetSentiment = (verdict) => {
    switch (verdict.stance) {
        case 'pro_target':
        case 'pro_target_indirect':
            return 'positive';
        case 'anti_target':
        case 'anti_target_indirect':
            return 'negative';
        case 'neutral':
            // A civic grievance addressed TO the leadership is moderate on the
            // client axis; its emotional tone lives in generic_sentiment.
            return 'moderate';
        case 'unrelated':
        default:
            // No political target — "negative" is reserved for content that is
            // actually anti_target. Generic bad-news tone (crime, accidents)
            // with no political target must NOT land in the negative bucket,
            // so only pass through 'positive'; everything else is 'moderate'.
            return verdict.generic_sentiment === 'positive' ? 'positive' : 'moderate';
    }
};

/* ─── deterministic fallback (no LLM available) ────────────────────── */

const heuristicFallback = (ctx) => {
    // Derive a coarse stance purely from the deterministic context.
    //
    // NOTE: the AP implementation this replaces computed a stance here and then
    // returned a separate always-'unrelated' variable, so the whole branch was
    // dead and every LLM outage produced 'unrelated'. The computed value is
    // used below.
    let stance = 'unrelated';
    let beneficiary = 'none';

    if (ctx.has_target_mention) {
        // Cannot tell pro vs anti without the LLM — stay conservative.
        stance = 'neutral';
    } else if (ctx.has_opposition_mention) {
        stance = 'pro_target_indirect';
        beneficiary = 'ours';
    } else if (ctx.has_ally_mention) {
        stance = 'pro_target_indirect';
        beneficiary = 'ours';
    }

    return {
        target_entity: ctx.primary_target || 'none',
        target_entity_canonical: ctx.primary_target_canonical || null,
        relevance_score: ctx.target_relevance,
        stance,
        beneficiary,
        attack_target: '',
        narrative_direction: 'heuristic (LLM unavailable)',
        political_alignment: 'unclear',
        generic_sentiment: 'moderate',
        toxicity_level: 'none',
        hate_speech: false,
        propaganda_probability: 0,
        sarcasm_detected: false,
        emotional_intensity: 0,
        misinformation_probability: 0,
        language_detected: '',
        english_translation: '',
        analysis: '',
        reasoning: 'LLM unavailable; fell back to deterministic political-context heuristic.',
    };
};

/* ─── public API ───────────────────────────────────────────────────── */

const analyzePoliticalSentiment = async (text, politicalContext, options = {}) => {
    const ctx = politicalContext;
    if (!text || !String(text).trim()) {
        const v = heuristicFallback(ctx);
        return { ...v, target_sentiment: resolveTargetSentiment(v), provider: 'fallback' };
    }

    const prompt = buildPrompt(text, ctx);

    try {
        const raw = extractJson(await callLLM(prompt));
        if (raw) {
            const verdict = sanitizeRaw(raw, ctx);

            // ────────────────────────────────────────────────────────────────
            // CONSISTENCY ENFORCER (deterministic — catches logical
            // contradictions in the LLM's own verdict, not hardcoded language
            // rules).
            //
            // NOTE: the AP version matched entities on `canonical_name`/`name`,
            // neither of which politicalContextService emits — it emits
            // `canonical` — so this branch never fired there.
            // ────────────────────────────────────────────────────────────────
            if (verdict.stance === 'neutral' && ctx.mode === 'about_target') {
                // Contradiction 1: LLM reports an explicit attack target that is
                // one of our own, yet claims a neutral stance.
                if (verdict.attack_target) {
                    const wanted = verdict.attack_target.toLowerCase().trim();
                    const attacked = (ctx.mentioned_entities || []).find(
                        (e) => String(e.canonical || '').toLowerCase() === wanted
                            || String(e.key || '').toLowerCase() === wanted
                    );
                    if (attacked && attacked.alignment === 'ally') {
                        console.warn(`[politicalSentiment] Consistency enforcer: attack on ally "${verdict.attack_target}" in about_target mode cannot be neutral. Correcting stance → anti_target.`);
                        verdict.stance = 'anti_target';
                        verdict.beneficiary = 'opposition';
                    }
                }
                // Contradiction 2: LLM reports negative sentiment AND the target
                // is one of ours, yet claims a neutral stance. A negative tone
                // about our own camp in client context is an attack.
                else if (verdict.generic_sentiment === 'negative') {
                    const targetIsAlly = ['revanth', 'bhatti', 'inc'].includes(
                        String(verdict.target_entity || '').toLowerCase()
                    );
                    if (targetIsAlly) {
                        console.warn(`[politicalSentiment] Consistency enforcer: negative sentiment about ally target "${verdict.target_entity}" in about_target mode cannot be neutral. Correcting stance → anti_target.`);
                        verdict.stance = 'anti_target';
                        verdict.beneficiary = 'opposition';
                    }
                }
            }

            return {
                ...verdict,
                target_sentiment: resolveTargetSentiment(verdict),
                provider: 'llm',
            };
        }
    } catch (err) {
        console.warn(`[politicalSentiment] LLM failed: ${err.message}`);
    }

    const fb = heuristicFallback(ctx);
    return { ...fb, target_sentiment: resolveTargetSentiment(fb), provider: 'fallback' };
};

module.exports = {
    analyzePoliticalSentiment,
    resolveTargetSentiment,
    ALLOWED_STANCES,
    // exported for unit tests
    buildPrompt,
    sanitizeRaw,
    heuristicFallback,
    extractJson,
};
