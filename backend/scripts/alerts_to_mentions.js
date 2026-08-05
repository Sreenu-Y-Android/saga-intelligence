#!/usr/bin/env node
/**
 * BSK WATCH · ALERTS → MENTIONS INTAKE
 * ────────────────────────────────────────────────────────────────
 * Reads every un-evaluated row from the Alert collection, runs each
 * through the RapidAPI ChatGPT-42 BSK relevance gate, and promotes the
 * relevant ones to the Mentions (Grievance) collection.
 *
 * Usage:
 *   node scripts/alerts_to_mentions.js                  # full batch (default)
 *   node scripts/alerts_to_mentions.js --limit 200      # bigger batch
 *   node scripts/alerts_to_mentions.js --since 2026-05-01
 *   node scripts/alerts_to_mentions.js --platform x
 *   node scripts/alerts_to_mentions.js --status active
 *   node scripts/alerts_to_mentions.js --fast           # heuristic only (no LLM call)
 *   node scripts/alerts_to_mentions.js --dry-run        # don't write, just report
 *
 * Idempotent: alerts already stamped with bsk_pipeline.processed=true are
 * skipped. To re-evaluate, clear that field manually.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { runBatch } = require('../src/services/alertsToMentionsService');

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const arg = (k, fallback = null) => {
    const i = argv.indexOf(k);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const opts = {
    limit:       parseInt(arg('--limit', '50'), 10),
    since:       arg('--since', null),
    status:      arg('--status', null),
    platform:    arg('--platform', null),
    dryRun:      flag('--dry-run'),
    allowLLM:    !flag('--fast')
};

(async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  BSK WATCH · ALERTS → MENTIONS INTAKE                      ║');
    console.log('║  Alerts → RapidAPI BSK gate → Grievance (Mentions)         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`Mode: ${opts.allowLLM ? 'FULL (RapidAPI gate)' : 'FAST (heuristic only)'}${opts.dryRun ? ' · DRY-RUN' : ''}`);
    console.log(`Limit: ${opts.limit}` +
        (opts.since    ? ` · since=${opts.since}`       : '') +
        (opts.status   ? ` · status=${opts.status}`     : '') +
        (opts.platform ? ` · platform=${opts.platform}` : ''));

    await connectDB();
    const t0 = Date.now();
    const stats = await runBatch(opts);
    const took = ((Date.now() - t0) / 1000).toFixed(1);

    console.log('\n┌─────── INTAKE SUMMARY ────────┐');
    console.log(`│  alerts scanned     : ${String(stats.scanned).padStart(5)} │`);
    console.log(`│  promoted (→ Ments) : ${String(stats.promoted).padStart(5)} │`);
    console.log(`│  rejected (gate)    : ${String(stats.rejected).padStart(5)} │`);
    console.log(`│  skipped            : ${String(stats.skipped).padStart(5)} │`);
    console.log(`│  errors             : ${String(stats.errors).padStart(5)} │`);
    console.log('├────────── by target ─────────┤');
    for (const [k, v] of Object.entries(stats.by_target)) console.log(`│  ${k.padEnd(16)} : ${String(v).padStart(5)} │`);
    console.log('├────────── by stance ─────────┤');
    for (const [k, v] of Object.entries(stats.by_stance)) console.log(`│  ${k.padEnd(16)} : ${String(v).padStart(5)} │`);
    console.log(`└── ${took}s ─────────────────────┘`);

    if (stats.sample.length) {
        console.log('\nFirst few promoted alerts:');
        for (const s of stats.sample) {
            console.log(`  • alert=${s.alert_id} → grievance=${s.grievance_id || '(?)'}  target=${s.target}  stance=${s.stance}  conf=${(s.confidence ?? 0).toFixed(2)}`);
        }
    }

    await mongoose.disconnect();
    process.exit(0);
})().catch((err) => {
    console.error('\n✖ alerts_to_mentions crashed:', err);
    process.exit(1);
});
