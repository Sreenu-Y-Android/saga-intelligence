/**
 * boothVoterService
 * ─────────────────────────────────────────────────────────────────────
 * Booth-level (polling-station) voter data sourced from the ECI 2025
 * Final Roll exports.
 *
 *  - `<key>.summary.json`      : one row per booth with elector counts
 *                                (drives the booth list + analytics).
 *  - `voters/<key>/<part>.json`: the full voter roll for that booth
 *                                (name, voter id, relation, house, age,
 *                                gender). Loaded lazily, per booth, and
 *                                cached in memory — the full set is ~500k
 *                                rows / 66MB so it must never be required
 *                                up front.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'boothVoters');

const normalizeConstituencyKey = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();

// Constituencies we have a booth summary for. Value is the on-disk key.
//
// DISCOVERED FROM DISK rather than hardcoded: the AP build listed its two
// seats inline, which meant adding a third required a code change. Here we
// scan `data/boothVoters/*.summary.json` at startup, so dropping in a
// Telangana booth roll makes it available with no edit. Currently empty —
// no Telangana booth rolls have been supplied yet, and the endpoints return
// an explicit "no booth data" response rather than fabricating counts.
const SUMMARY_KEYS = (() => {
  const map = {};
  try {
    for (const file of fs.readdirSync(DATA_DIR)) {
      const match = file.match(/^(.+)\.summary\.json$/);
      if (match) map[normalizeConstituencyKey(match[1])] = match[1];
    }
  } catch (_) {
    // Directory absent until the first booth roll is added — not an error.
  }
  return map;
})();

/** True when ANY constituency has booth rolls on disk (see hasBoothData below
 *  for the per-constituency check). Lets callers show a single "booth data not
 *  loaded" state instead of probing all 119 seats. */
const hasAnyBoothData = () => Object.keys(SUMMARY_KEYS).length > 0;

// Cache the (small) summaries and the (large) per-booth voter rolls so we
// only hit disk + JSON.parse once per file for the life of the process.
const summaryCache = new Map();
const voterCache = new Map();

const loadSummary = (key) => {
  if (summaryCache.has(key)) return summaryCache.get(key);
  const file = path.join(DATA_DIR, `${key}.summary.json`);
  let rows = null;
  try {
    rows = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    rows = null;
  }
  summaryCache.set(key, rows);
  return rows;
};

const hasBoothData = (constituency) => {
  const key = SUMMARY_KEYS[normalizeConstituencyKey(constituency)];
  if (!key) return false;
  const rows = loadSummary(key);
  return Boolean(rows && rows.length);
};

const getBoothsByConstituency = (constituency) => {
  const key = SUMMARY_KEYS[normalizeConstituencyKey(constituency)];
  if (!key) return null;
  const rows = loadSummary(key);
  if (!rows || !rows.length) return null;
  // The 2025 Final Roll is the complete set of parts for the seat, so the
  // number of booths we hold is also the official total — coverage is 100%.
  const total = rows.length;
  return {
    constituency,
    key,
    booths: rows,
    coverage: {
      collected: rows.length,
      total_booths: total,
      pct: total ? Math.round((rows.length / total) * 100) : 0,
    },
  };
};

// Lightweight lookup of a single booth's summary row (locality / polling
// station / counts) without touching the heavy voter roll — used by the
// area-sentiment endpoint.
const getBoothSummary = (constituency, part) => {
  const key = SUMMARY_KEYS[normalizeConstituencyKey(constituency)];
  if (!key) return null;
  const partNum = Number(part);
  if (!Number.isFinite(partNum)) return null;
  const row = (loadSummary(key) || []).find((b) => b.part === partNum);
  return row ? { key, ...row } : null;
};

const loadVoterRoll = (key, part) => {
  const cacheKey = `${key}/${part}`;
  if (voterCache.has(cacheKey)) return voterCache.get(cacheKey);
  const file = path.join(DATA_DIR, 'voters', key, `${part}.json`);
  let rows = null;
  try {
    rows = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    rows = null;
  }
  voterCache.set(cacheKey, rows);
  return rows;
};

