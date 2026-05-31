const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const {
  signToken, hashPin, verifyPin, findAdmin,
  requireAuth, requireRole,
} = require('./auth');

const app = express();

// CORS only needed for local dev (frontend and API are same-origin on Koyeb)
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Sprint 15.10: explicit pool config for Koyeb/Neon Postgres cost
// optimization. Neon bills compute-seconds while the instance is
// awake, and resets a ~5 min idle timer on any query. A single
// long-lived idle pg connection keeps the instance warm 24/7.
//   - max: 5            — cap concurrent connections. The server's
//                          load profile is light enough (one hotel,
//                          a handful of admins) that 5 is plenty.
//   - idleTimeoutMillis  — 10 s. Already the pg default, but
//                          explicit so it's obvious why it's there.
//                          Once a connection is idle 10 s, close it
//                          → Neon's idle timer can start counting.
const pool = new Pool({
  connectionString:   process.env.DATABASE_URL,
  ssl:                { rejectUnauthorized: false },
  max:                5,
  idleTimeoutMillis:  10_000,
});

pool.query('SELECT NOW()').then(() => {
  console.log('Database connected');
}).catch(err => {
  console.error('Database connection error:', err);
  if (!process.env.DATABASE_URL) console.error('DATABASE_URL env var is not set');
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ── Login identifier helpers (Sprint 7 / Sprint 9) ───────────────────────────
// Staff log in via any of {phone_number, username, employee_code, birthday}.
// The login endpoint accepts a single `identifier` and auto-detects the type:
//   - all digits, length 8   → birthday (MMDDYYYY → real date)        [Sprint 9]
//   - all digits, length 10  → phone_number
//   - all digits, length 4-6 → employee_code
//   - has a letter           → username (case-insensitive lookup)
//   - anything else          → invalid
// Username must contain at least one letter (enforced at signup + DB CHECK)
// so an all-digit username cannot shadow an employee_code or birthday.
// Length boundaries are tight (4-6 / 8 / 10) so the three digit ranges
// don't collide.

const PHONE_RE    = /^[0-9]{10}$/;
const CODE_RE     = /^[0-9]{4,6}$/;
const BDAY_RE     = /^[0-9]{8}$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,16}$/;
const HAS_LETTER  = /[A-Za-z]/;

// Parse an 8-digit MMDDYYYY into a real Date and back into YYYY-MM-DD.
// Returns null if the digits don't form a valid calendar date (e.g. Feb 30).
function birthdayToIso(s) {
  if (!BDAY_RE.test(s)) return null;
  const mm = parseInt(s.slice(0, 2), 10);
  const dd = parseInt(s.slice(2, 4), 10);
  const yyyy = parseInt(s.slice(4, 8), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100) return null;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function classifyIdentifier(raw) {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  if (BDAY_RE.test(v)) {
    const iso = birthdayToIso(v);
    if (iso) return { kind: 'birthday', value: iso };
    return null; // 8 digits but not a valid date
  }
  if (PHONE_RE.test(v))                                    return { kind: 'phone',    value: v };
  if (CODE_RE.test(v))                                     return { kind: 'code',     value: v };
  if (USERNAME_RE.test(v) && HAS_LETTER.test(v))           return { kind: 'username', value: v };
  return null;
}

function validatePhone(raw) {
  const v = String(raw || '').replace(/\D/g, '');
  if (!PHONE_RE.test(v)) return { ok: false, message: 'Phone must be 10 digits' };
  return { ok: true, value: v };
}
function validateUsername(raw) {
  const v = String(raw || '').trim();
  if (!USERNAME_RE.test(v) || !HAS_LETTER.test(v)) {
    return { ok: false, message: 'Username must be 3–16 chars from letters/numbers/._- and contain a letter' };
  }
  return { ok: true, value: v };
}
function validateEmployeeCode(raw) {
  const v = String(raw || '').trim();
  if (!CODE_RE.test(v)) return { ok: false, message: 'Employee ID must be 4–6 digits' };
  return { ok: true, value: v };
}

// Sprint 9: birthday accepts YYYY-MM-DD (from <input type="date">) and is
// stored as a real DATE in Postgres. Range-limited to a plausible person.
// Not unique — collisions handled at login time.
function validateBirthday(raw) {
  const v = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return { ok: false, message: 'Birthday must be a valid date (YYYY-MM-DD)' };
  }
  const [yyyy, mm, dd] = v.split('-').map(Number);
  if (yyyy < 1900 || yyyy > 2100) return { ok: false, message: 'Birthday year out of range' };
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
    return { ok: false, message: 'Birthday is not a valid date' };
  }
  return { ok: true, value: v };
}

// Validates the three identifier fields for create/update. Returns
// { ok, normalized: { phoneNumber, username, employeeCode } } or
// { ok: false, message }. requireAtLeastOne guards create-time inserts;
// updates may pass false if the caller wants to allow clearing all three
// (we don't, but the option exists).
function validateIdentifiers({ phoneNumber, username, employeeCode, birthday }, { requireAtLeastOne = true } = {}) {
  const out = { phoneNumber: null, username: null, employeeCode: null, birthday: null };
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  if (has(phoneNumber))  { const r = validatePhone(phoneNumber);         if (!r.ok) return { ok: false, message: r.message }; out.phoneNumber  = r.value; }
  if (has(username))     { const r = validateUsername(username);         if (!r.ok) return { ok: false, message: r.message }; out.username     = r.value; }
  if (has(employeeCode)) { const r = validateEmployeeCode(employeeCode); if (!r.ok) return { ok: false, message: r.message }; out.employeeCode = r.value; }
  if (has(birthday))     { const r = validateBirthday(birthday);         if (!r.ok) return { ok: false, message: r.message }; out.birthday     = r.value; }
  // Sprint 9.1: birthday is now a first-class identifier and counts toward
  // the at-least-one requirement (per GM feedback — equal weight across
  // all four methods).
  if (requireAtLeastOne && !out.phoneNumber && !out.username && !out.employeeCode && !out.birthday) {
    return { ok: false, message: 'At least one of phone, username, employee ID, or birthday is required' };
  }
  return { ok: true, normalized: out };
}

// Maps a unique-constraint error from a write to a user-friendly message.
function uniqueViolationMessage(err) {
  const detail = err && err.detail ? String(err.detail) : '';
  if (detail.includes('phone_number'))   return 'Phone number already exists';
  if (detail.includes('username'))       return 'Username already taken';
  if (detail.includes('employee_code'))  return 'Employee ID already taken';
  return 'Identifier already exists';
}

// ── Auth (new — JWT-based) ───────────────────────────────────────────────────

