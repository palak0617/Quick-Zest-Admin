// Dates like "today" and "this month" use Indian time unless TZ is set
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const config = require('./config');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('./middleware/auth');
//const dns = require("node:dns");

//dns.setServers(["1.1.1.1", "8.8.8.8"]);
const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.clientUrl.split(',').map((s) => s.trim()), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
if (!config.isProd) app.use(morgan('dev'));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

// Public: login + OTP
app.use('/api/auth', require('./routes/auth'));

// Everything below needs a signed-in admin who passed the OTP step
app.use('/api/inventory', requireAuth, require('./routes/inventory'));
app.use('/api/orders', requireAuth, require('./routes/orders'));
app.use('/api/payments', requireAuth, require('./routes/payments'));
app.use('/api/expenses', requireAuth, require('./routes/expenses'));
app.use('/api/reports', requireAuth, require('./routes/reports'));
app.use('/api/settings', requireAuth, require('./routes/settings'));
app.use('/api/chat', requireAuth, require('./routes/chat'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Errors → clean JSON messages
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';
  if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = `${Object.keys(err.keyValue || {}).join(', ') || 'Value'} already exists`;
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && config.isProd ? 'Server error' : message });
});

/**
 * First start: create the admin from ADMIN_EMAIL / ADMIN_PASSWORD if no admin exists yet.
 * Never changes an existing admin's password (use `npm run seed:admin` or Settings for that).
 */
async function ensureAdmin() {
  const { Admin } = require('./models');
  if (await Admin.exists({})) return;
  const email = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 8) {
    console.warn('No admin account yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ chars) and restart.');
    return;
  }
  const bcrypt = require('bcryptjs');
  await Admin.create({ email, name: process.env.ADMIN_NAME || 'Admin', passwordHash: await bcrypt.hash(password, 12) });
  console.log(`Admin account created for ${email}`);
}

mongoose
  .connect(config.mongoUri)
  .then(async () => {
    console.log('MongoDB connected');
    await ensureAdmin();
    app.listen(config.port, () => console.log(`Quick Zest API running on http://localhost:${config.port}`));
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
