/**
 * constituencyMasterService
 * ─────────────────────────────────────────────────────────────────────
 * In-process cache + reverse-index over the ConstituencyMaster collection.
 *
 *   • aliasIndex   — every alias / mandal / village / keyword token → AC name
 *   • acIndex      — AC name → full master row
 *   • districtIndex — district name → [AC names]
 *   • lsIndex      — LS slug → [AC names]
 *
 * Used by:
 *   • locationClassifierService — heuristic substring match on aliasIndex
 *     (no API call), then LLM fallback with keyword context per AC
 *   • routing engine            — resolveRouting(acName) returns the full
 *     fan-out: MLA login, MP login, district dashboard, LS dashboard
 *
 * The cache auto-refreshes every REFRESH_MS or on explicit
 * `invalidateCache()` (called from any controller that mutates the
 * master collection).
 */

const ConstituencyMaster = require('../models/ConstituencyMaster');
const User = require('../models/User');

const REFRESH_MS = parseInt(process.env.CONSTITUENCY_MASTER_REFRESH_MS || '300000', 10); // 5 min

const normKey = (v) =>
    String(v || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9]+/g, '')
        .trim();

const compactLower = (v) => String(v || '').toLowerCase().trim();

let cache = null;
let lastBuiltAt = 0;
let buildPromise = null;

// Try to read MlaProfileSettings.monitored_handles when building the person index.
// Optional dependency — missing collection in older deployments is non-fatal.
let MlaProfileSettings = null;
try { MlaProfileSettings = require('../models/MlaProfileSettings'); } catch (_) { /* optional */ }

// Alias map for politicians whose social mentions rarely use the exact full
// name stored in ConstituencyMaster.mla_name. Keys are the canonical AC name
// (UPPERCASE form from tg_mlas.json). Each alias is matched word-boundary
// aware, longest-first, so "Harish Rao" wins over a bare "Rao".
//
// DERIVED, not hand-curated: every person in the political entity graph that
// holds a seat contributes their aliases to that seat. Adding a leader to
// politicalData.js therefore widens this map automatically — the AP version
// this replaces was a hardcoded three-entry list that went stale the moment
// anyone changed seats.
const VIP_PERSON_ALIASES = (() => {
    const { POLITICAL_ENTITIES } = require('../config/politicalEntities');
    const { normalizeConstituencyKey } = require('../config/constituencyNormalizer');
    const TG_MLAS = require('../data/tg_mlas.json');

    // AC key → canonical UPPERCASE name, so entity constituencies (which use
    // roster spelling) land on the same key the master collection uses.
    const canonicalAcName = TG_MLAS.reduce((acc, m) => {
        acc[m.key] = m.constituency;
        return acc;
    }, {});

    const map = {};
    for (const ent of Object.values(POLITICAL_ENTITIES)) {
        if (ent.type !== 'person' || !ent.constituency) continue;

        const acName = canonicalAcName[normalizeConstituencyKey(ent.constituency)];
        if (!acName) continue; // out-of-state seat (e.g. Varanasi) — skip

        // Drop bare handles; the person index matches those separately and
        // they would otherwise pollute the location alias index.
        const aliases = (ent.aliases || []).filter((a) => a.length >= 4 && !/^@/.test(a));
        if (!aliases.length) continue;

        map[acName] = [...new Set([...(map[acName] || []), ...aliases])];
    }
    return map;
})();

const normalizePerson = (v) =>
    String(v || '')
        .toLowerCase()
        .replace(/^@+/, '')
        .replace(/[^a-z0-9ऀ-ൿ ]+/g, ' ')   // keep latin + Indic ranges + space
        .replace(/\s+/g, ' ')
        .trim();