app.post('/api/auth/staff/login', async (req, res) => {
  // Accept `identifier` (Sprint 7) or `phone` (legacy clients pre-Sprint 7).
  const raw = (req.body?.identifier ?? req.body?.phone ?? '').toString();
  const { pin } = req.body || {};
  const id = classifyIdentifier(raw);
  if (!id) return res.status(400).json({ success: false, message: 'Enter your phone, employee ID, birthday, or username' });

  // Sprint 9: enforce the admin's enabled-login-methods toggle. If the
  // identifier kind is currently disabled, reject before hitting the DB.
  try {
    const cfg = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'enabled_login_methods'`
    );
    if (cfg.rows.length) {
      const enabled = new Set(String(cfg.rows[0].value || '').split(',').map(s => s.trim()).filter(Boolean));
      // map classifier kind → setting name
      const settingByKind = { phone: 'phone', code: 'employee_code', username: 'username', birthday: 'birthday' };
      const needed = settingByKind[id.kind];
      if (needed && enabled.size > 0 && !enabled.has(needed)) {
        return res.status(400).json({ success: false, message: 'That login method is disabled for this property' });
      }
    }
  } catch (_e) { /* if settings table is unavailable, fall through to legacy behavior */ }

  try {
    const where = id.kind === 'phone'    ? 'phone_number = $1'
                : id.kind === 'code'     ? 'employee_code = $1'
                : id.kind === 'birthday' ? 'birthday = $1'
                :                          'LOWER(username) = LOWER($1)';
    const { rows } = await pool.query(
      `SELECT user_id, name, phone_number, username, employee_code, birthday, role, department_id,
              pin_hash, pin_required, pin_must_set, preferred_language
       FROM users WHERE ${where} AND active = true`,
      [id.value]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Sprint 9: birthdays aren't unique. If we got >1 match, ask the user
    // to disambiguate with a phone number or employee ID instead.
    if (rows.length > 1 && id.kind === 'birthday') {
      return res.status(409).json({
        success: false,
        message: 'More than one employee shares that birthday — sign in with your phone number or employee ID instead.',
      });
    }
    const user = rows[0];

    // PIN required: must verify. Skip during the post-reset window (pin_must_set).
    if (user.pin_required && !user.pin_must_set && user.pin_hash) {
      if (!pin) return res.status(400).json({ success: false, message: 'PIN required', pin_required: true });
      const ok = await verifyPin(pin, user.pin_hash);
      if (!ok) return res.status(401).json({ success: false, message: 'Invalid PIN' });
    }

    const token = signToken({
      sub:  user.user_id,
      role: user.role,
      name: user.name,
      type: 'staff',
    });

    return res.json({
      success: true,
      token,
      user: {
        user_id:            user.user_id,
        name:               user.name,
        phone_number:       user.phone_number,
        username:           user.username,
        employee_code:      user.employee_code,
        role:               user.role,
        department_id:      user.department_id,
        pin_required:       user.pin_required,
        pin_must_set:       user.pin_must_set,
        // Sprint 16.2: staff UI language. The client uses this to
        // drive the i18n t() lookup once the user is identified.
        preferred_language: user.preferred_language || 'en',
        type:               'staff',
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }
  const admin = findAdmin(username, password);
  if (!admin) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const token = signToken({
    sub:  admin.username,
    role: 'admin',
    name: admin.name || admin.username,
    type: 'admin',
  });

  return res.json({
    success: true,
    token,
    user: {
      username: admin.username,
      name:     admin.name || admin.username,
      role:     'admin',
      type:     'admin',
    },
  });
});

app.post('/api/auth/staff/set-pin', requireAuth, async (req, res) => {
  if (req.auth.type !== 'staff') {
    return res.status(403).json({ success: false, message: 'Staff only' });
  }
  const { pin } = req.body || {};
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ success: false, message: 'PIN must be 4 digits' });
  }
  try {
    const hash = await hashPin(pin);
    const { rows } = await pool.query(
      `UPDATE users SET pin_hash = $1, pin_must_set = false
       WHERE user_id = $2 RETURNING user_id`,
      [hash, req.auth.sub]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  if (req.auth.type === 'admin') {
    return res.json({
      success: true,
      user: {
        username: req.auth.sub,
        name:     req.auth.name,
        role:     'admin',
        type:     'admin',
      },
    });
  }
  try {
    const { rows } = await pool.query(
      `SELECT u.user_id, u.name, u.phone_number, u.username, u.employee_code,
              u.role, u.department_id,
              u.pin_required, u.pin_must_set,
              u.preferred_language,
              (u.pin_hash IS NOT NULL) AS has_pin,
              d.name AS department
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.department_id
       WHERE u.user_id = $1 AND u.active = true`,
      [req.auth.sub]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, user: { ...rows[0], type: 'staff' } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/staff/change-pin', requireAuth, async (req, res) => {
  if (req.auth.type !== 'staff') {
    return res.status(403).json({ success: false, message: 'Staff only' });
  }
  const { currentPin, newPin } = req.body || {};
  if (!newPin || !/^\d{4}$/.test(String(newPin))) {
    return res.status(400).json({ success: false, message: 'New PIN must be 4 digits' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT pin_hash FROM users WHERE user_id = $1 AND active = true',
      [req.auth.sub]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    const u = rows[0];

    // If they already have a PIN, require the current one to change it.
    if (u.pin_hash) {
      if (!currentPin) {
        return res.status(400).json({ success: false, message: 'Current PIN required' });
      }
      const ok = await verifyPin(currentPin, u.pin_hash);
      if (!ok) return res.status(401).json({ success: false, message: 'Current PIN is incorrect' });
    }

    const hash = await hashPin(newPin);
    await pool.query(
      'UPDATE users SET pin_hash = $1, pin_must_set = false WHERE user_id = $2',
      [hash, req.auth.sub]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  // Stateless JWT — client just discards token. Endpoint exists for symmetry
  // and a future server-side denylist if we add one.
  return res.json({ success: true });
});

// ── Departments ───────────────────────────────────────────────────────────────

app.get('/api/admin/departments', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM departments ORDER BY name');
    return res.json({ success: true, departments: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Sprint 11: dept management. Admin can add / rename / recolor /
// delete departments. Color is `#RRGGBB` or NULL (use frontend
// fallback). Name uniqueness handled by the DB UNIQUE constraint.
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

app.post('/api/admin/departments', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, color } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, message: 'name required' });
  }
  if (color != null && color !== '' && !HEX_COLOR_RE.test(color)) {
    return res.status(400).json({ success: false, message: 'color must be #RRGGBB or null' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO departments (name, color) VALUES ($1, $2)
       RETURNING department_id, name, color`,
      [String(name).trim(), color || null]
    );
    return res.json({ success: true, department: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'department name already exists' });
    }
    console.error('[departments:POST]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

app.patch('/api/admin/departments/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body || {};
  const sets = [];
  const params = [];
  if (name !== undefined) {
    if (!String(name).trim()) {
      return res.status(400).json({ success: false, message: 'name cannot be empty' });
    }
    params.push(String(name).trim());
    sets.push(`name = $${params.length}`);
  }
  if (color !== undefined) {
    if (color === null || color === '') {
      sets.push(`color = NULL`);
    } else if (HEX_COLOR_RE.test(color)) {
      params.push(color);
      sets.push(`color = $${params.length}`);
    } else {
      return res.status(400).json({ success: false, message: 'color must be #RRGGBB or null' });
    }
  }
  if (sets.length === 0) {
    return res.status(400).json({ success: false, message: 'nothing to update' });
  }
  params.push(parseInt(id, 10));
  try {
    const { rows } = await pool.query(
      `UPDATE departments SET ${sets.join(', ')} WHERE department_id = $${params.length}
       RETURNING department_id, name, color`,
      params
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'department not found' });
    }
    return res.json({ success: true, department: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'department name already exists' });
    }
    console.error('[departments:PATCH]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

app.delete('/api/admin/departments/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    // Refuse to delete if staff or shifts reference this dept —
    // would orphan FKs. Admin should reassign first.
    const { rows: refs } = await pool.query(
      // Sprint 11.1.2: don't count soft-deleted staff against
      // dept deletion — they're gone from every other surface, so
      // they shouldn't block dept cleanup either.
      `SELECT COUNT(*)::int AS n FROM users
       WHERE department_id = $1 AND deleted_at IS NULL`,
      [parseInt(id, 10)]
    );
    if (refs[0]?.n > 0) {
      return res.status(409).json({
        success: false,
        message: `${refs[0].n} staff still in this department — reassign them first.`,
      });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM departments WHERE department_id = $1`,
      [parseInt(id, 10)]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'department not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[departments:DELETE]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// ── Status Codes (Sprint 15.0) ────────────────────────────────────────────────
// Admin-defined codes the Shift Sheet renders as colored pills.
// CRUD lives under /api/admin/status-codes. is_system rows are
// renamable / re-colorable but not deletable (preserved across
// fresh installs via the seed in migration 019).

const isValidHexColor = (v) =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

app.get('/api/admin/status-codes', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT code_id, label, abbreviation, color, is_system, sort_order, updated_at
         FROM status_codes
        ORDER BY sort_order, label`
    );
    return res.json({ success: true, codes: rows });
  } catch (err) {
    console.error('[status-codes:GET]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

app.post('/api/admin/status-codes', requireAuth, requireRole('admin'), async (req, res) => {
  const { label, abbreviation, color, sort_order } = req.body || {};
  if (!label || !abbreviation || !color) {
    return res.status(400).json({ success: false, message: 'label, abbreviation, color required' });
  }
  if (!isValidHexColor(color)) {
    return res.status(400).json({ success: false, message: 'color must be #RRGGBB hex' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO status_codes (label, abbreviation, color, sort_order, is_system, updated_at)
       VALUES ($1, $2, $3, COALESCE($4, 100), FALSE, NOW())
       RETURNING code_id, label, abbreviation, color, is_system, sort_order, updated_at`,
      [label.trim(), abbreviation.trim().toUpperCase(), color.toLowerCase(),
       Number.isInteger(sort_order) ? sort_order : null]
    );
    return res.json({ success: true, code: rows[0] });
  } catch (err) {
    // Unique-violation on abbreviation → 409.
    if (err && err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A status code with that abbreviation already exists.' });
    }
    console.error('[status-codes:POST]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

app.patch('/api/admin/status-codes/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { label, abbreviation, color, sort_order } = req.body || {};
  if (color !== undefined && !isValidHexColor(color)) {
    return res.status(400).json({ success: false, message: 'color must be #RRGGBB hex' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE status_codes
          SET label        = COALESCE($1, label),
              abbreviation = COALESCE($2, abbreviation),
              color        = COALESCE($3, color),
              sort_order   = COALESCE($4, sort_order),
              updated_at   = NOW()
        WHERE code_id = $5::uuid
        RETURNING code_id, label, abbreviation, color, is_system, sort_order, updated_at`,
      [
        label ? label.trim() : null,
        abbreviation ? abbreviation.trim().toUpperCase() : null,
        color ? color.toLowerCase() : null,
        Number.isInteger(sort_order) ? sort_order : null,
        id,
      ]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'status code not found' });
    }
    return res.json({ success: true, code: rows[0] });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A status code with that abbreviation already exists.' });
    }
    console.error('[status-codes:PATCH]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

app.delete('/api/admin/status-codes/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    // System codes are protected — admin can rename / recolor them
    // but not remove them entirely. Guard at the DB level via the
    // WHERE clause so a stale client can't bypass it.
    const { rowCount } = await pool.query(
      `DELETE FROM status_codes WHERE code_id = $1::uuid AND is_system = FALSE`,
      [id]
    );
    if (!rowCount) {
      // Distinguish "not found" from "is_system protected" for a
      // friendlier 409.
      const { rows } = await pool.query(
        `SELECT is_system FROM status_codes WHERE code_id = $1::uuid`,
        [id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'status code not found' });
      }
      return res.status(409).json({ success: false, message: 'System codes can be renamed but not deleted.' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[status-codes:DELETE]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// ── Employee clock-in / out ───────────────────────────────────────────────────

app.post('/api/authenticate', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ success: false, message: 'Phone number required' });

  try {
    const { rows } = await pool.query(
      `SELECT user_id, name, phone_number, role, hire_date
       FROM users WHERE phone_number = $1 AND active = true`,
      [phoneNumber]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });

    const user = rows[0];
    const { rows: open } = await pool.query(
      `SELECT entry_id, clock_in_time FROM time_entries
       WHERE user_id = $1 AND clock_out_time IS NULL
       ORDER BY clock_in_time DESC LIMIT 1`,
      [user.user_id]
    );

    return res.json({
      success: true,
      employee: {
        ...user,
        clocked_in:    open.length > 0,
        clock_in_time: open.length > 0 ? open[0].clock_in_time : null,
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/clock-in', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ success: false, message: 'Phone number required' });

  try {
    const { rows: users } = await pool.query(
      'SELECT user_id FROM users WHERE phone_number = $1 AND active = true',
      [phoneNumber]
    );
    if (!users.length) return res.status(404).json({ success: false, message: 'Employee not found' });

    const userId = users[0].user_id;

    const { rows: open } = await pool.query(
      'SELECT entry_id FROM time_entries WHERE user_id = $1 AND clock_out_time IS NULL',
      [userId]
    );
    if (open.length) return res.status(400).json({ success: false, message: 'Already clocked in' });

    const { rows } = await pool.query(
      'INSERT INTO time_entries (user_id, clock_in_time) VALUES ($1, NOW()) RETURNING *',
      [userId]
    );
    return res.json({ success: true, entry: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/clock-out', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ success: false, message: 'Phone number required' });

  try {
    const { rows: users } = await pool.query(
      'SELECT user_id FROM users WHERE phone_number = $1 AND active = true',
      [phoneNumber]
    );
    if (!users.length) return res.status(404).json({ success: false, message: 'Employee not found' });

    const userId = users[0].user_id;

    const { rows: open } = await pool.query(
      `SELECT entry_id FROM time_entries
       WHERE user_id = $1 AND clock_out_time IS NULL
       ORDER BY clock_in_time DESC LIMIT 1`,
      [userId]
    );
    if (!open.length) return res.status(400).json({ success: false, message: 'Not currently clocked in' });

    const { rows } = await pool.query(
      'UPDATE time_entries SET clock_out_time = NOW() WHERE entry_id = $1 RETURNING *',
      [open[0].entry_id]
    );
    return res.json({ success: true, entry: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Me (auth-based clock + dashboard data) ──────────────────────────────────

app.post('/api/clock-in-self', requireAuth, async (req, res) => {
  if (req.auth.type !== 'staff') {
    return res.status(403).json({ success: false, message: 'Staff only' });
  }
  try {
    const userId = req.auth.sub;
    const { rows: open } = await pool.query(
      'SELECT entry_id FROM time_entries WHERE user_id = $1 AND clock_out_time IS NULL',
      [userId]
    );
    if (open.length) return res.status(400).json({ success: false, message: 'Already clocked in' });

    const { rows } = await pool.query(
      'INSERT INTO time_entries (user_id, clock_in_time) VALUES ($1, NOW()) RETURNING *',
      [userId]
    );
    return res.json({ success: true, entry: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/clock-out-self', requireAuth, async (req, res) => {
  if (req.auth.type !== 'staff') {
    return res.status(403).json({ success: false, message: 'Staff only' });
  }
  try {
    const userId = req.auth.sub;
    const { rows: open } = await pool.query(
      `SELECT entry_id FROM time_entries
       WHERE user_id = $1 AND clock_out_time IS NULL
       ORDER BY clock_in_time DESC LIMIT 1`,
      [userId]
    );
    if (!open.length) return res.status(400).json({ success: false, message: 'Not currently clocked in' });

    const { rows } = await pool.query(
      'UPDATE time_entries SET clock_out_time = NOW() WHERE entry_id = $1 RETURNING *',
      [open[0].entry_id]
    );
    return res.json({ success: true, entry: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Dashboard data for the authed staff user. weekStart=YYYY-MM-DD (Monday).
// Sprint 13.6: split a clock-in/clock-out entry into per-local-day
// hour chunks, honoring the caller's local timezone (passed in as
// `tz_offset_minutes`, matching `new Date().getTimezoneOffset()` —
// positive for west-of-UTC, negative for east). Mirrors the
// client-side adapter Sprint 13.5 added for the admin calendar —
// keeps the per-day breakdown honest when a single shift spans
// midnight (Monday 10pm → Tuesday 7am should put ~2h on Mon and
// ~7h on Tue, not 9h pinned to Monday).
const splitEntryByLocalDay = (entry, tzOffsetMinutes) => {
  const tzMs   = tzOffsetMinutes * 60_000;
  const inUtc  = new Date(entry.clock_in_time).getTime();
  const outUtc = entry.clock_out_time
    ? new Date(entry.clock_out_time).getTime()
    : Date.now();
  if (outUtc <= inUtc) return [];

  const out = [];
  let cursor = inUtc;
  let safety = 32;  // a clock-in left open for > a month is a data anomaly
  while (cursor < outUtc && safety-- > 0) {
    // Treat (cursor - tzMs) as "this UTC instant rendered in local
    // time" — its UTC-accessor fields are the local components.
    const local = new Date(cursor - tzMs);
    // Next local midnight: start of (local Y, M, D + 1) re-expressed
    // as the original UTC instant by re-adding the offset.
    const nextLocalMidnightAsLocalMs = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + 1,
      0, 0, 0
    );
    const nextLocalMidnightUtc = nextLocalMidnightAsLocalMs + tzMs;
    const segEnd = Math.min(outUtc, nextLocalMidnightUtc);
    const segHours = (segEnd - cursor) / 3_600_000;
    const dateKey = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
    out.push({ dateKey, hours: segHours });
    cursor = segEnd;
  }
  return out;
};

// String-based day arithmetic — avoids the Date-object timezone trap
// the old `new Date(weekStart + 'T00:00:00')` had (server-local
// midnight, which is UTC on Koyeb).
const addDaysToYmd = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};

app.get('/api/me/hours', requireAuth, async (req, res) => {
  if (req.auth.type !== 'staff') {
    return res.status(403).json({ success: false, message: 'Staff only' });
  }
  const userId    = req.auth.sub;
  const weekStart = req.query.weekStart;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ success: false, message: 'weekStart=YYYY-MM-DD required' });
  }
  // Sprint 13.6: caller's local timezone offset (mins, signed like
  // `new Date().getTimezoneOffset()`). Defaults to 0 (UTC) to keep
  // unauth'd / legacy callers behaving as before; the staff client
  // passes its real offset.
  const tzOffsetMinutes = parseInt(req.query.tz_offset_minutes, 10);
  const tzOffset = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0;

  try {
    // Entries that INTERSECT the week. An entry counts if any portion of it
    // falls inside [weekStart, weekStart + 7 days). This catches shifts that
    // started before this week but extend into it, and shifts that start in
    // this week but extend into next week.
    const { rows: entries } = await pool.query(
      `SELECT entry_id, clock_in_time, clock_out_time,
              EXTRACT(EPOCH FROM (COALESCE(clock_out_time, NOW()) - clock_in_time)) / 3600.0 AS hours
       FROM time_entries
       WHERE user_id = $1
         AND clock_in_time <  ($2::date + INTERVAL '7 days')
         AND COALESCE(clock_out_time, NOW()) >= $2::date
       ORDER BY clock_in_time DESC`,
      [userId, weekStart]
    );

    // Sprint 13.6: build per-local-day hour totals by splitting each
    // entry across the local days it touches. `weekStart` is a
    // YYYY-MM-DD string interpreted in the *caller's* local TZ; days
    // are derived via plain string arithmetic so server TZ doesn't
    // contaminate the bucket boundaries.
    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const dayHours = new Map();
    for (const e of entries) {
      for (const { dateKey, hours } of splitEntryByLocalDay(e, tzOffset)) {
        dayHours.set(dateKey, (dayHours.get(dateKey) || 0) + hours);
      }
    }
    const days = [];
    for (let i = 0; i < 7; i++) {
      const isoDate = addDaysToYmd(weekStart, i);
      days.push({
        date:    isoDate,
        dayName: dayNames[i],
        hours:   Math.round((dayHours.get(isoDate) || 0) * 10) / 10,
      });
    }
    const totalHours = Math.round(days.reduce((s, d) => s + d.hours, 0) * 10) / 10;

    // Scheduled hours this week (handles overnight shifts in JS)
    const { rows: scheds } = await pool.query(
      `SELECT
         COALESCE(sc.custom_start_time, sh.start_time)::text AS start_time,
         COALESCE(sc.custom_end_time,   sh.end_time)::text   AS end_time
       FROM schedules sc
       LEFT JOIN shifts sh ON sc.shift_id = sh.shift_id
       WHERE sc.user_id = $1
         AND sc.scheduled_date >= $2::date
         AND sc.scheduled_date <  ($2::date + INTERVAL '7 days')`,
      [userId, weekStart]
    );
    const minsBetween = (start, end) => {
      if (!start || !end) return 0;
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      let mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins < 0) mins += 24 * 60;
      return mins;
    };
    const scheduledHours = Math.round(
      scheds.reduce((s, r) => s + minsBetween(r.start_time, r.end_time), 0) / 60 * 10
    ) / 10;

    // Last 5 entries (any time)
    const { rows: recent } = await pool.query(
      `SELECT entry_id, clock_in_time, clock_out_time,
              EXTRACT(EPOCH FROM (COALESCE(clock_out_time, NOW()) - clock_in_time)) / 3600.0 AS hours
       FROM time_entries
       WHERE user_id = $1
       ORDER BY clock_in_time DESC
       LIMIT 5`,
      [userId]
    );
    const recentShifts = recent.map(r => ({
      entry_id:       r.entry_id,
      clock_in_time:  r.clock_in_time,
      clock_out_time: r.clock_out_time,
      hours:          Math.round(parseFloat(r.hours) * 10) / 10,
    }));

    // Current open entry (still clocked in)?
    const open = entries.find(e => !e.clock_out_time)
              || recent.find(e => !e.clock_out_time);

    // Raw entries for this week — Timesheet groups these by day for the
    // breakdown view. Home doesn't read this, so the cost is just payload.
    const weekEntries = entries.map(e => ({
      entry_id:       e.entry_id,
      clock_in_time:  e.clock_in_time,
      clock_out_time: e.clock_out_time,
      hours:          Math.round(parseFloat(e.hours) * 10) / 10,
    }));

    // Sprint 8.6: auto-signout timer (seconds) — staff Home reads this from
    // every /me/hours response so the banner timeout reflects the latest
    // admin setting without an extra fetch. 0 means the feature is off.
    // Sprint 16.1: also surface the idle-logout setting alongside
    // auto_signout_seconds. Single SQL trip pulls both. Default 15.
    const cfgRow = await pool.query(
      `SELECT key, value FROM app_settings
        WHERE key IN ('auto_signout_seconds', 'staff_idle_logout_seconds')`
    );
    const cfgMap = Object.fromEntries(cfgRow.rows.map(r => [r.key, r.value]));
    const autoSignoutSeconds = cfgMap.auto_signout_seconds !== undefined
      ? parseInt(cfgMap.auto_signout_seconds, 10)
      : 3;
    const idleLogoutSeconds = cfgMap.staff_idle_logout_seconds !== undefined
      ? parseInt(cfgMap.staff_idle_logout_seconds, 10)
      : 15;

    return res.json({
      success:             true,
      weekStart,
      days,
      totalHours,
      scheduledHours,
      recentShifts,
      entries:             weekEntries,
      currentlyClockedIn:  !!open,
      openClockInTime:     open ? open.clock_in_time : null,
      autoSignoutSeconds,
      idleLogoutSeconds,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Entries for the authed user in an arbitrary date range. Used by Timesheet
// CSV export (month/year range options). `from` is inclusive, `to` is inclusive.
app.get('/api/me/entries', requireAuth, async (req, res) => {
  if (req.auth.type !== 'staff') {
    return res.status(403).json({ success: false, message: 'Staff only' });
  }
  const { from, to } = req.query;
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ success: false, message: 'from and to dates required (YYYY-MM-DD)' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT entry_id, clock_in_time, clock_out_time,
              EXTRACT(EPOCH FROM (COALESCE(clock_out_time, NOW()) - clock_in_time)) / 3600.0 AS hours
       FROM time_entries
       WHERE user_id = $1
         AND clock_in_time >= $2::date
         AND clock_in_time <  ($3::date + INTERVAL '1 day')
       ORDER BY clock_in_time DESC`,
      [req.auth.sub, from, to]
    );
    return res.json({
      success: true,
      from, to,
      entries: rows.map(e => ({
        entry_id:       e.entry_id,
        clock_in_time:  e.clock_in_time,
        clock_out_time: e.clock_out_time,
        hours:          Math.round(parseFloat(e.hours) * 10) / 10,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// History for the authed user (last 4 weeks). Used by TimeClock week strip.
app.get('/api/me/history', requireAuth, async (req, res) => {
  if (req.auth.type !== 'staff') {
    return res.status(403).json({ success: false, message: 'Staff only' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT entry_id, clock_in_time, clock_out_time,
         CASE WHEN clock_out_time IS NOT NULL
           THEN ROUND(EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 60)
           ELSE NULL
         END AS total_minutes
       FROM time_entries
       WHERE user_id = $1 AND clock_in_time >= NOW() - INTERVAL '4 weeks'
       ORDER BY clock_in_time DESC`,
      [req.auth.sub]
    );
    return res.json({ success: true, entries: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── User: shift history (legacy — phone-based, kept for old clients) ────────

app.get('/api/user/:phone/history', async (req, res) => {
  try {
    const { rows: users } = await pool.query(
      'SELECT user_id FROM users WHERE phone_number = $1 AND active = true',
      [req.params.phone]
    );
    if (!users.length) return res.status(404).json({ success: false, message: 'Not found' });

    const { rows } = await pool.query(
      `SELECT entry_id, clock_in_time, clock_out_time,
         CASE WHEN clock_out_time IS NOT NULL
           THEN ROUND(EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 60)
           ELSE NULL
         END AS total_minutes
       FROM time_entries
       WHERE user_id = $1 AND clock_in_time >= NOW() - INTERVAL '4 weeks'
       ORDER BY clock_in_time DESC`,
      [users[0].user_id]
    );
    return res.json({ success: true, entries: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Admin: employees ──────────────────────────────────────────────────────────

app.get('/api/admin/employees', async (req, res) => {
  try {
    // Read OT threshold so per-row pending_ot_hours stays consistent with the
    // performance dashboard's definition. Falls back to 40h if missing.
    const { rows: cfg } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'overtime_threshold_hours'`
    );
    const threshold = cfg[0]?.value ? parseFloat(cfg[0].value) : 40;

    // CTE: per-user week aggregates. is_on_clock = any open entry; all_approved
    // = every entry's ot_approved is true (NULL if no entries → COALESCE later).
    const { rows } = await pool.query(
      `WITH week_agg AS (
         SELECT
           user_id,
           SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out_time, NOW()) - clock_in_time)) / 3600.0)::float AS hours,
           BOOL_OR(clock_out_time IS NULL) AS is_on_clock,
           BOOL_AND(ot_approved)            AS all_approved
         FROM time_entries
         WHERE clock_in_time >= date_trunc('week', CURRENT_DATE)
         GROUP BY user_id
       )
       SELECT
         u.user_id, u.name, u.phone_number, u.username, u.employee_code, u.birthday,
         u.role, u.hire_date,
         u.base_hourly_rate, u.active, u.department_id, d.name AS department,
         u.pin_required, u.pin_must_set,
         u.preferred_language,
         (u.pin_hash IS NOT NULL) AS has_pin,
         COALESCE(wa.hours, 0)::float                AS hours_this_week,
         COALESCE(wa.is_on_clock, false)             AS is_on_clock,
         CASE
           WHEN COALESCE(wa.hours, 0) > $1 AND NOT COALESCE(wa.all_approved, true)
           THEN COALESCE(wa.hours, 0) - $1
           ELSE 0
         END::float                                  AS pending_ot_hours
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.department_id
       LEFT JOIN week_agg wa   ON wa.user_id      = u.user_id
       WHERE u.deleted_at IS NULL  -- Sprint 11.1.2: hide soft-deleted users
       ORDER BY u.name`,
      [threshold]
    );

    return res.json({
      success:   true,
      employees: rows.map(r => ({
        ...r,
        hours_this_week:  Math.round(r.hours_this_week  * 10) / 10,
        pending_ot_hours: Math.round(r.pending_ot_hours * 10) / 10,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/admin/employees/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.user_id, u.name, u.phone_number, u.username, u.employee_code, u.birthday,
              u.role, u.hire_date,
              u.base_hourly_rate, u.active, u.department_id, d.name AS department,
              u.pin_required, u.pin_must_set,
              u.preferred_language,
              (u.pin_hash IS NOT NULL) AS has_pin
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.department_id
       WHERE u.user_id = $1 AND u.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    return res.json({ success: true, employee: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/admin/employees', async (req, res) => {
  const { name, role, hireDate, departmentId, baseHourlyRate,
          phoneNumber, username, employeeCode, birthday,
          preferredLanguage } = req.body;
  if (!name || !hireDate) {
    return res.status(400).json({ success: false, message: 'name and hireDate required' });
  }
  const v = validateIdentifiers({ phoneNumber, username, employeeCode, birthday });
  if (!v.ok) return res.status(400).json({ success: false, message: v.message });
  // Sprint 16.2: preferred_language. Default to 'en' when omitted
  // or invalid so the column's CHECK constraint stays satisfied.
  const lang = (preferredLanguage && ['en', 'es', 'zh'].includes(preferredLanguage))
    ? preferredLanguage : 'en';
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, phone_number, username, employee_code, birthday,
                          role, hire_date, department_id, base_hourly_rate,
                          preferred_language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [name, v.normalized.phoneNumber, v.normalized.username, v.normalized.employeeCode, v.normalized.birthday,
       role || 'employee', hireDate, departmentId || null, baseHourlyRate || null, lang]
    );
    return res.json({ success: true, employee: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: uniqueViolationMessage(err) });
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.patch('/api/admin/employees/:id/status', async (req, res) => {
  const { active } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE users SET active = $1 WHERE user_id = $2 RETURNING *',
      [!!active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    return res.json({ success: true, employee: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.put('/api/admin/employees/:id', async (req, res) => {
  const { name, role, hireDate, departmentId, baseHourlyRate,
          phoneNumber, username, employeeCode, birthday,
          preferredLanguage } = req.body;
  if (!name || !hireDate) {
    return res.status(400).json({ success: false, message: 'name and hireDate required' });
  }
  const v = validateIdentifiers({ phoneNumber, username, employeeCode, birthday });
  if (!v.ok) return res.status(400).json({ success: false, message: v.message });
  // Sprint 16.2: preferred_language gates the staff i18n layer.
  // Default-preserve via COALESCE so a partial PUT from an older
  // client doesn't wipe the admin's language choice.
  const lang = (preferredLanguage && ['en', 'es', 'zh'].includes(preferredLanguage))
    ? preferredLanguage : null;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, phone_number=$2, username=$3, employee_code=$4, birthday=$5,
                        role=$6, hire_date=$7, department_id=$8, base_hourly_rate=$9,
                        preferred_language=COALESCE($10, preferred_language)
       WHERE user_id=$11 RETURNING *`,
      [name, v.normalized.phoneNumber, v.normalized.username, v.normalized.employeeCode, v.normalized.birthday,
       role || 'employee', hireDate, departmentId || null, baseHourlyRate || null, lang, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    return res.json({ success: true, employee: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: uniqueViolationMessage(err) });
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.delete('/api/admin/employees/:id', async (req, res) => {
  // Sprint 11.1.2: soft delete. Hard DELETE explodes on the
  // time_entries.user_id FK (payroll/audit history we can't drop).
  // Setting `deleted_at = NOW()` hides the user from every UI
  // surface (list queries filter `deleted_at IS NULL`) while
  // preserving FK references for the historical record.
  try {
    const { rows: check } = await pool.query(
      'SELECT active, deleted_at FROM users WHERE user_id = $1',
      [req.params.id]
    );
    if (!check.length) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    if (check[0].deleted_at) {
      // Idempotent — re-DELETE of an already-soft-deleted user is a no-op success.
      return res.json({ success: true });
    }
    if (check[0].active) {
      return res.status(400).json({ success: false, message: 'Deactivate employee before deleting' });
    }
    await pool.query(
      `UPDATE users SET deleted_at = NOW(), active = false, updated_at = NOW()
       WHERE user_id = $1`,
      [req.params.id]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Admin: dashboard (home page aggregation) ─────────────────────────────────
//
// Single endpoint that powers the admin home: who's currently working, who's
// scheduled today (with derived status), pending approval queue, and a few
// counters. Called once on AdminHome mount; refreshes can re-call as needed.

app.get('/api/admin/dashboard', requireAuth, requireRole('admin'), async (req, res) => {
  // Use allSettled so one broken query doesn't 500 the whole dashboard. We
  // log per-query failures and surface them on the response so the client
  // can show a warning banner without losing access to the data that DID
  // load. (Earlier behavior returned a generic 500 with no detail, which
  // hid the real error in production.)
  const labels = [
    'activeStaff', 'currentlyWorking', 'todaySchedule',
    'todayEntries', 'pendingApprovals', 'weekHours', 'staffHours',
    'otThreshold',
  ];
  const settled = await Promise.allSettled([
    pool.query('SELECT COUNT(*)::int AS n FROM users WHERE active = true'),
    pool.query(`
      SELECT u.user_id, u.name, u.phone_number, u.role, u.department_id,
             d.name AS department, te.entry_id, te.clock_in_time
      FROM time_entries te
      JOIN users u        ON te.user_id        = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE te.clock_out_time IS NULL
        AND u.active = true
      ORDER BY u.name
    `),
    pool.query(`
      SELECT sc.schedule_id, sc.user_id,
             COALESCE(sc.custom_start_time, sh.start_time)::text AS start_time,
             COALESCE(sc.custom_end_time,   sh.end_time)::text   AS end_time,
             u.name, u.role, d.name AS department
      FROM schedules sc
      LEFT JOIN shifts sh ON sc.shift_id = sh.shift_id
      JOIN users u        ON sc.user_id  = u.user_id
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE sc.scheduled_date = CURRENT_DATE
        AND u.active = true
      ORDER BY start_time, u.name
    `),
    pool.query(`
      SELECT user_id, clock_in_time, clock_out_time
      FROM time_entries
      WHERE clock_in_time >= CURRENT_DATE - INTERVAL '1 day'
    `),
    pool.query(`
      SELECT ar.request_id, ar.entry_id, ar.requested_by, ar.reason,
             ar.created_at, u.name AS requested_by_name
      FROM approval_requests ar
      JOIN users u ON ar.requested_by = u.user_id
      WHERE ar.status = 'pending'
      ORDER BY ar.created_at DESC
      LIMIT 10
    `),
    pool.query(`
      SELECT COALESCE(SUM(
        EXTRACT(EPOCH FROM (COALESCE(clock_out_time, NOW()) - clock_in_time)) / 3600.0
      ), 0)::float AS hours
      FROM time_entries
      WHERE clock_in_time >= date_trunc('week', CURRENT_DATE)
    `),
    // Per-employee hours this week + whether all entries are OT-approved
    // (drives both the Hours-detail view and the new Pending-OT view).
    pool.query(`
      SELECT u.user_id, u.name, d.name AS department,
             SUM(
               EXTRACT(EPOCH FROM (COALESCE(te.clock_out_time, NOW()) - te.clock_in_time)) / 3600.0
             )::float                       AS hours,
             BOOL_AND(te.ot_approved)        AS all_approved
      FROM users u
      JOIN time_entries te
        ON te.user_id = u.user_id
       AND te.clock_in_time >= date_trunc('week', CURRENT_DATE)
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE u.active = true
      GROUP BY u.user_id, u.name, d.name
      ORDER BY hours DESC, u.name
    `),
    // OT threshold for pending-OT computation
    pool.query(
      `SELECT value FROM app_settings WHERE key = 'overtime_threshold_hours'`
    ),
  ]);

  const errors = [];
  const out = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      out[labels[i]] = r.value;
    } else {
      const msg = r.reason?.message || String(r.reason);
      errors.push(`${labels[i]}: ${msg}`);
      console.error(`[dashboard] ${labels[i]} failed:`, r.reason);
    }
  });

  // Defaults for any failed query so the response shape is still safe.
  const activeStaff      = out.activeStaff      || { rows: [{ n: 0 }] };
  const currentlyWorking = out.currentlyWorking || { rows: [] };
  const todaySchedule    = out.todaySchedule    || { rows: [] };
  const todayEntries     = out.todayEntries     || { rows: [] };
  const pendingApprovals = out.pendingApprovals || { rows: [] };
  const weekHours        = out.weekHours        || { rows: [{ hours: 0 }] };
  const staffHours       = out.staffHours       || { rows: [] };
  const otThreshold      = out.otThreshold      || { rows: [] };

  // Pending-OT aggregation: a staff has pending OT when their weekly hours
  // exceed the threshold AND any of their entries this week is unapproved.
  const threshold      = parseFloat(otThreshold.rows[0]?.value || '40') || 40;
  const staffWithPendingOT = [];
  let   weekOTTotal    = 0;
  staffHours.rows.forEach(r => {
    const hrs = parseFloat(r.hours) || 0;
    if (hrs > threshold && r.all_approved !== true) {
      const pending = hrs - threshold;
      weekOTTotal += pending;
      staffWithPendingOT.push({
        user_id:          r.user_id,
        name:             r.name,
        department:       r.department,
        pending_ot_hours: Math.round(pending * 10) / 10,
        hours:            Math.round(hrs * 10) / 10,
      });
    }
  });
  weekOTTotal = Math.round(weekOTTotal * 10) / 10;

  // Derive per-schedule status (clocked-in / late / yet-to-start / finished).
  const now     = new Date();
  const userMap = {};
  todayEntries.rows.forEach(e => {
    (userMap[e.user_id] = userMap[e.user_id] || []).push(e);
  });

  const scheduleWithStatus = todaySchedule.rows.map(s => {
    const entries   = userMap[s.user_id] || [];
    const openEntry = entries.find(e => !e.clock_out_time);
    const finished  = entries.find(e => e.clock_out_time);

    const [sh, sm] = (s.start_time || '00:00').split(':').map(Number);
    const start    = new Date(now);
    start.setHours(sh, sm, 0, 0);

    let status;
    if (openEntry)        status = 'clocked-in';
    else if (finished)    status = 'finished';
    else if (now > start) status = 'late';
    else                  status = 'yet-to-start';

    return { ...s, status, open_clock_in_time: openEntry?.clock_in_time || null };
  });

  return res.json({
    success:               true,
    activeStaffCount:      activeStaff.rows[0]?.n ?? 0,
    currentlyWorking:      currentlyWorking.rows,
    todaySchedule:         scheduleWithStatus,
    pendingApprovals:      pendingApprovals.rows,
    pendingApprovalsCount: pendingApprovals.rows.length,
    weekHoursTotal:        Math.round((weekHours.rows[0]?.hours ?? 0) * 10) / 10,
    weekOTTotal,                                          // Sprint 6.5.1
    staffWithPendingOT,                                   // Sprint 6.5.1
    staffHoursThisWeek:    staffHours.rows.map(r => ({
                             user_id:    r.user_id,
                             name:       r.name,
                             department: r.department,
                             hours:      Math.round(r.hours * 10) / 10,
                           })),
    onTheClockCount:       currentlyWorking.rows.length,
    errors:                errors.length ? errors : undefined,
  });
});

// Period range helper used by both the performance endpoint and the bulk-OT
// approval endpoint so they always agree on what "this week / month / year"
// means.
function periodRange(period) {
  const now = new Date();
  let from, to, prevFrom, prevTo, label;

  if (period === 'week') {
    const dow    = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow - 1));
    monday.setHours(0, 0, 0, 0);
    from     = monday;
    to       = new Date(monday); to.setDate(to.getDate() + 7);
    prevFrom = new Date(from);   prevFrom.setDate(prevFrom.getDate() - 7);
    prevTo   = new Date(to);     prevTo.setDate(prevTo.getDate() - 7);
    label    = 'vs last week';
  } else if (period === 'month') {
    from     = new Date(now.getFullYear(), now.getMonth(),     1);
    to       = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevTo   = new Date(now.getFullYear(), now.getMonth(),     1);
    label    = 'vs last month';
  } else {
    from     = new Date(now.getFullYear(),     0, 1);
    to       = new Date(now.getFullYear() + 1, 0, 1);
    prevFrom = new Date(now.getFullYear() - 1, 0, 1);
    prevTo   = new Date(now.getFullYear(),     0, 1);
    label    = 'vs last year';
  }
  return { from, to, prevFrom, prevTo, label };
}

// ── Admin: per-staff performance ─────────────────────────────────────────────
//
// One round-trip computes every metric the StaffDetail performance dashboard
// needs: hours worked + overtime against a configurable threshold, on-time
// rate (clock-in within tolerance of scheduled start), shifts worked / missed,
// 8-week trend, recent shifts, and a self-comparison vs the previous period.

app.get('/api/admin/staff/:userId/performance', requireAuth, requireRole('admin'), async (req, res) => {
  const { userId } = req.params;
  const period = ['week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'week';

  // Sprint 13.6: caller's local TZ offset so the week / month / year
  // window aligns to the operator's day boundaries (not the server's).
  const tzOffsetMinutes = parseInt(req.query.tz_offset_minutes, 10);
  const tzOffset = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0;

  try {
    const now = new Date();
    const { from, to, prevFrom, prevTo, label } = periodRange(period, tzOffset);

    // 8 weeks back (this Monday) for the trend chart
    const trendStart = new Date(now);
    const tDow       = trendStart.getDay() || 7;
    trendStart.setDate(trendStart.getDate() - (tDow - 1) - 7 * 7);
    trendStart.setHours(0, 0, 0, 0);

    // Earliest cutoff: trend start or prev-period start, whichever is older
    const fetchFrom = trendStart < prevFrom ? trendStart : prevFrom;

    const settled = await Promise.allSettled([
      pool.query(
        `SELECT u.user_id, u.name, u.phone_number, u.role, u.hire_date, u.active,
                u.department_id, d.name AS department
         FROM users u LEFT JOIN departments d ON u.department_id = d.department_id
         WHERE u.user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT key, value FROM app_settings
         WHERE key IN ('overtime_threshold_hours','on_time_tolerance_minutes','compare_baseline')`
      ),
      pool.query(
        `SELECT entry_id, clock_in_time, clock_out_time, manual_entry, ot_approved,
                EXTRACT(EPOCH FROM (COALESCE(clock_out_time, NOW()) - clock_in_time)) / 3600.0 AS hours
         FROM time_entries
         WHERE user_id = $1 AND clock_in_time >= $2
         ORDER BY clock_in_time DESC`,
        [userId, fetchFrom]
      ),
      pool.query(
        `SELECT sc.schedule_id, sc.scheduled_date::text,
                COALESCE(sc.custom_start_time, sh.start_time)::text AS start_time,
                COALESCE(sc.custom_end_time,   sh.end_time)::text   AS end_time
         FROM schedules sc LEFT JOIN shifts sh ON sc.shift_id = sh.shift_id
         WHERE sc.user_id = $1
           AND sc.scheduled_date >= $2::date
           AND sc.scheduled_date <  $3::date`,
        [userId, from.toISOString().split('T')[0], to.toISOString().split('T')[0]]
      ),
    ]);

    // User must exist; everything else can degrade gracefully.
    if (settled[0].status === 'rejected' || !settled[0].value.rows.length) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    const user      = settled[0].value.rows[0];
    const config    = { overtime_threshold_hours: 40, on_time_tolerance_minutes: 10, compare_baseline: 'self' };
    if (settled[1].status === 'fulfilled') {
      settled[1].value.rows.forEach(r => { if (r.key in config) config[r.key] = r.value; });
    }
    config.overtime_threshold_hours  = parseFloat(config.overtime_threshold_hours);
    config.on_time_tolerance_minutes = parseInt(config.on_time_tolerance_minutes, 10);

    const entries   = settled[2].status === 'fulfilled' ? settled[2].value.rows : [];
    const schedules = settled[3].status === 'fulfilled' ? settled[3].value.rows : [];

    // Hours of an entry that overlap [a, b)
    const hoursIn = (e, a, b) => {
      const start = new Date(e.clock_in_time);
      const end   = e.clock_out_time ? new Date(e.clock_out_time) : new Date();
      const oa    = start > a ? start : a;
      const ob    = end   < b ? end   : b;
      const ms    = ob - oa;
      return ms > 0 ? ms / 3600000 : 0;
    };

    const hoursWorked = entries.reduce((s, e) => s + hoursIn(e, from, to), 0);
    const prevHours   = entries.reduce((s, e) => s + hoursIn(e, prevFrom, prevTo), 0);

    // Weekly-bucketed overtime within the period. A week's OT counts as
    // "approved" only when EVERY entry that falls in that week has
    // ot_approved=true (admin sign-off). Otherwise it's pending.
    const weekMs = 7 * 24 * 3600 * 1000;
    let hoursOvertime = 0, hoursOvertimeApproved = 0, hoursOvertimePending = 0;
    let cursor = new Date(from);
    while (cursor < to) {
      const wEnd  = new Date(cursor.getTime() + weekMs);
      const clip  = wEnd < to ? wEnd : to;
      const wHrs  = entries.reduce((s, e) => s + hoursIn(e, cursor, clip), 0);
      if (wHrs > config.overtime_threshold_hours) {
        const ot = wHrs - config.overtime_threshold_hours;
        hoursOvertime += ot;
        // Entries whose clock-in falls in this week range
        const inWeek = entries.filter(e => {
          const start = new Date(e.clock_in_time);
          return start >= cursor && start < clip;
        });
        const allApproved = inWeek.length > 0 && inWeek.every(e => e.ot_approved);
        if (allApproved) hoursOvertimeApproved += ot;
        else             hoursOvertimePending  += ot;
      }
      cursor = wEnd;
    }

    // Shifts: pair each schedule with an entry within ±4h of scheduled start
    const tolMs   = config.on_time_tolerance_minutes * 60 * 1000;
    const matchMs = 4 * 3600 * 1000;
    let shiftsWorked = 0, shiftsMissed = 0, shiftsLate = 0, shiftsOnTime = 0;
    schedules.forEach(s => {
      const schedStart = new Date(`${s.scheduled_date}T${s.start_time}`);
      const match = entries.find(e =>
        Math.abs(new Date(e.clock_in_time).getTime() - schedStart.getTime()) <= matchMs
      );
      if (match) {
        shiftsWorked += 1;
        const lateBy = new Date(match.clock_in_time).getTime() - schedStart.getTime();
        if (lateBy <= tolMs) shiftsOnTime += 1;
        else                 shiftsLate   += 1;
      } else {
        shiftsMissed += 1;
      }
    });
    const onTimeRate = shiftsWorked > 0 ? shiftsOnTime / shiftsWorked : null;

    // Trend: last 8 weeks of weekly hours (oldest → newest)
    const trend = [];
    for (let i = 7; i >= 0; i--) {
      const dow    = now.getDay() || 7;
      const wStart = new Date(now);
      wStart.setDate(now.getDate() - (dow - 1) - i * 7);
      wStart.setHours(0, 0, 0, 0);
      const wEnd = new Date(wStart);
      wEnd.setDate(wStart.getDate() + 7);
      const h = entries.reduce((s, e) => s + hoursIn(e, wStart, wEnd), 0);
      trend.push({
        weekStart: wStart.toISOString().split('T')[0],
        hours:     Math.round(h * 10) / 10,
      });
    }

    const recentShifts = entries.slice(0, 10).map(e => ({
      entry_id:       e.entry_id,
      clock_in_time:  e.clock_in_time,
      clock_out_time: e.clock_out_time,
      hours:          e.clock_out_time ? Math.round(parseFloat(e.hours) * 10) / 10 : null,
      manual_entry:   e.manual_entry,
    }));

    const comparison = {
      baseline:      config.compare_baseline,
      label,
      previousValue: Math.round(prevHours * 10) / 10,
      deltaPct:      prevHours > 0 ? (hoursWorked - prevHours) / prevHours : null,
      note:          config.compare_baseline === 'self'
                       ? null
                       : 'Other baselines (department / all-staff) not yet implemented — showing self comparison.',
    };

    return res.json({
      success: true,
      user: {
        user_id:       user.user_id,
        name:          user.name,
        phone_number:  user.phone_number,
        role:          user.role,
        department:    user.department,
        department_id: user.department_id,
        hire_date:     user.hire_date,
        active:        user.active,
      },
      config,
      period,
      range: {
        from: from.toISOString().split('T')[0],
        to:   new Date(to.getTime() - 86400000).toISOString().split('T')[0],   // inclusive end
      },
      hoursWorked:     Math.round(hoursWorked * 10) / 10,
      hoursOvertime:         Math.round(hoursOvertime * 10) / 10,
      hoursOvertimeApproved: Math.round(hoursOvertimeApproved * 10) / 10,
      hoursOvertimePending:  Math.round(hoursOvertimePending  * 10) / 10,
      shiftsScheduled: schedules.length,
      shiftsWorked,
      shiftsMissed,
      shiftsOnTime,
      shiftsLate,
      onTimeRate:      onTimeRate != null ? Math.round(onTimeRate * 100) / 100 : null,
      comparison,
      trend,
      recentShifts,
    });
  } catch (err) {
    console.error('[performance]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// ── Admin: bulk entries (powers Staff list CSV export) ──────────────────────
//
// GET /api/admin/entries?from=YYYY-MM-DD&to=YYYY-MM-DD[&user_ids=a,b][&dept_id=N]
// Returns time_entries in [from, to] joined with the user's name and
// department. Optional filters narrow to specific users or a department.
// Date filter is inclusive on both ends.

app.get('/api/admin/entries', requireAuth, requireRole('admin'), async (req, res) => {
  const { from, to, user_ids, dept_id } = req.query;
  // Sprint 13.4: accept either YYYY-MM-DD (legacy, treated as server-
  // local date) OR a full ISO timestamp (preferred — encodes the
  // caller's local midnight in UTC so the range maps correctly
  // across timezones). The 11 PM clock-in bug was the server casting
  // 'YYYY-MM-DD' to ::date in UTC; an entry at 11 PM PT lives in the
  // next UTC day and fell outside the day's date range, so today's
  // calendar rendered empty while tomorrow's showed the entry.
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ISO_RE  = /^\d{4}-\d{2}-\d{2}T/;
  const fromIsISO = ISO_RE.test(String(from || ''));
  const toIsISO   = ISO_RE.test(String(to   || ''));
  const fromIsDate = DATE_RE.test(String(from || ''));
  const toIsDate   = DATE_RE.test(String(to   || ''));
  if (!from || !to || (!fromIsISO && !fromIsDate) || (!toIsISO && !toIsDate)) {
    return res.status(400).json({
      success: false,
      message: 'from and to required (YYYY-MM-DD or ISO timestamp)',
    });
  }

  // Sprint 13.7: predicate switches from "clock_in_time in [from, to)"
  // to "entry OVERLAPS [from, to)". An overnight shift that started
  // yesterday at 10pm and clocked out today at 7am has its Tuesday
  // segment (via Sprint 13.5's adapter) only if today's fetch returns
  // the entry — and the old predicate dropped it because
  // clock_in_time was yesterday. The overlap predicate is
  //   clock_in_time < to AND (clock_out_time IS NULL OR clock_out_time > from)
  // The COALESCE collapses null clock_out_time to NOW(), so a staff
  // still on the clock has their open entry surface on every day
  // the segment touches.
  const conditions = fromIsISO && toIsISO
    ? [
        `te.clock_in_time              <  $2::timestamptz`,
        `COALESCE(te.clock_out_time, NOW()) > $1::timestamptz`,
      ]
    : [
        // Legacy date format — interpreted in the server's timezone.
        `te.clock_in_time              <  ($2::date + INTERVAL '1 day')`,
        `COALESCE(te.clock_out_time, NOW()) > $1::date`,
      ];
  const params = [from, to];

  if (user_ids) {
    const ids = String(user_ids).split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length) {
      params.push(ids);
      conditions.push(`te.user_id = ANY($${params.length}::uuid[])`);
    }
  }
  if (dept_id) {
    params.push(parseInt(dept_id, 10));
    conditions.push(`u.department_id = $${params.length}::int`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT te.entry_id, te.clock_in_time, te.clock_out_time, te.manual_entry, te.ot_approved,
              EXTRACT(EPOCH FROM (COALESCE(te.clock_out_time, NOW()) - te.clock_in_time)) / 3600.0 AS hours,
              u.user_id, u.name, u.phone_number, u.role, u.base_hourly_rate,
              u.department_id, d.name AS department
       FROM time_entries te
       JOIN users u ON te.user_id = u.user_id
       LEFT JOIN departments d ON u.department_id = d.department_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.name, te.clock_in_time`,
      params
    );
    return res.json({
      success: true,
      from, to,
      entries: rows.map(e => ({
        entry_id:       e.entry_id,
        user_id:        e.user_id,
        name:           e.name,
        phone_number:   e.phone_number,
        role:           e.role,
        // Sprint 9.4: surface base_hourly_rate so the XLSX export can
        // compute Total Pay per employee. Null when not set; client
        // shows the pay cell as blank in that case.
        base_hourly_rate: e.base_hourly_rate != null ? parseFloat(e.base_hourly_rate) : null,
        department_id:  e.department_id,
        department:     e.department,
        clock_in_time:  e.clock_in_time,
        clock_out_time: e.clock_out_time,
        manual_entry:   e.manual_entry,
        ot_approved:    e.ot_approved,
        hours:          Math.round(parseFloat(e.hours) * 10) / 10,
      })),
    });
  } catch (err) {
    console.error('[admin/entries]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// ── Admin: bulk OT approve ───────────────────────────────────────────────────
//
// Sets ot_approved=true on every unapproved time_entry for the given staff
// within the requested period. Audit-logged (single row per bulk action).

app.post('/api/admin/staff/:userId/approve-ot', requireAuth, requireRole('admin'), async (req, res) => {
  const { userId } = req.params;
  const period = ['week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'week';
  // Sprint 13.6: align the bulk-approve window with the operator's
  // local week/month/year boundaries — mirrors the performance
  // endpoint so "approve OT for this week" approves the same set
  // of entries the performance dashboard counts.
  const tzOffsetMinutes = parseInt(req.query.tz_offset_minutes, 10);
  const tzOffset = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0;
  const { from, to } = periodRange(period, tzOffset);

  try {
    const { rows: before } = await pool.query(
      `SELECT entry_id, ot_approved
       FROM time_entries
       WHERE user_id = $1 AND clock_in_time >= $2 AND clock_in_time < $3 AND ot_approved = false`,
      [userId, from, to]
    );
    if (before.length === 0) {
      return res.json({ success: true, approvedCount: 0 });
    }

    const { rowCount } = await pool.query(
      `UPDATE time_entries SET ot_approved = true
       WHERE user_id = $1 AND clock_in_time >= $2 AND clock_in_time < $3 AND ot_approved = false`,
      [userId, from, to]
    );

    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
       VALUES (NULL, 'admin_bulk_ot_approve', 'time_entries', NULL, $1, $2)`,
      [
        JSON.stringify({ entry_ids: before.map(b => b.entry_id) }),
        JSON.stringify({
          user_id: userId,
          period,
          from: from.toISOString(),
          to:   to.toISOString(),
          approved_count: rowCount,
          admin_username: req.auth.sub,
        }),
      ]
    );

    return res.json({ success: true, approvedCount: rowCount });
  } catch (err) {
    console.error('[approve-ot]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// ── Admin: time entry override ───────────────────────────────────────────────
//
// Direct write to time_entries. Admins are approvers, not requesters, so we
// don't go through the approval_requests table. Old/new values are captured
// in audit_logs for traceability.

app.patch('/api/admin/time-entries/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { clock_in_time, clock_out_time } = req.body || {};
  if (!clock_in_time) {
    return res.status(400).json({ success: false, message: 'clock_in_time required' });
  }
  if (isNaN(new Date(clock_in_time).getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid clock_in_time' });
  }
  const cleanOut = (clock_out_time === '' || clock_out_time == null) ? null : clock_out_time;
  if (cleanOut && isNaN(new Date(cleanOut).getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid clock_out_time' });
  }
  if (cleanOut && new Date(cleanOut) <= new Date(clock_in_time)) {
    return res.status(400).json({ success: false, message: 'clock_out_time must be after clock_in_time' });
  }

  try {
    const { rows: orig } = await pool.query(
      'SELECT entry_id, user_id, clock_in_time, clock_out_time, manual_entry FROM time_entries WHERE entry_id = $1',
      [req.params.id]
    );
    if (!orig.length) return res.status(404).json({ success: false, message: 'Entry not found' });

    const { rows } = await pool.query(
      `UPDATE time_entries
       SET clock_in_time = $1, clock_out_time = $2, manual_entry = true
       WHERE entry_id = $3
       RETURNING *`,
      [clock_in_time, cleanOut, req.params.id]
    );

    // Audit (actor_id NULL because admins aren't users; admin username goes in new_data).
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
       VALUES (NULL, 'admin_time_entry_edit', 'time_entries', $1, $2, $3)`,
      [
        req.params.id,
        JSON.stringify(orig[0]),
        JSON.stringify({ ...rows[0], admin_username: req.auth.sub }),
      ]
    );

    return res.json({ success: true, entry: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Admin: PIN management ────────────────────────────────────────────────────

// Toggle whether an employee must enter a PIN at login.
app.patch('/api/admin/employees/:id/pin', requireAuth, requireRole('admin'), async (req, res) => {
  const { pin_required } = req.body || {};
  if (typeof pin_required !== 'boolean') {
    return res.status(400).json({ success: false, message: 'pin_required (boolean) required' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE users SET pin_required = $1
       WHERE user_id = $2
       RETURNING user_id, pin_required, pin_must_set, (pin_hash IS NOT NULL) AS has_pin`,
      [pin_required, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    return res.json({ success: true, employee: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Reset an employee's PIN — clears pin_hash, sets pin_must_set=true.
// Admin never sees the PIN; employee picks a new one on next login.
app.post('/api/admin/employees/:id/pin/reset', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET pin_hash = NULL, pin_must_set = true
       WHERE user_id = $1
       RETURNING user_id, pin_required, pin_must_set, (pin_hash IS NOT NULL) AS has_pin`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    return res.json({ success: true, employee: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Admin: time entries ───────────────────────────────────────────────────────

app.get('/api/admin/employees/:id/time-entries', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM time_entries WHERE user_id = $1 ORDER BY clock_in_time DESC',
      [req.params.id]
    );
    return res.json({ success: true, timeEntries: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Admin: scheduling ─────────────────────────────────────────────────────────

app.get('/api/admin/shift-templates', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, d.name AS department_name
       FROM shifts s
       JOIN departments d ON s.department_id = d.department_id
       ORDER BY d.name, s.start_time`
    );
    return res.json({ success: true, templates: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Sprint 15.5: shift-template CRUD. The GET above predates 15.x;
// the Shift Sheet's Templates modal needs create/edit/delete so
// the GM can keep the dept-scoped quick-picks current without
// touching SQL directly.
const isValidTimeStr = (v) => typeof v === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(v);

app.post('/api/admin/shift-templates', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, department_id, start_time, end_time } = req.body || {};
  if (!name || !department_id || !isValidTimeStr(start_time) || !isValidTimeStr(end_time)) {
    return res.status(400).json({ success: false, message: 'name, department_id, start_time, end_time required (HH:MM)' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO shifts (name, department_id, start_time, end_time)
       VALUES ($1, $2, $3::time, $4::time)
       RETURNING shift_id, name, department_id, start_time::text, end_time::text`,
      [String(name).trim(), department_id, start_time, end_time]
    );
    return res.json({ success: true, template: rows[0] });
  } catch (err) {
    console.error('[shift-templates:POST]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

app.patch('/api/admin/shift-templates/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { name, department_id, start_time, end_time } = req.body || {};
  if (start_time !== undefined && !isValidTimeStr(start_time)) {
    return res.status(400).json({ success: false, message: 'start_time must be HH:MM' });
  }
  if (end_time !== undefined && !isValidTimeStr(end_time)) {
    return res.status(400).json({ success: false, message: 'end_time must be HH:MM' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE shifts
          SET name          = COALESCE($1, name),
              department_id = COALESCE($2, department_id),
              start_time    = COALESCE($3::time, start_time),
              end_time      = COALESCE($4::time, end_time)
        WHERE shift_id = $5::uuid
        RETURNING shift_id, name, department_id, start_time::text, end_time::text`,
      [name ? String(name).trim() : null, department_id || null, start_time || null, end_time || null, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'template not found' });
    }
    return res.json({ success: true, template: rows[0] });
  } catch (err) {
    console.error('[shift-templates:PATCH]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

app.delete('/api/admin/shift-templates/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    // Refuse if any schedule rows reference this shift; admin should
    // reassign / clear first (mirrors the dept-delete guard).
    const { rows: refs } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM schedules WHERE shift_id = $1::uuid`,
      [id]
    );
    if (refs[0]?.n > 0) {
      return res.status(409).json({
        success: false,
        message: `${refs[0].n} scheduled shifts still reference this template — clear them first.`,
      });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM shifts WHERE shift_id = $1::uuid`,
      [id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'template not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[shift-templates:DELETE]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

app.get('/api/admin/schedule', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ success: false, message: 'start and end dates required' });
  try {
    const { rows } = await pool.query(
      `SELECT
         sc.schedule_id,
         sc.user_id,
         sc.scheduled_date::text,
         sc.notes,
         sc.shift_id,
         COALESCE(sc.custom_start_time, sh.start_time)::text AS start_time,
         COALESCE(sc.custom_end_time,   sh.end_time)::text   AS end_time,
         CASE WHEN sc.shift_id IS NOT NULL THEN sh.name ELSE 'Custom' END AS shift_name,
         u.name           AS employee_name,
         u.department_id,
         d.name           AS department_name
       FROM schedules sc
       JOIN users u        ON sc.user_id        = u.user_id
       JOIN departments d  ON u.department_id   = d.department_id
       LEFT JOIN shifts sh ON sc.shift_id       = sh.shift_id
       WHERE sc.scheduled_date BETWEEN $1 AND $2
         AND u.active = true
       ORDER BY d.name, u.name, sc.scheduled_date`,
      [start, end]
    );
    return res.json({ success: true, schedules: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/admin/schedule', async (req, res) => {
  const { user_id, scheduled_date, start_time, end_time, shift_id, notes } = req.body;
  if (!user_id || !scheduled_date) {
    return res.status(400).json({ success: false, message: 'user_id and scheduled_date required' });
  }
  if (!shift_id && (!start_time || !end_time)) {
    return res.status(400).json({ success: false, message: 'Either shift_id or start_time + end_time required' });
  }
  try {
    const { rows: dup } = await pool.query(
      'SELECT schedule_id FROM schedules WHERE user_id = $1 AND scheduled_date = $2',
      [user_id, scheduled_date]
    );
    if (dup.length) {
      return res.status(409).json({ success: false, message: 'Employee already has a shift on this date' });
    }
    const { rows } = await pool.query(
      `INSERT INTO schedules (user_id, shift_id, custom_start_time, custom_end_time, scheduled_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING schedule_id`,
      [user_id, shift_id || null, shift_id ? null : start_time, shift_id ? null : end_time, scheduled_date, notes || null]
    );
    return res.json({ success: true, schedule_id: rows[0].schedule_id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.put('/api/admin/schedule/:id', async (req, res) => {
  const { user_id, scheduled_date, start_time, end_time, shift_id, notes } = req.body;
  if (!user_id || !scheduled_date || (!shift_id && (!start_time || !end_time))) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE schedules
       SET user_id           = $1,
           scheduled_date    = $2,
           shift_id          = $3,
           custom_start_time = $4,
           custom_end_time   = $5,
           notes             = $6
       WHERE schedule_id = $7
       RETURNING schedule_id`,
      [user_id, scheduled_date, shift_id || null, shift_id ? null : start_time, shift_id ? null : end_time, notes || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Schedule not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.delete('/api/admin/schedule/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM schedules WHERE schedule_id = $1',
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Schedule not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Sprint 14.1 / 14.3: free-form text → structured start/end-time
// parser. Recognises the GM's common shorthands ("3p-11p", "11p-7a",
// "9a-5p", "9-5") and Sprint-14.3 split shifts
// ("9-12 / 4-8" → two segments). Free-form notes like "OFF", "BRK",
// "Deep clea" don't match and return null. Pure function.
//
// Return shape:
//   null  → unparseable (no valid range found)
//   {
//     parsed_start: 'HH:MM:SS',  // first segment's start
//     parsed_end:   'HH:MM:SS',  // last segment's end
//     parsed_segments: [{start, end}, ...]  // every parsed range
//   }
//
// parsed_start/end are kept around because the calendar overlay's
// bar-position math and most stat-card aggregates only want the
// outer envelope. Multi-segment-aware surfaces (the planned strip,
// the inline ghost bars) read parsed_segments instead.
const parseSingleRange = (s) => {
  // Format: "<h>[:<mm>][a|p|am|pm] [-–to] <h>[:<mm>][a|p|am|pm]"
  const re = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*[-–—to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\b/;
  const m = s.match(re);
  if (!m) return null;
  let [, h1s, mm1s, p1, h2s, mm2s, p2] = m;
  let h1 = parseInt(h1s, 10);
  let h2 = parseInt(h2s, 10);
  const mm1 = mm1s ? parseInt(mm1s, 10) : 0;
  const mm2 = mm2s ? parseInt(mm2s, 10) : 0;
  if (h1 > 23 || h2 > 23 || mm1 > 59 || mm2 > 59) return null;
  const isPm = (p) => p === 'p' || p === 'pm';
  const isAm = (p) => p === 'a' || p === 'am';
  const apply12 = (h, p) => {
    if (isPm(p)) return h === 12 ? 12 : h + 12;
    if (isAm(p)) return h === 12 ? 0  : h;
    return h;
  };
  h1 = apply12(h1, p1);
  h2 = apply12(h2, p2);
  // Heuristic when periods are omitted: "9-5" reads as 9 AM → 5 PM
  // (most hotel shifts cross noon, not midnight). If the explicit
  // start period is PM and end has no period, leave end alone — the
  // caller probably means an overnight (e.g., "11p-7" → 11 PM-7 AM).
  if (!p1 && !p2 && h2 < h1 && h2 < 12) h2 += 12;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    start: `${pad(h1)}:${pad(mm1)}:00`,
    end:   `${pad(h2)}:${pad(mm2)}:00`,
  };
};

const parseShiftTimes = (text) => {
  if (!text || typeof text !== 'string') return null;
  const s = text.trim().toLowerCase();
  if (s.length < 3) return null;
  // Sprint 14.3: split on inter-segment separators before trying the
  // single-range parser on each piece. "/" used to live inside the
  // single-range regex (treated as "to"), but the GM's split-shift
  // syntax "9-12 / 4-8" wants "/" as a segment delimiter — and the
  // unlikely "9/5" can still parse via the dash on its way through
  // the lone "9" piece's eventual rejection + fallback below.
  const SEP = /\s*(?:\/|,|\+|&|\sand\s)\s*/i;
  const pieces = s.split(SEP).map(p => p.trim()).filter(Boolean);
  const segments = [];
  for (const p of pieces) {
    const r = parseSingleRange(p);
    if (r) segments.push(r);
  }
  if (segments.length === 0) {
    // Fall back to whole-string parse in case the separator split
    // hurt us (e.g. an exotic punctuation pattern inside one range).
    const r = parseSingleRange(s);
    if (!r) return null;
    segments.push(r);
  }
  return {
    parsed_start:    segments[0].start,
    parsed_end:      segments[segments.length - 1].end,
    parsed_segments: segments,
  };
};

// ── Shift Sheet (Sprint 14) ──────────────────────────────────────────────────
//
// Excel-style weekly planning grid. One row per (week_start, user_id,
// day_of_week). Stores the GM's raw text per cell. Sprint 14 ships
// draft-only CRUD; the publish-to-calendar workflow + parsed time
// derivation lands in 14.x along with the calendar overlay.

// GET /api/admin/sheet/week?week_start=YYYY-MM-DD
// Returns all cells for that Monday-anchored week with user/dept
// joins for the grid's row grouping.
app.get('/api/admin/sheet/week', requireAuth, requireRole('admin'), async (req, res) => {
  const { week_start } = req.query;
  if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return res.status(400).json({ success: false, message: 'week_start required (YYYY-MM-DD)' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT c.cell_id, c.week_start::text, c.user_id, c.day_of_week,
              c.display_text, c.parsed_start::text, c.parsed_end::text,
              c.parsed_segments, c.notes,
              c.is_published, c.highlight, c.updated_at,
              u.name AS user_name, u.department_id, d.name AS department_name
       FROM schedule_sheet_cells c
       JOIN users u        ON c.user_id = u.user_id
       LEFT JOIN departments d ON u.department_id = d.department_id
       WHERE c.week_start = $1::date
       ORDER BY d.name NULLS LAST, u.name, c.day_of_week`,
      [week_start]
    );
    return res.json({ success: true, week_start, cells: rows });
  } catch (err) {
    console.error('[sheet/week]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// Sprint 14.2: published-cells overlay for the calendar.
// GET /api/admin/sheet/published?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns one row per published cell intersecting [from, to], with
// the cell's *actual* scheduled date computed from week_start +
// day_of_week. parsed_start/parsed_end are returned as 'HH:MM'
// strings (or null when the cell text was unparseable). The
// calendar uses these as a "planned" overlay alongside the
// existing clock-entry visualization.
app.get('/api/admin/sheet/published', requireAuth, requireRole('admin'), async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ success: false, message: 'from + to required (YYYY-MM-DD)' });
  }
  try {
    // day_of_week column is 0..6 with 0 = Monday (matches the sheet's
    // Mon-first column layout). Add it to week_start to get the
    // calendar date the cell represents.
    const { rows } = await pool.query(
      `SELECT c.cell_id,
              c.week_start::text,
              c.user_id,
              c.day_of_week,
              c.display_text,
              c.parsed_start::text,
              c.parsed_end::text,
              c.parsed_segments,
              c.notes,
              c.is_published,
              c.highlight,
              (c.week_start + (c.day_of_week || ' day')::interval)::date::text AS scheduled_date,
              u.name AS user_name,
              u.department_id,
              d.name AS department_name
         FROM schedule_sheet_cells c
         JOIN users u            ON c.user_id = u.user_id
         LEFT JOIN departments d ON u.department_id = d.department_id
        WHERE c.is_published = TRUE
          AND (c.week_start + (c.day_of_week || ' day')::interval)::date BETWEEN $1::date AND $2::date
        ORDER BY scheduled_date, d.name NULLS LAST, u.name`,
      [from, to]
    );
    return res.json({ success: true, planned: rows });
  } catch (err) {
    console.error('[sheet/published]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// PUT /api/admin/sheet/cell
// Upsert one cell. Body: { week_start, user_id, day_of_week, display_text, highlight?, notes? }
// Empty display_text deletes the cell (so backspacing-to-blank
// clears the cell instead of leaving a phantom row).
app.put('/api/admin/sheet/cell', requireAuth, requireRole('admin'), async (req, res) => {
  const { week_start, user_id, day_of_week, display_text, highlight, notes } = req.body || {};
  if (!week_start || !user_id || day_of_week === undefined ||
      !/^\d{4}-\d{2}-\d{2}$/.test(week_start) ||
      !(Number.isInteger(day_of_week) && day_of_week >= 0 && day_of_week <= 6)) {
    return res.status(400).json({ success: false, message: 'week_start, user_id, day_of_week (0-6) required' });
  }
  try {
    // Verify the user_id is an existing active employee — strict
    // typeahead means we never get a string Jun that doesn't map
    // to a real users row, but defensively check anyway.
    const { rows: u } = await pool.query(
      'SELECT user_id FROM users WHERE user_id = $1 AND deleted_at IS NULL',
      [user_id]
    );
    if (u.length === 0) {
      return res.status(404).json({ success: false, message: 'user_id not found' });
    }
    const text = String(display_text || '').trim();
    if (!text) {
      // Blank cell → delete the row if present.
      await pool.query(
        `DELETE FROM schedule_sheet_cells
         WHERE week_start = $1::date AND user_id = $2 AND day_of_week = $3`,
        [week_start, user_id, day_of_week]
      );
      return res.json({ success: true, cell: null });
    }
    // Sprint 14.1 / 14.3: derive structured times on every write.
    // parsed_start/end stay = outer envelope (first segment start,
    // last segment end); parsed_segments stores the full array for
    // split-shift consumers.
    const parsed = parseShiftTimes(text) || {
      parsed_start:    null,
      parsed_end:      null,
      parsed_segments: null,
    };
    const segmentsJson = parsed.parsed_segments
      ? JSON.stringify(parsed.parsed_segments)
      : null;
    // Sprint 15.3: notes is opt-in. `null` clears any existing
    // note; `undefined` (key missing from body) preserves it via
    // the COALESCE in the conflict branch.
    const notesParam = (notes === undefined) ? null : (notes === null ? null : String(notes));
    const notesProvided = (notes !== undefined);
    const { rows } = await pool.query(
      `INSERT INTO schedule_sheet_cells
         (week_start, user_id, day_of_week, display_text,
          parsed_start, parsed_end, parsed_segments, highlight, notes, updated_at)
       VALUES ($1::date, $2, $3, $4, $5::time, $6::time,
               $7::jsonb, COALESCE($8, FALSE), $9, NOW())
       ON CONFLICT (week_start, user_id, day_of_week) DO UPDATE
         SET display_text    = EXCLUDED.display_text,
             parsed_start    = EXCLUDED.parsed_start,
             parsed_end      = EXCLUDED.parsed_end,
             parsed_segments = EXCLUDED.parsed_segments,
             highlight       = COALESCE($8, schedule_sheet_cells.highlight),
             notes           = CASE WHEN $10::boolean THEN $9 ELSE schedule_sheet_cells.notes END,
             updated_at      = NOW()
       RETURNING cell_id, week_start::text, user_id, day_of_week,
                 display_text, parsed_start::text, parsed_end::text,
                 parsed_segments, notes,
                 is_published, highlight, updated_at`,
      [week_start, user_id, day_of_week, text,
       parsed.parsed_start, parsed.parsed_end, segmentsJson, highlight, notesParam, notesProvided]
    );
    return res.json({ success: true, cell: rows[0] });
  } catch (err) {
    console.error('[sheet/cell PUT]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// Sprint 14.1: bulk publish / unpublish. Body accepts either a
// list of cell_ids (most precise) or a (week_start, user_ids?)
// shape that scopes by row/week. Returns the rows that changed.
const setPublishedFlag = async (req, res, isPublished) => {
  const { cell_ids, week_start, user_ids } = req.body || {};
  if (Array.isArray(cell_ids) && cell_ids.length > 0) {
    try {
      const { rows } = await pool.query(
        `UPDATE schedule_sheet_cells
           SET is_published      = $1,
               last_published_at = CASE WHEN $1 THEN NOW() ELSE last_published_at END,
               updated_at        = NOW()
         WHERE cell_id = ANY($2::uuid[])
         RETURNING cell_id, week_start::text, user_id, day_of_week,
                   display_text, parsed_start::text, parsed_end::text,
                   parsed_segments, notes,
                   is_published, highlight, updated_at`,
        [isPublished, cell_ids]
      );
      return res.json({ success: true, cells: rows });
    } catch (err) {
      console.error('[sheet/publish ids]', err);
      return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
  }
  if (week_start && /^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    try {
      const params = [isPublished, week_start];
      let extra = '';
      if (Array.isArray(user_ids) && user_ids.length > 0) {
        params.push(user_ids);
        extra = ` AND user_id = ANY($${params.length}::uuid[])`;
      }
      const { rows } = await pool.query(
        `UPDATE schedule_sheet_cells
           SET is_published      = $1,
               last_published_at = CASE WHEN $1 THEN NOW() ELSE last_published_at END,
               updated_at        = NOW()
         WHERE week_start = $2::date${extra}
         RETURNING cell_id, week_start::text, user_id, day_of_week,
                   display_text, parsed_start::text, parsed_end::text,
                   parsed_segments, notes,
                   is_published, highlight, updated_at`,
        params
      );
      return res.json({ success: true, cells: rows });
    } catch (err) {
      console.error('[sheet/publish week]', err);
      return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
  }
  return res.status(400).json({ success: false, message: 'cell_ids[] or week_start required' });
};

app.post('/api/admin/sheet/publish',   requireAuth, requireRole('admin'), (req, res) => setPublishedFlag(req, res, true));
app.post('/api/admin/sheet/unpublish', requireAuth, requireRole('admin'), (req, res) => setPublishedFlag(req, res, false));

// ── Sprint 15.4: history-derived coverage algorithm ─────────────────────────
//
// For each (department_id, day_of_week), compute the average hours
// per day worked from `time_entries` over the last N weeks (default
// 8, set via the `coverage_history_weeks` app setting). The
// algorithm is *intelligent*:
//   - < 2 weeks of data → return the mean of whatever is available
//     with dataset_warning = 'low_sample'
//   - ≥ 3 weeks but the most recent 2 deviate from earlier weeks by
//     > 25% → trim to just the recent 2 and flag
//     dataset_warning = 'regime_change' (assume scheduling pattern
//     changed and the baseline should adapt)
//   - Otherwise → mean of all weeks, no warning
//
// All bucketing respects the caller's local TZ via tz_offset_minutes
// (matches the pattern used by /me/hours and /admin/entries).
const computeCoverageBaseline = async (anchorWeekStart, weeks, tzOffsetMinutes) => {
  const { rows } = await pool.query(
    `WITH local_entries AS (
       SELECT
         u.department_id,
         (te.clock_in_time - (INTERVAL '1 minute' * $3::int))::date AS local_in_date,
         EXTRACT(ISODOW FROM (te.clock_in_time - INTERVAL '1 minute' * $3::int))::int - 1 AS day_of_week,
         EXTRACT(EPOCH FROM (te.clock_out_time - te.clock_in_time)) / 3600.0 AS hours
       FROM time_entries te
       JOIN users u ON te.user_id = u.user_id
       WHERE te.clock_in_time   IS NOT NULL
         AND te.clock_out_time  IS NOT NULL
         AND te.clock_in_time >= ($1::date - (INTERVAL '7 days' * $2::int))::timestamptz
         AND te.clock_in_time <  $1::date::timestamptz
         AND u.deleted_at      IS NULL
         AND u.department_id   IS NOT NULL
     )
     SELECT
       department_id,
       day_of_week,
       (local_in_date - ((EXTRACT(ISODOW FROM local_in_date)::int - 1) * INTERVAL '1 day'))::date::text AS week_start,
       SUM(hours)::float8 AS hours
     FROM local_entries
     GROUP BY department_id, day_of_week, week_start
     ORDER BY department_id, day_of_week, week_start DESC`,
    [anchorWeekStart, weeks, tzOffsetMinutes]
  );

  // dept_id|dow → [{week_start, hours}] sorted by week_start DESC.
  const byDeptDow = new Map();
  for (const r of rows) {
    const key = `${r.department_id}|${r.day_of_week}`;
    if (!byDeptDow.has(key)) byDeptDow.set(key, []);
    byDeptDow.get(key).push({ week_start: r.week_start, hours: r.hours });
  }

  // Apply intelligent trimming per (dept × DOW).
  const baseline = new Map();
  for (const [key, weekly] of byDeptDow) {
    const sorted = weekly; // already DESC
    let trimmed = sorted;
    let warning = null;
    if (sorted.length === 0) continue;
    if (sorted.length < 2) {
      warning = 'low_sample';
    } else if (sorted.length >= 3) {
      const recent2 = sorted.slice(0, 2);
      const earlier = sorted.slice(2);
      const recentAvg  = recent2.reduce((s, w) => s + w.hours, 0) / recent2.length;
      const earlierAvg = earlier.reduce((s, w) => s + w.hours, 0) / earlier.length;
      const denom = Math.max(earlierAvg, 0.001);
      const deviation = Math.abs(recentAvg - earlierAvg) / denom;
      if (deviation > 0.25) {
        trimmed = recent2;
        warning = 'regime_change';
      }
    }
    const targetHours = trimmed.reduce((s, w) => s + w.hours, 0) / trimmed.length;
    baseline.set(key, {
      target_hours: targetHours,
      warning,
      sample_size: weekly.length,
      used_sample: trimmed.length,
    });
  }
  return baseline;
};

// Helper: minutes between two HH:MM:SS strings, with overnight wrap.
const minutesBetween = (startStr, endStr) => {
  const [h1, m1] = startStr.split(':').map(Number);
  const [h2, m2] = endStr.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return mins;
};

// Helper: detect self-overlap inside a multi-segment cell. Returns
// true if any two segments inside the cell overlap. Treats overnight
// wraps as fixed [start, start+duration) intervals.
const cellHasSelfOverlap = (segments) => {
  if (!Array.isArray(segments) || segments.length < 2) return false;
  const intervals = segments.map(s => {
    const [h1, m1] = String(s.start).split(':').map(Number);
    const [h2, m2] = String(s.end).split(':').map(Number);
    const start = h1 * 60 + m1;
    let end = h2 * 60 + m2;
    if (end < start) end += 24 * 60;
    return { start, end };
  }).sort((a, b) => a.start - b.start);
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].start < intervals[i - 1].end) return true;
  }
  return false;
};

// GET /api/admin/sheet/week-overview?week_start=YYYY-MM-DD&tz_offset_minutes=
// Right-rail aggregates for the Shift Sheet.
app.get('/api/admin/sheet/week-overview', requireAuth, requireRole('admin'), async (req, res) => {
  const { week_start } = req.query;
  if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return res.status(400).json({ success: false, message: 'week_start required (YYYY-MM-DD)' });
  }
  const tzOffsetMinutes = parseInt(req.query.tz_offset_minutes, 10);
  const tzOffset = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0;

  try {
    // 1. Pull coverage_history_weeks setting (default 8).
    const { rows: settingRows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'coverage_history_weeks'`
    );
    const setN = settingRows.length > 0 ? parseInt(settingRows[0].value, 10) : NaN;
    const weeks = Number.isInteger(setN) && setN >= 2 && setN <= 52 ? setN : 8;

    // 2. Compute the history baseline.
    const baseline = await computeCoverageBaseline(week_start, weeks, tzOffset);

    // 3. Pull current week's cells.
    const { rows: cells } = await pool.query(
      `SELECT c.cell_id, c.user_id, c.day_of_week, c.display_text,
              c.parsed_start::text, c.parsed_end::text, c.parsed_segments,
              c.is_published, c.last_published_at, c.updated_at,
              u.department_id, u.name AS user_name,
              d.name AS department_name
         FROM schedule_sheet_cells c
         JOIN users u ON c.user_id = u.user_id
         LEFT JOIN departments d ON u.department_id = d.department_id
        WHERE c.week_start = $1::date`,
      [week_start]
    );

    // 4. Planned hours per (dept × DOW) from published cells.
    const plannedByDeptDow = new Map();
    for (const cell of cells) {
      if (!cell.is_published || !cell.department_id) continue;
      const segs = Array.isArray(cell.parsed_segments) && cell.parsed_segments.length > 0
        ? cell.parsed_segments
        : (cell.parsed_start && cell.parsed_end
            ? [{ start: cell.parsed_start, end: cell.parsed_end }]
            : []);
      let hours = 0;
      for (const s of segs) hours += minutesBetween(s.start, s.end) / 60;
      const key = `${cell.department_id}|${cell.day_of_week}`;
      plannedByDeptDow.set(key, (plannedByDeptDow.get(key) || 0) + hours);
    }

    // 5. Build dept_coverage list + overall coverage_score.
    const { rows: depts } = await pool.query(
      `SELECT department_id, name, color FROM departments ORDER BY name`
    );
    const dept_coverage = [];
    let totalPlanned = 0;
    let totalTarget  = 0;
    let anyLowSample    = false;
    let anyRegimeChange = false;
    for (const d of depts) {
      let dPlanned = 0;
      let dTarget  = 0;
      let dHasBaseline = false;
      for (let dow = 0; dow < 7; dow++) {
        const key = `${d.department_id}|${dow}`;
        const planned = plannedByDeptDow.get(key) || 0;
        const base = baseline.get(key);
        dPlanned += planned;
        if (base && base.target_hours > 0) {
          dTarget += base.target_hours;
          dHasBaseline = true;
          if (base.warning === 'low_sample')    anyLowSample    = true;
          if (base.warning === 'regime_change') anyRegimeChange = true;
        }
      }
      const pct = dTarget > 0 ? Math.round((dPlanned / dTarget) * 100) : null;
      dept_coverage.push({
        department_id: d.department_id,
        name:          d.name,
        color:         d.color,
        planned_hours: Math.round(dPlanned * 10) / 10,
        target_hours:  Math.round(dTarget  * 10) / 10,
        pct,
        has_baseline:  dHasBaseline,
      });
      totalPlanned += dPlanned;
      totalTarget  += dTarget;
    }
    const coverage_score = totalTarget > 0 ? Math.round((totalPlanned / totalTarget) * 100) : null;

    // 6. Open shifts — (dept × DOW) slots the baseline says need
    // coverage but no published cell does. "no one is filling the
    // time in" per GM Sprint-15.4 round-2 decision.
    const open_shifts = [];
    for (const d of depts) {
      for (let dow = 0; dow < 7; dow++) {
        const key = `${d.department_id}|${dow}`;
        const base = baseline.get(key);
        if (!base || base.target_hours <= 0) continue;
        const planned = plannedByDeptDow.get(key) || 0;
        if (planned === 0) {
          open_shifts.push({
            department_id:   d.department_id,
            department_name: d.name,
            day_of_week:     dow,
            target_hours:    Math.round(base.target_hours * 10) / 10,
          });
        }
      }
    }

    // 7. Conflicts — for v1 we surface multi-segment cells whose
    // own segments overlap each other (a GM-typo guard: "9-12 /
    // 11-3"). The unique (week_start, user_id, day_of_week)
    // constraint makes cross-cell same-user same-DOW overlap
    // structurally impossible, so other conflict rules are
    // deferred to a future sprint when the schema supports them.
    const conflicts = [];
    for (const cell of cells) {
      if (!cell.is_published) continue;
      if (cellHasSelfOverlap(cell.parsed_segments)) {
        conflicts.push({
          cell_id:         cell.cell_id,
          user_id:         cell.user_id,
          user_name:       cell.user_name,
          day_of_week:     cell.day_of_week,
          display_text:    cell.display_text,
          department_name: cell.department_name,
          kind:            'self_overlap',
        });
      }
    }

    // 8. Unpublished changes — cells whose latest edit happened
    // after the last publish. Brand-new cells (last_published_at
    // NULL) count too; cells freshly published count zero because
    // the publish handler sets last_published_at = NOW() and
    // updated_at = NOW() in the same UPDATE.
    const unpublished_changes_count = cells.filter(c => {
      if (!c.last_published_at) return true;
      return new Date(c.updated_at).getTime() > new Date(c.last_published_at).getTime();
    }).length;

    return res.json({
      success: true,
      week_start,
      coverage_score,
      dept_coverage,
      open_shifts,
      conflicts,
      unpublished_changes_count,
      dataset_warning: anyRegimeChange ? 'regime_change' : (anyLowSample ? 'low_sample' : null),
      meta: { history_weeks: weeks },
    });
  } catch (err) {
    console.error('[week-overview]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// ── Sprint 15.5: Copy Previous Week ──────────────────────────────────────────
// POST /api/admin/sheet/copy-from-previous
// Body: { week_start, overwrite?: boolean }
// Bulk-inserts cells from (week_start - 7 days) into week_start as
// fresh drafts (is_published = FALSE). By default fills empty slots
// only; overwrite=true also stomps existing target cells.
app.post('/api/admin/sheet/copy-from-previous', requireAuth, requireRole('admin'), async (req, res) => {
  const { week_start, overwrite } = req.body || {};
  if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return res.status(400).json({ success: false, message: 'week_start required (YYYY-MM-DD)' });
  }
  const shouldOverwrite = overwrite === true;
  try {
    const { rows } = await pool.query(
      `WITH src AS (
         SELECT user_id, day_of_week, display_text,
                parsed_start, parsed_end, parsed_segments, highlight, notes
           FROM schedule_sheet_cells
          WHERE week_start = ($1::date - INTERVAL '7 days')::date
       ),
       ins AS (
         INSERT INTO schedule_sheet_cells
           (week_start, user_id, day_of_week, display_text,
            parsed_start, parsed_end, parsed_segments,
            highlight, notes, is_published, updated_at)
         SELECT $1::date, user_id, day_of_week, display_text,
                parsed_start, parsed_end, parsed_segments,
                highlight, notes, FALSE, NOW()
           FROM src
         ON CONFLICT (week_start, user_id, day_of_week) DO UPDATE
           SET display_text    = CASE WHEN $2::boolean THEN EXCLUDED.display_text    ELSE schedule_sheet_cells.display_text    END,
               parsed_start    = CASE WHEN $2::boolean THEN EXCLUDED.parsed_start    ELSE schedule_sheet_cells.parsed_start    END,
               parsed_end      = CASE WHEN $2::boolean THEN EXCLUDED.parsed_end      ELSE schedule_sheet_cells.parsed_end      END,
               parsed_segments = CASE WHEN $2::boolean THEN EXCLUDED.parsed_segments ELSE schedule_sheet_cells.parsed_segments END,
               highlight       = CASE WHEN $2::boolean THEN EXCLUDED.highlight       ELSE schedule_sheet_cells.highlight       END,
               notes           = CASE WHEN $2::boolean THEN EXCLUDED.notes           ELSE schedule_sheet_cells.notes           END,
               is_published    = CASE WHEN $2::boolean THEN FALSE                    ELSE schedule_sheet_cells.is_published    END,
               updated_at      = CASE WHEN $2::boolean THEN NOW()                    ELSE schedule_sheet_cells.updated_at      END
         RETURNING cell_id
       )
       SELECT COUNT(*)::int AS n FROM ins`,
      [week_start, shouldOverwrite]
    );
    return res.json({ success: true, copied: rows[0]?.n || 0, overwrite: shouldOverwrite });
  } catch (err) {
    console.error('[copy-from-previous]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// ── Sprint 15.5: Auto-Fill ───────────────────────────────────────────────────
// For each (user_id × day_of_week), find the most-recent completed
// clock entry from the last N weeks (the coverage_history_weeks
// setting) and propose it as a shift suggestion. Returns suggestions
// as plain `display_text` strings — the same free-form syntax the
// parser already understands (e.g. "9a-5p").
//
// Preview (no DB writes):
//   POST /api/admin/sheet/auto-fill-preview?tz_offset_minutes=
//   Body: { week_start }
//   Returns: { suggestions: [{ user_id, day_of_week, display_text }] }
//
// Apply (bulk insert):
//   POST /api/admin/sheet/auto-fill-apply
//   Body: { week_start, suggestions: [...], overwrite?: boolean }
//   Returns: { applied: N }
const fmtTimeShort = (timeStr) => {
  // "07:00:00" → "7a"; "15:30:00" → "3:30p"
  const [hStr, mStr] = String(timeStr).split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${period}` : `${h12}${period}`;
};

app.post('/api/admin/sheet/auto-fill-preview', requireAuth, requireRole('admin'), async (req, res) => {
  const { week_start } = req.body || {};
  if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return res.status(400).json({ success: false, message: 'week_start required' });
  }
  const tzOffsetMinutes = parseInt(req.query.tz_offset_minutes, 10);
  const tzOffset = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0;
  try {
    const { rows: settingRows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'coverage_history_weeks'`
    );
    const setN = settingRows.length > 0 ? parseInt(settingRows[0].value, 10) : NaN;
    const weeks = Number.isInteger(setN) && setN >= 2 && setN <= 52 ? setN : 8;

    // Sprint 15.8: smarter algorithm. Pull *every* completed entry
    // in the lookback window, then per (user × DOW):
    //   1. Round each entry's start + end to the nearest 15 min.
    //   2. Tally the rounded (start, end) pairs.
    //   3. Pick the pair with the most occurrences (the *mode*).
    //   4. Ties broken by most recent.
    // This catches "she usually works 9-5 even though last week was
    // a one-off 11-7" — the most-common pattern dominates the
    // suggestion instead of the most-recent anomaly.
    const { rows } = await pool.query(
      `SELECT te.user_id,
              EXTRACT(ISODOW FROM (te.clock_in_time - INTERVAL '1 minute' * $3::int))::int - 1 AS day_of_week,
              (te.clock_in_time  - INTERVAL '1 minute' * $3::int)::time::text AS start_local,
              (te.clock_out_time - INTERVAL '1 minute' * $3::int)::time::text AS end_local,
              te.clock_in_time
         FROM time_entries te
         JOIN users u ON te.user_id = u.user_id
        WHERE te.clock_in_time   IS NOT NULL
          AND te.clock_out_time  IS NOT NULL
          AND te.clock_in_time >= ($1::date - (INTERVAL '7 days' * $2::int))::timestamptz
          AND te.clock_in_time <  $1::date::timestamptz
          AND u.deleted_at IS NULL
        ORDER BY te.user_id, day_of_week, te.clock_in_time DESC`,
      [week_start, weeks, tzOffset]
    );

    // Round HH:MM:SS to the nearest 15 minutes; returns "HH:MM".
    const roundTo15 = (timeStr) => {
      const [h, m] = String(timeStr).split(':').map(Number);
      const total = h * 60 + m;
      const rounded = Math.round(total / 15) * 15;
      const wrap = ((rounded % 1440) + 1440) % 1440;
      const rh = Math.floor(wrap / 60);
      const rm = wrap % 60;
      return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
    };

    // Group: user|dow → Map(pairKey → { count, latest_in })
    const byUserDow = new Map();
    for (const r of rows) {
      const key = `${r.user_id}|${r.day_of_week}`;
      const startR = roundTo15(r.start_local);
      const endR   = roundTo15(r.end_local);
      const pairKey = `${startR}-${endR}`;
      let bucket = byUserDow.get(key);
      if (!bucket) { bucket = new Map(); byUserDow.set(key, bucket); }
      const entry = bucket.get(pairKey);
      if (!entry) {
        bucket.set(pairKey, { count: 1, start: startR, end: endR, latest_in: r.clock_in_time });
      } else {
        entry.count += 1;
        // SQL ORDER BY clock_in_time DESC means the first row we
        // see for a pair is already the most recent — leave it.
      }
    }

    // Pick the winning pair per (user × DOW): highest count, tie
    // broken by latest_in.
    const suggestions = [];
    for (const [key, bucket] of byUserDow) {
      const [user_id, dowStr] = key.split('|');
      let best = null;
      for (const v of bucket.values()) {
        if (!best
          || v.count > best.count
          || (v.count === best.count && v.latest_in > best.latest_in)) {
          best = v;
        }
      }
      if (best) {
        suggestions.push({
          user_id,
          day_of_week:  parseInt(dowStr, 10),
          display_text: `${fmtTimeShort(best.start + ':00')}-${fmtTimeShort(best.end + ':00')}`,
          confidence:   bucket.size === 1 ? 'high' : (best.count >= 3 ? 'high' : 'low'),
        });
      }
    }
    return res.json({ success: true, suggestions, meta: { history_weeks: weeks } });
  } catch (err) {
    console.error('[auto-fill-preview]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

app.post('/api/admin/sheet/auto-fill-apply', requireAuth, requireRole('admin'), async (req, res) => {
  const { week_start, suggestions, overwrite } = req.body || {};
  if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return res.status(400).json({ success: false, message: 'week_start required' });
  }
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return res.json({ success: true, applied: 0 });
  }
  const shouldOverwrite = overwrite === true;
  try {
    let applied = 0;
    for (const s of suggestions) {
      if (!s.user_id || !Number.isInteger(s.day_of_week) || !s.display_text) continue;
      const parsed = parseShiftTimes(s.display_text) || {
        parsed_start: null, parsed_end: null, parsed_segments: null,
      };
      const segmentsJson = parsed.parsed_segments ? JSON.stringify(parsed.parsed_segments) : null;
      const { rowCount } = await pool.query(
        shouldOverwrite
          ? `INSERT INTO schedule_sheet_cells
               (week_start, user_id, day_of_week, display_text,
                parsed_start, parsed_end, parsed_segments, updated_at)
             VALUES ($1::date, $2, $3, $4, $5::time, $6::time, $7::jsonb, NOW())
             ON CONFLICT (week_start, user_id, day_of_week) DO UPDATE
               SET display_text    = EXCLUDED.display_text,
                   parsed_start    = EXCLUDED.parsed_start,
                   parsed_end      = EXCLUDED.parsed_end,
                   parsed_segments = EXCLUDED.parsed_segments,
                   updated_at      = NOW()`
          : `INSERT INTO schedule_sheet_cells
               (week_start, user_id, day_of_week, display_text,
                parsed_start, parsed_end, parsed_segments, updated_at)
             VALUES ($1::date, $2, $3, $4, $5::time, $6::time, $7::jsonb, NOW())
             ON CONFLICT (week_start, user_id, day_of_week) DO NOTHING`,
        [week_start, s.user_id, s.day_of_week, s.display_text,
         parsed.parsed_start, parsed.parsed_end, segmentsJson]
      );
      if (rowCount > 0) applied += 1;
    }
    return res.json({ success: true, applied });
  } catch (err) {
    console.error('[auto-fill-apply]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// PUT /api/admin/sheet/cell/highlight — toggle/set the highlight flag
// on a single cell. Body: { cell_id, highlight: boolean }.
app.put('/api/admin/sheet/cell/highlight', requireAuth, requireRole('admin'), async (req, res) => {
  const { cell_id, highlight } = req.body || {};
  if (!cell_id || typeof highlight !== 'boolean') {
    return res.status(400).json({ success: false, message: 'cell_id + highlight (bool) required' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE schedule_sheet_cells
         SET highlight = $1, updated_at = NOW()
       WHERE cell_id = $2::uuid
       RETURNING cell_id, week_start::text, user_id, day_of_week,
                 display_text, parsed_start::text, parsed_end::text,
                 parsed_segments, notes,
                 is_published, highlight, updated_at`,
      [highlight, cell_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'cell not found' });
    }
    return res.json({ success: true, cell: rows[0] });
  } catch (err) {
    console.error('[sheet/highlight]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// DELETE /api/admin/sheet/cell?week_start=&user_id=&day_of_week=
app.delete('/api/admin/sheet/cell', requireAuth, requireRole('admin'), async (req, res) => {
  const { week_start, user_id, day_of_week } = req.query;
  if (!week_start || !user_id || day_of_week === undefined) {
    return res.status(400).json({ success: false, message: 'week_start, user_id, day_of_week required' });
  }
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM schedule_sheet_cells
       WHERE week_start = $1::date AND user_id = $2 AND day_of_week = $3::int`,
      [week_start, user_id, day_of_week]
    );
    return res.json({ success: true, deleted: rowCount });
  } catch (err) {
    console.error('[sheet/cell DELETE]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// ── Shifts board (employee-facing) ───────────────────────────────────────────

// GET /api/shifts/range?from=YYYY-MM-DD&to=YYYY-MM-DD[&userId=UUID]
// Sprint 10.1: range version of /api/shifts/daily for the staff
// Calendar's week view. Same visibility model — `schedule_visibility`
// = 'all' shows everyone's schedules, 'department' restricts to the
// requester's dept (when userId provided), 'none' returns empty.
app.get('/api/shifts/range', async (req, res) => {
  const { from, to, userId } = req.query;
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ success: false, message: 'from and to required (YYYY-MM-DD)' });
  }
  try {
    const { rows: sv } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'schedule_visibility'"
    );
    const visibility = sv[0]?.value || 'all';

    if (visibility === 'none') {
      return res.json({ success: true, schedules: [], visibility });
    }

    let query = `
      SELECT
        sc.schedule_id,
        sc.user_id,
        sc.scheduled_date::text,
        COALESCE(sc.custom_start_time, sh.start_time)::text AS start_time,
        COALESCE(sc.custom_end_time,   sh.end_time)::text   AS end_time,
        u.name           AS employee_name,
        u.department_id,
        d.name           AS department_name
      FROM schedules sc
      JOIN users u        ON sc.user_id       = u.user_id
      JOIN departments d  ON u.department_id  = d.department_id
      LEFT JOIN shifts sh ON sc.shift_id      = sh.shift_id
      WHERE sc.scheduled_date BETWEEN $1::date AND $2::date AND u.active = true`;
    const params = [from, to];

    if (visibility === 'department' && userId) {
      const { rows: ur } = await pool.query(
        'SELECT department_id FROM users WHERE user_id = $1', [userId]
      );
      if (ur.length && ur[0].department_id) {
        query += ' AND u.department_id = $3';
        params.push(ur[0].department_id);
      }
    }

    query += ' ORDER BY sc.scheduled_date, d.name, start_time';
    const { rows } = await pool.query(query, params);
    return res.json({ success: true, schedules: rows, visibility });
  } catch (err) {
    console.error('[shifts/range]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/shifts/daily', async (req, res) => {
  const { date, userId } = req.query;
  if (!date) return res.status(400).json({ success: false, message: 'date required' });
  try {
    const { rows: sv } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'schedule_visibility'"
    );
    const visibility = sv[0]?.value || 'all';

    if (visibility === 'none') {
      return res.json({ success: true, schedules: [], visibility });
    }

    let query = `
      SELECT
        sc.schedule_id,
        sc.user_id,
        sc.scheduled_date::text,
        COALESCE(sc.custom_start_time, sh.start_time)::text AS start_time,
        COALESCE(sc.custom_end_time,   sh.end_time)::text   AS end_time,
        u.name           AS employee_name,
        u.department_id,
        d.name           AS department_name
      FROM schedules sc
      JOIN users u        ON sc.user_id       = u.user_id
      JOIN departments d  ON u.department_id  = d.department_id
      LEFT JOIN shifts sh ON sc.shift_id      = sh.shift_id
      WHERE sc.scheduled_date = $1 AND u.active = true`;
    const params = [date];

    if (visibility === 'department' && userId) {
      const { rows: ur } = await pool.query(
        'SELECT department_id FROM users WHERE user_id = $1', [userId]
      );
      if (ur.length && ur[0].department_id) {
        query += ' AND u.department_id = $2';
        params.push(ur[0].department_id);
      }
    }

    query += ' ORDER BY d.name, start_time';
    const { rows } = await pool.query(query, params);
    return res.json({ success: true, schedules: rows, visibility });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── App settings ──────────────────────────────────────────────────────────────

// Sprint 8.7: unauthenticated config the login page needs to render
// itself correctly. Limited to UX-only flags — never anything that could
// help an attacker map the system. Add new keys explicitly here, don't
// dump the whole app_settings table.
app.get('/api/public-config', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM app_settings WHERE key IN ('hide_abc_keyboard','enabled_login_methods','staff_login_layout','tenant_logo_dark_strategy')`
    );
    const out = {
      hide_abc_keyboard: false,
      // Sprint 9: default to all four methods enabled if the setting hasn't
      // been written yet. New tenants get the full menu out of the box.
      enabled_login_methods: ['phone', 'username', 'employee_code', 'birthday'],
      // Sprint 9.1.3: default to 'hardcode' so behavior matches prior
      // sprints. Admin can opt into 'fluid' for clamp()-based continuous
      // sizing if breakpoint behavior doesn't fit their hardware.
      staff_login_layout: 'hardcode',
      // Sprint 9.2: default to white-card backdrop — safest for colored
      // tenant logos. Dev can switch to invert or force-light per tenant
      // in the Dev Panel.
      tenant_logo_dark_strategy: 'card',
    };
    rows.forEach(r => {
      if (r.key === 'hide_abc_keyboard') out.hide_abc_keyboard = r.value === 'true';
      if (r.key === 'enabled_login_methods') {
        out.enabled_login_methods = String(r.value || '').split(',').map(s => s.trim()).filter(Boolean);
      }
      if (r.key === 'staff_login_layout' && (r.value === 'fluid' || r.value === 'hardcode')) {
        out.staff_login_layout = r.value;
      }
      if (r.key === 'tenant_logo_dark_strategy' && ['card', 'invert', 'force-light'].includes(r.value)) {
        out.tenant_logo_dark_strategy = r.value;
      }
    });
    return res.json({ success: true, config: out });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/admin/settings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM app_settings ORDER BY key');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return res.json({ success: true, settings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Generic settings update — accepts any of the known keys with validation.
// Body shape is { key1: value1, key2: value2, ... } — single-key or batch
// updates both work.
app.put('/api/admin/settings', async (req, res) => {
  const ALLOWED = {
    schedule_visibility:        v => ['all', 'department', 'none'].includes(v),
    overtime_threshold_hours:   v => /^\d+(\.\d+)?$/.test(String(v)) && parseFloat(v) > 0 && parseFloat(v) <= 168,
    on_time_tolerance_minutes:  v => /^\d+$/.test(String(v)) && parseInt(v, 10) >= 0 && parseInt(v, 10) <= 240,
    compare_baseline:           v => ['self', 'department', 'all'].includes(v),
    // Sprint 8.6: seconds before auto sign-out after a successful clock-in
    // or clock-out. 0 disables the feature; max 60 to avoid stale-session
    // territory. Read by /api/me/hours so staff Home page can pick it up
    // without an admin endpoint.
    auto_signout_seconds:       v => /^\d+$/.test(String(v)) && parseInt(v, 10) >= 0 && parseInt(v, 10) <= 60,
    // Sprint 9.1: replaces Sprint 8.7's block_system_keyboard (which
    // browsers ignored via password autofill). When 'true', the on-screen
    // ABC switcher + letters keyboard are hidden on the staff login page —
    // numeric keypad fills the available area with bigger buttons. The
    // system keyboard is unaffected (we can't reliably block it); admins
    // who want to fully ditch letters should *also* disable the username
    // login method in the staff_login_methods toggles so a system keyboard
    // can't reach a useful login.
    hide_abc_keyboard:          v => v === 'true' || v === 'false',
    // Sprint 9.1.3: choose how the staff login page handles sizing.
    //   'hardcode' — fixed breakpoints (current behavior), buttons step
    //                at each width threshold.
    //   'fluid'    — continuous via clamp() keyed off vh/vw, scales
    //                smoothly with both viewport dimensions at once.
    // 'hardcode' is default for predictability; admins on big monitors
    // or with weird aspect ratios can opt into 'fluid' from settings.
    staff_login_layout:         v => v === 'fluid' || v === 'hardcode',
    // Sprint 9.2: how tenant logos render in dark mode when the tenant
    // only provides a light-mode asset (e.g. a colored PNG).
    //   'card'        — wrap the logo in a white rounded backdrop (default)
    //   'invert'      — apply CSS filter: invert(1) hue-rotate(180deg)
    //                   (only safe for monochrome logos)
    //   'force-light' — keep the page in light theme for this tenant
    // Set via the Dev Panel; reachable from the bare /login/dev URL.
    tenant_logo_dark_strategy:  v => ['card', 'invert', 'force-light'].includes(v),
    // Sprint 9.4: day of the week (0=Sun, 6=Sat) on which biweekly
    // pay periods reset. Used by the payroll-CSV/XLSX export to align
    // the "biweekly" range to the most recently completed 14-day pay
    // period, and by the OT computation to define the 7-day workweek
    // boundary.
    pay_period_start_day:       v => /^[0-6]$/.test(String(v)),
    // Sprint 9: which staff login methods are enabled for this tenant.
    // CSV of {phone,username,employee_code,birthday}. At least one must be
    // present. Used at login time to gate the identifier classifier and at
    // the staff login UI to hide irrelevant keypads.
    enabled_login_methods:      v => {
      const allowed = ['phone', 'username', 'employee_code', 'birthday'];
      const parts = String(v || '').split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length === 0) return false;
      return parts.every(p => allowed.includes(p));
    },
    // Sprint 14.1: hidden by default. When 'true', the Calendar
    // surface re-exposes a small "Legacy panel" button next to the
    // primary "Assign" pill so the admin can fall back to the
    // pre-Sprint-14 AssignPanel + AssignModal flow if the new
    // sheet doesn't fit their workflow.
    enable_legacy_assign_panel: v => v === 'true' || v === 'false',
    // Sprint 15.0: weeks of historical data the coverage algorithm
    // (Sprint 15.4) considers when computing the per-(dept × DOW)
    // target hours. Stored as a string for app_settings compat;
    // validated as an integer in [2, 52]. Default 8 — set by the
    // client when missing rather than seeded here.
    coverage_history_weeks: v => {
      if (typeof v !== 'string') return false;
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n >= 2 && n <= 52 && String(n) === v.trim();
    },
    // Sprint 16.1: idle-logout timer for the staff focused-action
    // screen. After login, if the staff member doesn't tap a clock
    // action within N seconds, they're auto-logged-out so the next
    // staff at a shared kiosk doesn't inherit their session.
    // Stored as a string per app_settings convention; validated as
    // an integer in [5, 120]. Default 15.
    staff_idle_logout_seconds: v => {
      if (typeof v !== 'string') return false;
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n >= 5 && n <= 120 && String(n) === v.trim();
    },
  };
  const updates = req.body || {};
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No settings provided' });
  }
  // Sprint 9.1.1: be lenient on *unknown* keys — silently skip them rather
  // than bailing out of the whole batch. Without this, a client/server
  // version mismatch (e.g. browser still shipping the old
  // `block_system_keyboard` key from a stale build) makes every save fail
  // with "Unknown setting" and the user sees "settings won't save." Still
  // strict on known keys with invalid values — those reject the batch as
  // before because that signals a real bug or attack, not version drift.
  const writes = [];
  for (const [k, v] of Object.entries(updates)) {
    if (!(k in ALLOWED)) {
      console.warn(`[settings PUT] ignoring unknown key: ${k}`);
      continue;
    }
    if (!ALLOWED[k](v)) return res.status(400).json({ success: false, message: `Invalid value for ${k}` });
    writes.push([k, v]);
  }
  if (writes.length === 0) {
    return res.status(400).json({ success: false, message: 'No recognized settings in request' });
  }
  try {
    for (const [k, v] of writes) {
      await pool.query(
        `INSERT INTO app_settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [k, String(v)]
      );
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── HANDOFF NOTES (Sprint 10) ─────────────────────────────────────────────────
//
// One endpoint family backs the Calendar handoffs drawer's three
// views (per-shift threads, general department/all-staff handoffs,
// cross-day carryovers — 10.1+ surfaces the third). The data model is
// in database/migrations/011_handoff_notes.sql; this is the read/
// write layer over it.
//
// Visibility model: all authed users can read all notes (Snoqualmie
// is single-tenant; multi-tenant scoping would happen at the
// `tenant_id` column or DB level if we add it). Mutations are
// author-or-admin gated. Pin / resolve / read state arrive in 10.2;
// 10 only exposes body + carry_until on PATCH.

// GET /api/handoff-notes?from=YYYY-MM-DD&to=YYYY-MM-DD
//   [&scope=shift|department|all] [&schedule_id=UUID] [&department_id=INT]
//   [&carry=true]
//
// Returns notes whose for_date falls in [from, to] OR whose
// carry_until extends into that range. is_read is computed per
// requester via LEFT JOIN handoff_note_reads. Sorted with pinned
// notes first (NULLs last), then newest. Sprint 10.1 added the
// `carry=true` filter — restricts results to notes that are
// actively carrying (carry_until >= today). Drives the Cross-day
// tab in the HandoffsDrawer.
app.get('/api/handoff-notes', requireAuth, async (req, res) => {
  const { from, to, scope, schedule_id, department_id, carry } = req.query;
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ success: false, message: 'from and to required (YYYY-MM-DD)' });
  }

  // Visibility window: for_date in [from, to] OR (carrying AND
  // carry_until reaches into [from, to]). The second clause is what
  // makes 10.1's cross-day view work later — same query, no new
  // endpoint.
  // Sprint 10.4: admin tokens carry the username in req.auth.sub
  // (not a UUID — admin creds live in server/config/admins.json),
  // so we can't bind `sub` directly to a UUID-typed read-state
  // join. For admin: skip the read-state join (admin doesn't track
  // unread state) and emit is_read=TRUE for every row instead.
  // For staff: bind their UUID and compute is_read normally.
  const isAdminReader = req.auth.type === 'admin';
  const conditions = [
    `( (n.for_date BETWEEN $1::date AND $2::date)
      OR (n.carry_until IS NOT NULL AND n.carry_until >= $1::date AND n.for_date <= $2::date) )`,
  ];
  const params = [from, to];
  if (!isAdminReader) params.push(req.auth.sub);

  if (scope) {
    if (!['shift', 'department', 'all'].includes(scope)) {
      return res.status(400).json({ success: false, message: 'scope must be shift|department|all' });
    }
    params.push(scope);
    conditions.push(`n.scope = $${params.length}`);
  }
  if (schedule_id) {
    params.push(schedule_id);
    conditions.push(`n.schedule_id = $${params.length}::uuid`);
  }
  if (department_id) {
    params.push(parseInt(department_id, 10));
    conditions.push(`n.department_id = $${params.length}::int`);
  }
  if (carry === 'true') {
    // Sprint 10.1: "actively carrying right now." Note must have a
    // carry_until that hasn't passed yet. for_date can be earlier
    // than today (the note originated earlier and is rolling forward).
    conditions.push(`n.carry_until IS NOT NULL AND n.carry_until >= CURRENT_DATE`);
  }

  // Sprint 10.4: LEFT JOIN users (not JOIN) — admin-authored notes
  // have author_user_id IS NULL; the LEFT JOIN preserves the row
  // and we fall back to `author_label` (and a final "Unknown"
  // safety net) for the displayed name. The read-state join is
  // skipped for admin and `is_read` short-circuits to TRUE.
  const readJoinSql = isAdminReader
    ? ''
    : `LEFT JOIN handoff_note_reads r ON r.note_id = n.note_id AND r.user_id = $3::uuid`;
  const isReadExpr = isAdminReader
    ? `TRUE AS is_read`
    : `(r.note_id IS NOT NULL) AS is_read`;

  try {
    const { rows } = await pool.query(
      `SELECT
         n.note_id, n.body, n.scope,
         n.schedule_id, n.department_id,
         -- Sprint 11.1: explicit ::text casts so the client gets
         -- YYYY-MM-DD strings, not the JS-Date round-trip that
         -- bakes a timezone into the JSON (e.g. 2026-05-20T07:00:00Z).
         -- Without this, n.for_date === forDate comparisons in the
         -- drawer general/all filters silently miss every row.
         -- (Note: no backticks in this comment — they would close the
         -- enclosing JS template literal early. Fixed in Sprint 11.1.1.)
         n.for_date::text   AS for_date,
         n.carry_until::text AS carry_until,
         n.pinned_at, n.resolved_at,
         n.created_at, n.updated_at,
         n.author_user_id,
         COALESCE(u.name, n.author_label, 'Unknown') AS author_name,
         d.name AS department_name,
         s.scheduled_date::text  AS schedule_date,
         sh.start_time     AS shift_start,
         sh.end_time       AS shift_end,
         su.name           AS schedule_user_name,
         ${isReadExpr}
       FROM handoff_notes n
       LEFT JOIN users u ON n.author_user_id = u.user_id
       LEFT JOIN departments d ON n.department_id = d.department_id
       LEFT JOIN schedules s   ON n.schedule_id = s.schedule_id
       LEFT JOIN shifts sh     ON s.shift_id = sh.shift_id
       LEFT JOIN users su      ON s.user_id = su.user_id
       ${readJoinSql}
       WHERE ${conditions.join(' AND ')}
       ORDER BY n.pinned_at DESC NULLS LAST, n.created_at DESC`,
      params
    );
    return res.json({ success: true, notes: rows });
  } catch (err) {
    console.error('[handoff-notes:GET]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// POST /api/handoff-notes
//   body: { body, scope, schedule_id?, department_id?, for_date?, carry_until? }
// For scope='shift', for_date is denormalized from the schedule on
// insert; for the other two scopes it's required from the caller.
app.post('/api/handoff-notes', requireAuth, async (req, res) => {
  const { body, scope, schedule_id, department_id, for_date, carry_until } = req.body || {};

  if (!body || !String(body).trim()) {
    return res.status(400).json({ success: false, message: 'body required' });
  }
  if (!['shift', 'department', 'all'].includes(scope)) {
    return res.status(400).json({ success: false, message: 'scope must be shift|department|all' });
  }

  let resolvedDate = for_date;
  if (scope === 'shift') {
    if (!schedule_id) {
      return res.status(400).json({ success: false, message: 'shift scope requires schedule_id' });
    }
    const { rows: srows } = await pool.query(
      `SELECT scheduled_date FROM schedules WHERE schedule_id = $1`,
      [schedule_id]
    );
    if (!srows.length) {
      return res.status(404).json({ success: false, message: 'schedule not found' });
    }
    // ISO-format the date so the CHECK doesn't get tripped by timezone drift.
    resolvedDate = srows[0].scheduled_date.toISOString().split('T')[0];
  } else if (scope === 'department') {
    if (!department_id) {
      return res.status(400).json({ success: false, message: 'department scope requires department_id' });
    }
    if (!for_date || !/^\d{4}-\d{2}-\d{2}$/.test(for_date)) {
      return res.status(400).json({ success: false, message: 'for_date required (YYYY-MM-DD)' });
    }
  } else { // 'all'
    if (!for_date || !/^\d{4}-\d{2}-\d{2}$/.test(for_date)) {
      return res.status(400).json({ success: false, message: 'for_date required (YYYY-MM-DD)' });
    }
  }

  if (carry_until && !/^\d{4}-\d{2}-\d{2}$/.test(carry_until)) {
    return res.status(400).json({ success: false, message: 'carry_until must be YYYY-MM-DD' });
  }

  // Sprint 10.4: admin author has no row in `users` (creds live in
  // server/config/admins.json), so we can't FK to user_id. Store
  // author_user_id=NULL + author_label = the admin's display name,
  // matching the audit_logs pattern from Sprint 5.
  const isAdmin = req.auth.type === 'admin';
  const authorUserId = isAdmin ? null : req.auth.sub;
  const authorLabel  = isAdmin ? (req.auth.name || req.auth.sub || 'Admin') : null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO handoff_notes
         (author_user_id, author_label, body, scope, schedule_id, department_id, for_date, carry_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING note_id`,
      [
        authorUserId,
        authorLabel,
        String(body).trim(),
        scope,
        scope === 'shift'      ? schedule_id   : null,
        scope === 'department' ? parseInt(department_id, 10) : null,
        resolvedDate,
        carry_until || null,
      ]
    );
    return res.json({ success: true, note_id: rows[0].note_id });
  } catch (err) {
    console.error('[handoff-notes:POST]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// PATCH /api/handoff-notes/:id  (author or admin only)
//   body: { body?, carry_until?, pinned?, resolved? }
//
// 10 exposed body + carry_until. 10.2 added pinned + resolved. Both
// new fields are *admin-only* even when the requester is the author —
// pinning your own note to the top defeats the moderation purpose, and
// staff resolving their own note before an admin reviews it would let
// problems disappear from the queue.
app.patch('/api/handoff-notes/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { body, carry_until, pinned, resolved } = req.body || {};

  const { rows: own } = await pool.query(
    `SELECT author_user_id FROM handoff_notes WHERE note_id = $1`,
    [id]
  );
  if (!own.length) return res.status(404).json({ success: false, message: 'note not found' });

  const isAuthor = own[0].author_user_id === req.auth.sub;
  const isAdmin  = req.auth.role === 'admin';
  if (!isAuthor && !isAdmin) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }
  if ((pinned !== undefined || resolved !== undefined) && !isAdmin) {
    return res.status(403).json({ success: false, message: 'pin/resolve is admin-only' });
  }

  const sets = [];
  const params = [];
  if (typeof body === 'string') {
    if (!body.trim()) return res.status(400).json({ success: false, message: 'body cannot be empty' });
    params.push(body.trim());
    sets.push(`body = $${params.length}`);
  }
  if (carry_until !== undefined) {
    if (carry_until === null || carry_until === '') {
      sets.push(`carry_until = NULL`);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(carry_until)) {
      params.push(carry_until);
      sets.push(`carry_until = $${params.length}::date`);
    } else {
      return res.status(400).json({ success: false, message: 'carry_until must be YYYY-MM-DD or null' });
    }
  }
  // 10.2: pinned / resolved map to *_at timestamps. Sending `true`
  // stamps NOW(); `false` clears the timestamp. NULL is equivalent
  // to not sending the key at all (no-op).
  if (pinned === true)  sets.push(`pinned_at = NOW()`);
  if (pinned === false) sets.push(`pinned_at = NULL`);
  if (resolved === true)  sets.push(`resolved_at = NOW()`);
  if (resolved === false) sets.push(`resolved_at = NULL`);

  if (sets.length === 0) {
    return res.status(400).json({ success: false, message: 'nothing to update' });
  }

  params.push(id);
  try {
    await pool.query(
      `UPDATE handoff_notes SET ${sets.join(', ')} WHERE note_id = $${params.length}`,
      params
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[handoff-notes:PATCH]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// POST /api/handoff-notes/mark-read
//   body: { note_ids: [UUID, ...] }
//
// Sprint 10.2: bulk mark a set of notes as read by the current
// user. Idempotent via composite-PK ON CONFLICT DO NOTHING — calling
// twice with the same IDs is a no-op. Returns the inserted count
// (so the client can confirm progress without re-fetching the list).
app.post('/api/handoff-notes/mark-read', requireAuth, async (req, res) => {
  const { note_ids } = req.body || {};
  if (!Array.isArray(note_ids) || note_ids.length === 0) {
    return res.status(400).json({ success: false, message: 'note_ids array required' });
  }
  // Soft cap so a runaway client can't blow up the query.
  if (note_ids.length > 1000) {
    return res.status(400).json({ success: false, message: 'too many note_ids (max 1000)' });
  }
  // Sprint 10.4: admin has no users row → can't FK into
  // handoff_note_reads. Return success with marked=0 instead of
  // crashing — the drawer treats admin as already-read for every
  // row (see GET /handoff-notes), so this is consistent.
  if (req.auth.type === 'admin') {
    return res.json({ success: true, marked: 0 });
  }
  try {
    // unnest() expands the array into rows; INSERT … SELECT skips
    // any IDs the user already marked read.
    const { rowCount } = await pool.query(
      `INSERT INTO handoff_note_reads (note_id, user_id)
       SELECT id::uuid, $2::uuid
       FROM unnest($1::uuid[]) AS id
       ON CONFLICT (note_id, user_id) DO NOTHING`,
      [note_ids, req.auth.sub]
    );
    return res.json({ success: true, marked: rowCount });
  } catch (err) {
    console.error('[handoff-notes/mark-read]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// GET /api/handoff-notes/unread-count
//
// Sprint 10.2: drives the Sidebar's Calendar-nav dot. Counts notes
// the current user hasn't marked read, whose visibility window
// reaches today or tomorrow (so the badge means "there's something
// timely that wants my attention," not "there's any unread note
// anywhere in history"). Resolved notes don't count.
app.get('/api/handoff-notes/unread-count', requireAuth, async (req, res) => {
  // Sprint 10.4: admin has no users row to track reads against, so
  // there's nothing to count. Return 0 — the sidebar dot stays
  // hidden for admin viewers, which is the right HCI: admins are
  // *moderators* of handoffs, not the audience.
  if (req.auth.type === 'admin') {
    return res.json({ success: true, count: 0 });
  }
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM handoff_notes n
       LEFT JOIN handoff_note_reads r
         ON r.note_id = n.note_id AND r.user_id = $1::uuid
       WHERE r.note_id IS NULL
         AND n.resolved_at IS NULL
         AND ( (n.for_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day')
            OR (n.carry_until IS NOT NULL AND n.carry_until >= CURRENT_DATE) )`,
      [req.auth.sub]
    );
    return res.json({ success: true, count: rows[0]?.count || 0 });
  } catch (err) {
    console.error('[handoff-notes/unread-count]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/handoff-notes/counts?from=YYYY-MM-DD&to=YYYY-MM-DD
//   [&department_id=INT]
//
// Sprint 10.1: per-day count aggregation used by Week-view shift
// cells to render `💬 N` badges. One round-trip instead of one
// query per cell. Counts a note for *every* date in [for_date,
// COALESCE(carry_until, for_date)] that falls inside the requested
// window — so a carrying note correctly shows on each day it's
// visible, not only its origin date.
//
// Returns { success, counts: { 'YYYY-MM-DD': { total, unread } } }.
// Days with zero notes are omitted (client treats missing keys as
// {total:0, unread:0}).
app.get('/api/handoff-notes/counts', requireAuth, async (req, res) => {
  const { from, to, department_id } = req.query;
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ success: false, message: 'from and to required (YYYY-MM-DD)' });
  }

  // Sprint 10.4: admin has no users row for read tracking. Drop the
  // reads LEFT JOIN entirely and report unread=0 for admin
  // requests (consistent with admin treatment in the GET /handoff-
  // notes and /unread-count endpoints — admin is moderator, not
  // audience).
  const isAdminReader = req.auth.type === 'admin';
  const params = [from, to];
  if (!isAdminReader) params.push(req.auth.sub);
  let deptFilter = '';
  if (department_id) {
    params.push(parseInt(department_id, 10));
    deptFilter = `AND (n.department_id = $${params.length}::int OR n.scope = 'all')`;
  }

  const readJoinSql = isAdminReader
    ? ''
    : `LEFT JOIN handoff_note_reads r ON r.note_id = n.note_id AND r.user_id = $3::uuid`;
  const unreadExpr = isAdminReader
    ? `0`
    : `COUNT(n.note_id) FILTER (WHERE r.note_id IS NULL)`;

  try {
    // generate_series spans every day in the window; cross-join to
    // handoff_notes and keep matches where the day falls inside the
    // note's [for_date, COALESCE(carry_until, for_date)] range.
    // Unread = no row in handoff_note_reads for the requester (or
    // hardcoded 0 for admin).
    const { rows } = await pool.query(
      `WITH days AS (
         SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS d
       )
       SELECT
         to_char(days.d, 'YYYY-MM-DD')         AS date,
         COUNT(n.note_id)                      AS total,
         ${unreadExpr}                          AS unread
       FROM days
       LEFT JOIN handoff_notes n
         ON days.d BETWEEN n.for_date AND COALESCE(n.carry_until, n.for_date)
         ${deptFilter}
       ${readJoinSql}
       GROUP BY days.d
       HAVING COUNT(n.note_id) > 0
       ORDER BY days.d`,
      params
    );

    const counts = {};
    rows.forEach(r => {
      counts[r.date] = { total: Number(r.total), unread: Number(r.unread) };
    });
    return res.json({ success: true, counts });
  } catch (err) {
    console.error('[handoff-notes/counts]', err);
    return res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  }
});

// DELETE /api/handoff-notes/:id  (author or admin only)
app.delete('/api/handoff-notes/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const { rows: own } = await pool.query(
    `SELECT author_user_id FROM handoff_notes WHERE note_id = $1`,
    [id]
  );
  if (!own.length) return res.status(404).json({ success: false, message: 'note not found' });

  const isAuthor = own[0].author_user_id === req.auth.sub;
  const isAdmin  = req.auth.role === 'admin';
  if (!isAuthor && !isAdmin) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  try {
    await pool.query(`DELETE FROM handoff_notes WHERE note_id = $1`, [id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[handoff-notes:DELETE]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Serve React frontend ──────────────────────────────────────────────────────

const buildPath = path.join(__dirname, 'build');
app.use(express.static(buildPath));
app.get('*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`HotelOps API running on port ${PORT}`));
