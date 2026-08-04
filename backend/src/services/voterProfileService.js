/**
 * voterProfileService
 * ─────────────────────────────────────────────────────────────────────
 * Read-only reference layer over the per-constituency voter profile dataset
 * covering the 119 Telangana assembly constituencies.
 *
 * The dataset is GENERATED — run `node scripts/build_tg_voter_profiles.js`.
 * Do not hand-edit `tg_voter_profiles.json`; it is rebuilt from the AC
 * geojson, `tg_mlas.json` and `ls_to_ac.json`.
 *
 * DATA HONESTY
 * Identity (AC number/name/district/Lok Sabha/reserved status) and the MLA
 * roster are fully populated. Elector counts, 2023 election results and
 * socio-economic indicators are NOT — no Telangana source for them exists in
 * this repo yet. Rather than emit zeros that render as real measurements,
 * those fields are null and `DATA_COVERAGE` / each record's `data_status`
 * report them as pending so the UI can say so explicitly.
 *
 * To populate them, drop the files named in the generator script into
 * `src/data/` and re-run it — no code change needed here.
 */

const TG_VOTER_PROFILES = require('../data/tg_voter_profiles.json');
const { normalizeConstituencyKey } = require('../config/constituencyNormalizer');
const { normalizeDistrict } = require('../config/districtNormalizer');

const PROFILE_BY_KEY = TG_VOTER_PROFILES.reduce((acc, p) => {
  acc[p.key] = p;
  return acc;
}, {});

const PROFILE_BY_AC_NUMBER = TG_VOTER_PROFILES.reduce((acc, p) => {
  acc[p.ac_number] = p;
  return acc;
}, {});

const getAllVoterProfiles = () => TG_VOTER_PROFILES;

const getVoterProfileByConstituency = (name) =>
  PROFILE_BY_KEY[normalizeConstituencyKey(name)] || null;

const getVoterProfileByAcNumber = (acNumber) =>
  PROFILE_BY_AC_NUMBER[Number(acNumber)] || null;

const getVoterProfilesByDistrict = (district) => {
  const key = normalizeDistrict(district);
  if (!key) return [];
  return TG_VOTER_PROFILES.filter((p) => p.district_key === key);
};

/**
 * Which sections of the standard 9-part voter-profile spec are populated vs
 * pending, for UI messaging.
 *
 *   populated   — real values for every seat
 *   partial     — some fields present, others pending
 *   pending     — no source loaded yet, but the shape exists and will fill in
 *   unavailable — not published at AC granularity by any official source
 *   derived     — produced by the grievance/sentiment pipeline, not this dataset
 */
const DATA_COVERAGE = {
  electoral_profile: 'pending',        // needs an ECI AC-wise electors report for Telangana
  demographic_profile: 'pending',
  community_social_profile: 'unavailable', // not published at AC granularity
  socio_economic_profile: 'pending',   // needs a Telangana Socio Economic Survey extract
  geographic_profile: 'partial',       // district + Lok Sabha populated; mandals/villages/wards pending
  election_intelligence: 'pending',    // needs an ECI 2023 Telangana assembly results dataset
  public_issues_profile: 'derived',    // comes from the grievance/sentiment pipeline
  booth_level_profile: 'unavailable',  // needs booth rolls
  citizen_engagement_metrics: 'unavailable',
};

/** Machine-readable coverage summary so the UI can render an honest banner. */
const getVoterProfileCoverage = () => {
  const total = TG_VOTER_PROFILES.length;
  const count = (predicate) => TG_VOTER_PROFILES.filter(predicate).length;

  return {
    total_constituencies: total,
    sections: DATA_COVERAGE,
    populated: {
      identity: total,
      mla: count((p) => p.mla),
      lok_sabha: count((p) => p.lok_sabha),
      district: count((p) => p.district_key),
      electors: count((p) => p.electors_total !== null),
      election_results: count((p) => p.election_2023 !== null),
      socio_economic: count((p) => p.socio_economic !== null),
    },
  };
};

module.exports = {
  TG_VOTER_PROFILES,
  // Legacy alias — AP-era callers referenced this as AP_VOTER_PROFILES.
  AP_VOTER_PROFILES: TG_VOTER_PROFILES,
  normalizeConstituencyKey,
  getAllVoterProfiles,
  getVoterProfileByConstituency,
  getVoterProfileByAcNumber,
  getVoterProfilesByDistrict,
  getVoterProfileCoverage,
  DATA_COVERAGE,
};
