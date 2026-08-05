/**
 * seed_trending_topics_keywords.js
 * ─────────────────────────────────────────────────────────────────────
 * Current (early August 2026) Telangana political news topics, researched
 * live rather than templated — see the migration/keyword-audit conversation
 * for sources. Meant to be refreshed periodically as news cycles move on;
 * this is a snapshot, not a permanent list.
 *
 * Same weight=1 / category='hate' / non-risk-triggering convention as
 * seed_monitoring_keywords.js.
 *
 * Run:  node scripts/seed_trending_topics_keywords.js --dry-run   (preview only)
 *       node scripts/seed_trending_topics_keywords.js             (insert new, skip existing)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Keyword = require('../src/models/Keyword');

const WEIGHT = 1;
const CATEGORY = 'hate';

// ─────────────────────────────────────────────────────────
// "Criminal waste" remark (Revanth Reddy, engineering graduates, late July
// 2026) — sparked a youth backlash, including a symbolic "Telangana Endrin
// Party" protest movement on Instagram.
// ─────────────────────────────────────────────────────────
const CRIMINAL_WASTE_CONTROVERSY = [
  'Revanth Reddy criminal waste', 'criminal waste remark', 'Telangana Endrin Party',
  'Revanth Reddy engineering graduates remark', 'Revanth Reddy youth backlash',
  '#CriminalWaste', '#TelanganaEndrinParty', '#RevanthInsultsYouth',
  'రేవంత్ రెడ్డి క్రిమినల్ వేస్ట్', 'రేవంత్ యువత అవమానం',
];

// ─────────────────────────────────────────────────────────
// KTR legal notice to Revanth Reddy — Globarena Technologies / 2019
// Intermediate exam-result controversy (early August 2026).
// ─────────────────────────────────────────────────────────
const GLOBARENA_CONTROVERSY = [
  'KTR legal notice Revanth Reddy', 'Globarena Technologies', 'Globarena controversy',
  '2019 Intermediate exam controversy', 'KTR Revanth apology demand',
  '#GlobarenaControversy', '#KTRLegalNotice',
  'కేటీఆర్ లీగల్ నోటీసు రేవంత్', 'గ్లోబరీనా వివాదం',
];

// ─────────────────────────────────────────────────────────
// Jobs promise / "one lakh government jobs" — KTR challenging the
// Congress government's 70,000-jobs claim against its Youth Declaration.
// ─────────────────────────────────────────────────────────
const JOBS_PROMISE_CONTROVERSY = [
  'one lakh jobs Telangana', 'Telangana government jobs promise', '70000 jobs Congress',
  'Youth Declaration Telangana', 'KTR jobs challenge Revanth', 'Telangana job notifications delay 2026',
  '#OneLakhJobs', '#TelanganaJobsPromise', '#YouthDeclaration',
  'తెలంగాణ లక్ష ఉద్యోగాలు', 'యువజన ప్రకటన తెలంగాణ',
];

// ─────────────────────────────────────────────────────────
// NEET-UG paper leak — KTR accusing Revanth of double standards for not
// protesting the Centre over it.
// ─────────────────────────────────────────────────────────
const NEET_CONTROVERSY = [
  'NEET UG paper leak Telangana', 'KTR NEET double standards', 'Revanth Reddy NEET silence',
  '#NEETPaperLeak', '#NEETTelangana',
];

// ─────────────────────────────────────────────────────────
// GHMC Election 2026 — major upcoming civic election, active campaigning
// across parties.
// ─────────────────────────────────────────────────────────
const GHMC_ELECTION_2026 = [
  'GHMC Election 2026', 'GHMC polls 2026', 'Hyderabad civic election 2026',
  'GHMC campaign Revanth', 'GHMC campaign KTR', 'GHMC campaign BJP',
  '#GHMCElections2026', '#GHMC2026', '#HyderabadElections',
  'జిహెచ్ఎంసి ఎన్నికలు 2026',
];

// ─────────────────────────────────────────────────────────
// DCP transfer over the PM Modi troll case — BJP calling it "vendetta
// politics" (early August 2026).
// ─────────────────────────────────────────────────────────
const DCP_TRANSFER_CONTROVERSY = [
  'DCP transfer PM Modi troll case', 'Cyber Crime DCP Telangana transfer',
  'vendetta politics Telangana', 'Telangana Congress BJP DCP row',
  '#VendettaPolitics', '#DCPTransfer',
];

// ─────────────────────────────────────────────────────────
// AICC intervention over growing rift inside Telangana Congress —
// coordination committee announced between government and party org.
// ─────────────────────────────────────────────────────────
const CONGRESS_INTERNAL_RIFT = [
  'AICC Telangana Congress rift', 'Telangana Congress infighting', 'Congress coordination committee Telangana',
  'Telangana Congress cadre dissatisfaction', 'AICC Telangana consultations',
  '#TelanganaCongressRift', '#AICCTelangana',
  'తెలంగాణ కాంగ్రెస్ విభేదాలు',
];

// ─────────────────────────────────────────────────────────
// Special Intensive Revision of electoral rolls — Kodangal (Revanth
// Reddy's own seat), alleged BJP-BRS "conspiracy" to slow it down.
// ─────────────────────────────────────────────────────────
const SIR_ELECTORAL_ROLLS = [
  'Special Intensive Revision Kodangal', 'electoral rolls revision Telangana',
  'BJP BRS conspiracy Kodangal', 'SIR electoral rolls Telangana 2026',
  '#SIRTelangana', '#ElectoralRollsKodangal',
];

const isTelugu = (s) => /[ఀ-౿]/.test(s);

const buildEntries = () => {
  const groups = [
    CRIMINAL_WASTE_CONTROVERSY,
    GLOBARENA_CONTROVERSY,
    JOBS_PROMISE_CONTROVERSY,
    NEET_CONTROVERSY,
    GHMC_ELECTION_2026,
    DCP_TRANSFER_CONTROVERSY,
    CONGRESS_INTERNAL_RIFT,
    SIR_ELECTORAL_ROLLS,
  ];
  const seen = new Map();
  for (const list of groups) {
    for (const term of list) {
      const trimmed = term.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.set(key, {
        keyword: trimmed, category: CATEGORY, language: isTelugu(trimmed) ? 'te' : 'en',
        weight: WEIGHT, direction: 'neutral', is_active: true,
      });
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

    const entries = buildEntries();
    console.log(`Prepared ${entries.length} trending-topic keyword entries (deduped).\n`);

    let inserted = 0, updated = 0, skipped = 0;
    for (const entry of entries) {
      const existing = await Keyword.findOne({
        keyword: { $regex: `^${entry.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      });
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

    console.log(`${dryRun ? 'Would insert' : 'Inserted'}: ${inserted}, ${dryRun ? 'would update' : 'updated'}: ${updated}, skipped (already present): ${skipped}, total considered: ${entries.length}`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
