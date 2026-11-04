const { Counter, Settings } = require('../models');

/** Wrap async route handlers so thrown errors reach the error middleware. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function nextSeq(name) {
  const c = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return c.seq;
}

async function getSettings() {
  let s = await Settings.findOne({ key: 'main' });
  if (!s) s = await Settings.create({ key: 'main' });
  return s;
}

/** Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD into a Mongo date filter (inclusive). */
function dateRange(query, field = 'date') {
  const f = {};
  if (query.from) f.$gte = new Date(query.from);
  if (query.to) {
    const t = new Date(query.to);
    t.setHours(23, 59, 59, 999);
    f.$lte = t;
  }
  return Object.keys(f).length ? { [field]: f } : {};
}

const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Only keep listed keys from an object (prevents mass-assignment). */
const pick = (obj = {}, keys) =>
  keys.reduce((o, k) => (obj[k] !== undefined ? ((o[k] = obj[k]), o) : o), {});

module.exports = { ah, HttpError, nextSeq, getSettings, dateRange, escapeRegex, round2, pick };
