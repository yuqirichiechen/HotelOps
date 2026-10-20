// Authentication helpers + Express middleware.
//
// Two principal types coexist:
//   • staff  — row in users table; identifier = phone_number (10 digits).
//              May optionally have a bcrypt-hashed PIN (pin_hash) and a
//              per-user pin_required flag. Token sub = user_id (UUID).
//   • admin  — entry in server/config/admins.json. No DB row. Token sub =
//              admin username. role is always 'admin'.
//
// JWTs are HS256, 8-hour expiry, signed with process.env.JWT_SECRET.

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Sprint 19.4: NEVER sign with a publicly-known fallback. The old
// 'dev-secret-do-not-ship' literal meant a deploy missing JWT_SECRET let
// anyone forge an admin token. Now, with no JWT_SECRET we sign with a
// random per-process secret instead: tokens can't be forged, nothing
// crashes, but every restart/deploy signs everyone out — loud enough to
// notice, safe in the meantime. Set JWT_SECRET (long random string) in
// Koyeb to make sessions survive restarts. Local dev: put it in server/.env.
const crypto = require('crypto');
const JWT_FROM_ENV = !!process.env.JWT_SECRET;
const JWT_SECRET   = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const TOKEN_EXPIRY = '8h';
const BCRYPT_ROUNDS = 10;

if (!JWT_FROM_ENV) {
  console.error('[auth] !! JWT_SECRET is not set — using a random per-boot secret. ' +
    'Sessions will not survive a restart. Set JWT_SECRET in the environment.');
} else if (process.env.JWT_SECRET.length < 32 ||
           /change-me|dev-secret|secret$/i.test(process.env.JWT_SECRET)) {
  console.error('[auth] !! JWT_SECRET looks weak/placeholder (need >= 32 random chars). ' +
    'Anyone who guesses it can forge admin tokens.');
}

// ── Admin config (loaded once at module init) ───────────────────────────────

const adminsFile = path.join(__dirname, 'config', 'admins.json');
let admins = [];
try {
  const parsed = JSON.parse(fs.readFileSync(adminsFile, 'utf8'));
  admins = Array.isArray(parsed.admins) ? parsed.admins : [];
  console.log(`[auth] Loaded ${admins.length} admin credential(s)`);
} catch (err) {
  console.error('[auth] Failed to load admins.json:', err.message);
}

const findAdmin = (username, password) =>
  admins.find(a => a.username === username && a.password === password) || null;

// ── JWT helpers ─────────────────────────────────────────────────────────────

const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

const verifyToken = (token) => {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
};

// ── PIN helpers ─────────────────────────────────────────────────────────────

const hashPin   = (pin)         => bcrypt.hash(String(pin), BCRYPT_ROUNDS);
const verifyPin = (pin, hash)   => bcrypt.compare(String(pin), hash);

// ── Express middleware ──────────────────────────────────────────────────────

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Missing token' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ success: false, message: 'Invalid or expired token' });

  req.auth = payload; // { sub, role, name, type, iat, exp }
  next();
};

// Sprint 22.4: the `dev` role (server-verified dev sign-in, see below) can do everything an admin can, plus the dev-only surfaces
// (auto-sync settings, forecast settings, logs). An admin can NOT use dev-only routes: requireRole('dev').
const ROLE_IMPLIES = { dev: ['admin'] };
const requireRole = (...allowed) => (req, res, next) => {
  if (!req.auth) return res.status(401).json({ success: false, message: 'Not authenticated' });
  const roles = [req.auth.role, ...(ROLE_IMPLIES[req.auth.role] || [])];
  if (!allowed.some(a => roles.includes(a))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
};

// ── Dev sign-in (Sprint 22.4) ───────────────────────────────────────────────
// Replaces the client-side dev/dev gate. Credentials come from the environment — never from the repo:
//   DEV_USERNAME        (default "dev")
//   DEV_PASSWORD_HASH   bcrypt hash; generate with:  node server/scripts/hash-password.js "<password>"
// With no hash configured, dev sign-in is disabled (503) — there is no default password.
const DEV_FAIL_MAX_PER_IP = 5, DEV_FAIL_MAX_GLOBAL = 30, DEV_FAIL_WINDOW_MS = 15 * 60 * 1000;
const devFails = new Map();           // ip → [timestamps]
let devFailsGlobal = [];
const prune = (list, now) => list.filter(t => now - t < DEV_FAIL_WINDOW_MS);
const devClientKey = (req) => (req.get && (req.get('cf-connecting-ip') || (req.get('x-forwarded-for') || '').split(',')[0].trim())) || req.ip || 'unknown';

/** @returns {{ allowed: boolean, retryAfterSec?: number }} */
function devLoginAllowed(key, now = Date.now()) {
  const mine = prune(devFails.get(key) || [], now); devFails.set(key, mine); devFailsGlobal = prune(devFailsGlobal, now);
  if (mine.length >= DEV_FAIL_MAX_PER_IP) return { allowed: false, retryAfterSec: Math.ceil((DEV_FAIL_WINDOW_MS - (now - mine[0])) / 1000) };
  if (devFailsGlobal.length >= DEV_FAIL_MAX_GLOBAL) return { allowed: false, retryAfterSec: Math.ceil((DEV_FAIL_WINDOW_MS - (now - devFailsGlobal[0])) / 1000) };
  return { allowed: true };
}
function recordDevFailure(key, now = Date.now()) { devFails.set(key, [...prune(devFails.get(key) || [], now), now]); devFailsGlobal.push(now); }
function clearDevFailures(key) { devFails.delete(key); }
const _resetDevLimiter = () => { devFails.clear(); devFailsGlobal = []; };

const BCRYPT_RE = /^\$2[aby]\$\d\d\$.{53}$/;
const devConfigured = () => !!process.env.DEV_PASSWORD_HASH;
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
let warnedPlainDev = false;
async function verifyDevCredentials(username, password) {
  const secret = process.env.DEV_PASSWORD_HASH;
  const wantUser = process.env.DEV_USERNAME || 'dev';
  // A bcrypt hash is the intended value. Debug convenience (Sprint 22.4): any other non-empty value is treated as the PLAIN password
  // (compared in constant time) — replace it with a hash (node server/scripts/hash-password.js "<password>") once setup is done.
  let passOk;
  if (BCRYPT_RE.test(secret)) {
    passOk = await bcrypt.compare(String(password || ''), secret);    // always runs, so a wrong username takes as long as a wrong password
  } else {
    if (!warnedPlainDev) { warnedPlainDev = true; console.warn('[auth] !! DEV_PASSWORD_HASH is not a bcrypt hash — treating it as the PLAIN dev password. Replace it with a hash when you are done debugging.'); }
    passOk = crypto.timingSafeEqual(sha(password || ''), sha(secret));
  }
  const a = Buffer.from(String(username || '')), b = Buffer.from(wantUser);
  const userOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  return passOk && userOk ? { username: wantUser } : null;
}

module.exports = {
  signToken,
  verifyToken,
  hashPin,
  verifyPin,
  findAdmin,
  requireAuth,
  requireRole,
  devConfigured, verifyDevCredentials, devLoginAllowed, recordDevFailure, clearDevFailures, devClientKey, _resetDevLimiter,
};