const genderBucket = (g) => {
  const v = String(g || '').trim().toLowerCase();
  if (v === 'male') return 'male';
  if (v === 'female') return 'female';
  if (v.includes('third') || v === 'tg') return 'third';
  return 'other';
};

/* Exact booth-level metrics derived from the full voter roll — genders, age
 * profile (brackets + avg/median), first-time/senior share, and household
 * spread. Single pass over the roll. */
const computeBoothMetrics = (all) => {
  const counts = { male: 0, female: 0, third: 0, other: 0 };
  const age = { '18-29': 0, '30-44': 0, '45-59': 0, '60+': 0, unknown: 0 };
  const houses = new Map();
  const ages = [];
  let ageSum = 0;

  for (const v of all) {
    counts[genderBucket(v.gender)] += 1;

    const a = Number(v.age);
    if (Number.isFinite(a) && a > 0) {
      ageSum += a;
      ages.push(a);
      if (a < 30) age['18-29'] += 1;
      else if (a < 45) age['30-44'] += 1;
      else if (a < 60) age['45-59'] += 1;
      else age['60+'] += 1;
    } else {
      age.unknown += 1;
    }

    const h = String(v.house_no || '').trim();
    if (h && h !== '-') houses.set(h, (houses.get(h) || 0) + 1);
  }

  ages.sort((a, b) => a - b);
  const median = ages.length ? ages[Math.floor(ages.length / 2)] : null;
  const total = all.length;
  const households = houses.size;

  return {
    total,
    counts,
    age,
    avgAge: ages.length ? Math.round(ageSum / ages.length) : null,
    medianAge: median,
    youngCount: age['18-29'],
    youngPct: total ? Math.round((age['18-29'] / total) * 100) : 0,
    seniorCount: age['60+'],
    seniorPct: total ? Math.round((age['60+'] / total) * 100) : 0,
    households,
    avgPerHousehold: households ? Number((total / households).toFixed(1)) : null,
    // Standard electoral sex ratio: females per 1,000 males.
    genderRatio: counts.male ? Math.round((counts.female / counts.male) * 1000) : null,
  };
};

/**
 * Paginated + searchable voter roll for one booth.
 * opts: { page=1, pageSize=50, search='', gender='' }
 * Returns null when the constituency/booth has no roll on disk.
 */
const getBoothVoters = (constituency, part, opts = {}) => {
  const key = SUMMARY_KEYS[normalizeConstituencyKey(constituency)];
  if (!key) return null;
  const partNum = Number(part);
  if (!Number.isFinite(partNum)) return null;

  const all = loadVoterRoll(key, partNum);
  if (!all) return null;

  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(opts.pageSize) || 50));
  const search = String(opts.search || '').trim().toLowerCase();
  const genderFilter = String(opts.gender || '').trim().toLowerCase();

  // Whole-booth metrics + gender breakdown (before any filtering).
  const metrics = computeBoothMetrics(all);
  const counts = metrics.counts;

  let rows = all;
  if (search) {
    rows = rows.filter((v) =>
      String(v.name || '').toLowerCase().includes(search) ||
      String(v.voter_id || '').toLowerCase().includes(search) ||
      String(v.relation || '').toLowerCase().includes(search) ||
      String(v.house_no || '').toLowerCase().includes(search));
  }
  if (genderFilter && genderFilter !== 'all') {
    rows = rows.filter((v) => genderBucket(v.gender) === genderFilter);
  }

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const voters = rows.slice(start, start + pageSize);

  // Booth summary row (locality / polling station) for context in the header.
  const summary = (loadSummary(key) || []).find((b) => b.part === partNum) || null;

  return {
    constituency,
    key,
    part: partNum,
    summary,
    counts,
    metrics,
    totalUnfiltered: all.length,
    total,
    page,
    pageSize,
    pages,
    voters,
  };
};

module.exports = {
  hasBoothData,
  hasAnyBoothData,
  getBoothsByConstituency,
  getBoothVoters,
  getBoothSummary,
  normalizeConstituencyKey,
};
