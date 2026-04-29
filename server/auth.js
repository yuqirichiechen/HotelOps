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

const JWT_SECRET   = process.env.JWT_SECRET || 'dev-secret-do-not-ship';
const TOKEN_EXPIRY = '8h';
const BCRYPT_ROUNDS = 10;

if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — using dev fallback. Set it in production.');
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

const requireRole = (...allowed) => (req, res, next) => {
  if (!req.auth) return res.status(401).json({ success: false, message: 'Not authenticated' });
  if (!allowed.includes(req.auth.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
};

module.exports = {
  signToken,
  verifyToken,
  hashPin,
  verifyPin,
  findAdmin,
  requireAuth,
  requireRole,
};