const buildCache = async () => {
    const rows = await ConstituencyMaster.find({ is_active: true }).lean();
    let mlaProfiles = [];
    if (MlaProfileSettings) {
        try {
            mlaProfiles = await MlaProfileSettings.find({ is_active: true })
                .select('constituency monitored_handles').lean();
        } catch (err) {
            console.warn('[ConstituencyMaster] failed to load MlaProfileSettings:', err.message);
        }
    }
    const handleMap = {}; // constituency_upper → [handles]
    for (const p of mlaProfiles) {
        const key = String(p.constituency || '').toUpperCase();
        if (!key) continue;
        handleMap[key] = (handleMap[key] || []).concat(p.monitored_handles || []);
    }

    const acIndex = {};           // ac_key → row
    const aliasIndex = [];        // [{ token, token_lower, ac_name, source }]
    const districtIndex = {};     // district_key → [ac_name]
    const lsIndex = {};           // lok_sabha_key → [ac_name]
    const personIndex = [];       // [{ token_lower, ac_name, matched_via, original }]

    const addToken = (token, ac_name, source) => {
        const lower = compactLower(token);
        if (!lower || lower.length < 3) return;        // skip very short tokens to avoid false positives
        aliasIndex.push({ token, token_lower: lower, ac_name, source });
    };

    for (const row of rows) {
        const key = row.ac_key || normKey(row.ac_name);
        acIndex[key] = row;

        // Index every recognisable token for heuristic substring matching.
        addToken(row.ac_name, row.ac_name, 'ac_name');

        for (const m of (row.mandals || [])) {
            addToken(m.name, row.ac_name, 'mandal');
            for (const a of (m.aliases || [])) addToken(a, row.ac_name, 'mandal_alias');
        }
        for (const v of (row.villages || [])) {
            addToken(v.name, row.ac_name, 'village');
            for (const a of (v.aliases || [])) addToken(a, row.ac_name, 'village_alias');
        }
        for (const kw of (row.keywords || [])) {
            addToken(kw, row.ac_name, 'keyword');
        }

        // Person index — politician name / handle → AC name.
        // Used by the grievance + alert pipeline so any mention of an MLA or MP
        // routes to THEIR constituency regardless of any other location detected.
        const addPerson = (raw, via) => {
            const lower = normalizePerson(raw);
            if (!lower || lower.length < 3) return;
            personIndex.push({ token_lower: lower, ac_name: row.ac_name, matched_via: via, original: String(raw).trim() });
        };
        addPerson(row.mla_name, 'mla');
        addPerson(row.mp_name, 'mp');
        const profileHandles = handleMap[String(row.ac_name || '').toUpperCase()] || [];
        for (const h of profileHandles) addPerson(h, 'handle');
        const vipAliases = VIP_PERSON_ALIASES[String(row.ac_name || '').toUpperCase()] || [];
        for (const a of vipAliases) addPerson(a, 'vip_alias');

        // District + LS reverse indexes for routing fan-out.
        if (row.district_key) {
            (districtIndex[row.district_key] = districtIndex[row.district_key] || []).push(row.ac_name);
        }
        if (row.lok_sabha_key) {
            (lsIndex[row.lok_sabha_key] = lsIndex[row.lok_sabha_key] || []).push(row.ac_name);
        }
    }

    // Longest-first so multi-word tokens win over substrings
    // ('Tirumala Hills' beats 'Tirumala' beats 'Hills').
    aliasIndex.sort((a, b) => b.token_lower.length - a.token_lower.length);
    // Same for persons: 'Nara Lokesh' must beat 'Lokesh'.
    personIndex.sort((a, b) => b.token_lower.length - a.token_lower.length);

    cache = { acIndex, aliasIndex, districtIndex, lsIndex, personIndex, builtAt: Date.now(), rowCount: rows.length };
    lastBuiltAt = Date.now();
    console.log(`[ConstituencyMaster] cache rebuilt: ${rows.length} ACs, ${aliasIndex.length} tokens, ${personIndex.length} persons`);
    return cache;
};

const getCache = async () => {
    if (cache && Date.now() - lastBuiltAt < REFRESH_MS) return cache;
    if (buildPromise) return buildPromise;
    buildPromise = buildCache().finally(() => { buildPromise = null; });
    return buildPromise;
};

const invalidateCache = () => {
    cache = null;
    lastBuiltAt = 0;
};

/* ─── alias matching (used by classifier heuristic short-circuit) ── */

/**
 * Scan the haystack for ANY indexed token. Returns the first (longest)
 * hit so the caller knows which AC the post is about and why.
 */
const matchAlias = async (haystack) => {
    if (!haystack) return null;
    const lower = compactLower(haystack);
    const c = await getCache();
    for (const entry of c.aliasIndex) {
        // Word-boundary-ish match: require non-alphanumeric neighbours
        // so 'Tirupati' inside 'Tirupatipatnam' doesn't match falsely.
        const i = lower.indexOf(entry.token_lower);
        if (i < 0) continue;
        const before = lower[i - 1];
        const after = lower[i + entry.token_lower.length];
        const isBoundary = (ch) => ch === undefined || /[^a-z0-9]/i.test(ch);
        if (isBoundary(before) && isBoundary(after)) {
            return {
                ac_name: entry.ac_name,
                matched_token: entry.token,
                match_source: entry.source,
            };
        }
    }
    return null;
};

/**
 * Returns up to `limit` representative tokens per AC for the classifier's
 * LLM prompt context. Helps the model disambiguate "I'm at the Padalu" →
 * picks TIRUPATI by association.
 */
const getContextTokensForAcs = async (acNames, limit = 6) => {
    const c = await getCache();
    const out = {};
    for (const ac of acNames) {
        const key = normKey(ac);
        const row = c.acIndex[key];
        if (!row) continue;
        const tokens = [];
        for (const m of (row.mandals || []).slice(0, limit)) tokens.push(m.name);
        for (const v of (row.villages || []).slice(0, limit)) tokens.push(v.name);
        for (const kw of (row.keywords || []).slice(0, limit)) tokens.push(kw);
        out[ac] = tokens.slice(0, limit);
    }
    return out;
};

/**
 * Scan text for any politician name (mla_name / mp_name from ConstituencyMaster)
 * or monitored_handle from MlaProfileSettings. Returns the first (longest) hit
 * so the caller can route the post to THAT politician's constituency.
 *
 * Returns null when no person is mentioned, so the caller can fall through to
 * the location classifier.
 */
