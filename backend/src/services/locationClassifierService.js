/**
 * locationClassifierService
 * ─────────────────────────────────────────────────────────────────────
 * LLM-backed Telangana location classifier. Given the raw text
 * of a social-media post (plus optional metadata), returns the most
 * relevant Telangana constituency / district / Lok-Sabha seat so the post can
 * be auto-routed to the right MLA / MP dashboard via the existing
 * scopeMiddleware (`detected_location.constituency`).
 *
 * Output (or null if the post is not about Telangana):
 *   {
 *     constituency: '<exact name from tg_mlas.json>',
 *     district:     '<district name>',
 *     lok_sabha:    '<ls slug from ls_to_ac.json>',
 *     confidence:   0.0..1.0,
 *     reasoning:    'one short sentence',
 *     provider:     'rapidapi' | 'heuristic'
 *   }
 *
 * The prompt is constrained: the model MUST pick from the canonical
 * list (no inventions). We then validate the output server-side; an
 * unrecognised name forces a null return so we never stamp garbage.
 *
 * A tiny heuristic short-circuit catches the common case where the post
 * literally names a constituency — avoids a RapidAPI call for obvious
 * inputs and keeps quota for ambiguous text.
 */

const { chatJson } = require('./llmProvider');
const TG_MLAS = require('../data/tg_mlas.json');
const LS_TO_AC = require('../data/ls_to_ac.json');
const masterService = require('./constituencyMasterService');

const CLASSIFIER_TIMEOUT = parseInt(process.env.LOCATION_CLASSIFIER_TIMEOUT_MS || '20000', 10);
const MIN_CONFIDENCE = Number(process.env.LOCATION_CLASSIFIER_MIN_CONF || 0.55);

/* ─── canonical lists ─────────────────────────────────────────────── */

// Shared normalizer — strips (SC)/(ST) reservation markers but PRESERVES
// urban/rural and directional qualifiers, so "Nizamabad (Urban)" and
// "Nizamabad (Rural)" stay distinct seats rather than collapsing onto one key.
const { normalizeConstituencyKey: normalize } = require('../config/constituencyNormalizer');

const CONSTITUENCIES = [...new Set(
    TG_MLAS.map((m) => String(m.constituency || '').trim()).filter(Boolean)
)];

// Build AC → LS reverse map so we can derive lok_sabha + district from the
// constituency once the classifier picks one.
const AC_TO_LS = (() => {
    const map = {};
    for (const [ls, acs] of Object.entries(LS_TO_AC)) {
        for (const ac of acs) {
            map[normalize(ac)] = ls;
        }
    }
    return map;
})();

const CONSTITUENCY_BY_NORM = (() => {
    const map = {};
    for (const c of CONSTITUENCIES) map[normalize(c)] = c;
    return map;
})();

// District map — derived from the MLA dataset where present, else from a
// hand-maintained fallback list. Most production data files only carry
// constituency; district is best-effort.
const DISTRICT_BY_AC = (() => {
    const map = {};
    for (const m of TG_MLAS) {
        if (m.constituency && m.district) {
            map[normalize(m.constituency)] = m.district;
        }
    }
    return map;
})();

/* ─── heuristic short-circuit ─────────────────────────────────────── */

const heuristicLookup = (text) => {
    if (!text) return null;
    const lower = String(text).toLowerCase();
    // Try each constituency name as a substring match. Longest first so
    // "Nizamabad (Rural)" wins over a bare "Nizamabad" when both appear.
    const sorted = CONSTITUENCIES.slice().sort((a, b) => b.length - a.length);
    for (const c of sorted) {
        const needle = c.toLowerCase();
        if (needle.length < 4) continue;        // skip 3-letter noise
        if (lower.includes(needle)) {
            return c;
        }
    }
    return null;
};

/* ─── prompt ──────────────────────────────────────────────────────── */

