/**
 * Apply ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD from .env to the admin account in the database.
 *
 *   npm run seed:admin            # update the existing admin (or create one if none exists)
 *   npm run seed:admin -- --only  # same, and delete any OTHER admin accounts
 *
 * The phone link (authenticator app) and backup codes are kept. Use `npm run reset-2fa` to re-link.
 */
const config = require('../config');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Admin } = require('../models');

const dns = require("node:dns");

dns.setServers(["1.1.1.1", "8.8.8.8"]);

(async () => {
  const email = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME;
  const only = process.argv.includes('--only');
  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }
  await mongoose.connect(config.mongoUri);
  const passwordHash = await bcrypt.hash(password, 12);
  const all = await Admin.find().sort({ createdAt: 1 });

  // Which account to update: the one already using this email, otherwise the only/oldest admin
  let admin = all.find((a) => a.email === email);
  if (!admin && all.length > 1 && !only) {
    console.error(
      `There are ${all.length} admin accounts (${all.map((a) => a.email).join(', ')}) and none uses ${email}.\n` +
        'Run "npm run seed:admin -- --only" to move the oldest one to the new details and delete the rest.'
    );
    process.exit(1);
  }
  admin = admin || all[0];

  if (admin) {
    const old = admin.email;
    admin.email = email;
    admin.passwordHash = passwordHash;
    if (name) admin.name = name;
    admin.failedCodes = 0;
    admin.lockedUntil = undefined;
    await admin.save();
    console.log(old === email ? `Updated ${email}: new password${name ? ' and name' : ''} saved.` : `Admin changed from ${old} to ${email}, new password saved.`);
  } else {
    admin = await Admin.create({ email, passwordHash, name: name || 'Admin' });
    console.log(`Admin ${email} created. The first sign-in will link your phone.`);
  }

  if (only) {
    const r = await Admin.deleteMany({ _id: { $ne: admin._id } });
    if (r.deletedCount) console.log(`Removed ${r.deletedCount} other admin account(s).`);
  }
  console.log('Old credentials no longer work. Sign in with the new email and password (same authenticator app).');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.code === 11000 ? 'That email is already used by another admin. Run with --only.' : e);
  process.exit(1);
});
