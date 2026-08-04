#!/usr/bin/env node
/**
 * migrate_sentiment_labels.js
 * ─────────────────────────────────────────────────────────────────────
 * Converts the legacy `analysis.sentiment: 'neutral'` label to 'moderate'
 * across the grievance and alert collections.
 *
 * WHY
 * The AP.Blura.Saga pipeline standardised on positive | negative | moderate,
 * and every new write uses 'moderate'. The historic rows in this database were
 * written as 'neutral'. Left mixed, the UI shows two buckets for one concept
 * and any dashboard filtering on 'moderate' silently under-counts.
 *
 * The Grievance schema deliberately accepts BOTH labels, so this migration is
 * safe to run at any time and safe NOT to run — nothing breaks either way, the
 * counts are just split until you do.
 *
 * Usage:
 *   node scripts/migrate_sentiment_labels.js --dry-run    # report only (default)
 *   node scripts/migrate_sentiment_labels.js --execute    # apply the update
 */

require('dotenv').config();
const mongoose = require('mongoose');

const EXECUTE = process.argv.includes('--execute');

/** Collections and the sentiment paths within them that carry the label. */
const TARGETS = [
  { collection: 'grievances', fields: ['analysis.sentiment', 'analysis.generic_sentiment', 'analysis.target_sentiment'] },
  { collection: 'alerts', fields: ['sentiment', 'analysis.sentiment'] },
  { collection: 'contents', fields: ['analysis.sentiment'] },
  { collection: 'newsarticles', fields: ['sentiment'] },
];

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set — check backend/.env');
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName: process.env.DB_NAME, serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  console.log(`Connected to "${mongoose.connection.name}"`);
  console.log(EXECUTE ? '\nMode: EXECUTE — changes will be written\n' : '\nMode: DRY RUN — nothing will be written (pass --execute to apply)\n');

  let grandTotal = 0;

  for (const { collection, fields } of TARGETS) {
    const exists = await db.listCollections({ name: collection }).hasNext();
    if (!exists) {
      console.log(`${collection.padEnd(14)} — collection absent, skipped`);
      continue;
    }

    const col = db.collection(collection);

    for (const field of fields) {
      const count = await col.countDocuments({ [field]: 'neutral' });
      if (!count) continue;

      grandTotal += count;

      if (EXECUTE) {
        const result = await col.updateMany(
          { [field]: 'neutral' },
          { $set: { [field]: 'moderate' } }
        );
        console.log(`${collection.padEnd(14)} ${field.padEnd(28)} ${String(count).padStart(7)} → updated ${result.modifiedCount}`);
      } else {
        console.log(`${collection.padEnd(14)} ${field.padEnd(28)} ${String(count).padStart(7)} would be updated`);
      }
    }
  }

  console.log(`\n${grandTotal} document field(s) ${EXECUTE ? 'migrated' : 'would be migrated'}.`);

  if (!EXECUTE && grandTotal) {
    console.log('Re-run with --execute to apply.');
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
