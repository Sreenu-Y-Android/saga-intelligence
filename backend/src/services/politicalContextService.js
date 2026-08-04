/**
 * politicalContextService
 * ─────────────────────────────────────────────────────────────────────
 * Stage 3 of the target-aware grievance pipeline.
 *
 * Pure-JS, deterministic, NO LLM call. Given a piece of social-media text,
 * this service produces a structured snapshot of which political entities are
 * mentioned, who the primary target is, and how the content relates to the
 * client leadership (CM Revanth Reddy / INC).
 *
 * The downstream `politicalSentimentService` injects this snapshot into its
 * LLM prompt so the model reasons about sentiment RELATIVE TO THE CLIENT
 * rather than performing generic positive/negative classification.
 *
 *   buildPoliticalContext(text, { taggedKeyword, authorHandle, platform })
 *     → {
 *         mentioned_entities: [{ key, canonical, alignment, ... }],
 *         primary_target,             // entity key with highest priority
 *         primary_target_alignment,   // 'ally' | 'opposition' | 'neutral' | null
 *         target_relevance,           // 0..1 (deterministic heuristic)
 *         mode,                       // 'about_target' | 'about_opposition'
 *                                     // | 'general_politics' | 'civic_grievance'
 *                                     // | 'irrelevant'
 *         has_target_mention,
 *         has_opposition_mention,
 *         has_ally_mention,
 *         language_hints: { has_telugu, has_urdu, ... },
 *         summary,                    // human-readable one-liner for the prompt
 *       }
 */

const {
    POLITICAL_ENTITIES,
    ALIAS_INDEX,
    TARGET_ALIASES,
    isAlly,
    isOpposition,
    isPrimaryTarget,
} = require('../config/politicalEntities');

/* ─── language / script detection ──────────────────────────────────── */

const TELUGU_RX = /[ఀ-౿]/;
const DEVANAGARI_RX = /[ऀ-ॿ]/;
const TAMIL_RX = /[஀-௿]/;
const KANNADA_RX = /[ಀ-೿]/;
const URDU_ARABIC_RX = /[؀-ۿ]/;

const detectLanguageHints = (text) => ({
    has_telugu: TELUGU_RX.test(text),
    has_hindi: DEVANAGARI_RX.test(text),
    has_devanagari: DEVANAGARI_RX.test(text),
    has_tamil: TAMIL_RX.test(text),
    has_kannada: KANNADA_RX.test(text),
    has_urdu: URDU_ARABIC_RX.test(text),
    has_latin: /[a-z]/i.test(text),
});

/* ─── lightweight civic-grievance lexicon (multilingual) ──────────── */

/**
 * Urdu is included deliberately: a large share of Hyderabad's old-city civic
 * complaints arrive in Urdu script and would otherwise score as "no civic
 * signal" and be dropped to `irrelevant`.
 */
const CIVIC_GRIEVANCE_TOKENS = [
    // English
    'pothole', 'power cut', 'electricity', 'water supply', 'road repair',
    'street light', 'sanitation', 'garbage', 'drainage', 'sewage',
    'ration', 'pension', 'school fee', 'hospital', 'ambulance',
    'farmer', 'crop loss', 'unemployment', 'salary not paid',
    'rythu bharosa', 'rythu bandhu', 'gruha jyothi', 'arogyasri',
    // Telugu
    'కరెంట్', 'నీళ్లు', 'నీరు', 'రోడ్డు', 'గుంత', 'డ్రైనేజీ',
    'రేషన్', 'పెన్షన్', 'పంట', 'రైతు', 'ఆస్పత్రి', 'పాఠశాల',
    'వీధి దీపం', 'ఉద్యోగం', 'రుణమాఫీ', 'ఆరోగ్యశ్రీ',
    // Hindi
    'बिजली', 'पानी', 'सड़क', 'गड्ढा', 'राशन', 'पेंशन', 'किसान',
    'अस्पताल', 'स्कूल फीस', 'सीवर',
    // Urdu
    'بجلی', 'پانی', 'سڑک', 'راشن', 'پنشن', 'اسپتال', 'نالی', 'کچرا',
];

const containsCivicSignal = (lowerText) =>
    CIVIC_GRIEVANCE_TOKENS.some((t) => lowerText.includes(t.toLowerCase()));

/* ─── alias matching ───────────────────────────────────────────────── */

/**
 * Walk the sorted alias index once and collect every match. Multiple
 * occurrences of the same entity count once. Returns entity keys in the
 * order of first appearance plus a per-entity match metadata bag.
 */
