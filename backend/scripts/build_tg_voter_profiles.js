#!/usr/bin/env node
/**
 * build_tg_voter_profiles.js
 * ─────────────────────────────────────────────────────────────────────
 * Generates `backend/src/data/tg_voter_profiles.json` — one record per
 * Telangana assembly constituency — from data already in the repo:
 *
 *   • AC number + name   ← frontend/public/telangana_ac.geojson (AC_NO / AC_NAME)
 *   • Lok Sabha seat     ← backend/src/data/ls_to_ac.json
 *   • MLA / party        ← backend/src/data/tg_mlas.json
 *   • District           ← districtNormalizer (geojson-consistent keys)
 *   • Reserved category  ← the (SC)/(ST) marker on the seat name
 *
 * WHAT IS NOT POPULATED
 * Elector counts (male/female/other/total), 2023 election results and
 * socio-economic indicators are NOT derivable from anything in this repo —
 * they need an ECI statistical report and a Telangana Socio Economic Survey
 * extract. Those fields are emitted as null with `data_status` marking them
 * pending, so `getVoterProfileCoverage()` reports them honestly to the UI
 * instead of the page rendering zeros that look like real measurements.
 *
 * To populate them later, drop in:
 *   backend/src/data/tg_ac_electors_verified.json   (keyed by AC number)
 *   backend/src/data/tg_socioeconomic_latest.json   ({_meta, statewide})
 * and re-run this script — it picks them up automatically.
 *
 * Run:  node scripts/build_tg_voter_profiles.js
 */

const fs = require('fs');
const path = require('path');

const {
  normalizeConstituencyKey,
  getReservationStatus,
} = require('../src/config/constituencyNormalizer');
const { normalizeDistrict, formatDistrictLabel } = require('../src/config/districtNormalizer');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const GEOJSON = path.join(__dirname, '..', '..', 'frontend', 'public', 'telangana_ac.geojson');
const OUTPUT = path.join(DATA_DIR, 'tg_voter_profiles.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** Optional enrichment files — absent until real datasets are supplied. */
const readOptional = (name) => {
  const file = path.join(DATA_DIR, name);
  return fs.existsSync(file) ? readJson(file) : null;
};

const geo = readJson(GEOJSON);
const lsToAc = readJson(path.join(DATA_DIR, 'ls_to_ac.json'));
const mlas = readJson(path.join(DATA_DIR, 'tg_mlas.json'));

const electors = readOptional('tg_ac_electors_verified.json');
const socioEconomic = readOptional('tg_socioeconomic_latest.json');

/* ─── indexes ──────────────────────────────────────────────────────── */

const mlaByKey = mlas.reduce((acc, m) => {
  acc[m.key] = m;
  return acc;
}, {});

// AC → Lok Sabha, from the ls_to_ac fan-out.
const acToLs = {};
for (const [ls, acs] of Object.entries(lsToAc)) {
  for (const ac of acs) acToLs[normalizeConstituencyKey(ac)] = ls;
}

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/* ─── build ────────────────────────────────────────────────────────── */

const seen = new Set();
const profiles = [];
const unmatchedMla = [];

for (const feature of geo.features) {
  const props = feature.properties || {};
  const acName = String(props.AC_NAME || '').trim();
  const acNumber = Number(props.AC_NO);
  if (!acName || !acNumber) continue;

  const key = normalizeConstituencyKey(acName);
  if (seen.has(key)) continue;
  seen.add(key);

  const mla = mlaByKey[key] || null;
  if (!mla) unmatchedMla.push(`AC ${acNumber} ${acName}`);

  const districtKey = normalizeDistrict(mla?.district || props.DIST_NAME);
  const electorRow = electors ? electors[String(acNumber)] : null;

  profiles.push({
    ac_number: acNumber,
    constituency: acName.toUpperCase(),
    key,
    district: districtKey ? formatDistrictLabel(districtKey) : titleCase(String(props.DIST_NAME || '')),
    district_key: districtKey || null,
    reserved_category: getReservationStatus(acName),
    lok_sabha: acToLs[key] ? titleCase(acToLs[key]) : null,

    mla: mla
      ? {
          name: mla.mla,
          party: mla.party,
          alliance: mla.alliance,
          role: mla.role,
          // ADR affidavit fields — no Telangana affidavit dataset loaded yet.
          criminal_cases: null,
          education: null,
          assets: null,
          liabilities: null,
          in_static_roster: true,
        }
      : null,

    electors_male: electorRow ? electorRow.electors_male : null,
    electors_female: electorRow ? electorRow.electors_female : null,
    electors_other: electorRow ? electorRow.electors_other : null,
    electors_total: electorRow ? electorRow.electors_total : null,
    electors_source: electorRow ? electorRow.source : null,

    // 2023 Telangana assembly results — pending an ECI results dataset.
    election_2023: null,

    socio_economic: socioEconomic
      ? {
          ...socioEconomic.statewide,
          vintage: socioEconomic._meta?.vintage || null,
          granularity: socioEconomic._meta?.granularity || null,
          source: socioEconomic._meta?.source || null,
        }
      : null,

    data_status: {
      identity: 'populated',
      mla: mla ? 'populated' : 'pending',
      electors: electorRow ? 'populated' : 'pending',
      election_results: 'pending',
      socio_economic: socioEconomic ? 'populated' : 'pending',
      booth_level: 'pending',
    },

    data_sources: {
      identity: 'Derived from telangana_ac.geojson (ECI Delimitation 2008 boundaries)',
      mla: 'tg_mlas.json — generated from telanganaMlaDirectory.js + politicalData.js roster',
      lok_sabha: 'ls_to_ac.json — derived from the AC geojson PC_NAME field',
      electors: electorRow ? electorRow.source : 'PENDING — needs an ECI AC-wise electors report for Telangana',
      election_results: 'PENDING — needs an ECI 2023 Telangana assembly results dataset',
      socio_economic: socioEconomic ? socioEconomic._meta?.source : 'PENDING — needs a Telangana Socio Economic Survey extract',
    },
  });
}

profiles.sort((a, b) => a.ac_number - b.ac_number);

fs.writeFileSync(OUTPUT, `${JSON.stringify(profiles, null, 2)}\n`);

const withMla = profiles.filter((p) => p.mla).length;
console.log(`Wrote ${profiles.length} constituency profiles to src/data/tg_voter_profiles.json`);
console.log(`  MLA matched      : ${withMla} / ${profiles.length}`);
console.log(`  Lok Sabha mapped : ${profiles.filter((p) => p.lok_sabha).length} / ${profiles.length}`);
console.log(`  District resolved: ${profiles.filter((p) => p.district_key).length} / ${profiles.length}`);
console.log(`  Reserved seats   : SC=${profiles.filter((p) => p.reserved_category === 'SC').length} ST=${profiles.filter((p) => p.reserved_category === 'ST').length}`);
console.log(`  Electors         : ${electors ? 'loaded' : 'PENDING (drop in tg_ac_electors_verified.json)'}`);
console.log(`  Socio-economic   : ${socioEconomic ? 'loaded' : 'PENDING (drop in tg_socioeconomic_latest.json)'}`);

if (unmatchedMla.length) {
  console.warn(`\n⚠ ${unmatchedMla.length} constituency/ies with no MLA match:`);
  for (const u of unmatchedMla) console.warn(`   ${u}`);
}
