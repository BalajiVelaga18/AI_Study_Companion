const path = require('path');
// Load root .env when running as a workspace (cwd may be server/ which has no .env)
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config');

const app = express();
// Secure headers (lightweight helmet-equivalent, no extra dep)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.removeHeader('X-Powered-By');
  next();
});
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json({ limit: '1mb' }));

// Simple in-memory rate limiter for AI endpoints (60 req/min/IP)
const hits = new Map();
function aiRateLimit(req, res, next) {
  const key = req.ip + ':' + Math.floor(Date.now() / 60000);
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (n > 60) return res.status(429).json({ success: false, error: { code: 'rate_limited', message: 'too many AI requests, slow down' } });
  next();
}

app.get('/health', (req, res) => res.json({ ok: true, at: new Date() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/core'));
app.use('/api', require('./routes/compat')); // spec-style aliases
app.use('/api/materials', require('./routes/materials'));
app.use('/api/learn', aiRateLimit, require('./routes/learn'));
app.use('/api/quiz', aiRateLimit, require('./routes/quiz'));
// Admin aliases: spec wants /api/admin/*, canonical router lives at /api/analytics/admin/*
const analyticsRouter = require('./routes/analytics');
app.use('/api/analytics', analyticsRouter);
app.use('/api/admin', (req, res, next) => {
  // Router paths are '/admin/overview' etc; req.url here is already stripped of '/api/admin'.
  if (!req.url.startsWith('/admin/')) req.url = '/admin' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  analyticsRouter(req, res, next);
});
// Centralized, consistent error shape; never leak internals
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
    return res.status(400).json({ success: false, error: { code: 'invalid_input', message: 'malformed JSON body' } });
  }
  const status = err.status || 500;
  res.status(status).json({ success: false, error: { code: err.code || 'internal', message: status === 500 ? 'internal error' : (err.message || 'error') } });
});

const PORT = process.env.PORT || 4000;
connectDB(process.env.MONGO_URI).then((conn) => {
  // Show WHERE data is stored (DB name only, never credentials) so you can open the same DB in Compass.
  console.log(`mongo: ${conn.name} @ ${conn.host}:${conn.port}${process.env.MONGO_URI ? '' : ' (in-memory fallback — set MONGO_URI in .env to persist in Compass)'}`);
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-me') {
    console.warn('warn: JWT_SECRET is the default dev value — set your own in .env');
  }
  if (require.main === module) app.listen(PORT, '0.0.0.0', () => console.log(`server :${PORT}`));;
}).catch((e) => { console.error('db connect failed — check MONGO_URI in .env:', e.message); process.exit(1); });
module.exports = app;
