const jwt = require('jsonwebtoken');
const config = require('../config');
const { Admin } = require('../models');

const COOKIE = 'qx_session';

function setSessionCookie(res, admin) {
  const token = jwt.sign({ sub: admin._id.toString(), stage: 'full' }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** Short-lived token proving step 1 (password) passed; required for OTP verification. */
function signPendingToken(admin) {
  return jwt.sign({ sub: admin._id.toString(), stage: 'otp' }, config.jwtSecret, { expiresIn: '10m' });
}

function verifyPendingToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  if (payload.stage !== 'otp') throw new Error('Invalid token stage');
  return payload.sub;
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: 'Not signed in' });
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.stage !== 'full') return res.status(401).json({ error: 'Two-factor step not completed' });
    const admin = await Admin.findById(payload.sub).select('name email lastLoginAt');
    if (!admin) return res.status(401).json({ error: 'Account not found' });
    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

module.exports = { requireAuth, setSessionCookie, clearSessionCookie, signPendingToken, verifyPendingToken };
