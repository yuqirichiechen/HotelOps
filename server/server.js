const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Always allow localhost for local dev; add FRONTEND_URL (GitHub Pages) for production
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
];
if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (curl, Postman, same-origin)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
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
  console.error('Database connection error:', err.message);
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ ok: true }));

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
              u.base_hourly_rate, u.active, d.name AS department
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

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`HotelOps API running on port ${PORT}`));
