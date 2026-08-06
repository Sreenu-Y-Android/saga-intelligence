/**
 * seed_all_constituency_keywords.js
 * ─────────────────────────────────────────────────────────────────────
 * Fills the keyword-coverage gap for MLAs who exist in tg_mlas.json (the
 * full 119-seat roster) but are NOT in the curated politicalData.js roster
 * (OUR_LEADERS/OPPOSITION_LEADERS — 42 notable leaders only). Without this,
 * seed_monitoring_keywords.js only ever activates search/capture for those
 * 42 seats, leaving the other 77 constituencies with zero keyword coverage
 * and therefore no data on the map.
 *
 * Seeds baseline entries only: MLA full name, MLA short name (if distinct),
 * and a clean constituency name (reservation suffix stripped, title-cased).
 * Same weight=1 / non-risk-triggering convention as seed_monitoring_keywords.js
 * — see that file's header comment for why.
 *
 * Idempotent: case-insensitive existing-keyword check, skips duplicates
 * unless --force. Safe to re-run.
 *
 * Run:  node scripts/seed_all_constituency_keywords.js --dry-run   (preview only, no writes)
 *       node scripts/seed_all_constituency_keywords.js             (insert new, skip existing)
 *       node scripts/seed_all_constituency_keywords.js --force     (also overwrite existing matches)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Keyword = require('../src/models/Keyword');
const { OUR_LEADERS, OPPOSITION_LEADERS } = require('../src/config/politicalData');
const tgMlas = require('../src/data/tg_mlas.json');

const WEIGHT = 1;
const CATEGORY = 'hate'; // matches the category already used by every other keyword doc in this DB

const cleanConstituency = (c) => String(c || '').replace(/\s*\((SC|ST)\)\s*$/i, '').trim();
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const isTelugu = (s) => /[ఀ-౿]/.test(s);

const buildEntries = () => {
  const rosteredConstituencies = new Set(
    [...OUR_LEADERS, ...OPPOSITION_LEADERS].map((l) => (l.constituency || '').toUpperCase().trim()).filter(Boolean)
  );
  const uncovered = tgMlas.filter((m) => !rosteredConstituencies.has((m.constituency || '').toUpperCase().trim()));

  const seen = new Map();
  for (const m of uncovered) {
    const name = String(m.mla || '').trim();
    const shortName = String(m.shortName || '').trim();
    const constituency = titleCase(cleanConstituency(m.constituency));

    if (name && name.length > 3) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, {
          keyword: name, category: CATEGORY, language: isTelugu(name) ? 'te' : 'en',
          weight: WEIGHT, direction: 'neutral', is_active: true,
        });
      }
    }
    if (shortName && shortName.length > 3 && shortName.toLowerCase() !== name.toLowerCase()) {
      const key = shortName.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, {
          keyword: shortName, category: CATEGORY, language: isTelugu(shortName) ? 'te' : 'en',
          weight: WEIGHT, direction: 'neutral', is_active: true,
        });
      }
    }
    if (constituency) {
      const key = constituency.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, {
          keyword: constituency, category: CATEGORY, language: 'en',
          weight: WEIGHT, direction: 'neutral', is_active: true,
        });
      }
    }
  }
  return { entries: [...seen.values()], uncoveredCount: uncovered.length };
};

async function seed() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');

  try {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME });
    console.log(`Connected to MongoDB (db: ${process.env.DB_NAME})${dryRun ? ' [DRY RUN — no writes]' : ''}`);

    const { entries, uncoveredCount } = buildEntries();
    console.log(`${uncoveredCount} MLAs uncovered by the curated roster -> ${entries.length} deduped keyword entries prepared.\n`);

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
      if (dryRun) {
        inserted++;
        continue;
      }
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
