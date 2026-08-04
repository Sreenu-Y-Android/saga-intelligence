#!/usr/bin/env node
/**
 * build_tg_mlas.js
 * ─────────────────────────────────────────────────────────────────────
 * Generates `backend/src/data/tg_mlas.json` — the backend's source of truth
 * for MLA ↔ constituency mapping — by merging the two datasets that already
 * carry this information:
 *
 *   1. frontend/src/data/telanganaMlaDirectory.js  — party-wise and
 *      image-linked, covers all parties, but only seats that have a photo
 *      on file (118 members).
 *   2. backend/src/config/politicalData.js         — the INC roster with
 *      handles and districts; fills Congress seats the directory omits.
 *
 * Generating rather than hand-maintaining a third copy matters because those
 * two are the files that actually get edited when an MLA changes; a
 * hand-written backend copy would drift within a release or two.
 *
 * The frontend files are ES modules and the backend is CommonJS, so this
 * script stages `.mjs` copies in a temp dir and dynamically imports them.
 *
 * Run after editing either source:
 *     node scripts/build_tg_mlas.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const {
  normalizeConstituencyKey,
  getReservationStatus,
} = require('../src/config/constituencyNormalizer');
const { normalizeDistrict, formatDistrictLabel } = require('../src/config/districtNormalizer');
const { CABINET_MINISTERS, CONGRESS_MLAS } = require('../src/config/politicalData');

const FRONTEND_DATA = path.join(__dirname, '..', '..', 'frontend', 'src', 'data');
const OUTPUT = path.join(__dirname, '..', 'src', 'data', 'tg_mlas.json');

const SOURCES = ['telanganaMinistersData.js', 'telanganaMlaDirectory.js'];

/** Which alliance each party sat in after the 2023 assembly election. */
const PARTY_ALLIANCE = {
  INC: 'INDIA',
  CPI: 'INDIA',
  BRS: 'BRS',
  BJP: 'NDA',
  AIMIM: 'AIMIM',
};

/**
 * The frontend cannot import backend JSON, so mirror the dataset into
 * `frontend/src/data/` as ES modules. Generated from the same records, so the
 * two can never drift — which is exactly what would happen if the frontend
 * kept its own hand-maintained roster.
 */
