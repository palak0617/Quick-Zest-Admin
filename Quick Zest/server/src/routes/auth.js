/**
 * Admin login = password + 6-digit code from an authenticator app on the admin's phone
 * (Google Authenticator / Microsoft Authenticator / Authy). Free, works offline, no SMS or email needed.
 *
 *  POST /login        email + password → { pendingToken, step: 'setup' | 'code', setup? }
 *  POST /verify       pendingToken + code (or backup code) → session cookie (+ backup codes on first setup)
 *  POST /2fa/change/start    (signed in) password + current code → QR for a new phone
 *  POST /2fa/change/confirm  (signed in) code from the new phone → switches over, new backup codes
 *  POST /2fa/backup-codes    (signed in) password + code → fresh backup codes
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { Admin } = require('../models');
const { ah, HttpError } = require('../utils/helpers');
const totp = require('../utils/totp');
const { requireAuth, setSessionCookie, clearSessionCookie, signPendingToken, verifyPendingToken } = require('../middleware/auth');

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

function assertNotLocked(admin) {
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    const mins = Math.ceil((admin.lockedUntil - Date.now()) / 60000);
    throw new HttpError(429, `Too many wrong codes. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`);
  }
}

async function registerFailure(admin) {
  admin.failedCodes = (admin.failedCodes || 0) + 1;
  if (admin.failedCodes >= MAX_FAILS) {
    admin.failedCodes = 0;
    admin.lockedUntil = new Date(Date.now() + LOCK_MS);
    await admin.save();
    throw new HttpError(429, 'Too many wrong codes. Locked for 15 minutes.');
  }
  await admin.save();
  throw new HttpError(401, `Wrong code. ${MAX_FAILS - admin.failedCodes} attempt${MAX_FAILS - admin.failedCodes === 1 ? '' : 's'} left.`);
}

function readSecret(enc) {
  const s = enc && totp.decrypt(enc);
  if (enc && !s) {
    throw new HttpError(500, 'Two-factor data cannot be read (JWT_SECRET changed?). Run "npm run reset-2fa" to set it up again.');
  }
  return s;
}

/**
 * Checks a 6-digit app code against the active secret, or a backup code.
 * On success updates replay/backup state (caller saves). Returns 'app' | 'backup' | null.
 */
function checkActiveCode(admin, input) {
  const raw = String(input || '').trim();
  const secret = readSecret(admin.totpSecret);
  const step = secret ? totp.verifyCode(secret, raw, admin.totpLastStep) : null;
  if (step !== null) {
    admin.totpLastStep = step;
    return 'app';
  }
  if (!/^\d{6}$/.test(raw.replace(/\s/g, ''))) {
    const h = totp.hashBackup(raw);
    const i = admin.backupCodes.indexOf(h);
    if (i !== -1) {
      admin.backupCodes.splice(i, 1);
      return 'backup';
    }
  }
  return null;
}

function finishSuccess(admin) {
  admin.failedCodes = 0;
  admin.lockedUntil = undefined;
}

const getPendingAdmin = async (token) => {
  let id;
  try {
    id = verifyPendingToken(token);
  } catch {
    throw new HttpError(401, 'Sign-in step expired. Please enter your password again.');
  }
  const admin = await Admin.findById(id);
  if (!admin) throw new HttpError(401, 'Please sign in again.');
  return admin;
};

/** Step 1: email + password */
router.post(
  '/login',
  authLimiter,
  ah(async (req, res) => {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const admin = await Admin.findOne({ email });
    // Same message for wrong email or password, so accounts can't be probed
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new HttpError(401, 'Incorrect email or password');
    }
    assertNotLocked(admin);

    if (admin.totpEnabled) {
      return res.json({ pendingToken: signPendingToken(admin), step: 'code', backupLeft: admin.backupCodes.length });
    }

    // First sign-in: link an authenticator app by scanning a QR code
    const secret = totp.newSecret();
    admin.totpPendingSecret = totp.encrypt(secret);
    await admin.save();
    res.json({ pendingToken: signPendingToken(admin), step: 'setup', setup: await totp.setupPayload(secret, admin.email) });
  })
);

