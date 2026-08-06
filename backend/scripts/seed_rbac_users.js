/**
 * seed_rbac_users.js
 * ─────────────────────────────────────────────────────────────────────
 * Idempotent seed for the RBAC rollout. Creates / updates the super admin
 * account. Scoped logins (mla / mp / special_leader) are provisioned
 * separately once real constituency/officeholder data is confirmed for
 * this deployment — see scopeMiddleware.js for the role definitions.
 *
 * Run with:
 *   node backend/scripts/seed_rbac_users.js
 *
 * Override credentials via env vars: SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD,
 * MONGO_URI.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

const upsertUser = async ({ email, password, full_name, role, ...scope }) => {
  const lookup = { email: email.toLowerCase() };
  const existing = await User.findOne(lookup);
  if (existing) {
    existing.full_name = full_name;
    existing.role = role;
    if (scope.assigned_constituency !== undefined) existing.assigned_constituency = scope.assigned_constituency;
    if (scope.assigned_lok_sabha !== undefined) existing.assigned_lok_sabha = scope.assigned_lok_sabha;
    if (scope.extra_constituencies !== undefined) existing.extra_constituencies = scope.extra_constituencies;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      existing.password = await bcrypt.hash(password, salt);
    }
    await existing.save();
    console.log(`[seed] updated ${role.padEnd(12)} ${email}`);
    return existing;
  }
  const salt = await bcrypt.genSalt(10);
  const user = await User.create({
    email: email.toLowerCase(),
    password: await bcrypt.hash(password, salt),
    full_name,
    role,
    ...scope,
    is_active: true,
  });
  console.log(`[seed] created ${role.padEnd(12)} ${email}`);
  return user;
};

const main = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/blura';
  await mongoose.connect(uri);
  try {
    await upsertUser({
      email: process.env.SUPERADMIN_EMAIL || 'admin@blurasaga.local',
      password: process.env.SUPERADMIN_PASSWORD || 'ChangeMe123!',
      full_name: 'Blura Saga Super Admin',
      role: 'superadmin',
    });
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
