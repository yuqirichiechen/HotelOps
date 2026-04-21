const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// CORS only needed for local dev (frontend and API are same-origin on Koyeb)
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
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

// ── Admin auth ────────────────────────────────────────────────────────────────

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

// ── Serve React frontend ──────────────────────────────────────────────────────

const buildPath = path.join(__dirname, 'build');
app.use(express.static(buildPath));
app.get('*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`HotelOps API running on port ${PORT}`));
