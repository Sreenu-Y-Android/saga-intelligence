#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  BSK WATCH — ENTIRE CLUSTER WIPE                                         ║
 * ║                                                                          ║
 * ║  Drops every user database on the connected MongoDB cluster              ║
 * ║  (everything except the system DBs: admin, local, config), then          ║
 * ║  re-seeds the BSK Watch defaults — default admin user, settings,         ║
 * ║  and the BSK / BJP Telangana monitoring keywords.                        ║
 * ║                                                                          ║
 * ║  USAGE:                                                                  ║
 * ║     CONFIRM=YES node scripts/clean-db.js                                 ║
 * ║     # or                                                                 ║
 * ║     CONFIRM=YES npm run db:clean                                         ║
 * ║                                                                          ║
 * ║  Refuses to run without CONFIRM=YES to prevent accidental wipes.         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SYSTEM_DBS = new Set(['admin', 'local', 'config']);

const fmt = (n) => (n === 1 ? '1 collection' : `${n} collections`);

async function listDatabases(conn) {
  const admin = conn.connection.db.admin();
  const { databases = [] } = await admin.listDatabases();
  return databases.map((d) => d.name);
}

async function wipeDatabase(conn, dbName) {
  const db = conn.connection.useDb(dbName, { useCache: false });
  const collections = await db.db.listCollections().toArray();
  if (collections.length === 0) {
    console.log(`  ⏭  ${dbName} — empty, skipping`);
    return { dbName, dropped: 0 };
  }
  for (const c of collections) {
    try {
      await db.db.collection(c.name).drop();
    } catch (err) {
      if (err.codeName !== 'NamespaceNotFound') {
        console.warn(`    ! Could not drop ${dbName}.${c.name}: ${err.message}`);
      }
    }
  }
  // Drop the database entirely as well (removes empty db from the cluster)
  try {
    await db.db.dropDatabase();
  } catch (err) {
    console.warn(`    ! Could not drop database ${dbName}: ${err.message}`);
  }
  console.log(`  ✔  ${dbName} — wiped (${fmt(collections.length)})`);
  return { dbName, dropped: collections.length };
}

