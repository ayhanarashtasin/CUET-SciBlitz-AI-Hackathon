/**
 * Centralised rate limiters (express-rate-limit v8).
 *
 * Sensitive endpoints — auth/OAuth, payment init, AI (LLM cost), and forum
 * writes — are brute-force / spam / cost-amplification targets. Authenticated
 * limiters key on the user id; public ones key on IP. A relaxed global limiter
 * backstops everything else.
 *
 * NOTE: for correct client-IP detection behind a proxy (Vercel/Render/Nginx),
 * server.js sets `app.set('trust proxy', 1)` in production.
 */
const rateLimit = require('express-rate-limit');
const { createRateLimitStore } = require('../config/redis');

const standard = {
  standardHeaders: true,
  legacyHeaders: false
};

// Key by authenticated user id when present, else fall back to IP.
function userOrIpKey(req, res) {
  return (req.user && req.user.id)
    ? `u:${req.user.id}`
    : `ip:${rateLimit.ipKeyGenerator(req.ip)}`;
}

function distributedStore(prefix) {
  const store = createRateLimitStore(prefix);
  return store ? { store } : {};
}

const message = (msg) => ({ success: false, message: msg, code: 'RATE_LIMITED' });

// Global backstop — generous, protects the whole API surface.
const globalLimiter = rateLimit({
  ...standard,
  ...distributedStore('rl:global:'),
  windowMs: 60 * 1000,
  max: 300,
  message: message('Too many requests. Please slow down and try again shortly.')
});

// Auth / OAuth — brute force + callback flooding.
const authLimiter = rateLimit({
  ...standard,
  ...distributedStore('rl:auth:'),
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: message('Too many authentication attempts. Try again in a few minutes.')
});

// Payments — checkout session creation. Gateway callbacks are intentionally
// NOT limited here (they must be able to retry) and are validated server-side.
const paymentLimiter = rateLimit({
  ...standard,
  ...distributedStore('rl:payment:'),
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKey,
  message: message('Too many payment attempts. Please wait a moment.')
});

// AI / LLM — protects against cost abuse and request amplification.
const aiLimiter = rateLimit({
  ...standard,
  ...distributedStore('rl:ai:'),
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKey,
  message: message('You are sending AI requests too quickly. Please slow down.')
});

// Forum writes (posts/comments/reactions) — spam control.
const writeLimiter = rateLimit({
  ...standard,
  ...distributedStore('rl:forum-write:'),
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: userOrIpKey,
  message: message('You are posting too quickly. Please slow down.')
});

// Reader writes can contain thousands of sampled pointer coordinates. The
// autosave client batches them, so a per-user limiter blocks request-amplified
// abuse without affecting normal drawing, erasing, undo, or retry traffic.
const annotationWriteLimiter = rateLimit({
  ...standard,
  ...distributedStore('rl:annotation-write:'),
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: userOrIpKey,
  message: message('Annotation changes are being sent too quickly. Please wait a moment.')
});

const reportLimiter = rateLimit({
  ...standard,
  ...distributedStore('rl:forum-report:'),
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: userOrIpKey,
  message: message('Too many reports. Please wait before submitting another.')
});

// Uploads — heavier disk/network cost per request.
const uploadLimiter = rateLimit({
  ...standard,
  ...distributedStore('rl:upload:'),
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: userOrIpKey,
  message: message('Too many uploads. Please wait before uploading more.')
});

// Public waitlist submissions — prevents spam bot form stuffing
const waitlistLimiter = rateLimit({
  ...standard,
  ...distributedStore('rl:waitlist:'),
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: message('Too many waitlist submissions from this IP. Please try again later.')
});

module.exports = {
  globalLimiter,
  authLimiter,
  paymentLimiter,
  aiLimiter,
  writeLimiter,
  annotationWriteLimiter,
  reportLimiter,
  uploadLimiter,
  waitlistLimiter
};
