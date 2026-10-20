// Sprint 22 — the sync engine against a REAL throwaway Postgres (initdb on port 5439) with a fake rGuest "world".
// Never touches rGuest or your database.   node tests/sync-engine.test.js "$PWD"
const ROOT = process.argv[2]; const assert = require('assert'); const { execSync } = require('child_process'); const fs = require('fs');
const PGBIN = '/opt/homebrew/opt/postgresql@14/bin', DIR = '/tmp/hopdb_sync', PORT = 5439;
const sh = (c) => execSync(c, { stdio: 'pipe' }).toString();
try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* not running */ } sh(`rm -rf ${DIR}`);
sh(`${PGBIN}/initdb -D ${DIR} -A trust -U postgres`); sh(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l /tmp/hopdb_sync.log -w start`);
const psql = (args) => sh(`${PGBIN}/psql -h 127.0.0.1 -p ${PORT} -U postgres ${args}`);
psql('-c "CREATE DATABASE hoptest"'); for (const f of ['tests/real-postgres/base.sql', 'database/migrations/025_sprint18_reservation_history.sql', 'database/migrations/028_sprint22_sync_engine.sql', 'database/migrations/029_sprint22_rollups.sql']) psql(`-d hoptest -v ON_ERROR_STOP=1 -q -f "${ROOT}/${f}"`);
const { Pool } = require(ROOT + '/server/node_modules/pg'); const real = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'hoptest' });
let queries = 0, connects = 0, failConnect = false, slowMs = 0; const pool = { query: (...a) => { queries++; return real.query(...a); }, connect: async () => { if (failConnect) { failConnect = false; throw new Error('db down'); } if (slowMs) await new Promise(r => setTimeout(r, slowMs)); connects++; const c = await real.connect(); const q = c.query.bind(c); c.query = (...a) => { queries++; return q(...a); }; return c; } };
const { createSyncEngine } = require(ROOT + '/server/sync/engine');

// ── fake rGuest world ──
const TODAY = '2026-10-12'; const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let seq = 0; const world = new Map();
const mk = (status, arr, dep, o = {}) => { const id = uuid(++seq); world.set(id, { id, status, arrivalDateLocalDate: arr, departureDateLocalDate: dep, confirmationId: 'C' + seq, roomType: 'rt1', ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'G', lastName: String(seq) }, ...o }); return id; };
for (let i = 0; i < 20; i++) mk('DPT', addDays(TODAY, -300 + i * 14), addDays(TODAY, -298 + i * 14));
for (let i = 0; i < 5; i++) mk('INH', addDays(TODAY, -1 - (i % 2)), addDays(TODAY, 1 + i), { roomNumber: String(100 + i), roomId: 'room1' });
for (let i = 0; i < 3; i++) mk('RES', TODAY, addDays(TODAY, 2));
for (let i = 0; i < 4; i++) mk('RES', addDays(TODAY, 1), addDays(TODAY, 3));
const futureIds = []; for (let i = 0; i < 40; i++) futureIds.push(mk('RES', addDays(TODAY, 5 + i * 7), addDays(TODAY, 7 + i * 7)));
for (let i = 0; i < 8; i++) mk('CXL', addDays(TODAY, 10 + i * 20), addDays(TODAY, 12 + i * 20));
const WORLD_SIZE = world.size;
const stat = { count: 0, slice: 0, resSlice: 0, detail: 0, other: 0 }; let completeRes = true, delayMs = 0, fatal = false;
const overlaps = (r, from, to) => r.arrivalDateLocalDate <= to && r.departureDateLocalDate >= from;
// real rGuest semantics (live-probed): RES [from,to) = every stay with a NIGHT in the range (arrival < to && departure > from); other statuses: inclusive days
const inSlice = (r, from, to, st) => st.includes(r.status) && (r.status === 'RES' ? (r.arrivalDateLocalDate < to && r.departureDateLocalDate > from) : overlaps(r, from, to));
const client = {
  async getPropertyDate() { stat.other++; if (fatal) throw Object.assign(new Error('bad creds'), { fatal: true }); return TODAY; },
  async listRooms() { stat.other++; return [{ id: 'room1', roomNumber: '101', floorId: '01' }]; }, async listRoomTypes() { stat.other++; return [{ id: 'rt1', typeCode: 'NQRR' }]; },
  async getRatePlans() { stat.other++; return [{ code: 'BAR', name: 'Best Available Rate' }]; }, async getVipStatuses() { stat.other++; return []; },
  async countSlice(from, to, st) { stat.count++; return [...world.values()].filter(r => inSlice(r, from, to, st)).length; },
  async fetchSliceExact(from, to, st) { if (delayMs) await new Promise(r => setTimeout(r, delayMs)); stat.slice++; if (st.includes('RES')) stat.resSlice++;
    const items = [...world.values()].filter(r => inSlice(r, from, to, st)).map(r => JSON.parse(JSON.stringify(r))).sort(() => Math.random() - 0.5);
    return { items, complete: st.includes('RES') ? completeRes : true, calls: 1 }; },
  async getReservationDetail(id) { stat.detail++; const r = world.get(id); if (!r || r.purged) throw Object.assign(new Error('404'), { status: 404 });
    return { id, status: r.status, reservationCreateTime: '2026-10-01T18:30:00Z', sourceInfo: { bookedBy: 'SiteMinder' }, cancellationInfo: r.status === 'CXL' ? { isNoShow: false } : null }; },
  clearLogs() {},
};
let nowMs = Date.parse('2026-10-12T19:30:00Z');   // 12:30 PM PT — inside the 5-minute window
const advance = (min) => { nowMs += min * 60000; };
const mkEngine = (c = client) => createSyncEngine({ getPool: () => pool, getClient: () => c, now: () => new Date(nowMs), logger: { error() {}, info() {}, warn() {} } });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const idle = async (eng) => { for (let i = 0; i < 2000; i++) { const s = await eng.getStatus(); if (!s.running) return s; await sleep(5); } throw new Error('engine did not become idle'); };
const q = async (sql, p) => (await real.query(sql, p)).rows;
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };

(async () => {
  const eng = mkEngine();
  await t('FULL sync: every reservation (past, in-house, future, cancelled) lands in the mirror; silent (no events); state initialised', async () => {
    await eng.trigger('full'); const s = await idle(eng);
    assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_history'))[0].n, WORLD_SIZE);
    assert.strictEqual((await q("SELECT count(*)::int n FROM reservation_history WHERE status='CXL'"))[0].n, 8);
    assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_events'))[0].n, 0, 'backfill is silent');
    const st = (await q('SELECT * FROM sync_state'))[0]; assert.strictEqual(st.initialized, true); assert.strictEqual(st.backfill.done, true);
    const run = (await q("SELECT * FROM sync_runs WHERE kind='full'"))[0]; assert(run && run.status === 'success' && run.fetched >= WORLD_SIZE, JSON.stringify(run));
    assert(s.state.backfillDone); assert.strictEqual((await q("SELECT count(*)::int n FROM reservation_history WHERE raw IS NOT NULL"))[0].n, WORLD_SIZE, 'raw rows stored');
  });
  await t('first tick after the backfill: frequent + hourly + reconcile all due; nothing changed → zero events, no false "gone"', async () => {
    const r = await eng.tick(); assert.deepStrictEqual(r.started, ['frequent', 'hourly', 'reconcile']); const s = await idle(eng);
    assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_events'))[0].n, 0); assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_history WHERE gone_at IS NOT NULL'))[0].n, 8, 'only the 8 cancelled rows are gone');
    assert(s.recentRuns.every(x => x.status === 'success'), JSON.stringify(s.recentRuns.map(x => [x.kind, x.status, x.error])));
  });
  await t('ACCURACY DATA: the daily reconcile records bookings on the books for the next 15 days (per room-type group) and yesterday\'s actual arrivals', async () => {
    const r = await q("SELECT horizon_days, booked, base_code, to_char(target_date,'YYYY-MM-DD') td FROM daily_rollups ORDER BY horizon_days"); assert.strictEqual(r.length, 15, '15 horizons × 1 group');
    const resOn = (d) => [...world.values()].filter(x => x.status === 'RES' && x.arrivalDateLocalDate === d).length;
    assert.strictEqual(r[0].booked, resOn(TODAY)); assert.strictEqual(r[1].booked, resOn(addDays(TODAY, 1))); assert.strictEqual(r[1].td, addDays(TODAY, 1)); assert.strictEqual(r[1].base_code, 'NQRR'); assert.strictEqual(r[14].td, addDays(TODAY, 14));
    const a = await q("SELECT arrivals, to_char(arrival_date,'YYYY-MM-DD') d FROM daily_actuals"); assert.deepStrictEqual(a.map(x => [x.d, x.arrivals]), [[addDays(TODAY, -1), [...world.values()].filter(x => ['INH', 'DPT'].includes(x.status) && x.arrivalDateLocalDate === addDays(TODAY, -1)).length]]);
  });
  await t('ACCURACY DATA is idempotent: a second reconcile the same day overwrites, it does not duplicate', async () => {
    await eng.trigger('reconcile'); await idle(eng); assert.strictEqual((await q('SELECT count(*)::int n FROM daily_rollups'))[0].n, 15); assert.strictEqual((await q('SELECT count(*)::int n FROM daily_actuals'))[0].n, 1);
  });
  await t('a frequent tick with NOTHING changed touches the database zero times (Neon can sleep)', async () => {
    advance(5); const q0 = queries, c0 = connects; const r = await eng.tick(); assert.deepStrictEqual(r.started, ['frequent']); const s = await idle(eng);
    assert.strictEqual(queries, q0, 'no queries'); assert.strictEqual(connects, c0, 'no connections'); assert.strictEqual(s.recentRuns[0].kind, 'frequent'); assert.strictEqual(s.recentRuns[0].new_count + s.recentRuns[0].changed, 0);
    advance(1); const q1 = queries; assert.strictEqual((await eng.tick()).started.length, 0); assert.strictEqual(queries, q1, 'a tick with nothing due is DB-free too');
  });
  let newId;
  await t('NEW booking: detected on the next 5-minute scan, enriched (created time / booked by), held in memory — written at the flush interval, not on every scan', async () => {
    newId = mk('RES', addDays(TODAY, 1), addDays(TODAY, 2)); advance(5); const q0 = queries; await eng.tick(); let s = await idle(eng);
    assert.strictEqual(s.pending.events, 1); assert.strictEqual(queries, q0, 'write-behind: nothing written yet'); assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_history WHERE reservation_id=$1', [newId]))[0].n, 0);
    advance(16); await eng.tick(); s = await idle(eng);   // flush interval (15 min) passed
    const row = (await q('SELECT * FROM reservation_history WHERE reservation_id=$1', [newId]))[0]; assert(row, 'row written'); assert.strictEqual(row.booked_by, 'SiteMinder'); assert(row.pms_created_at); assert.strictEqual(row.status, 'RES'); assert(row.fingerprint);
    const ev = await q("SELECT * FROM reservation_events WHERE reservation_id=$1", [newId]); assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].event_type, 'new'); assert.strictEqual(ev[0].info.booked_by, 'SiteMinder'); assert(!JSON.stringify(ev[0].info).includes('G'), 'no guest name in events');
    assert.strictEqual(s.pending.events, 0);
  });
  let arrivedId, departedId;
  await t('ARRIVED (RES→INH) and DEPARTED (INH→DPT) are recognised without extra list calls (detail lookup of the vanished row)', async () => {
    arrivedId = [...world.values()].find(r => r.status === 'RES' && r.arrivalDateLocalDate === TODAY).id; world.get(arrivedId).status = 'INH'; world.get(arrivedId).roomNumber = '105'; world.get(arrivedId).roomId = 'room1';
    departedId = [...world.values()].find(r => r.status === 'INH' && r.id !== arrivedId).id; world.get(departedId).status = 'DPT';
    advance(5); await eng.tick(); await idle(eng); advance(16); await eng.tick(); await idle(eng);
    const ev = await q("SELECT reservation_id, event_type FROM reservation_events WHERE reservation_id = ANY($1) ORDER BY event_id", [[arrivedId, departedId]]);
    assert(ev.some(e => e.reservation_id === arrivedId && e.event_type === 'arrived'), JSON.stringify(ev)); assert(ev.some(e => e.reservation_id === departedId && e.event_type === 'departed'), JSON.stringify(ev));
    assert.strictEqual((await q('SELECT status FROM reservation_history WHERE reservation_id=$1', [departedId]))[0].status, 'DPT');
  });
  let cxlId;
  await t('CANCELLED future booking: count-gate catches it hourly, row is KEPT (status CXL, gone_at, reason), event written', async () => {
    cxlId = futureIds[10]; world.get(cxlId).status = 'CXL'; const before = (await q('SELECT count(*)::int n FROM reservation_history'))[0].n;
    advance(61); await eng.tick(); await idle(eng);
    const row = (await q('SELECT status, gone_at, gone_reason FROM reservation_history WHERE reservation_id=$1', [cxlId]))[0]; assert.strictEqual(row.status, 'CXL'); assert(row.gone_at); assert.strictEqual(row.gone_reason, 'cancelled');
    assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_history'))[0].n, before, 'nothing deleted');
    assert((await q("SELECT 1 FROM reservation_events WHERE reservation_id=$1 AND event_type='cancelled'", [cxlId])).length === 1);
  });
  await t('COUNT-GATE efficiency: an hourly run with no changes re-fetches no 30-day slice (counts + the 14-day near window + in-house only)', async () => {
    advance(61); Object.assign(stat, { count: 0, resSlice: 0, slice: 0 }); await eng.tick(); const st2 = await idle(eng); const hr = st2.recentRuns.find(r => r.kind === 'hourly');
    assert(stat.count >= 13, 'every 30-day slice counted: ' + stat.count); assert.strictEqual(hr.details.slices.refetched.length, 0, 'no 30-day slice re-fetched: ' + JSON.stringify(hr.details.slices)); assert.strictEqual(stat.resSlice, 2, 'the frequent scan (today+tomorrow) + the hourly exact near-term window (next 14 days) — nothing else'); assert(stat.slice <= 4, 'frequent RES+INH and hourly near+INH only: ' + stat.slice);
  });
  await t('CHANGED reservation (room assigned, dates moved) → one "changed" event with old/new values', async () => {
    const id = futureIds[0]; Object.assign(world.get(id), { roomNumber: '101', roomId: 'room1', departureDateLocalDate: addDays(world.get(id).departureDateLocalDate, 1) });
    advance(61); await eng.tick(); await idle(eng); const ev = await q("SELECT * FROM reservation_events WHERE reservation_id=$1", [id]); assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].event_type, 'changed');
    assert.deepStrictEqual(ev[0].changes.room_number, [null, '101']); assert(ev[0].changes.departure_date && ev[0].changes.nights);
  });
  await t('far-out edits (beyond the near window) that keep the slice count are caught by the daily RECONCILE, not the hourly gate', async () => {
    const id = futureIds[30]; Object.assign(world.get(id), { roomNumber: '102', roomId: 'room1' });
    advance(61); await eng.tick(); await idle(eng); assert.strictEqual((await q("SELECT count(*)::int n FROM reservation_events WHERE reservation_id=$1", [id]))[0].n, 0, 'hourly gate cannot see it');
    await eng.trigger('reconcile'); await idle(eng); const ev = await q("SELECT * FROM reservation_events WHERE reservation_id=$1", [id]); assert.strictEqual(ev.length, 1); assert.deepStrictEqual(ev[0].changes.room_number, [null, '102']);
  });
  await t('INCOMPLETE slice fetch never marks anything gone (run is "partial"); the next complete run does (404 → not_found)', async () => {
    const id = futureIds[20]; world.get(id).purged = true; world.get(id).status = 'CXL'; world.delete(id);   // disappears from rGuest entirely
    completeRes = false; advance(61); await eng.tick(); let s = await idle(eng);
    assert.strictEqual((await q('SELECT gone_at FROM reservation_history WHERE reservation_id=$1', [id]))[0].gone_at, null, 'not marked while the fetch was incomplete'); assert(s.recentRuns.some(r => r.kind === 'hourly' && r.status === 'partial'), JSON.stringify(s.recentRuns.map(r => [r.kind, r.status])));
    completeRes = true; advance(61); await eng.tick(); s = await idle(eng);
    const row = (await q('SELECT gone_at, gone_reason FROM reservation_history WHERE reservation_id=$1', [id]))[0]; assert(row.gone_at); assert.strictEqual(row.gone_reason, 'not_found');
  });
  await t('RESTART: a new engine resumes from the database (no backfill re-run); legacy rows without a fingerprint are adopted silently', async () => {
    const legacyId = mk('RES', addDays(TODAY, 2), addDays(TODAY, 4));
    await q(`INSERT INTO reservation_history (reservation_id, status, arrival_date, departure_date, guest_name, property_id) VALUES ($1,'RES',$2,$3,'Old Row','default')`, [legacyId, addDays(TODAY, 2), addDays(TODAY, 4)]);
    const evBefore = (await q('SELECT count(*)::int n FROM reservation_events'))[0].n, runsBefore = (await q("SELECT count(*)::int n FROM sync_runs WHERE kind IN ('backfill','full')"))[0].n;
    const eng2 = mkEngine(); advance(5); const s0 = await eng2.getStatus(); assert(s0.state.backfillDone && s0.state.initialized, 'state restored from sync_state'); assert(s0.indexSize > 40);
    advance(61); await eng2.tick(); await idle(eng2); await eng2.flushNow();
    assert.strictEqual((await q("SELECT count(*)::int n FROM sync_runs WHERE kind IN ('backfill','full')"))[0].n, runsBefore, 'no backfill re-run');
    assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_events WHERE reservation_id=$1', [legacyId]))[0].n, 0, 'legacy row adopted without an event'); assert((await q('SELECT fingerprint FROM reservation_history WHERE reservation_id=$1', [legacyId]))[0].fingerprint, 'fingerprint now set');
    assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_events'))[0].n, evBefore);
  });
  await t('FLUSH SAFETY: a failed write keeps everything in memory and the retry writes it exactly once; writes arriving DURING a flush are not lost', async () => {
    await eng.flushNow(); const id1 = mk('RES', addDays(TODAY, 1), addDays(TODAY, 2)); advance(5); const tk = await eng.trigger('frequent'); const s0 = await idle(eng); assert(s0.pending.events >= 1, JSON.stringify({ tk, pending: s0.pending, runs: s0.recentRuns.slice(0, 3).map(r => [r.kind, r.status, r.new_count, r.error]), lastFlush: s0.lastFlushAt, now: s0.now }));
    failConnect = true; await assert.rejects(() => eng.flushNow(), /db down/); let s = await eng.getStatus(); assert(s.pending.events >= 1, 'still pending after the failed flush'); assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_history WHERE reservation_id=$1', [id1]))[0].n, 0);
    const id2 = mk('RES', addDays(TODAY, 1), addDays(TODAY, 3)); slowMs = 120; const flushing = eng.flushNow(); await sleep(20); advance(5); await eng.trigger('frequent'); await sleep(60);   // a scan adds id2 while the flush is in flight
    await flushing; slowMs = 0; await idle(eng); await eng.flushNow();
    for (const id of [id1, id2]) { assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_history WHERE reservation_id=$1', [id]))[0].n, 1, id); assert.strictEqual((await q("SELECT count(*)::int n FROM reservation_events WHERE reservation_id=$1 AND event_type='new'", [id]))[0].n, 1, 'exactly one new-event for ' + id); }
  });
  await t('status exposes what the panel needs: last scheduler ping, tick count, boot time, next-due times', async () => {
    const before = (await eng.getStatus()).tickCount; advance(1); await eng.tick(); await idle(eng); const s = await eng.getStatus();
    assert.strictEqual(s.tickCount, before + 1); assert.strictEqual(s.lastTickAt, new Date(nowMs).toISOString()); assert(s.bootedAt); assert(s.nextDue.frequent && s.nextDue.hourly && s.nextDue.reconcile, JSON.stringify(s.nextDue));
  });
  await t('settings: validated, persisted to app_settings, and they change the schedule (flush interval, window)', async () => {
    const bad = await eng.updateSettings({ frequent: { everyMinutes: 0 } }); assert.strictEqual(bad.ok, false);
    const ok = await eng.updateSettings({ frequent: { from: '08:00', to: '20:00', everyMinutes: 10 }, flushEveryMinutes: 30 }); assert.strictEqual(ok.ok, true);
    const stored = JSON.parse((await q("SELECT value FROM app_settings WHERE key='sync_settings'"))[0].value); assert.strictEqual(stored.frequent.everyMinutes, 10); assert.strictEqual(stored.flushEveryMinutes, 30);
    await eng.updateSettings({ frequent: { from: '12:00', to: '24:00', everyMinutes: 5 }, flushEveryMinutes: 15 });
  });
  await t('overlapping pings are safe: a second tick while a run is in progress is told "busy"', async () => {
    delayMs = 40; advance(61); const r1 = await eng.tick(); const r2 = await eng.tick(); assert(r1.started.length > 0); assert(/busy/.test(r2.reason), JSON.stringify(r2)); await idle(eng); delayMs = 0;
  });
  await t('rGuest auth failure pauses the engine (persisted) and stops all further calls — no retry loop', async () => {
    const eng3 = mkEngine(); fatal = true; advance(61); await eng3.tick(); await idle(eng3); const s = await eng3.getStatus();
    assert.strictEqual(s.settings.paused, true); assert(s.authFailure); assert.strictEqual(JSON.parse((await q("SELECT value FROM app_settings WHERE key='sync_settings'"))[0].value).paused, true);
    const calls = stat.other; advance(61); const r = await eng3.tick(); assert.deepStrictEqual(r, { started: [], reason: 'paused' }); assert.strictEqual(stat.other, calls, 'no calls while paused');
    fatal = false; const res = await eng3.updateSettings({ paused: false }); assert.strictEqual(res.ok, true); advance(61); assert((await eng3.tick()).started.length > 0, 'resumes after an admin un-pauses');
    await idle(eng3);
  });
  await t('manual run: unknown kind rejected, known kinds start; "full" is repeatable and idempotent (row count unchanged)', async () => {
    await assert.rejects(() => eng.trigger('nope'), /unknown kind/); const n0 = (await q('SELECT count(*)::int n FROM reservation_history'))[0].n; const ev0 = (await q('SELECT count(*)::int n FROM reservation_events'))[0].n;
    await eng.trigger('full'); await idle(eng); assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_history'))[0].n, n0 + 0 /* world rows incl. legacy */); assert.strictEqual((await q('SELECT count(*)::int n FROM reservation_events'))[0].n, ev0, 'a re-run of the full load emits no events');
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
  await real.end(); try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* ignore */ } sh(`rm -rf ${DIR}`); process.exit(process.exitCode || 0);
})().catch(async (e) => { console.error('HARNESS FAILED', e.stack); try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* ignore */ } process.exit(1); });