const resolvePersonToConstituency = async (text) => {
    const all = await resolveAllPersonsToConstituencies(text);
    return all.length > 0 ? all[0] : null;
};

/**
 * Same as `resolvePersonToConstituency` but returns EVERY distinct person
 * match in the text, so a grievance mentioning N politicians can be routed
 * to all N of their constituencies. De-duplicated by ac_name, ordered by
 * the longest matched token first (most specific match wins as primary).
 */
const resolveAllPersonsToConstituencies = async (text) => {
    if (!text) return [];
    const haystack = normalizePerson(text);
    if (!haystack) return [];
    const c = await getCache();
    const isBoundary = (ch) => ch === undefined || /[^a-z0-9ऀ-ൿ]/i.test(ch);
    const seenAc = new Set();
    const out = [];
    for (const entry of c.personIndex || []) {
        if (seenAc.has(entry.ac_name)) continue;
        const i = haystack.indexOf(entry.token_lower);
        if (i < 0) continue;
        const before = haystack[i - 1];
        const after = haystack[i + entry.token_lower.length];
        if (!isBoundary(before) || !isBoundary(after)) continue;
        seenAc.add(entry.ac_name);
        out.push({
            ac_name: entry.ac_name,
            matched_name: entry.original,
            matched_via: entry.matched_via,
            token_length: entry.token_lower.length,
        });
    }
    return out;
};

/* ─── routing engine ──────────────────────────────────────────────── */

/**
 * Given a detected AC name, return the full routing fan-out:
 *   • ac_dashboard / district_dashboard / lok_sabha_dashboard URLs
 *   • mla_users   — login(s) for the AC's MLA(s)
 *   • mp_users    — login(s) for the LS seat's MP(s)
 *   • siblings    — other ACs in the same district / LS (for context)
 *   • scope_keys  — keys that get stamped on the grievance so any future
 *                   district / LS scope filter resolves correctly
 */
const resolveRouting = async (acName) => {
    if (!acName) return null;
    const c = await getCache();
    const key = normKey(acName);
    const row = c.acIndex[key];

    const district = row?.district || null;
    const lokSabha = row?.lok_sabha || null;
    const districtKey = row?.district_key || normKey(district);
    const lsKey       = row?.lok_sabha_key || normKey(lokSabha);

    const acDisplay = row?.ac_name || String(acName).toUpperCase();

    // Sibling ACs in the same district / LS (sorted, AC excluded).
    const siblingsInDistrict = (c.districtIndex[districtKey] || []).filter((x) => normKey(x) !== key);
    const siblingsInLs       = (c.lsIndex[lsKey]             || []).filter((x) => normKey(x) !== key);

    // Login users for this AC and its LS seat.
    const [mlaUsers, mpUsers] = await Promise.all([
        User.find({ role: 'mla', assigned_constituency: { $regex: `^${escapeRegex(acDisplay)}$`, $options: 'i' } })
            .select('id email full_name is_active').lean(),
        lsKey
            ? User.find({ role: 'mp', assigned_lok_sabha: { $regex: `^${escapeRegex(lokSabha)}$`, $options: 'i' } })
                .select('id email full_name is_active').lean()
            : Promise.resolve([]),
    ]);

    return {
        ac_name:    acDisplay,
        ac_key:     key,
        district,
        district_key: districtKey || null,
        lok_sabha:  lokSabha,
        lok_sabha_key: lsKey || null,

        dashboards: {
            ac:        `/dashboard/constituency/${key}`,
            district:  districtKey ? `/dashboard/district/${districtKey}` : null,
            lok_sabha: lsKey       ? `/dashboard/ls/${lsKey}`             : null,
        },

        mla_users: mlaUsers,
        mp_users:  mpUsers,

        mla_name:  row?.mla_name || null,
        mla_party: row?.mla_party || null,
        mp_name:   row?.mp_name || null,
        mp_party:  row?.mp_party || null,

        siblings_in_district: siblingsInDistrict,
        siblings_in_ls:       siblingsInLs,

        // Keys used by scopeMiddleware / future district-level filters.
        scope_keys: [
            key,
            lsKey       ? `ls:${lsKey}`             : null,
            districtKey ? `district:${districtKey}` : null,
        ].filter(Boolean),
    };
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ─── lookup helpers ──────────────────────────────────────────────── */

const getMasterRow = async (acName) => {
    const c = await getCache();
    return c.acIndex[normKey(acName)] || null;
};

const getAcsByDistrict = async (district) => {
    const c = await getCache();
    return c.districtIndex[normKey(district)] || [];
};

const getAcsByLokSabha = async (ls) => {
    const c = await getCache();
    return c.lsIndex[normKey(ls)] || [];
};

const getAllAcs = async () => {
    const c = await getCache();
    return Object.values(c.acIndex);
};

module.exports = {
    matchAlias,
    resolvePersonToConstituency,
    resolveAllPersonsToConstituencies,
    resolveRouting,
    getMasterRow,
    getAcsByDistrict,
    getAcsByLokSabha,
    getAllAcs,
    getContextTokensForAcs,
    invalidateCache,
    // exported for tests / debug
    _buildCacheForTest: buildCache,
};
