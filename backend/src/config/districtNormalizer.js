/**
 * districtNormalizer.js
 * ─────────────────────────────────────────────────────────────────────
 * Reconciles the three different spellings of a Telangana district that
 * coexist in this system:
 *
 *   1. `telangana_districts.geojson`  → "JAYASHANKAR BHUPALAPALLY", "WARANGAL"
 *   2. `politicalData.js` roster      → "Jayashankar Bhupalpally", "Hanamkonda"
 *   3. `telanganaLocations.js`        → "kumuram bheem asifabad", "ranga reddy"
 *
 * Left unreconciled these disagree on ~6 districts, and a choropleth join on
 * the raw string silently renders those districts as "no data" — the failure
 * looks like missing coverage rather than a data bug, which is why it is
 * worth normalizing rather than hoping the strings line up.
 *
 * `normalizeDistrict` always returns a key that exists in the geojson, so it
 * is safe to use directly as a map-join key.
 *
 * ⚠ Keep in sync with `frontend/src/components/geographic/districtNames.js`,
 * which carries the same table for client-side map rendering.
 */

/** The 31 district polygons present in telangana_districts.geojson. */
const GEOJSON_DISTRICTS = [
    'ADILABAD',
    'BHADRADRI KOTHAGUDEM',
    'HYDERABAD',
    'JAGTIAL',
    'JANGAON',
    'JAYASHANKAR BHUPALAPALLY',
    'JOGULAMBA GADWAL',
    'KAMAREDDY',
    'KARIMNAGAR',
    'KHAMMAM',
    'KUMURAMBHEEM ASIFABAD',
    'MAHABUBABAD',
    'MAHABUBNAGAR',
    'MANCHERIAL',
    'MEDAK',
    'MEDCHAL-MALKAJGIRI',
    'NAGARKURNOOL',
    'NALGONDA',
    'NARAYANPET',
    'NIRMAL',
    'NIZAMABAD',
    'PEDDAPALLI',
    'RAJANNA SIRCILLA',
    'RANGAREDDY',
    'SANGAREDDY',
    'SIDDIPET',
    'SURYAPET',
    'VIKARABAD',
    'WANAPARTHY',
    'WARANGAL',
    'YADADRI BHUVANAGIRI',
];

/**
 * Variant spelling → geojson district key.
 *
 * Two entries are territorial rather than orthographic. Hanamkonda and Mulugu
 * are real districts created in the 2016+ reorganisation, but the upstream
 * shapefile predates them, so they have no polygon of their own. Folding them
 * into the parent they were carved from keeps their grievances on the map
 * instead of dropping them; the alternative is a hole in the state.
 */
const DISTRICT_ALIASES = {
    // ── Territorial folds (no polygon of their own) ────────────────────
    hanamkonda: 'WARANGAL',
    'hanumakonda': 'WARANGAL',
    'warangal urban': 'WARANGAL',
    'warangal rural': 'WARANGAL',
    mulugu: 'JAYASHANKAR BHUPALAPALLY',

    // ── Spelling / spacing variants ────────────────────────────────────
    'jayashankar bhupalpally': 'JAYASHANKAR BHUPALAPALLY',
    'jayashankar bhupalapally': 'JAYASHANKAR BHUPALAPALLY',
    bhupalpally: 'JAYASHANKAR BHUPALAPALLY',
    'kumuram bheem asifabad': 'KUMURAMBHEEM ASIFABAD',
    'kumurambheem asifabad': 'KUMURAMBHEEM ASIFABAD',
    'komaram bheem asifabad': 'KUMURAMBHEEM ASIFABAD',
    asifabad: 'KUMURAMBHEEM ASIFABAD',
    'ranga reddy': 'RANGAREDDY',
    rangareddy: 'RANGAREDDY',
    'r r district': 'RANGAREDDY',
    medchal: 'MEDCHAL-MALKAJGIRI',
    malkajgiri: 'MEDCHAL-MALKAJGIRI',
    'medchal malkajgiri': 'MEDCHAL-MALKAJGIRI',
    sircilla: 'RAJANNA SIRCILLA',
    'rajanna sircilla': 'RAJANNA SIRCILLA',
    yadadri: 'YADADRI BHUVANAGIRI',
    bhuvanagiri: 'YADADRI BHUVANAGIRI',
    bhongir: 'YADADRI BHUVANAGIRI',
    'jogulamba gadwal': 'JOGULAMBA GADWAL',
    gadwal: 'JOGULAMBA GADWAL',
    'bhadradri kothagudem': 'BHADRADRI KOTHAGUDEM',
    kothagudem: 'BHADRADRI KOTHAGUDEM',
    'mahbubnagar': 'MAHABUBNAGAR',
    'mahaboobnagar': 'MAHABUBNAGAR',
    'mahbubabad': 'MAHABUBABAD',
    'mahaboobabad': 'MAHABUBABAD',
    secunderabad: 'HYDERABAD',
    'greater hyderabad': 'HYDERABAD',
    ghmc: 'HYDERABAD',
    cyberabad: 'HYDERABAD',
};

/** Display casing for districts whose title-case form is not simply "Word Word". */
const DISPLAY_OVERRIDES = {
    'MEDCHAL-MALKAJGIRI': 'Medchal-Malkajgiri',
    'KUMURAMBHEEM ASIFABAD': 'Kumuram Bheem Asifabad',
    'JAYASHANKAR BHUPALAPALLY': 'Jayashankar Bhupalapally',
    'YADADRI BHUVANAGIRI': 'Yadadri Bhuvanagiri',
    'RAJANNA SIRCILLA': 'Rajanna Sircilla',
    'JOGULAMBA GADWAL': 'Jogulamba Gadwal',
    'BHADRADRI KOTHAGUDEM': 'Bhadradri Kothagudem',
    RANGAREDDY: 'Rangareddy',
};

const GEOJSON_SET = new Set(GEOJSON_DISTRICTS);

/** Strip punctuation and collapse whitespace so lookups tolerate messy input. */
const canonicalizeKey = (value) =>
    String(value || '')
        .toLowerCase()
        .replace(/[._]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/**
 * Resolve any district spelling to the key used by telangana_districts.geojson.
 * Returns null when the name is not a Telangana district at all (for example
 * Varanasi or Gandhinagar, which appear in the roster for national leaders).
 */
const normalizeDistrict = (name) => {
    const key = canonicalizeKey(name);
    if (!key) return null;

    const upper = key.toUpperCase();
    if (GEOJSON_SET.has(upper)) return upper;

    const aliased = DISTRICT_ALIASES[key];
    if (aliased) return aliased;

    // Tolerate a hyphen/space mismatch ("medchal malkajgiri" vs "medchal-malkajgiri")
    const hyphenated = upper.replace(/\s+/g, '-');
    if (GEOJSON_SET.has(hyphenated)) return hyphenated;

    const despaced = upper.replace(/[\s-]+/g, '');
    const match = GEOJSON_DISTRICTS.find((d) => d.replace(/[\s-]+/g, '') === despaced);
    return match || null;
};

/** True when the name resolves to a district polygon on the Telangana map. */
const isKnownDistrict = (name) => normalizeDistrict(name) !== null;

/** Human-readable label for a district, from any input spelling. */
const formatDistrictLabel = (name) => {
    const normalized = normalizeDistrict(name);
    if (!normalized) {
        return String(name || '')
            .trim()
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    return (
        DISPLAY_OVERRIDES[normalized] ||
        normalized.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    );
};

module.exports = {
    GEOJSON_DISTRICTS,
    DISTRICT_ALIASES,
    normalizeDistrict,
    isKnownDistrict,
    formatDistrictLabel,
};