const buildPrompt = (text, ctx) => `You are a geo-routing classifier for a Telangana political-monitoring system.
Your one job: given a social-media post, decide which Telangana assembly constituency it is most likely about.

CONTEXT (use as evidence, do not just echo):
  Author location  : ${ctx.userLocation || '(unknown)'}
  Author bio       : ${ctx.userBio || '(unknown)'}
  Hashtags         : ${ctx.hashtags || '(none)'}
  Tagged account   : ${ctx.taggedAccount || '(none)'}

ALLOWED CONSTITUENCIES (you MUST pick one of these spellings, or "NONE"):
${CONSTITUENCIES.join(', ')}

Decision rules:
  1. If the post explicitly mentions a place name that maps to one of the
     allowed constituencies — pick that constituency.
  2. If the post mentions a smaller locality (mandal / village / landmark)
     that you know lies inside one of the allowed constituencies — pick
     that constituency.
  3. If the post is about a known MLA / MP by name and you know their seat
     — pick that seat.
  4. If the post is about Telangana broadly with no specific seat,
     pick "NONE" — do not guess a seat at random.
  5. If the post is not about Telangana at all, pick "NONE".
  6. Hyderabad is split across 15 separate assembly seats. Only pick one if
     the post names a specific area (e.g. Jubilee Hills, Charminar,
     Malkajgiri); a bare "Hyderabad" is "NONE".
  7. NEVER invent a constituency name. NEVER pick an Andhra Pradesh or
     other-state seat. NEVER pick more than one.

Output STRICT JSON, no prose, no markdown:
{
  "constituency": "<one of the allowed names, exactly as written, or NONE>",
  "evidence":     "<one short phrase quoting the part of the text that pinned the location>",
  "confidence":   0.0-1.0,
  "reasoning":    "<one short sentence>"
}

POST:
<<<
${String(text || '').slice(0, 1500)}
>>>`;

/* ─── result enrichment ───────────────────────────────────────────── */

const enrichWithDistrictAndLs = (constituency) => {
    const key = normalize(constituency);
    return {
        district:  DISTRICT_BY_AC[key] || null,
        lok_sabha: AC_TO_LS[key]       || null,
    };
};

/* ─── public API ──────────────────────────────────────────────────── */

/**
 * Classify a post to its Telangana constituency. Returns null if the post is
 * not confidently about any Telangana seat.
 */
const classifyApLocation = async (text, ctxOpts = {}) => {
    const ctx = {
        userLocation:  ctxOpts.userLocation  || '',
        userBio:       ctxOpts.userBio       || '',
        hashtags:      ctxOpts.hashtags      || '',
        taggedAccount: ctxOpts.taggedAccount || '',
    };

    // 1. Heuristic short-circuit — try the rich ConstituencyMaster alias
    //    index FIRST (mandals / villages / keywords / aliases), then fall
    //    back to the static AC-name list for environments where the master
    //    DB hasn't been seeded yet.
    const haystack = `${text} ${ctx.userLocation} ${ctx.userBio} ${ctx.hashtags} ${ctx.taggedAccount}`;
    try {
        const masterHit = await masterService.matchAlias(haystack);
        if (masterHit) {
            const enr = enrichWithDistrictAndLs(masterHit.ac_name);
            return {
                constituency: masterHit.ac_name,
                district:     enr.district,
                lok_sabha:    enr.lok_sabha,
                confidence:   0.95,
                reasoning:    `Master DB matched "${masterHit.matched_token}" (${masterHit.match_source}) → ${masterHit.ac_name}.`,
                matched_token: masterHit.matched_token,
                match_source:  masterHit.match_source,
                provider:     'master_index',
            };
        }
    } catch (err) {
        console.warn(`[LocationClassifier] Master index lookup failed: ${err.message}`);
    }

    const heuristic = heuristicLookup(haystack);
    if (heuristic) {
        const enr = enrichWithDistrictAndLs(heuristic);
        return {
            constituency: heuristic,
            district:     enr.district,
            lok_sabha:    enr.lok_sabha,
            confidence:   0.92,
            reasoning:    `Exact constituency name "${heuristic}" found in post or author metadata.`,
            provider:     'heuristic',
        };
    }

    // 2. RapidAPI classifier for ambiguous text.
    if (!text || !String(text).trim()) return null;

    let raw;
    try {
        raw = await chatJson({
            prompt:      buildPrompt(text, ctx),
            temperature: 0,
            maxTokens:   300,
            timeoutMs:   CLASSIFIER_TIMEOUT,
        });
    } catch (err) {
        console.warn(`[LocationClassifier] RapidAPI failed: ${err.message}`);
        return null;
    }
    if (!raw || typeof raw !== 'object') return null;

    const picked = String(raw.constituency || '').trim();
    if (!picked || picked.toUpperCase() === 'NONE') return null;

    // Validate against canonical list (case / punctuation insensitive).
    const canonical = CONSTITUENCY_BY_NORM[normalize(picked)];
    if (!canonical) {
        console.warn(`[LocationClassifier] LLM returned invalid constituency "${picked}" — discarding.`);
        return null;
    }

    const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
    if (confidence < MIN_CONFIDENCE) {
        return null;
    }

    const enr = enrichWithDistrictAndLs(canonical);
    return {
        constituency: canonical,
        district:     enr.district,
        lok_sabha:    enr.lok_sabha,
        confidence,
        reasoning:    String(raw.reasoning || raw.evidence || '').slice(0, 200),
        provider:     'rapidapi',
    };
};

module.exports = {
    classifyApLocation,
    // exported for tests / admin tooling
    CONSTITUENCIES,
    AC_TO_LS,
    DISTRICT_BY_AC,
};
