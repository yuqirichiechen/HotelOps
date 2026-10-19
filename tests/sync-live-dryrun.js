// Sprint 22 — LIVE dry run: the real rGuest (read-only calls, ONE login) → the sync engine → a THROWAWAY local Postgres.
// Validates the mirror against rGuest's own numbers. Never writes to rGuest or to your real database.
//   node tests/sync-live-dryrun.js "$PWD" [monthsBack=3]
const ROOT = process.argv[2]; const MONTHS = +(process.argv[3] || 3); const assert = require('assert'); const { execSync } = require('child_process');
const PGBIN = '/opt/homebrew/opt/postgresql@14/bin', DIR = '/tmp/hopdb_live', PORT = 5438; const sh = (c) => execSync(c, { stdio: 'pipe' }).toString();
try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* not running */ } sh(`rm -rf ${DIR}`); sh(`${PGBIN}/initdb -D ${DIR} -A trust -U postgres`);
sh(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l /tmp/hopdb_live.log -w start`);
const psql = (a) => sh(`${PGBIN}/psql -h 127.0.0.1 -p ${PORT} -U postgres ${a}`); psql('-c "CREATE DATABASE hoptest"');
for (const f of ['tests/real-postgres/base.sql', 'database/migrations/025_sprint18_reservation_history.sql', 'database/migrations/028_sprint22_sync_engine.sql']) psql(`-d hoptest -v ON_ERROR_STOP=1 -q -f "${ROOT}/${f}"`);
require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env', override: true });
const { Pool } = require(ROOT + '/server/node_modules/pg'); const pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'hoptest' });
const { createAgilysysClient } = require(ROOT + '/server/agilysys/client'); const { createSyncEngine } = require(ROOT + '/server/sync/engine');
const client = createAgilysysClient(); const eng = createSyncEngine({ getPool: () => pool, getClient: () => client, logger: console });
const q = async (s, p) => (await pool.query(s, p)).rows; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const idle = async () => { for (let i = 0; i < 60000; i++) { const s = await eng.getStatus(); if (!s.running) return s; await sleep(200); } throw new Error('timeout'); };
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
(async () => {
  try {
    await eng.updateSettings({ backfill: { monthsBack: MONTHS } });
    const t0 = Date.now(); await eng.trigger('full'); let s = await idle(); const full = s.recentRuns.find(r => r.kind === 'full');
    console.log(`FULL (${MONTHS} months back + 400 days ahead): status=${full.status} complete=${full.complete} calls=${full.calls} fetched=${full.fetched} duration=${Math.round((Date.now() - t0) / 1000)} s | error=${full.error || '-'}`);
    const byStatus = await q('SELECT status, count(*)::int n FROM reservation_history GROUP BY 1 ORDER BY 1'); console.log('mirror by status:', JSON.stringify(byStatus), '| incomplete chunks:', JSON.stringify(s.state.backfill.incomplete));
    const today = String(await client.getPropertyDate()).slice(0, 10), end = addDays(today, 400);
    // 1) rGuest's OWN total (totalElements, a separate field from the rows) vs the mirror, for RES stays with a night in [today, end)
    const total = await client.countSlice(today, end, ['RES']);
    const mirrorN = (await q("SELECT count(*)::int n FROM reservation_history WHERE status='RES' AND arrival_date < $2 AND departure_date > $1", [today, end]))[0].n;
    const live = await client.fetchSliceExact(today, end, ['RES']); const liveIds = new Set(live.items.map(x => x.id));
    const mirror = await q("SELECT reservation_id FROM reservation_history WHERE status='RES' AND arrival_date < $2 AND departure_date > $1", [today, end]); const mirrorIds = new Set(mirror.map(r => r.reservation_id));
    const missing = [...liveIds].filter(id => !mirrorIds.has(id)), extra = [...mirrorIds].filter(id => !liveIds.has(id));
    console.log(`future RES (a night in [${today}, ${end})): rGuest totalElements ${total} | exact fetch ${liveIds.size} (complete=${live.complete}) | mirror ${mirrorN} | missing from mirror ${missing.length} | extra in mirror ${extra.length}`);
    // 2) in-house matches
    const inh = await client.fetchSliceExact(today, today, ['INH']); const mInh = (await q("SELECT count(*)::int n FROM reservation_history WHERE status='INH'"))[0].n; console.log(`in-house: rGuest ${inh.items.length} | mirror ${mInh}`);
    // 3) typed columns look right
    const sample = await q("SELECT confirmation_id, type_code, base_code, status, arrival_date::text, departure_date::text, nights, room_number, floor_id, source, (raw IS NOT NULL) has_raw FROM reservation_history WHERE status='RES' ORDER BY arrival_date LIMIT 3"); console.log('sample rows:', JSON.stringify(sample));
    const nulls = (await q("SELECT count(*) FILTER (WHERE type_code IS NULL)::int no_type, count(*) FILTER (WHERE arrival_date IS NULL)::int no_arr, count(*) FILTER (WHERE fingerprint IS NULL)::int no_fp, count(*) FILTER (WHERE status='CXL' AND gone_at IS NULL)::int cxl_not_gone FROM reservation_history"))[0]; console.log('integrity:', JSON.stringify(nulls));
    // 4) second pass finds (almost) nothing: hourly + frequent + reconcile
    for (const k of ['hourly', 'frequent', 'reconcile']) { await eng.trigger(k); s = await idle(); const r = s.recentRuns.find(x => x.kind === k); console.log(`${k}: status=${r.status} calls=${r.calls} fetched=${r.fetched} new=${r.new_count} changed=${r.changed} gone=${r.gone} unchanged=${r.unchanged} ${r.duration_ms} ms details=${JSON.stringify(r.details).slice(0, 220)}`); }
    await eng.flushNow(); const ev = await q('SELECT event_type, count(*)::int n FROM reservation_events GROUP BY 1'); console.log('events after the second pass:', JSON.stringify(ev));
    const ok = missing.length === 0 && extra.length === 0 && total === liveIds.size && live.complete && mInh === inh.items.length && nulls.no_type === 0 && nulls.cxl_not_gone === 0;
    console.log(ok ? '\nLIVE DRY RUN: PASS' : '\nLIVE DRY RUN: CHECK THE LINES ABOVE'); process.exitCode = ok ? 0 : 1;
  } catch (e) { console.error('FAILED', e.stack); process.exitCode = 1; }
  await pool.end(); try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* ignore */ } sh(`rm -rf ${DIR}`); process.exit(process.exitCode || 0);
})();