const findMentionedEntities = (text) => {
    const raw = String(text || '');
    const lower = ` ${raw.toLowerCase()} `; // pad for boundary detection
    const seen = new Map();

    for (const { alias, entityKey } of ALIAS_INDEX) {
        if (seen.has(entityKey)) continue;
        if (!lower.includes(alias)) continue;

        // For short purely-alphanumeric aliases, require a non-word boundary so
        // 'inc' doesn't match inside 'incident' but DOES match 'inc4telangana'.
        if (/^[a-z0-9]+$/.test(alias) && alias.length <= 4) {
            const rx = new RegExp(`(?:^|[^a-z0-9_])${alias}(?:[^a-z0-9_]|$)`, 'i');
            if (!rx.test(raw)) continue;
        }

        const ent = POLITICAL_ENTITIES[entityKey];
        seen.set(entityKey, {
            key: entityKey,
            canonical: ent.canonical,
            type: ent.type,
            party: ent.party || null,
            alignment: ent.alignment,
            priority: ent.priority || 0,
            alias_matched: alias,
        });
    }

    return [...seen.values()];
};

/* ─── relevance score & mode ───────────────────────────────────────── */

const computeTargetRelevance = (mentions, taggedKeyword) => {
    const tagged = String(taggedKeyword || '').toLowerCase();

    const hasTarget = mentions.some((m) => isPrimaryTarget(m.key));
    const hasAlly = mentions.some((m) => isAlly(m.key));
    const hasOpposition = mentions.some((m) => isOpposition(m.key));

    // Direct mention of the CM / Deputy CM → maximum relevance.
    if (hasTarget) return 1.0;

    // Tagged-keyword bootstrap: the fetcher saved the keyword that pulled this
    // post; if the keyword itself was a target alias, treat as high.
    if (tagged && TARGET_ALIASES.some((a) => tagged.includes(a))) return 0.9;

    if (hasOpposition && hasAlly) return 0.8;
    if (hasOpposition) return 0.55; // opposition-only — often relevant indirectly
    if (hasAlly) return 0.5;
    return 0.1;
};

const decideMode = ({ mentions, targetRelevance, hasCivic }) => {
    const hasTarget = mentions.some((m) => isPrimaryTarget(m.key));
    const hasAlly = mentions.some((m) => isAlly(m.key));
    const hasOpposition = mentions.some((m) => isOpposition(m.key));

    if (hasTarget && hasCivic) return 'civic_grievance';
    if (hasTarget) return 'about_target';
    if (hasOpposition && hasAlly) return 'about_target';    // comparative
    if (hasOpposition) return 'about_opposition';
    if (hasAlly) return 'about_target';                     // praise of an INC ally reflects on the CM
    if (hasCivic) return 'civic_grievance';
    if (targetRelevance < 0.2) return 'irrelevant';
    return 'general_politics';
};

/* ─── primary target selection ─────────────────────────────────────── */

const pickPrimaryTarget = (mentions) => {
    if (mentions.length === 0) return null;

    // 1. The CM / Deputy CM always wins if present.
    const targetHit = mentions.find((m) => isPrimaryTarget(m.key));
    if (targetHit) return targetHit;

    // 2. Otherwise pick the highest-priority entity.
    return mentions.slice().sort((a, b) => b.priority - a.priority)[0];
};

/* ─── public API ───────────────────────────────────────────────────── */

const buildPoliticalContext = (text, opts = {}) => {
    const { taggedKeyword = '', authorHandle = '', platform = '' } = opts;
    const raw = String(text || '');
    const lower = raw.toLowerCase();

    const mentions = findMentionedEntities(raw);
    const hasCivic = containsCivicSignal(lower);
    const targetRelevance = computeTargetRelevance(mentions, taggedKeyword);
    const primary = pickPrimaryTarget(mentions);
    const mode = decideMode({ mentions, targetRelevance, hasCivic });
    const languageHints = detectLanguageHints(raw);

    const hasTarget = mentions.some((m) => isPrimaryTarget(m.key));
    const hasAlly = mentions.some((m) => isAlly(m.key));
    const hasOpposition = mentions.some((m) => isOpposition(m.key));

    const summaryParts = [];
    if (hasTarget) summaryParts.push('mentions the CM / Deputy CM directly');
    if (hasAlly && !hasTarget) summaryParts.push('mentions an INC leader or the party');
    if (hasOpposition) summaryParts.push('mentions opposition');
    if (hasCivic) summaryParts.push('contains civic grievance signal');
    if (summaryParts.length === 0) summaryParts.push('no clear political target detected');

    return {
        mentioned_entities: mentions,
        primary_target: primary?.key || null,
        primary_target_canonical: primary?.canonical || null,
        primary_target_alignment: primary?.alignment || null,
        has_target_mention: hasTarget,
        has_ally_mention: hasAlly,
        has_opposition_mention: hasOpposition,
        has_civic_signal: hasCivic,
        target_relevance: targetRelevance,
        mode,
        language_hints: languageHints,
        tagged_keyword: taggedKeyword || null,
        author_handle: authorHandle || null,
        platform: platform || null,
        summary: summaryParts.join('; '),
    };
};

module.exports = {
    buildPoliticalContext,
    // exposed for unit tests
    findMentionedEntities,
    detectLanguageHints,
    containsCivicSignal,
    computeTargetRelevance,
};