async function reseedDefaults(conn) {
  console.log('\nRe-seeding BSK Watch defaults…');

  // Bind models to the connection so they live in the configured app DB
  const User = require('../src/models/User');
  const Settings = require('../src/models/Settings');
  const Keyword = require('../src/models/Keyword');

  // ─── default admin user ──────────────────────────────────────────
  const email = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@bskwatch.in').trim().toLowerCase();
  const password = process.env.DEFAULT_ADMIN_PASSWORD || '#BSK@Telangana2026';
  const full_name = process.env.DEFAULT_ADMIN_NAME || 'BSK Watch Super Admin';
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(password, salt);
  await User.create({ email, password: hashed, full_name, role: 'superadmin', is_active: true });
  console.log(`  ✔  Default admin created: ${email}`);

  // ─── global settings ─────────────────────────────────────────────
  await Settings.create({
    id: 'global_settings',
    high_risk_threshold: 70,
    medium_risk_threshold: 40,
    risk_threshold_high: 70,
    risk_threshold_medium: 40,
    monitoring_interval_minutes: 5,
    enable_email_alerts: true,
  });
  console.log('  ✔  Default global settings created');

  // ─── BSK monitoring keywords ─────────────────────────────────────
  const bskKeywords = [
    { keyword: 'Bandi Sanjay Kumar', category: 'other', language: 'en', weight: 100 },
    { keyword: 'Bandi Sanjay',       category: 'other', language: 'en', weight: 100 },
    { keyword: 'BSK',                category: 'other', language: 'en', weight: 80 },
    { keyword: '@bandisanjay_bjp',   category: 'other', language: 'en', weight: 90 },
    { keyword: 'MP Karimnagar',      category: 'other', language: 'en', weight: 80 },
    { keyword: 'Karimnagar MP',      category: 'other', language: 'en', weight: 80 },
    { keyword: 'BJP Telangana President', category: 'other', language: 'en', weight: 75 },
    { keyword: 'బండి సంజయ్',         category: 'other', language: 'te', weight: 100 },
    { keyword: 'బండి సంజయ్ కుమార్',  category: 'other', language: 'te', weight: 100 },
    { keyword: 'కరీంనగర్ ఎంపీ',      category: 'other', language: 'te', weight: 80 },
    { keyword: 'బీజేపీ తెలంగాణ',      category: 'other', language: 'te', weight: 75 },
    { keyword: 'కమలం',               category: 'other', language: 'te', weight: 60 },
    { keyword: 'बंडी संजय',          category: 'other', language: 'hi', weight: 100 },
    { keyword: 'बंडी संजय कुमार',    category: 'other', language: 'hi', weight: 100 },
    { keyword: 'करीमनगर सांसद',      category: 'other', language: 'hi', weight: 80 },
    { keyword: 'भाजपा तेलंगाना',      category: 'other', language: 'hi', weight: 75 },
    { keyword: 'BJP Telangana',      category: 'other', language: 'en', weight: 65 },
    { keyword: 'BJPTelangana',       category: 'other', language: 'en', weight: 60 },
    { keyword: '#BJP4Telangana',     category: 'other', language: 'en', weight: 65 },
    { keyword: '#BJP4BharatMata',    category: 'other', language: 'en', weight: 50 },
    { keyword: '#KarimnagarMP',      category: 'other', language: 'en', weight: 70 },
    { keyword: '#BandiSanjay',       category: 'other', language: 'en', weight: 90 },
    { keyword: 'Karimnagar',         category: 'other', language: 'en', weight: 55 },
    { keyword: 'Choppadandi',        category: 'other', language: 'en', weight: 55 },
    { keyword: 'Vemulawada',         category: 'other', language: 'en', weight: 55 },
    { keyword: 'Sircilla',           category: 'other', language: 'en', weight: 55 },
    { keyword: 'Manakondur',         category: 'other', language: 'en', weight: 55 },
    { keyword: 'Husnabad',           category: 'other', language: 'en', weight: 55 },
    { keyword: 'Huzurabad',          category: 'other', language: 'en', weight: 55 },
    { keyword: 'Bandi Sanjay abuse',   category: 'hate',   language: 'en', weight: 95 },
    { keyword: 'Bandi Sanjay arrest',  category: 'threat', language: 'en', weight: 90 },
    { keyword: 'Bandi Sanjay murder',  category: 'threat', language: 'en', weight: 100 },
    { keyword: 'kill Bandi Sanjay',    category: 'threat', language: 'en', weight: 100 },
    { keyword: 'Bandi Sanjay protest', category: 'other',  language: 'en', weight: 75 },
  ];
  await Keyword.insertMany(bskKeywords);
  console.log(`  ✔  Seeded ${bskKeywords.length} BSK monitoring keywords`);
}

async function main() {
  if ((process.env.CONFIRM || '').toUpperCase() !== 'YES') {
    console.error(
      '✖ Refusing to run without CONFIRM=YES. This script wipes the ENTIRE Mongo cluster.\n' +
      '  Re-run as:  CONFIRM=YES npm run db:clean'
    );
    process.exit(2);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('✖ MONGODB_URI not set in environment.');
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  BSK WATCH · CLUSTER WIPE                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('Connecting to MongoDB cluster…');

  const conn = await mongoose.connect(uri);
  console.log('Connected.\n');

  const dbs = await listDatabases(conn);
  console.log(`Databases on cluster: ${dbs.join(', ')}\n`);

  const targets = dbs.filter((d) => !SYSTEM_DBS.has(d));
  if (targets.length === 0) {
    console.log('Nothing to wipe — cluster has no user databases.');
  } else {
    console.log(`Wiping ${targets.length} database(s)…`);
    for (const dbName of targets) {
      await wipeDatabase(conn, dbName);
    }
  }

  // After wipe, mongoose's default connection is bound to whichever DB the URI
  // implies. If DB_NAME is set we use that; otherwise we fall back to "blura_hub"
  // which is the historical app DB. Reseed inside the configured app DB.
  const appDb = (process.env.DB_NAME && process.env.DB_NAME.trim()) || 'blura_hub';
  await conn.disconnect();

  console.log(`\nReconnecting to app DB "${appDb}" for re-seeding…`);
  await mongoose.connect(uri, { dbName: appDb });
  await reseedDefaults(mongoose);

  await mongoose.disconnect();

  console.log('\n✔ Cluster wiped and BSK Watch defaults seeded.');
  console.log('  Next backend boot will additionally seed velocity alert thresholds,');
  console.log('  recurring master-calendar events, and any other on-boot defaults.\n');
}

main().catch((err) => {
  console.error('\n✖ Wipe failed:', err);
  process.exit(1);
});