/** Step 2: code from the app (or a backup code) */
router.post(
  '/verify',
  authLimiter,
  ah(async (req, res) => {
    const admin = await getPendingAdmin(req.body.pendingToken);
    assertNotLocked(admin);
    let backupCodes;

    if (!admin.totpEnabled) {
      // Finishing first-time setup
      const pending = readSecret(admin.totpPendingSecret);
      if (!pending) throw new HttpError(400, 'Setup expired. Please sign in again.');
      const step = totp.verifyCode(pending, req.body.code);
      if (step === null) await registerFailure(admin);
      const codes = totp.newBackupCodes();
      admin.totpSecret = admin.totpPendingSecret;
      admin.totpPendingSecret = undefined;
      admin.totpEnabled = true;
      admin.totpLastStep = step;
      admin.backupCodes = codes.hashed;
      backupCodes = codes.plain;
    } else {
      const how = checkActiveCode(admin, req.body.code);
      if (!how) await registerFailure(admin);
    }

    finishSuccess(admin);
    admin.lastLoginAt = new Date();
    await admin.save();
    setSessionCookie(res, admin);
    res.json({ admin: { name: admin.name, email: admin.email }, backupCodes, backupLeft: admin.backupCodes.length });
  })
);

router.get('/me', requireAuth, (req, res) => res.json({ admin: req.admin }));

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Signed-in checks for sensitive actions: password + current code */
async function confirmIdentity(req) {
  const admin = await Admin.findById(req.admin._id);
  assertNotLocked(admin);
  if (!(await bcrypt.compare(String(req.body.password || ''), admin.passwordHash))) {
    throw new HttpError(400, 'Password is incorrect');
  }
  if (!checkActiveCode(admin, req.body.code)) await registerFailure(admin);
  finishSuccess(admin);
  return admin;
}

router.get(
  '/2fa',
  requireAuth,
  ah(async (req, res) => {
    const admin = await Admin.findById(req.admin._id);
    res.json({ enabled: admin.totpEnabled, backupLeft: admin.backupCodes.length });
  })
);

router.post(
  '/2fa/change/start',
  requireAuth,
  authLimiter,
  ah(async (req, res) => {
    const admin = await confirmIdentity(req);
    const secret = totp.newSecret();
    admin.totpPendingSecret = totp.encrypt(secret);
    await admin.save();
    res.json({ setup: await totp.setupPayload(secret, admin.email) });
  })
);

router.post(
  '/2fa/change/confirm',
  requireAuth,
  authLimiter,
  ah(async (req, res) => {
    const admin = await Admin.findById(req.admin._id);
    assertNotLocked(admin);
    const pending = readSecret(admin.totpPendingSecret);
    if (!pending) throw new HttpError(400, 'Start the phone change again.');
    const step = totp.verifyCode(pending, req.body.code);
    if (step === null) await registerFailure(admin);
    const codes = totp.newBackupCodes();
    admin.totpSecret = admin.totpPendingSecret;
    admin.totpPendingSecret = undefined;
    admin.totpLastStep = step;
    admin.backupCodes = codes.hashed;
    finishSuccess(admin);
    await admin.save();
    res.json({ backupCodes: codes.plain });
  })
);

router.post(
  '/2fa/backup-codes',
  requireAuth,
  authLimiter,
  ah(async (req, res) => {
    const admin = await confirmIdentity(req);
    const codes = totp.newBackupCodes();
    admin.backupCodes = codes.hashed;
    await admin.save();
    res.json({ backupCodes: codes.plain });
  })
);

router.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
    const admin = await Admin.findById(req.admin._id);
    if (!(await bcrypt.compare(String(currentPassword || ''), admin.passwordHash))) {
      throw new HttpError(400, 'Current password is incorrect');
    }
    admin.passwordHash = await bcrypt.hash(String(newPassword), 12);
    await admin.save();
    res.json({ ok: true });
  })
);

module.exports = router;
module.exports._test = { checkActiveCode };
