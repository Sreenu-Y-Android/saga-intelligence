/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Produced by backend/scripts/build_tg_mlas.js from backend/src/config/districtNormalizer.js.
 * Re-run that script after changing the roster.
 */

/**
 * Client-side mirror of the backend district normalizer, so a district
 * renders under one label no matter which of the three spellings in this
 * system it arrived as. Without it the choropleth join misses and the
 * district paints as "no data" — a data bug that looks like missing coverage.
 */

export const GEOJSON_DISTRICTS = [
  "ADILABAD",
  "BHADRADRI KOTHAGUDEM",
  "HYDERABAD",
  "JAGTIAL",
  "JANGAON",
  "JAYASHANKAR BHUPALAPALLY",
  "JOGULAMBA GADWAL",
  "KAMAREDDY",
  "KARIMNAGAR",
  "KHAMMAM",
  "KUMURAMBHEEM ASIFABAD",
  "MAHABUBABAD",
  "MAHABUBNAGAR",
  "MANCHERIAL",
  "MEDAK",
  "MEDCHAL-MALKAJGIRI",
  "NAGARKURNOOL",
  "NALGONDA",
  "NARAYANPET",
  "NIRMAL",
  "NIZAMABAD",
  "PEDDAPALLI",
  "RAJANNA SIRCILLA",
  "RANGAREDDY",
  "SANGAREDDY",
  "SIDDIPET",
  "SURYAPET",
  "VIKARABAD",
  "WANAPARTHY",
  "WARANGAL",
  "YADADRI BHUVANAGIRI"
];

export const DISTRICT_ALIASES = {
  "hanamkonda": "WARANGAL",
  "hanumakonda": "WARANGAL",
  "warangal urban": "WARANGAL",
  "warangal rural": "WARANGAL",
  "mulugu": "JAYASHANKAR BHUPALAPALLY",
  "jayashankar bhupalpally": "JAYASHANKAR BHUPALAPALLY",
  "jayashankar bhupalapally": "JAYASHANKAR BHUPALAPALLY",
  "bhupalpally": "JAYASHANKAR BHUPALAPALLY",
  "kumuram bheem asifabad": "KUMURAMBHEEM ASIFABAD",
  "kumurambheem asifabad": "KUMURAMBHEEM ASIFABAD",
  "komaram bheem asifabad": "KUMURAMBHEEM ASIFABAD",
  "asifabad": "KUMURAMBHEEM ASIFABAD",
  "ranga reddy": "RANGAREDDY",
  "rangareddy": "RANGAREDDY",
  "r r district": "RANGAREDDY",
  "medchal": "MEDCHAL-MALKAJGIRI",
  "malkajgiri": "MEDCHAL-MALKAJGIRI",
  "medchal malkajgiri": "MEDCHAL-MALKAJGIRI",
  "sircilla": "RAJANNA SIRCILLA",
  "rajanna sircilla": "RAJANNA SIRCILLA",
  "yadadri": "YADADRI BHUVANAGIRI",
  "bhuvanagiri": "YADADRI BHUVANAGIRI",
  "bhongir": "YADADRI BHUVANAGIRI",
  "jogulamba gadwal": "JOGULAMBA GADWAL",
  "gadwal": "JOGULAMBA GADWAL",
  "bhadradri kothagudem": "BHADRADRI KOTHAGUDEM",
  "kothagudem": "BHADRADRI KOTHAGUDEM",
  "mahbubnagar": "MAHABUBNAGAR",
  "mahaboobnagar": "MAHABUBNAGAR",
  "mahbubabad": "MAHABUBABAD",
  "mahaboobabad": "MAHABUBABAD",
  "secunderabad": "HYDERABAD",
  "greater hyderabad": "HYDERABAD",
  "ghmc": "HYDERABAD",
  "cyberabad": "HYDERABAD"
};

const DISPLAY_OVERRIDES = {
  "MEDCHAL-MALKAJGIRI": "Medchal-Malkajgiri",
  "KUMURAMBHEEM ASIFABAD": "Kumuram Bheem Asifabad",
  "JAYASHANKAR BHUPALAPALLY": "Jayashankar Bhupalapally",
  "YADADRI BHUVANAGIRI": "Yadadri Bhuvanagiri",
  "RAJANNA SIRCILLA": "Rajanna Sircilla",
  "JOGULAMBA GADWAL": "Jogulamba Gadwal",
  "BHADRADRI KOTHAGUDEM": "Bhadradri Kothagudem",
  "RANGAREDDY": "Rangareddy"
};

const GEOJSON_SET = new Set(GEOJSON_DISTRICTS);

const canonicalizeKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Resolve any district spelling to the telangana_districts.geojson key,
 *  or null when the name is not a Telangana district at all. */
export const normalizeDistrict = (name) => {
  const key = canonicalizeKey(name);
  if (!key) return null;

  const upper = key.toUpperCase();
  if (GEOJSON_SET.has(upper)) return upper;

  const aliased = DISTRICT_ALIASES[key];
  if (aliased) return aliased;

  const hyphenated = upper.replace(/\s+/g, '-');
  if (GEOJSON_SET.has(hyphenated)) return hyphenated;

  const despaced = upper.replace(/[\s-]+/g, '');
  return GEOJSON_DISTRICTS.find((d) => d.replace(/[\s-]+/g, '') === despaced) || null;
};

export const isKnownDistrict = (name) => normalizeDistrict(name) !== null;

/** Human-readable district label, from any input spelling. */
export const formatDistrictLabel = (name) => {
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
