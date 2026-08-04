/**
 * constituencyNormalizer.js
 * ─────────────────────────────────────────────────────────────────────
 * Canonical assembly-constituency key derivation for Telangana.
 *
 * ⚠ Why this is not the AP implementation
 * The Andhra Pradesh codebase normalized constituency names by stripping
 * EVERY parenthetical:  `name.replace(/\([^)]*\)/g, ' ')`. That is correct for
 * AP, where parentheses only ever carry a reservation marker — "Achampet (SC)".
 *
 * In Telangana the parenthetical is sometimes part of the seat name itself:
 *
 *     NIZAMABAD (URBAN)  and  NIZAMABAD (RURAL)   → two different seats
 *     WARANGAL (EAST)    and  WARANGAL (WEST)     → two different seats
 *
 * Stripping blindly collapses those pairs onto one key, so one MLA silently
 * overwrites the other in every lookup map and one seat vanishes from the map.
 * This module strips reservation markers only, and keeps directional or
 * urban/rural qualifiers as part of the key.
 */

/** Parentheticals that are reservation status, not part of the seat name. */
const RESERVATION_MARKERS = /\((\s*(sc|st|gen|general)\s*)\)/gi;

/**
 * Spelling variants across our three data sources, mapped to the canonical key.
 * Left side is the already-normalized (lowercase, alphanumeric) form.
 */
const CONSTITUENCY_ALIASES = {
    // Right-hand side is the ECI spelling; these pairs otherwise produce two
    // "seats" for one constituency and push the state total past 119.
    devarakadra: 'devarkadra',
    miryalguda: 'miryalaguda',
    zaheerabad: 'zahirabad',

    // ── geojson AC_NAME → MLA-directory spelling ──────────────────────
    // telangana_ac.geojson carries the 2008 delimitation transliterations,
    // which differ from the MLA directory on these seats. Without these the
    // constituency joins silently miss and the seat shows no MLA.
    bellampalle: 'bellampalli',
    armur: 'armoor',
    ghanpurstation: 'ghanpur',
    stationghanpur: 'ghanpur',
    jangoan: 'jangaon',
    vicarabad: 'vikarabad',
    kukatpalle: 'kukatpally',
    maheswaram: 'maheshwaram',
    mahbubnagar: 'mahabubnagar',
    // The geojson entry for AC 71 is literally "Secunderabad Cantt. (SC" —
    // an unclosed parenthesis, so the reservation-marker regex cannot strip it.
    secunderabadcanttsc: 'secunderabadcantonment',
    secunderabadcantt: 'secunderabadcantonment',
    sathupalli: 'sathupalle',
    satthupalli: 'sathupalle',
    thungathurthi: 'thungathurthy',
    tungathurthy: 'thungathurthy',
    waradhanapet: 'wardhannapet',
    wardhanapet: 'wardhannapet',
    mulugu: 'mulug',
    kothagudem: 'kothagudem',
    yellareddy: 'yellareddy',
    jangaon: 'jangaon',
    lbnagar: 'lalbahadurnagar',
    'lalbahadurnagar': 'lalbahadurnagar',
    quthbullapur: 'qutbullapur',
    kutbullapur: 'qutbullapur',
    secunderabadcantt: 'secunderabadcantonment',
    secunderabadcantonment: 'secunderabadcantonment',
    nizamabadurban: 'nizamabadurban',
    nizamabadrural: 'nizamabadrural',
    warangaleast: 'warangaleast',
    warangalwest: 'warangalwest',
};

/**
 * Reduce a constituency name to a stable lookup key.
 *
 *   "NIZAMABAD (URBAN)"  → "nizamabadurban"
 *   "Achampet (SC)"      → "achampet"
 *   "Warangal East"      → "warangaleast"
 */
const normalizeConstituencyKey = (name) => {
    const base = String(name || '')
        .toLowerCase()
        .replace(RESERVATION_MARKERS, ' ')  // drop (SC) / (ST) / (GEN) only
        .replace(/[^a-z0-9]/g, '')          // keep any remaining qualifier
        .trim();

    return CONSTITUENCY_ALIASES[base] || base;
};

/** Strip the reservation marker for display, preserving qualifiers. */
const formatConstituencyLabel = (name) =>
    String(name || '')
        .replace(RESERVATION_MARKERS, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());

/** Reservation status of a seat, when the name carries it. */
const getReservationStatus = (name) => {
    const match = String(name || '').match(/\(\s*(SC|ST|GEN|GENERAL)\s*\)/i);
    if (!match) return null;
    const value = match[1].toUpperCase();
    return value === 'GENERAL' ? 'GEN' : value;
};

module.exports = {
    CONSTITUENCY_ALIASES,
    normalizeConstituencyKey,
    formatConstituencyLabel,
    getReservationStatus,
};
