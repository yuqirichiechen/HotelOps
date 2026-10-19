// Migration 028: idempotent, keeps legacy rows, and the pre-existing (Sprint 18.5) reservation_history upsert from runScrape.js still works afterwards.
//   node tests/migration-028.test.js "$PWD"
const ROOT = process.argv[2]; const assert = require('assert'); const { execSync } = require('child_process'); const fs = require('fs');
const PGBIN = '/opt/homebrew/opt/postgresql@14/bin', DIR = '/tmp/hopdb_mig', PORT = 5437; const sh = (c) => execSync(c, { stdio: 'pipe' }).toString();
try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* not running */ } sh(`rm -rf ${DIR}`); sh(`${PGBIN}/initdb -D ${DIR} -A trust -U postgres`);
sh(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l /tmp/hopdb_mig.log -w start`);
const psql = (a) => sh(`${PGBIN}/psql -h 127.0.0.1 -p ${PORT} -U postgres ${a}`); psql('-c "CREATE DATABASE t"');
const file = (f) => psql(`-d t -v ON_ERROR_STOP=1 -q -f "${ROOT}/${f}"`);
const { Pool } = require(ROOT + '/server/node_modules/pg'); const pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 't' });
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
(async () => {
  file('tests/real-postgres/base.sql'); file('database/migrations/025_sprint18_reservation_history.sql');
  await pool.query("INSERT INTO reservation_history (reservation_id, guest_name, source, status, arrival_date) VALUES (gen_random_uuid(), 'Legacy Guest', 'Best Available Rate', 'RES', '2026-11-01')");
  await t('migration 028 applies cleanly TWICE (idempotent) and keeps pre-existing rows', async () => {
    file('database/migrations/028_sprint22_sync_engine.sql'); file('database/migrations/028_sprint22_sync_engine.sql');
    const r = (await pool.query("SELECT property_id, fingerprint, gone_at, last_changed_at IS NOT NULL AS lc FROM reservation_history")).rows; assert.strictEqual(r.length, 1); assert.deepStrictEqual([r[0].property_id, r[0].fingerprint, r[0].gone_at, r[0].lc], ['default', null, null, true]);
    for (const tb of ['reservation_events', 'sync_runs', 'sync_state']) assert.strictEqual((await pool.query('SELECT to_regclass($1) r', [tb])).rows[0].r, tb);
  });
  await t('label columns accept long values (were VARCHAR(50/100/200))', async () => {
    await pool.query("INSERT INTO reservation_history (reservation_id, source, guest_name, sub_label) VALUES (gen_random_uuid(), $1, $2, $3)", ['x'.repeat(300), 'y'.repeat(400), 'z'.repeat(300)]);
  });
  await t('the ORIGINAL runScrape.js upsert (29 columns, Sprint 18.5) still works on the migrated table, insert and update', async () => {
    const src = fs.readFileSync(ROOT + '/server/forecast/runScrape.js', 'utf8'); const m = src.match(/const q = `\s*(INSERT INTO reservation_history \([\s\S]*?)`;/); assert(m, 'upsert SQL found');
    const sql = m[1].replace('${placeholders.join(\',\')}', '(' + Array.from({ length: 29 }, (_, i) => `$${i + 1}`).join(',') + ')');
    const id = '11111111-1111-4111-8111-111111111111'; const vals = (status) => [id, 'C1', 'Ann Lee', 'p1', '2026-11-02', '2026-11-04', 2, 'r1', '101', '01', 'NQRR', 'NQRR', 'Double Queen Standard', 'Standard', 'BAR', status, 'Pending', 'future', null, null, false, false, false, false, false, false, false, false, null];
    await pool.query(sql, vals('RES')); await pool.query(sql, vals('INH'));
    const row = (await pool.query('SELECT status, guest_name, property_id, fingerprint FROM reservation_history WHERE reservation_id=$1', [id])).rows[0]; assert.deepStrictEqual([row.status, row.guest_name, row.property_id, row.fingerprint], ['INH', 'Ann Lee', 'default', null]);
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); await pool.end(); try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* ignore */ } sh(`rm -rf ${DIR}`); process.exit(process.exitCode || 0);
})().catch(async (e) => { console.error('HARNESS FAILED', e.stack); try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* ignore */ } process.exit(1); });
