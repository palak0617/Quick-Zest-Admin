/**
 * Authenticator-app codes (TOTP, RFC 6238) — the same 6-digit codes used by
 * Google Authenticator, Microsoft Authenticator, Authy, etc. No external service, no cost.
 */
const crypto = require('crypto');
const QRCode = require('qrcode');
const config = require('../config');

const ISSUER = 'Quick Zest Admin';
const STEP = 30; // seconds per code
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secretB32, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP);

/**
 * Check a 6-digit code, allowing ±30s clock drift.
 * Returns the matched time-step (store it to block reuse) or null.
 */
function verifyCode(secretB32, code, lastUsedStep = -1, now = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const cur = currentStep(now);
  for (const step of [cur - 1, cur, cur + 1]) {
    if (step <= lastUsedStep) continue; // each code works only once
    const a = Buffer.from(hotp(secretB32, step));
    if (crypto.timingSafeEqual(a, Buffer.from(c))) return step;
  }
  return null;
}

const newSecret = () => base32Encode(crypto.randomBytes(20));

/* ---- Secrets are stored encrypted (AES-256-GCM) so a database leak alone can't produce codes ---- */
const key = () => crypto.createHash('sha256').update(`${config.jwtSecret}:totp`).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

function decrypt(payload) {
  try {
    const [iv, tag, enc] = String(payload).split('.').map((s) => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null; // JWT_SECRET changed or data corrupted
  }
}

/** Everything the login page needs to show the "scan this QR" step */
async function setupPayload(secretB32, email) {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  const url = `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=${STEP}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 240 });
  return { qr, secret: secretB32.replace(/(.{4})/g, '$1 ').trim(), otpauthUrl: url };
}

/* ---- Backup codes: for when the phone is lost. Shown once, stored hashed, each works once. ---- */
const hashBackup = (code) => crypto.createHash('sha256').update(String(code).toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');

function newBackupCodes(n = 8) {
  const plain = Array.from({ length: n }, () => {
    const s = crypto.randomBytes(5).toString('hex');
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
  return { plain, hashed: plain.map(hashBackup) };
}

module.exports = { verifyCode, newSecret, encrypt, decrypt, setupPayload, newBackupCodes, hashBackup, hotp, currentStep, base32Encode, base32Decode };
