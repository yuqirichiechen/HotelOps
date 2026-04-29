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

// ── Auth (new — JWT-based) ───────────────────────────────────────────────────

app.post('/api/auth/staff/login', async (req, res) => {
  const { phone, pin } = req.body || {};
  if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });

  try {
    const { rows } = await pool.query(
      `SELECT user_id, name, phone_number, role, department_id,
              pin_hash, pin_required, pin_must_set
       FROM users WHERE phone_number = $1 AND active = true`,
      [phone]
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
      `SELECT user_id, name, phone_number, role, department_id,
              pin_required, pin_must_set
       FROM users WHERE user_id = $1 AND active = true`,
      [req.auth.sub]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, user: { ...rows[0], type: 'staff' } });
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

// ── Admin auth (legacy — kept until AdminPanel/AdminLogin is removed) ────────

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USERNAME || 'admin';
  const validPass = process.env.ADMIN_PASSWORD || 'admin';
  if (username === validUser && password === validPass) {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
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

// ── User: shift history (last 4 weeks) ───────────────────────────────────────

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
    const { rows } = await pool.query(
      `SELECT u.user_id, u.name, u.phone_number, u.role, u.hire_date,
              u.base_hourly_rate, u.active, u.department_id, d.name AS department
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.department_id
       ORDER BY u.name`
    );
    return res.json({ success: true, employees: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/admin/employees', async (req, res) => {
  const { name, phoneNumber, role, hireDate, departmentId, baseHourlyRate } = req.body;
  if (!name || !phoneNumber || !hireDate) {
    return res.status(400).json({ success: false, message: 'name, phoneNumber, hireDate required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, phone_number, role, hire_date, department_id, base_hourly_rate)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, phoneNumber, role || 'employee', hireDate, departmentId || null, baseHourlyRate || null]
    );
    return res.json({ success: true, employee: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Phone number already exists' });
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
  const { name, phoneNumber, role, hireDate, departmentId, baseHourlyRate } = req.body;
  if (!name || !phoneNumber || !hireDate) {
    return res.status(400).json({ success: false, message: 'name, phoneNumber, hireDate required' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, phone_number=$2, role=$3, hire_date=$4,
       department_id=$5, base_hourly_rate=$6 WHERE user_id=$7 RETURNING *`,
      [name, phoneNumber, role || 'employee', hireDate, departmentId || null, baseHourlyRate || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    return res.json({ success: true, employee: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Phone number already exists' });
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

app.put('/api/admin/settings', async (req, res) => {
  const { schedule_visibility } = req.body;
  if (!['all', 'department', 'none'].includes(schedule_visibility)) {
    return res.status(400).json({ success: false, message: 'Invalid visibility value' });
  }
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value)
       VALUES ('schedule_visibility', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [schedule_visibility]
    );
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
