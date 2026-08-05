/**
 * Seed active-monitoring keywords (topic terms + individual candidate names/handles)
 * into the Keyword collection, so they:
 *
 *   1. Get actively searched across X/Facebook/Instagram/YouTube by
 *      grievanceService.fetchKeywordGrievances() (POST /api/grievances/fetch-keywords),
 *      pulling matching posts straight into Grievances for analysis.
 *   2. Also flow into Alerts via monitorService.performFullAnalysis(), which reads
 *      every active Keyword when scanning monitored sources.
 *
 * IMPORTANT: these are seeded with weight=1 and category='monitoring' —
 * deliberately NOT the default weight=50. monitorService.performFullAnalysis()
 * overrides risk_score with keyword weight on any match ("Layer 1: Explicit
 * User Keyword Matching"), so a generic topic term like "Revanth Reddy" or
 * "#RevanthReddy" at the default weight would flag ordinary positive coverage
 * as a medium-risk alert. weight=1 keeps these search-only / non-risk.
 *
 * Run:  node scripts/seed_monitoring_keywords.js
 *       node scripts/seed_monitoring_keywords.js --force     (overwrite existing)
 *       node scripts/seed_monitoring_keywords.js --dry-run   (preview only, no writes)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Keyword = require('../src/models/Keyword');
const { OUR_LEADERS, OPPOSITION_LEADERS } = require('../src/config/politicalData');

const WEIGHT = 1;
const CATEGORY = 'hate';

// ─────────────────────────────────────────────────────────
// Topic / hashtag monitoring terms
// ─────────────────────────────────────────────────────────

const EN_NEGATIVE = [
  'Revanth Reddy failed promises', 'Revanth Reddy six guarantees', 'Congress six guarantees failure',
  'Telangana Congress failed promises', 'Revanth Reddy loan waiver', 'Congress loan waiver delay',
  'Rythu Bharosa delay', 'Revanth Reddy unemployment', 'Telangana job notifications delay',
  'Revanth Reddy HYDRA', 'HYDRA demolitions Telangana', 'Musi River project controversy',
  'Musi beautification protests', 'Revanth Reddy land acquisition', 'Congress Telangana corruption allegations',
  'Revanth Reddy governance failure', 'Telangana Congress anti farmer', 'Telangana Congress anti youth',
  'Revanth Reddy power cuts', 'Telangana Congress fiscal crisis', 'Revanth Reddy debt burden',
  'Revanth Reddy Praja Palana criticism', 'Congress Telangana betrayal', 'Revanth Reddy administration failure',
  '#FailedPromises', '#CongressFailedTelangana', '#RevanthFailed', '#SaveTelangana', '#BrokenPromises',
  '#CongressFailures', '#TelanganaBetrayed', '#HYDRAVictims', '#StopHYDRA', '#MusiProject',
  '#MusiEvictions', '#JoblessYouth', '#FarmerIssues', '#LoanWaiverDelay', '#PrajaPalanaFailure'
];

const EN_POSITIVE = [
  'Revanth Reddy development', 'Telangana Rising', 'Revanth Reddy investments', 'Revanth Reddy jobs',
  'Congress welfare Telangana', 'Praja Palana success', 'Revanth Reddy reforms', 'Telangana investment summit',
  'Future City Hyderabad', 'Revanth Reddy industrial growth', 'Telangana tourism development',
  'Revanth Reddy farmer welfare', 'Congress governance Telangana', 'Telangana economic growth',
  'Revanth Reddy infrastructure',
  '#RevanthReddy', '#CMRevanthReddy', '#TelanganaRising', '#PrajaPalana', '#TelanganaDevelopment',
  '#FutureCity', '#InvestInTelangana', '#CongressForTelangana', '#TelanganaProgress', '#NewTelangana',
  '#PeopleFirstGovernance', '#TelanganaGrowth', '#RevanthForTelangana', '#TelanganaTransformation',
  '#DevelopingTelangana'
];

const TE_NEGATIVE = [
  'రేవంత్ రెడ్డి హామీలు', 'రేవంత్ రెడ్డి ఆరు గ్యారంటీలు', 'కాంగ్రెస్ హామీలు అమలు కాలేదు',
  'రైతు రుణమాఫీ ఆలస్యం', 'రైతు భరోసా ఆలస్యం', 'రేవంత్ రెడ్డి నిరుద్యోగం', 'ఉద్యోగాల భర్తీ ఆలస్యం',
  'హైడ్రా కూల్చివేతలు', 'హైడ్రా వివాదం', 'మూసీ ప్రాజెక్ట్ వివాదం', 'మూసీ సుందరీకరణ వ్యతిరేకత',
  'కాంగ్రెస్ రైతు వ్యతిరేకం', 'కాంగ్రెస్ యువత వ్యతిరేకం', 'రేవంత్ పాలన వైఫల్యం', 'కాంగ్రెస్ మోసం తెలంగాణ',
  'నెరవేరని హామీలు', 'రేవంత్ రెడ్డి అప్పులు', 'విద్యుత్ కోతలు తెలంగాణ',
  '#హామీలమోసం', '#కాంగ్రెస్‌మోసం', '#రేవంత్‌విఫలం', '#హైడ్రాబాధితులు', '#మూసీవివాదం',
  '#రైతులసమస్యలు', '#నిరుద్యోగయువత', '#నెరవేరనిహామీలు'
];

const TE_POSITIVE = [
  'రేవంత్ రెడ్డి అభివృద్ధి', 'తెలంగాణ రైజింగ్', 'ప్రజా పాలన విజయవంతం', 'రేవంత్ రెడ్డి పెట్టుబడులు',
  'రేవంత్ రెడ్డి ఉపాధి', 'కాంగ్రెస్ సంక్షేమం', 'తెలంగాణ అభివృద్ధి', 'భవిష్యత్ నగరం',
  'పారిశ్రామిక వృద్ధి తెలంగాణ', 'రైతు సంక్షేమం తెలంగాణ', 'రేవంత్ రెడ్డి సంస్కరణలు', 'తెలంగాణ ఆర్థిక వృద్ధి',
  '#రేవంత్‌రెడ్డి', '#ప్రజాపాలన', '#తెలంగాణఅభివృద్ధి', '#కొత్తతెలంగాణ', '#అభివృద్ధితెలంగాణ',
  '#తెలంగాణప్రగతి', '#తెలంగాణరైజింగ్'
];

const ENTITY_SCHEME = [
  'Revanth Reddy', 'CM Revanth', 'Telangana Congress', 'TPCC', 'Praja Palana', 'HYDRA Telangana',
  'Musi River Project', 'Future City Hyderabad', 'Rythu Bharosa Telangana', 'Indiramma Housing',
  'Indiramma Illu', 'Mahalakshmi Scheme Telangana', 'Gruha Jyothi Telangana', 'Cheyutha Telangana',
  'Telangana CMO', 'Telangana Secretariat', 'Hyderabad Congress', 'Telangana Government',
  '#TelanganaCongress', '#CongressTelangana', '#TPCC', '#INC', '#TelanganaCM', '#TelanganaGovernment',
  '#Hyderabad', '#TelanganaPolitics', '#TelanganaNews', '#CongressGovernment', '#RevanthReddyGovernment',
  '#PrajaPalana', '#IndirammaIllu', '#IndirammaHousing', '#RythuBharosa', '#MahalakshmiScheme',
  '#GruhaJyothi', '#Cheyutha', '#FreeBusScheme', '#TelanganaWelfare'
];

const isTelugu = (s) => /[ఀ-౿]/.test(s);

const buildTopicEntries = () => {
  const groups = [
    { list: EN_NEGATIVE, direction: 'negative' },
    { list: EN_POSITIVE, direction: 'positive' },
    { list: TE_NEGATIVE, direction: 'negative' },
    { list: TE_POSITIVE, direction: 'positive' },
    { list: ENTITY_SCHEME, direction: 'neutral' }
  ];

  const seen = new Map(); // normalized keyword (lowercase) -> entry, dedupes cross-list repeats (e.g. #PrajaPalana)
  for (const { list, direction } of groups) {
    for (const term of list) {
      const trimmed = term.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue; // first occurrence wins
      seen.set(key, {
        keyword: trimmed,
        category: CATEGORY,
        language: isTelugu(trimmed) ? 'te' : 'en',
        weight: WEIGHT,
        direction,
        is_active: true
      });
    }
  }
  return [...seen.values()];
};

// ─────────────────────────────────────────────────────────
// Individual candidate terms — so each named leader (ours + opposition)
// is also actively fetched, not just the general topic list.
// ─────────────────────────────────────────────────────────

const buildCandidateEntries = () => {
  const seen = new Map();
  const allLeaders = [...OUR_LEADERS, ...OPPOSITION_LEADERS];

  for (const leader of allLeaders) {
    const direction = 'neutral'; // candidate name itself is neutral; tone comes from post content
    const nameTerm = (leader.shortName || leader.name || '').trim();
    if (nameTerm && nameTerm.length > 3) {
      const key = nameTerm.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, { keyword: nameTerm, category: CATEGORY, language: 'en', weight: WEIGHT, direction, is_active: true });
      }
    }
    for (const handle of leader.handles_normalized || []) {
      if (!handle) continue;
      const key = handle.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, { keyword: handle, category: CATEGORY, language: 'en', weight: WEIGHT, direction, is_active: true });
      }
    }
  }
  return [...seen.values()];
};

async function seed() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');

  try {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME });
    console.log(`Connected to MongoDB (db: ${process.env.DB_NAME})${dryRun ? ' [DRY RUN — no writes]' : ''}`);

    const entries = [...buildTopicEntries(), ...buildCandidateEntries()];
    console.log(`Prepared ${entries.length} monitoring keyword entries (topic + candidate, deduped).`);

    let inserted = 0, updated = 0, skipped = 0;
    for (const entry of entries) {
      // Case-insensitive existing check — schema unique index is case-sensitive,
      // but we don't want "TRS" and "trs" as separate docs.
      const existing = await Keyword.findOne({ keyword: { $regex: `^${entry.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
      if (existing) {
        if (dryRun) { skipped++; continue; }
        if (force) {
          existing.set(entry);
          await existing.save();
          updated++;
        } else {
          skipped++;
        }
        continue;
      }
      if (dryRun) { inserted++; continue; }
      await Keyword.create(entry);
      inserted++;
    }

    console.log(`\n${dryRun ? 'Would insert' : 'Done — inserted'}: ${inserted}, ${dryRun ? 'would update' : 'updated'}: ${updated}, skipped: ${skipped}, total considered: ${entries.length}`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
