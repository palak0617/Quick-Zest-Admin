/**
 * Lost your phone and your backup codes? Run this from your computer:
 *   MONGODB_URI="<atlas uri>" JWT_SECRET="<same as on Render>" npm run reset-2fa
 * The next sign-in will show a QR code to link a new phone.
 */
const config = require('../config');
const mongoose = require('mongoose');
const { Admin } = require('../models');

(async () => {
  await mongoose.connect(config.mongoUri);
  const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const filter = email ? { email } : {};
  const r = await Admin.updateMany(filter, {
    $set: { totpEnabled: false, totpLastStep: -1, backupCodes: [], failedCodes: 0 },
    $unset: { totpSecret: 1, totpPendingSecret: 1, lockedUntil: 1 },
  });
  console.log(r.modifiedCount ? `Two-factor reset for ${email || 'all admins'}. Sign in to link a new phone.` : 'No matching admin found.');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
