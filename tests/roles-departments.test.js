// Sprint 28.9 — roles are employee / admin; Front Desk lives only in the department. Migration 034 (+ rollback) on a real throwaway Postgres, and the server rules.
//   node tests/roles-departments.test.js "$PWD"
const ROOT = process.argv[2]; const SRV = ROOT + '/server'; const assert = require('assert'); const { execSync } = require('child_process'); const fs = require('fs');
process.env.PORT = '3994'; process.env.JWT_SECRET = 'x'.repeat(40); process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
const jwt = require(SRV + '/node_modules/jsonwebtoken'); const pg = require(SRV + '/node_modules/pg');
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };
const MIG = ROOT + '/database/migrations/034_sprint28_9_roles_departments.sql', RB = ROOT + '/database/migrations/034_sprint28_9_roles_departments_ROLLBACK.sql';

// ── the server rules (queries mocked) ────────────────────────────────────────────────────────────────────────────────────────────────────
const sqls = []; const depts = { 1: 'Front Desk', 2: 'Housekeeping', 3: 'Management' }; let refs = { users: 0, people: 0, shifts: 0 };
pg.Pool.prototype.query = async function (sql, params) { const q = String(sql).replace(/\s+/g, ' '); sqls.push({ q, params });
  if (/^SELECT name FROM departments WHERE department_id/.test(q)) { const n = depts[params[0]]; return { rows: n ? [{ name: n }] : [] }; }
  if (/^UPDATE departments SET/.test(q)) return { rows: [{ department_id: params[params.length - 1], name: 'x', color: null }] };
  if (/SELECT COUNT\(\*\)::int AS n FROM users/.test(q)) return { rows: [{ n: refs.users }] };
  if (/SELECT \(SELECT COUNT\(\*\)::int FROM users/.test(q)) return { rows: [{ people: refs.people, shifts: refs.shifts }] };
  if (/^DELETE FROM departments/.test(q)) return { rows: [], rowCount: 1 };
  if (/^INSERT INTO users/.test(q) || /^UPDATE users SET name/.test(q)) return { rows: [{ user_id: 'u-new', role: params[5] === undefined ? undefined : (/^INSERT/.test(q) ? params[5] : params[5]) }], rowCount: 1 };
  return { rows: [], rowCount: 0 }; };
pg.Pool.prototype.connect = async function () { return { query: async () => ({ rows: [], rowCount: 0 }), release() {} }; };
const sign = (o) => jwt.sign(o, process.env.JWT_SECRET); const A = sign({ sub: 'mgr', role: 'admin', type: 'admin' });
const http = (p, o = {}) => fetch('http://127.0.0.1:3994' + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
const emp = (role) => ({ name: 'Ann Lee', hireDate: '2026-11-01', phoneNumber: '2065550100', ...(role === undefined ? {} : { role }) });

(async () => {
  require(SRV + '/server.js'); await sleep(600);
  await t('ROLE is employee or admin only: the old front_desk role (and anything else) is refused on create and on edit; no role = employee; the saved value is what was validated', async () => {
    for (const bad of ['front_desk', 'dev', 'manager', 'EMPLOYEE']) { assert.strictEqual((await http('/api/admin/employees', { method: 'POST', token: A, body: emp(bad) })).status, 400, 'POST ' + bad); assert.strictEqual((await http('/api/admin/employees/u1', { method: 'PUT', token: A, body: emp(bad) })).status, 400, 'PUT ' + bad); }
    const r = await http('/api/admin/employees', { method: 'POST', token: A, body: emp('front_desk') }); assert(/employee or admin/.test(r.body.message), r.body.message);
    for (const [given, saved] of [['employee', 'employee'], ['admin', 'admin'], [undefined, 'employee'], ['', 'employee']]) { sqls.length = 0; const ok = await http('/api/admin/employees', { method: 'POST', token: A, body: emp(given) }); assert.strictEqual(ok.status, 200, String(given)); assert.strictEqual(sqls.find(s => /^INSERT INTO users/.test(s.q)).params[5], saved, 'saved role for ' + given); }
    sqls.length = 0; assert.strictEqual((await http('/api/admin/employees/u1', { method: 'PUT', token: A, body: emp('admin') })).status, 200); assert.strictEqual(sqls.find(s => /^UPDATE users SET name/.test(s.q)).params[5], 'admin');
  });
  await t('FRONT DESK ACCESS = the department: department Front Desk (any spelling) passes /api/frontdesk, other departments / none are refused; admin and dev pass; tokens signed BEFORE the migration (role front_desk) still pass until they expire', async () => {
    const tok = (o) => sign({ sub: '11111111-1111-4111-8111-111111111111', type: 'staff', name: 'S', ...o }); const get = (token) => http('/api/frontdesk/housekeeping/locked-rooms?date=2026-11-16', { token });
    assert.strictEqual((await get(tok({ role: 'employee', dept: 'Front Desk' }))).status, 200); assert.strictEqual((await get(tok({ role: 'employee', dept: 'front_desk' }))).status, 200);
    assert.strictEqual((await get(tok({ role: 'employee', dept: 'Housekeeping' }))).status, 403); assert.strictEqual((await get(tok({ role: 'employee', dept: null }))).status, 403); assert.strictEqual((await get(tok({ role: 'employee' }))).status, 403);
    assert.strictEqual((await get(A)).status, 200); assert.strictEqual((await get(sign({ sub: 'd', role: 'dev', type: 'dev' }))).status, 200); assert.strictEqual((await get(undefined)).status, 401);
    assert.strictEqual((await get(tok({ role: 'front_desk', dept: null }))).status, 200, 'an old token keeps working for its 8 hours');
    const src = fs.readFileSync(SRV + '/server.js', 'utf8'); assert(!/u\.role = 'front_desk'/.test(src), 'a note can be sent to Front Desk department staff only — no role check left'); assert(/LEGACY_FRONT_DESK_ROLE/.test(fs.readFileSync(SRV + '/auth.js', 'utf8')), 'the one legacy line is named so it can be removed');
  });
  await t('FRONT DESK DEPARTMENT IS PROTECTED: it can be recoloured but not renamed or deleted (its name grants the pages); other departments rename, recolour and delete normally', async () => {
    const patch = (id, body) => http('/api/admin/departments/' + id, { method: 'PATCH', token: A, body }); const del = (id) => http('/api/admin/departments/' + id, { method: 'DELETE', token: A });
    const r = await patch(1, { name: 'Reception' }); assert.strictEqual(r.status, 409); assert(/Front Desk can.t be renamed/.test(r.body.message), r.body.message);
    assert.strictEqual((await patch(1, { color: '#112233' })).status, 200, 'colour is fine'); assert.strictEqual((await patch(1, { name: 'front desk' })).status, 200, 'a re-spelling that still matches is fine');
    assert.strictEqual((await patch(2, { name: 'Housekeeping & Laundry' })).status, 200); const d = await del(1); assert.strictEqual(d.status, 409); assert(/Front Desk can.t be deleted/.test(d.body.message));
    refs = { users: 0, people: 0, shifts: 0 }; assert.strictEqual((await del(3)).status, 200, 'an unused department deletes');
  });
  await t('DELETING a department that is still referenced gives a clear 409 (active staff / former staff / shift templates) instead of a raw foreign-key error', async () => {
    const del = (id) => http('/api/admin/departments/' + id, { method: 'DELETE', token: A });
    refs = { users: 2, people: 2, shifts: 0 }; let r = await del(3); assert.strictEqual(r.status, 409); assert(/2 staff still in this department/.test(r.body.message), r.body.message);
    refs = { users: 0, people: 1, shifts: 3 }; r = await del(3); assert.strictEqual(r.status, 409); assert(/3 shift template\(s\) and 1 former staff record\(s\)/.test(r.body.message), r.body.message); refs = { users: 0, people: 0, shifts: 0 };
  });

  // ── migration 034 on a real postgres ────────────────────────────────────────────────────────────────────────────────────────────────────
  const PGBIN = '/opt/homebrew/opt/postgresql@14/bin', DIR = '/tmp/hopdb_roles', PORT = 5439; const sh = (c) => execSync(c, { stdio: 'pipe' }).toString();
  try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* not running */ } sh(`rm -rf ${DIR}`); sh(`${PGBIN}/initdb -D ${DIR} -A trust -U postgres`);
  sh(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l /tmp/hopdb_roles.log -w start`);
  try {
    const psql = (db, a) => sh(`${PGBIN}/psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} ${a} 2>&1`);
    const file = (db, f) => psql(db, `-v ON_ERROR_STOP=1 -q -f "${f}"`); const client = async (db) => { const c = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: db }); await c.connect(); return c; };
    let ph = 100; const mkUser = (c, name, role, dept, extra = '') => c.query(`INSERT INTO users (name, phone_number, role, department_id, base_hourly_rate, ${extra ? 'deleted_at,' : ''} hire_date) VALUES ($1, $2, $3, $4, 17.5, ${extra ? 'NOW(),' : ''} '2025-03-01') RETURNING user_id`, [name, '2065550' + String(++ph), role, dept]).then(r => r.rows[0].user_id);
    const mkDb = async (db, withShift) => { psql('postgres', `-c "CREATE DATABASE ${db}"`); file(db, ROOT + '/database/schema.sql'); const c = await client(db);
      const D = Object.fromEntries((await c.query('SELECT department_id, name FROM departments')).rows.map(r => [r.name, r.department_id])); D.Management = (await c.query("INSERT INTO departments (name, color) VALUES ('Management', '#718096') RETURNING department_id")).rows[0].department_id;
      const U = {}; U.ann = await mkUser(c, 'Ann FrontRole NoDept', 'front_desk', null); U.bob = await mkUser(c, 'Bob FrontRole Mgmt', 'front_desk', D.Management); U.cat = await mkUser(c, 'Cat FrontRole Housekeeping', 'front_desk', D['Housekeeping']);
      U.dan = await mkUser(c, 'Dan FrontRole FrontDesk', 'front_desk', D['Front Desk']); U.eve = await mkUser(c, 'Eve Employee Mgmt', 'employee', D.Management); U.fay = await mkUser(c, 'Fay Admin Mgmt', 'admin', D.Management);
      U.gus = await mkUser(c, 'Gus Employee Housekeeping', 'employee', D['Housekeeping']); U.hal = await mkUser(c, 'Hal Admin NoDept', 'admin', null); U.ivy = await mkUser(c, 'Ivy Deleted Mgmt', 'employee', D.Management, 'deleted'); U.jon = await mkUser(c, 'Jon Deleted FrontRole', 'front_desk', null, 'deleted');
      await c.query("INSERT INTO time_entries (user_id, clock_in_time, clock_out_time) VALUES ($1, '2026-11-01 08:00+00', '2026-11-01 16:00+00')", [U.ann]);
      if (withShift) await c.query("INSERT INTO shifts (department_id, name, start_time, end_time) VALUES ($1, 'Mgmt day', '08:00', '16:00')", [D.Management]); return { c, D, U }; };
    const rest = async (c) => (await c.query("SELECT user_id, to_jsonb(u) - 'role' - 'department_id' - 'updated_at' AS rest FROM users u ORDER BY user_id")).rows;   // updated_at is the automatic 'last modified' stamp (trigger) — checked separately
    const stamps = async (c) => Object.fromEntries((await c.query('SELECT name, updated_at FROM users')).rows.map(r => [r.name.split(' ')[0], +r.updated_at]));
    const state = async (c) => Object.fromEntries((await c.query('SELECT u.name, u.role, d.name AS dept FROM users u LEFT JOIN departments d ON d.department_id = u.department_id')).rows.map(r => [r.name.split(' ')[0], [r.role, r.dept]]));

    await t('MIGRATION 034: every group lands where decided, nobody is lost, NOTHING ELSE about a person changes, the originals are backed up and audited, Management is deleted when unused', async () => {
      const { c, U } = await mkDb('m1', false); const before = await rest(c), stamp0 = await stamps(c); const n0 = (await c.query('SELECT count(*)::int n FROM users')).rows[0].n, te0 = (await c.query('SELECT count(*)::int n FROM time_entries')).rows[0].n;
      const out = file('m1', MIG); assert(/A \(role→employee \+ Front Desk\): 3/.test(out) && /B \(role→employee, department kept\): 2/.test(out) && /C \(left Management\): 3/.test(out), out);
      assert(/Management department deleted/.test(out), out); const s = await state(c);
      assert.deepStrictEqual(s.Ann, ['employee', 'Front Desk']); assert.deepStrictEqual(s.Bob, ['employee', 'Front Desk'], 'A: front_desk role in Management → Front Desk'); assert.deepStrictEqual(s.Jon, ['employee', 'Front Desk'], 'a deleted person too');
      assert.deepStrictEqual(s.Cat, ['employee', 'Housekeeping'], 'B: Housekeeping stays Housekeeping — only the role changes'); assert.deepStrictEqual(s.Dan, ['employee', 'Front Desk']);
      assert.deepStrictEqual(s.Eve, ['employee', null], 'C: Management → Uncategorized'); assert.deepStrictEqual(s.Fay, ['admin', null], 'an admin stays an admin'); assert.deepStrictEqual(s.Ivy, ['employee', null]);
      assert.deepStrictEqual(s.Gus, ['employee', 'Housekeeping'], 'untouched'); assert.deepStrictEqual(s.Hal, ['admin', null], 'untouched');
      assert.strictEqual((await c.query("SELECT count(*)::int n FROM users WHERE role = 'front_desk'")).rows[0].n, 0, 'nobody holds the retired role'); assert.strictEqual((await c.query('SELECT count(*)::int n FROM users')).rows[0].n, n0, 'no person lost');
      const after = await rest(c); const diff = after.flatMap((r, i) => Object.keys(r.rest).filter(k => JSON.stringify(r.rest[k]) !== JSON.stringify(before[i].rest[k])).map(k => k + ': ' + JSON.stringify(before[i].rest[k]) + ' → ' + JSON.stringify(r.rest[k]))); assert(diff.length === 0, JSON.stringify([...new Set(diff.map(d => d.split(':')[0]))]) + ' changed; e.g. ' + diff[0] + ' — name, phone, pay rate, hire date, PIN, deleted flag … everything else is byte-for-byte the same'); assert.strictEqual((await c.query('SELECT count(*)::int n FROM time_entries')).rows[0].n, te0); const stamp1 = await stamps(c); assert.deepStrictEqual(Object.keys(stamp1).filter(k => stamp1[k] !== stamp0[k]).sort(), ['Ann', 'Bob', 'Cat', 'Dan', 'Eve', 'Fay', 'Ivy', 'Jon'], 'the automatic last-modified stamp moves only for the 8 people actually changed (Gus and Hal are untouched)');
      assert.strictEqual((await c.query("SELECT count(*)::int n FROM departments WHERE name = 'Management'")).rows[0].n, 0, 'Management is gone'); assert.strictEqual((await c.query("SELECT count(*)::int n FROM departments WHERE name IN ('Front Desk','Housekeeping','Maintenance','Food & Beverage')")).rows[0].n, 4, 'the real departments stay');
      const bk = (await c.query('SELECT * FROM migration_034_backup ORDER BY user_name')).rows; assert.strictEqual(bk.length, 8, 'every touched person backed up (A3 + B2 + C3)'); const ann = bk.find(b => b.user_id === U.ann); assert.deepStrictEqual([ann.old_role, ann.old_department_id, ann.new_role], ['front_desk', null, 'employee']);
      assert.strictEqual((await c.query("SELECT count(*)::int n FROM audit_logs WHERE action = 'migration_034_role_department'")).rows[0].n, 8, 'one audit row each'); await c.end();
    });
    await t('MIGRATION 034 is SAFE TO RUN TWICE: the second run changes nothing, the backup keeps the FIRST (original) values, no extra audit rows', async () => {
      const c = await client('m1'); const before = await rest(c), st = await state(c), bk = (await c.query('SELECT * FROM migration_034_backup ORDER BY user_id')).rows; const out = file('m1', MIG); assert(/0 newly backed up \| A .*: 0 \| B .*: 0 \| C .*: 0/.test(out), out);
      assert.deepStrictEqual(await rest(c), before); assert.deepStrictEqual(await state(c), st); const bk2 = (await c.query('SELECT * FROM migration_034_backup ORDER BY user_id')).rows; assert.deepStrictEqual(bk2.map(b => [b.user_id, b.old_role, b.old_department_id]), bk.map(b => [b.user_id, b.old_role, b.old_department_id]));
      assert.strictEqual((await c.query("SELECT count(*)::int n FROM audit_logs WHERE action = 'migration_034_role_department'")).rows[0].n, 8); await c.end();
    });
    await t('MANAGEMENT IS KEPT when a shift template still uses it (a clear notice says so) — people still move out of it; nothing else breaks', async () => {
      const { c, D } = await mkDb('m2', true); const out = file('m2', MIG); assert(/Management department KEPT — still used by 1 shift template/.test(out), out); assert.strictEqual((await c.query("SELECT count(*)::int n FROM departments WHERE name = 'Management'")).rows[0].n, 1);
      assert.strictEqual((await c.query('SELECT count(*)::int n FROM users WHERE department_id = $1', [D.Management])).rows[0].n, 0, 'nobody is left in it'); assert.strictEqual((await c.query('SELECT count(*)::int n FROM shifts')).rows[0].n, 1, 'the shift template is untouched'); await c.end();
    });
    await t('MANAGEMENT IS KEPT when a department-scoped handoff note points at it (deleting it would break that note), and a missing Front Desk department is created only when someone needs it', async () => {
      const { c, D, U } = await mkDb('m3', false); await c.query("INSERT INTO handoff_notes (author_user_id, body, scope, department_id, for_date) VALUES ($1, 'x', 'department', $2, '2026-11-16')", [U.hal, D.Management]); await c.query('UPDATE users SET department_id = NULL WHERE department_id = $1', [D['Front Desk']]); await c.query("DELETE FROM departments WHERE name = 'Front Desk'");
      const out = file('m3', MIG); assert(/created the Front Desk department/.test(out) && /Management department KEPT — still used by 0 shift template\(s\), 1 handoff note/.test(out), out); assert.strictEqual((await c.query("SELECT d.name FROM users u JOIN departments d USING (department_id) WHERE u.user_id = $1", [U.ann])).rows[0].name, 'Front Desk'); await c.end();
    });
    await t('ROLLBACK restores the original role + department from the backup (re-creating Management), and LEAVES ALONE anyone an admin edited after the migration', async () => {
      const c = await client('m1'); await c.query("UPDATE users SET role = 'admin' WHERE name LIKE 'Cat %'");   // edited after the migration
      const out = file('m1', RB); assert(/re-created department Management/.test(out) && /left alone \(edited since the migration\): Cat FrontRole Housekeeping/.test(out) && /7 restored, 1 left alone/.test(out), out); const s = await state(c);
      assert.deepStrictEqual(s.Ann, ['front_desk', null]); assert.deepStrictEqual(s.Bob, ['front_desk', 'Management']); assert.deepStrictEqual(s.Dan, ['front_desk', 'Front Desk']); assert.deepStrictEqual(s.Eve, ['employee', 'Management']); assert.deepStrictEqual(s.Fay, ['admin', 'Management']); assert.deepStrictEqual(s.Ivy, ['employee', 'Management']);
      assert.deepStrictEqual(s.Cat, ['admin', 'Housekeeping'], 'the later edit is kept'); assert.deepStrictEqual(s.Gus, ['employee', 'Housekeeping']); await c.end();
    });
    await t('IF THE MIGRATION FAILS HALFWAY, NOTHING IS CHANGED: with the audit table missing it errors out and every role, department and the backup table roll back to the starting state', async () => {
      const { c } = await mkDb('m4', false); const before = await state(c), rest0 = await rest(c); await c.query('DROP TABLE audit_logs CASCADE'); let failed = false;
      try { file('m4', MIG); } catch (e) { failed = true; assert(/audit_logs/.test(String(e.stdout || e.message)), 'fails for the right reason'); } assert(failed, 'the migration reported the error (ON_ERROR_STOP)');
      assert.deepStrictEqual(await state(c), before, 'every role + department exactly as before'); assert.deepStrictEqual(await rest(c), rest0); assert.strictEqual((await c.query("SELECT to_regclass('migration_034_backup') AS t")).rows[0].t, null, 'not even the backup table is left half-made');
      assert.strictEqual((await c.query("SELECT count(*)::int n FROM departments WHERE name = 'Management'")).rows[0].n, 1, 'Management untouched'); await c.end();
    });
    await t('A DATABASE WITH NOTHING TO CHANGE (no front_desk role, no Management) is a clean no-op: zero rows touched, no errors', async () => {
      psql('postgres', '-c "CREATE DATABASE m5"'); file('m5', ROOT + '/database/schema.sql'); const c = await client('m5'); await mkUser(c, 'Zed Employee', 'employee', 2); await mkUser(c, 'Yan Admin', 'admin', null); const before = await state(c), stamp0 = await stamps(c);
      const out = file('m5', MIG); assert(/0 newly backed up \| A .*: 0 \| B .*: 0 \| C .*: 0/.test(out), out); assert.deepStrictEqual(await state(c), before); assert.deepStrictEqual(await stamps(c), stamp0, 'not even a last-modified stamp moved'); assert.strictEqual((await c.query('SELECT count(*)::int n FROM migration_034_backup')).rows[0].n, 0); await c.end();
    });
    await t('the migration is wrapped in ONE transaction and only ever UPDATEs users.role / users.department_id (no DROP, no DELETE FROM users, no TRUNCATE)', () => {
      const sql = fs.readFileSync(MIG, 'utf8').replace(/--.*$/gm, ''); assert(/^\s*BEGIN;/.test(sql) && /COMMIT;\s*$/.test(sql)); assert(!/\bDROP\b|TRUNCATE|DELETE FROM users|ALTER TYPE|ALTER TABLE/i.test(sql), 'destructive statement found');
      const updates = [...sql.matchAll(/UPDATE users SET ([^W]*?) WHERE/gs)].map(m => m[1].replace(/\s+/g, ' ').trim()); assert(updates.length === 3 && updates.every(u => /^(role = 'employee'(, department_id = fd_id)?|department_id = NULL)$/.test(u)), JSON.stringify(updates));
      assert(!/front_desk/.test(fs.readFileSync(ROOT + '/database/schema.sql', 'utf8').split('\n').filter(l => /INSERT INTO departments|Management/.test(l) && !/^--/.test(l)).join('\n')), 'a fresh install seeds no Management'); assert(!/'Management',/.test(fs.readFileSync(ROOT + '/database/schema.sql', 'utf8')), 'schema.sql no longer seeds Management');
    });
  } finally { try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* */ } }
  console.log(`${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
