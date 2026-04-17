const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// CORS only needed for local dev (frontend and API are same-origin on Koyeb)
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
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
    return res.json({ success: true, employee: rows[0] });
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

// ── Serve React frontend ──────────────────────────────────────────────────────

const buildPath = path.join(__dirname, 'build');
app.use(express.static(buildPath));
app.get('*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`HotelOps API running on port ${PORT}`));
