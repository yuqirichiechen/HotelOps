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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.query('SELECT NOW()').then(() => {
  console.log('Database connected');
}).catch(err => {
  console.error('Database connection error:', err);
  if (!process.env.DATABASE_URL) console.error('DATABASE_URL env var is not set');
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ── Login identifier helpers (Sprint 7) ──────────────────────────────────────
// Staff log in via any of {phone_number, username, employee_code}. The login
// endpoint accepts a single `identifier` and auto-detects the type:
//   - all digits, length 10  → phone_number
//   - all digits, length 4-6 → employee_code
//   - has a letter           → username (case-insensitive lookup)
//   - anything else          → invalid
// Username must contain at least one letter (enforced at signup + DB CHECK)
// so an all-digit username cannot shadow an employee_code.

const PHONE_RE    = /^[0-9]{10}$/;
const CODE_RE     = /^[0-9]{4,6}$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,16}$/;
const HAS_LETTER  = /[A-Za-z]/;

function classifyIdentifier(raw) {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
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

// Validates the three identifier fields for create/update. Returns
// { ok, normalized: { phoneNumber, username, employeeCode } } or
// { ok: false, message }. requireAtLeastOne guards create-time inserts;
// updates may pass false if the caller wants to allow clearing all three
// (we don't, but the option exists).
function validateIdentifiers({ phoneNumber, username, employeeCode }, { requireAtLeastOne = true } = {}) {
  const out = { phoneNumber: null, username: null, employeeCode: null };
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  if (has(phoneNumber))  { const r = validatePhone(phoneNumber);         if (!r.ok) return { ok: false, message: r.message }; out.phoneNumber  = r.value; }
  if (has(username))     { const r = validateUsername(username);         if (!r.ok) return { ok: false, message: r.message }; out.username     = r.value; }
  if (has(employeeCode)) { const r = validateEmployeeCode(employeeCode); if (!r.ok) return { ok: false, message: r.message }; out.employeeCode = r.value; }
  if (requireAtLeastOne && !out.phoneNumber && !out.username && !out.employeeCode) {
    return { ok: false, message: 'At least one of phone, username, or employee ID is required' };
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
  if (!id) return res.status(400).json({ success: false, message: 'Enter your phone, username, or employee ID' });

  try {
    const where = id.kind === 'phone'    ? 'phone_number = $1'
                : id.kind === 'code'     ? 'employee_code = $1'
                :                          'LOWER(username) = LOWER($1)';
    const { rows } = await pool.query(
      `SELECT user_id, name, phone_number, username, employee_code, role, department_id,
              pin_hash, pin_required, pin_must_set
       FROM users WHERE ${where} AND active = true`,
      [id.value]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
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
        user_id:       user.user_id,
        name:          user.name,
        phone_number:  user.phone_number,
        username:      user.username,
        employee_code: user.employee_code,
        role:          user.role,
        department_id: user.department_id,
        pin_required:  user.pin_required,
        pin_must_set:  user.pin_must_set,
        type:          'staff',
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
app.get('/api/me/hours', requireAuth, async (req, res) => {
  if (req.auth.type !== 'staff') {
    return res.status(403).json({ success: false, message: 'Staff only' });
  }
  const userId    = req.auth.sub;
  const weekStart = req.query.weekStart;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ success: false, message: 'weekStart=YYYY-MM-DD required' });
  }

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

    // Aggregate by day (Mon → Sun)
    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const start    = new Date(weekStart + 'T00:00:00');
    const days     = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const isoDate = d.toISOString().split('T')[0];
      let hours = 0;
      for (const e of entries) {
        const eDate = new Date(e.clock_in_time).toISOString().split('T')[0];
        if (eDate === isoDate) hours += parseFloat(e.hours);
      }
      days.push({ date: isoDate, dayName: dayNames[i], hours: Math.round(hours * 10) / 10 });
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
         u.user_id, u.name, u.phone_number, u.username, u.employee_code,
         u.role, u.hire_date,
         u.base_hourly_rate, u.active, u.department_id, d.name AS department,
         u.pin_required, u.pin_must_set,
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
      `SELECT u.user_id, u.name, u.phone_number, u.username, u.employee_code,
              u.role, u.hire_date,
              u.base_hourly_rate, u.active, u.department_id, d.name AS department,
              u.pin_required, u.pin_must_set,
              (u.pin_hash IS NOT NULL) AS has_pin
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.department_id
       WHERE u.user_id = $1`,
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
          phoneNumber, username, employeeCode } = req.body;
  if (!name || !hireDate) {
    return res.status(400).json({ success: false, message: 'name and hireDate required' });
  }
  const v = validateIdentifiers({ phoneNumber, username, employeeCode });
  if (!v.ok) return res.status(400).json({ success: false, message: v.message });
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, phone_number, username, employee_code,
                          role, hire_date, department_id, base_hourly_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, v.normalized.phoneNumber, v.normalized.username, v.normalized.employeeCode,
       role || 'employee', hireDate, departmentId || null, baseHourlyRate || null]
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
          phoneNumber, username, employeeCode } = req.body;
  if (!name || !hireDate) {
    return res.status(400).json({ success: false, message: 'name and hireDate required' });
  }
  const v = validateIdentifiers({ phoneNumber, username, employeeCode });
  if (!v.ok) return res.status(400).json({ success: false, message: v.message });
  try {
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, phone_number=$2, username=$3, employee_code=$4,
                        role=$5, hire_date=$6, department_id=$7, base_hourly_rate=$8
       WHERE user_id=$9 RETURNING *`,
      [name, v.normalized.phoneNumber, v.normalized.username, v.normalized.employeeCode,
       role || 'employee', hireDate, departmentId || null, baseHourlyRate || null, req.params.id]
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
  try {
    const { rows: check } = await pool.query(
      'SELECT active FROM users WHERE user_id = $1', [req.params.id]
    );
    if (!check.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (check[0].active) return res.status(400).json({ success: false, message: 'Deactivate employee before deleting' });
    await pool.query('DELETE FROM users WHERE user_id = $1', [req.params.id]);
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

  try {
    const now = new Date();
    const { from, to, prevFrom, prevTo, label } = periodRange(period);

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
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ success: false, message: 'from and to dates required (YYYY-MM-DD)' });
  }

  const conditions = [
    `te.clock_in_time >= $1::date`,
    `te.clock_in_time <  ($2::date + INTERVAL '1 day')`,
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
              u.user_id, u.name, u.phone_number, u.role,
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
  const { from, to } = periodRange(period);

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

// ── Shifts board (employee-facing) ───────────────────────────────────────────

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
  };
  const updates = req.body || {};
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No settings provided' });
  }
  for (const [k, v] of Object.entries(updates)) {
    if (!(k in ALLOWED))   return res.status(400).json({ success: false, message: `Unknown setting: ${k}` });
    if (!ALLOWED[k](v))    return res.status(400).json({ success: false, message: `Invalid value for ${k}` });
  }
  try {
    for (const [k, v] of Object.entries(updates)) {
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

// ── Serve React frontend ──────────────────────────────────────────────────────

const buildPath = path.join(__dirname, 'build');
app.use(express.static(buildPath));
app.get('*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`HotelOps API running on port ${PORT}`));