function writeFrontendModules(records) {
  const frontendDataDir = path.join(__dirname, '..', '..', 'frontend', 'src', 'data');
  fs.mkdirSync(frontendDataDir, { recursive: true });

  const banner = (source) =>
    `/**\n` +
    ` * GENERATED FILE — DO NOT EDIT BY HAND.\n` +
    ` * Produced by backend/scripts/build_tg_mlas.js from ${source}.\n` +
    ` * Re-run that script after changing the roster.\n` +
    ` */\n\n`;

  /* ── tgMLAs.js — 119 assembly seats ───────────────────────────── */
  const mlaRows = records.map((r) => ({
    constituency: r.constituency,
    key: r.key,
    mla: r.mla,
    shortName: r.shortName,
    party: r.party,
    alliance: r.alliance,
    role: r.role,
    district: r.district,
    districtKey: r.districtKey,
    reservation: r.reservation,
    image: r.image,
    handles: r.handles,
  }));

  fs.writeFileSync(
    path.join(frontendDataDir, 'tgMLAs.js'),
    `${banner('telanganaMlaDirectory.js + politicalData.js')}` +
      `export const TG_MLAS = ${JSON.stringify(mlaRows, null, 2)};\n\n` +
      `/**\n` +
      ` * Reduce a constituency name to a stable lookup key.\n` +
      ` * Mirrors backend/src/config/constituencyNormalizer.js — strips (SC)/(ST)\n` +
      ` * reservation markers only, so "Nizamabad (Urban)" and "Nizamabad (Rural)"\n` +
      ` * stay distinct seats instead of collapsing onto one key.\n` +
      ` */\n` +
      `export const normalizeConstituencyKey = (name) =>\n` +
      `  String(name || '')\n` +
      `    .toLowerCase()\n` +
      `    .replace(/\\((\\s*(sc|st|gen|general)\\s*)\\)/gi, ' ')\n` +
      `    .replace(/[^a-z0-9]/g, '')\n` +
      `    .trim();\n\n` +
      `export const MLA_BY_KEY = TG_MLAS.reduce((acc, m) => {\n` +
      `  acc[m.key] = m;\n` +
      `  return acc;\n` +
      `}, {});\n\n` +
      `export const getMlaByConstituency = (name) =>\n` +
      `  MLA_BY_KEY[normalizeConstituencyKey(name)] || null;\n\n` +
      `export const getMlasByDistrict = (districtKey) =>\n` +
      `  TG_MLAS.filter((m) => m.districtKey === districtKey);\n\n` +
      `export default TG_MLAS;\n`
  );

  /* ── tgMPs.js — 17 Lok Sabha seats ────────────────────────────── */
  const lsToAc = readJsonSafe(path.join(__dirname, '..', 'src', 'data', 'ls_to_ac.json')) || {};
  const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  const mpRows = Object.entries(lsToAc).map(([lsKey, acs]) => ({
    ls_id: lsKey,
    ls_name: titleCase(lsKey),
    // No Telangana MP roster is available in this repo yet. The seat and its
    // assembly segments are real; the member is explicitly null rather than a
    // placeholder name that would render as fact.
    mp: null,
    party: null,
    assembly_segments: acs,
  }));

  fs.writeFileSync(
    path.join(frontendDataDir, 'tgMPs.js'),
    `${banner('ls_to_ac.json (derived from telangana_ac.geojson PC_NAME)')}` +
      `export const TG_MPS = ${JSON.stringify(mpRows, null, 2)};\n\n` +
      `export const MP_BY_LS_ID = TG_MPS.reduce((acc, m) => {\n` +
      `  acc[String(m.ls_id).toLowerCase()] = m;\n` +
      `  return acc;\n` +
      `}, {});\n\n` +
      `export const getMpByLsId = (lsId) => MP_BY_LS_ID[String(lsId || '').toLowerCase()] || null;\n\n` +
      `export const getMpByLsName = (name) =>\n` +
      `  MP_BY_LS_ID[String(name || '').toLowerCase().trim()] || null;\n\n` +
      `export default TG_MPS;\n`
  );

  /* ── districtNames.js — mirror of the backend district normalizer ── */
  const {
    GEOJSON_DISTRICTS,
    DISTRICT_ALIASES,
  } = require('../src/config/districtNormalizer');

  const geoDir = path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'geographic');
  fs.mkdirSync(geoDir, { recursive: true });

  fs.writeFileSync(
    path.join(geoDir, 'districtNames.js'),
    `${banner('backend/src/config/districtNormalizer.js')}` +
      `/**\n` +
      ` * Client-side mirror of the backend district normalizer, so a district\n` +
      ` * renders under one label no matter which of the three spellings in this\n` +
      ` * system it arrived as. Without it the choropleth join misses and the\n` +
      ` * district paints as "no data" — a data bug that looks like missing coverage.\n` +
      ` */\n\n` +
      `export const GEOJSON_DISTRICTS = ${JSON.stringify(GEOJSON_DISTRICTS, null, 2)};\n\n` +
      `export const DISTRICT_ALIASES = ${JSON.stringify(DISTRICT_ALIASES, null, 2)};\n\n` +
      `const DISPLAY_OVERRIDES = ${JSON.stringify(
        {
          'MEDCHAL-MALKAJGIRI': 'Medchal-Malkajgiri',
          'KUMURAMBHEEM ASIFABAD': 'Kumuram Bheem Asifabad',
          'JAYASHANKAR BHUPALAPALLY': 'Jayashankar Bhupalapally',
          'YADADRI BHUVANAGIRI': 'Yadadri Bhuvanagiri',
          'RAJANNA SIRCILLA': 'Rajanna Sircilla',
          'JOGULAMBA GADWAL': 'Jogulamba Gadwal',
          'BHADRADRI KOTHAGUDEM': 'Bhadradri Kothagudem',
          RANGAREDDY: 'Rangareddy',
        },
        null,
        2
      )};\n\n` +
      `const GEOJSON_SET = new Set(GEOJSON_DISTRICTS);\n\n` +
      `const canonicalizeKey = (value) =>\n` +
      `  String(value || '')\n` +
      `    .toLowerCase()\n` +
      `    .replace(/[._]+/g, ' ')\n` +
      `    .replace(/\\s+/g, ' ')\n` +
      `    .trim();\n\n` +
      `/** Resolve any district spelling to the telangana_districts.geojson key,\n` +
      ` *  or null when the name is not a Telangana district at all. */\n` +
      `export const normalizeDistrict = (name) => {\n` +
      `  const key = canonicalizeKey(name);\n` +
      `  if (!key) return null;\n\n` +
      `  const upper = key.toUpperCase();\n` +
      `  if (GEOJSON_SET.has(upper)) return upper;\n\n` +
      `  const aliased = DISTRICT_ALIASES[key];\n` +
      `  if (aliased) return aliased;\n\n` +
      `  const hyphenated = upper.replace(/\\s+/g, '-');\n` +
      `  if (GEOJSON_SET.has(hyphenated)) return hyphenated;\n\n` +
      `  const despaced = upper.replace(/[\\s-]+/g, '');\n` +
      `  return GEOJSON_DISTRICTS.find((d) => d.replace(/[\\s-]+/g, '') === despaced) || null;\n` +
      `};\n\n` +
      `export const isKnownDistrict = (name) => normalizeDistrict(name) !== null;\n\n` +
      `/** Human-readable district label, from any input spelling. */\n` +
      `export const formatDistrictLabel = (name) => {\n` +
      `  const normalized = normalizeDistrict(name);\n` +
      `  if (!normalized) {\n` +
      `    return String(name || '')\n` +
      `      .trim()\n` +
      `      .replace(/[_-]+/g, ' ')\n` +
      `      .replace(/\\b\\w/g, (c) => c.toUpperCase());\n` +
      `  }\n` +
      `  return (\n` +
      `    DISPLAY_OVERRIDES[normalized] ||\n` +
      `    normalized.toLowerCase().replace(/\\b\\w/g, (c) => c.toUpperCase())\n` +
      `  );\n` +
      `};\n`
  );

  console.log('Wrote frontend/src/data/tgMLAs.js, tgMPs.js and components/geographic/districtNames.js');
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

