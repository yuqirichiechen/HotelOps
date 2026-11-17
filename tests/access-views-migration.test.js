// Sprint 28.10 — migration 035 (Views) on a real throwaway Postgres.   node tests/access-views-migration.test.js "$PWD"
const ROOT = process.argv[2]; const assert = require('assert'); const { execSync } = require('child_process'); const fs = require('fs');
const pg = require(ROOT + '/server/node_modules/pg'); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };
const MIG = ROOT + '/database/migrations/035_sprint28_10_access_views.sql', RB = ROOT + '/database/migrations/035_sprint28_10_access_views_ROLLBACK.sql';
const PGBIN = '/opt/homebrew/opt/postgresql@14/bin', DIR = '/tmp/hopdb_views', PORT = 5440; const sh = (c) => execSync(c, { stdio: 'pipe' }).toString();
(async () => {
  try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* not running */ } sh(`rm -rf ${DIR}`); sh(`${PGBIN}/initdb -D ${DIR} -A trust -U postgres`);
  sh(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l /tmp/hopdb_views.log -w start`);
  try {
    const psql = (db, a) => sh(`${PGBIN}/psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} ${a} 2>&1`); const file = (db, f) => psql(db, `-v ON_ERROR_STOP=1 -q -f "${f}"`);
    const client = async (db) => { const c = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: db }); await c.connect(); return c; };
    const mk = async (db, extra) => { psql('postgres', `-c "CREATE DATABASE ${db}"`); file(db, ROOT + '/database/schema.sql'); file(db, ROOT + '/database/migrations/003_app_settings.sql'); const c = await client(db);
      await c.query("INSERT INTO departments (name) VALUES ('Management')"); const d = async (n) => (await c.query('SELECT department_id FROM departments WHERE name = $1', [n])).rows[0].department_id;
      await c.query("INSERT INTO users (name, phone_number, role, department_id, base_hourly_rate, hire_date) VALUES ('Fran','2065550101','employee',$1,17.5,'2025-03-01'),('Hana','2065550102','employee',$2,16,'2025-04-01'),('Mia','2065550103','admin',NULL,NULL,'2025-05-01')", [await d('Front Desk'), await d('Housekeeping')]);
      if (extra) await extra(c); return c; };
    const snapshot = async (c) => ({ users: (await c.query('SELECT to_jsonb(u) AS j FROM users u ORDER BY user_id')).rows.map(r => r.j), depts: (await c.query('SELECT department_id, name, color FROM departments ORDER BY department_id')).rows });

    await t('MIGRATION 035: creates the views table + the department link, seeds a "Front Desk" view with exactly what Front Desk staff had, attaches it to the Front Desk department ONLY, switch defaults to off — and changes no person or department row', async () => {
      const c = await mk('v1'); const before = await snapshot(c); const out = file('v1', MIG); assert(/Front Desk view created: 1 \| attached to the Front Desk department: 1/.test(out), out);
      const v = (await c.query('SELECT * FROM access_views')).rows; assert.strictEqual(v.length, 1); assert.deepStrictEqual([v[0].name, v[0].pages], ['Front Desk', ['reservations', 'housekeeping', 'logbook']]);
      const dv = Object.fromEntries((await c.query('SELECT d.name, av.name AS view FROM departments d LEFT JOIN access_views av USING (view_id)')).rows.map(r => [r.name, r.view])); assert.strictEqual(dv['Front Desk'], 'Front Desk'); assert(Object.entries(dv).filter(([k]) => k !== 'Front Desk').every(([, x]) => x === null), 'every other department is Home only: ' + JSON.stringify(dv));
      assert.deepStrictEqual(await snapshot(c), before, 'users (incl. last-modified stamps) and department names / colours are byte-for-byte the same'); assert.strictEqual((await c.query("SELECT value FROM app_settings WHERE key = 'access_admin_sets_view'")).rows[0].value, 'false', 'admins locked out by default');
      await assert.rejects(c.query("INSERT INTO access_views (name) VALUES ('  FRONT desk ')"), /uq_access_views_name/, 'names are unique ignoring case / spaces'); await c.end();
    });
    await t('MIGRATION 035 is SAFE TO RUN TWICE and never overrides a later choice: after dev sets Front Desk to "Home only" (or another view), a re-run changes nothing; an existing switch value stays', async () => {
      const c = await client('v1'); await c.query("UPDATE departments SET view_id = NULL WHERE name = 'Front Desk'"); await c.query("UPDATE app_settings SET value = 'true' WHERE key = 'access_admin_sets_view'"); const before = await snapshot(c);
      const out = file('v1', MIG); assert(/Front Desk view created: 0 \| attached to the Front Desk department: 0/.test(out), out); assert.strictEqual((await c.query("SELECT view_id FROM departments WHERE name = 'Front Desk'")).rows[0].view_id, null, 'the Home-only choice survives'); assert.strictEqual((await c.query('SELECT count(*)::int n FROM access_views')).rows[0].n, 1);
      assert.strictEqual((await c.query("SELECT value FROM app_settings WHERE key = 'access_admin_sets_view'")).rows[0].value, 'true', 'the switch is not reset'); assert.deepStrictEqual(await snapshot(c), before); await c.end();
    });
    await t('a database WITHOUT a Front Desk department gets the tables and the switch but no view (nothing to attach)', async () => {
      const c = await mk('v2', async (cc) => { await cc.query("UPDATE users SET department_id = NULL WHERE department_id = (SELECT department_id FROM departments WHERE name = 'Front Desk')"); await cc.query("DELETE FROM departments WHERE name = 'Front Desk'"); });
      const out = file('v2', MIG); assert(/Front Desk view created: 0/.test(out), out); assert.strictEqual((await c.query('SELECT count(*)::int n FROM access_views')).rows[0].n, 0); await c.end();
    });
    await t('deleting a view that departments use just sets them to Home only (the link is ON DELETE SET NULL); users are untouched', async () => {
      const c = await client('v1'); await c.query("UPDATE departments SET view_id = (SELECT view_id FROM access_views LIMIT 1) WHERE name IN ('Front Desk', 'Housekeeping')"); const before = (await c.query('SELECT to_jsonb(u) AS j FROM users u ORDER BY user_id')).rows;
      await c.query('DELETE FROM access_views'); assert.strictEqual((await c.query('SELECT count(*)::int n FROM departments WHERE view_id IS NOT NULL')).rows[0].n, 0); assert.deepStrictEqual((await c.query('SELECT to_jsonb(u) AS j FROM users u ORDER BY user_id')).rows, before); await c.end();
    });
    await t('ROLLBACK removes only the views table, the department link and the switch — every person and department stays', async () => {
      const c = await client('v1'); const before = await snapshot(c); file('v1', RB); assert.strictEqual((await c.query("SELECT to_regclass('access_views') AS t")).rows[0].t, null); assert.strictEqual((await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name = 'departments' AND column_name = 'view_id'")).rows[0].n, 0);
      assert.strictEqual((await c.query("SELECT count(*)::int n FROM app_settings WHERE key = 'access_admin_sets_view'")).rows[0].n, 0); assert.deepStrictEqual(await snapshot(c), before); file('v1', RB); file('v1', MIG); assert.strictEqual((await c.query('SELECT count(*)::int n FROM access_views')).rows[0].n, 1, 'and it can be re-applied'); await c.end();
    });
    await t('the migration is additive and transactional: one BEGIN/COMMIT, no DROP / DELETE / UPDATE of users, and the only UPDATE is departments.view_id', () => {
      const sql = fs.readFileSync(MIG, 'utf8').replace(/--.*$/gm, ''); assert(/^\s*BEGIN;/.test(sql) && /COMMIT;\s*$/.test(sql)); assert(!/\bDROP\b|TRUNCATE|DELETE FROM|UPDATE users/i.test(sql), 'destructive statement'); const ups = [...sql.matchAll(/UPDATE (\w+) SET (\w+)/g)].map(m => m[1] + '.' + m[2]); assert.deepStrictEqual(ups, ['departments.view_id']);
    });
  } finally { try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* */ } }
  console.log(`${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