async function main() {
  for (const file of SOURCES) {
    if (!fs.existsSync(path.join(FRONTEND_DATA, file))) {
      console.error(`Missing source: ${path.join(FRONTEND_DATA, file)}`);
      process.exit(1);
    }
  }

  // Stage .mjs copies so Node treats them as ES modules regardless of the
  // nearest package.json "type" field.
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-mlas-'));
  try {
    for (const file of SOURCES) {
      const source = fs.readFileSync(path.join(FRONTEND_DATA, file), 'utf8');
      // Extensionless relative imports are valid in bundlers but not in Node ESM.
      const rewritten = source.replace(
        /from\s+'\.\/telanganaMinistersData'/g,
        "from './telanganaMinistersData.mjs'"
      );
      fs.writeFileSync(path.join(stage, file.replace(/\.js$/, '.mjs')), rewritten);
    }

    const directoryUrl = pathToFileURL(path.join(stage, 'telanganaMlaDirectory.mjs')).href;
    const { PARTY_WISE_MLA_DIRECTORY } = await import(directoryUrl);

    const byKey = new Map();
    const skipped = [];
    const duplicates = [];

    const addRecord = (record) => {
      const existing = byKey.get(record.key);
      if (existing) {
        // Same seat claimed twice. Prefer the richer record (one with a photo
        // and a party) but report it — a genuine duplicate means one of the two
        // MLAs would otherwise disappear from every lookup silently.
        duplicates.push(`${record.constituency} — ${existing.mla} (${existing.party}) vs ${record.mla} (${record.party})`);
        if (!existing.image && record.image) byKey.set(record.key, { ...record });
        return;
      }
      byKey.set(record.key, record);
    };

    /* ── source 1: party-wise directory (all parties, photo-backed) ── */
    for (const partyGroup of PARTY_WISE_MLA_DIRECTORY) {
      for (const member of partyGroup.members) {
        // A member with no constituency cannot be joined to a map polygon or a
        // grievance, so it is reference-only — record it as skipped rather than
        // emitting a row that silently never matches anything.
        if (!member.constituency) {
          skipped.push(`${partyGroup.party}: ${member.name}`);
          continue;
        }

        const normalizedDistrict = normalizeDistrict(member.district);

        addRecord({
          constituency: member.constituency.toUpperCase(),
          key: normalizeConstituencyKey(member.constituency),
          reservation: getReservationStatus(member.constituency),
          mla: member.name,
          shortName: member.shortName || member.name,
          party: partyGroup.party,
          alliance: PARTY_ALLIANCE[partyGroup.party] || partyGroup.party,
          role: member.role || 'MLA',
          district: normalizedDistrict ? formatDistrictLabel(normalizedDistrict) : (member.district || ''),
          districtKey: normalizedDistrict || '',
          department: member.department || '',
          image: member.image || '',
          profileId: member.id || '',
          handles: [],
          source: 'directory',
        });
      }
    }

    /* ── source 2: INC roster (fills Congress seats with no photo) ── */
    for (const leader of [...CABINET_MINISTERS, ...CONGRESS_MLAS]) {
      if (!leader.constituency) continue;

      const key = normalizeConstituencyKey(leader.constituency);
      const existing = byKey.get(key);

      if (existing) {
        // Already covered by the directory — enrich it with the handles and
        // district the roster carries but the photo directory does not.
        if (!existing.handles.length && leader.handles?.length) {
          existing.handles = [...leader.handles];
        }
        if (!existing.districtKey && leader.district) {
          const d = normalizeDistrict(leader.district);
          if (d) {
            existing.districtKey = d;
            existing.district = formatDistrictLabel(d);
          }
        }
        continue;
      }

      const normalizedDistrict = normalizeDistrict(leader.district);

      addRecord({
        constituency: leader.constituency.toUpperCase(),
        key,
        reservation: getReservationStatus(leader.constituency),
        mla: leader.name,
        shortName: leader.shortName || leader.name,
        party: 'INC',
        alliance: PARTY_ALLIANCE.INC,
        role: leader.role || 'MLA',
        district: normalizedDistrict ? formatDistrictLabel(normalizedDistrict) : (leader.district || ''),
        districtKey: normalizedDistrict || '',
        department: '',
        image: '',
        profileId: leader.id || '',
        handles: leader.handles || [],
        source: 'roster',
      });
    }

    const records = [...byKey.values()].sort((a, b) =>
      a.constituency.localeCompare(b.constituency)
    );

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(records, null, 2)}\n`);

    writeFrontendModules(records);

    const partyCounts = records.reduce((acc, r) => {
      acc[r.party] = (acc[r.party] || 0) + 1;
      return acc;
    }, {});
    const fromRoster = records.filter((r) => r.source === 'roster').length;

    console.log(`Wrote ${records.length} MLAs to src/data/tg_mlas.json`);
    console.log('By party:', partyCounts);
    console.log(`Seat coverage: ${records.length} / 119   (${fromRoster} recovered from the INC roster)`);
    console.log(`Records without a photo: ${records.filter((r) => !r.image).length}`);

    if (duplicates.length) {
      console.warn(`\n⚠ ${duplicates.length} seat(s) claimed twice:`);
      for (const d of duplicates) console.warn(`   ${d}`);
    }
    if (skipped.length) {
      console.warn(`\n⚠ ${skipped.length} member(s) skipped — no constituency on record:`);
      for (const s of skipped) console.warn(`   ${s}`);
    }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
