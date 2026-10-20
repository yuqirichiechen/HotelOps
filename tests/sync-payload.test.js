// Sprint 22.3 — the Forecast/Reservations payload built from the mirror equals what a full scrape would have produced, and reflects
// status changes the sync made. REAL throwaway Postgres + fake rGuest.   node tests/sync-payload.test.js "$PWD"
const ROOT = process.argv[2]; const assert = require('assert'); const { execSync } = require('child_process');
const PGBIN = '/opt/homebrew/opt/postgresql@14/bin', DIR = '/tmp/hopdb_payload', PORT = 5436; const sh = (c) => execSync(c, { stdio: 'pipe' }).toString();
try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* not running */ } sh(`rm -rf ${DIR}`); sh(`${PGBIN}/initdb -D ${DIR} -A trust -U postgres`);
sh(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l /tmp/hopdb_payload.log -w start`);
const psql = (a) => sh(`${PGBIN}/psql -h 127.0.0.1 -p ${PORT} -U postgres ${a}`); psql('-c "CREATE DATABASE hoptest"');
for (const f of ['tests/real-postgres/base.sql', 'database/migrations/025_sprint18_reservation_history.sql', 'database/migrations/028_sprint22_sync_engine.sql', 'database/migrations/029_sprint22_rollups.sql']) psql(`-d hoptest -v ON_ERROR_STOP=1 -q -f "${ROOT}/${f}"`);
const { Pool } = require(ROOT + '/server/node_modules/pg'); const pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'hoptest' });
const { createSyncEngine } = require(ROOT + '/server/sync/engine'); const { buildMirrorPayload } = require(ROOT + '/server/sync/payload'); const { computeForecast } = require(ROOT + '/server/forecast/compute');
const TODAY = '2026-10-12'; const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`; let seq = 0; const world = new Map();
const mk = (status, arr, dep, o = {}) => { const id = uuid(++seq); world.set(id, { id, status, arrivalDateLocalDate: arr, departureDateLocalDate: dep, arrivalDate: arr + 'T07:00:00Z', departureDate: dep + 'T07:00:00Z', confirmationId: 'C' + seq, roomType: 'rt1', ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'G', lastName: String(seq) }, ...o }); return id; };
const rooms = [101, 102, 103, 104].map(n => ({ id: 'room' + n, roomNumber: String(n), roomTypeId: 'rt1', floorId: '01', status: true, isDeleted: false, currentOccupancyStatus: n < 103 ? 'OCC' : 'VAC', housekeepingRoomStatus: n < 103 ? 'OC' : 'VI' }));
const inh1 = mk('INH', addDays(TODAY, -1), addDays(TODAY, 2), { roomNumber: '101', roomId: 'room101' }), inh2 = mk('INH', addDays(TODAY, -1), TODAY, { roomNumber: '102', roomId: 'room102' });
const arrToday = mk('RES', TODAY, addDays(TODAY, 2)); mk('RES', TODAY, addDays(TODAY, 1), { roomNumber: '103', roomId: 'room103' }); for (let i = 0; i < 3; i++) mk('RES', addDays(TODAY, 1), addDays(TODAY, 3)); for (let i = 0; i < 5; i++) mk('RES', addDays(TODAY, 20 + i * 30), addDays(TODAY, 22 + i * 30));
mk('DPT', addDays(TODAY, -2), TODAY); mk('DPT', addDays(TODAY, -9), addDays(TODAY, -7)); mk('CXL', addDays(TODAY, 5), addDays(TODAY, 7));
const overlaps = (r, a, b) => r.arrivalDateLocalDate <= b && r.departureDateLocalDate >= a;
const inSlice = (r, a, b, st) => st.includes(r.status) && (r.status === 'RES' ? (r.arrivalDateLocalDate < b && r.departureDateLocalDate > a) : overlaps(r, a, b));
const client = { async getPropertyDate() { return TODAY; }, async listRooms() { return JSON.parse(JSON.stringify(rooms)); }, async listRoomTypes() { return [{ id: 'rt1', typeCode: 'NQRR', name: 'Double Queen Standard' }]; }, async getRatePlans() { return [{ code: 'BAR', name: 'Best Available Rate' }]; }, async getVipStatuses() { return []; },
  async getReservationMetrics() { return null; }, async countSlice(a, b, st) { return [...world.values()].filter(r => inSlice(r, a, b, st)).length; },
  async fetchSliceExact(a, b, st) { return { items: [...world.values()].filter(r => inSlice(r, a, b, st)).map(r => JSON.parse(JSON.stringify(r))), complete: true, calls: 1 }; },
  async getReservationDetail(id) { const r = world.get(id); if (!r) throw Object.assign(new Error('404'), { status: 404 }); return { id, status: r.status, reservationCreateTime: '2026-10-01T18:30:00Z', sourceInfo: { bookedBy: 'SiteMinder' } }; }, clearLogs() {} };
let nowMs = Date.parse('2026-10-12T19:30:00Z'); const eng = createSyncEngine({ getPool: () => pool, getClient: () => client, now: () => new Date(nowMs), logger: { error() {}, info() {}, warn() {} } });
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); const idle = async () => { for (let i = 0; i < 2000; i++) { const s = await eng.getStatus(); if (!s.running) return s; await sleep(5); } throw new Error('not idle'); };
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.message.split('\n').slice(0, 25).join(' | ')); process.exitCode = 1; } };
const key = (p) => p.reservations.map(r => [r.id, r.kind, r.status, r.typeCode, r.arrivalDate, r.departureDate, r.roomNumber || null].join('|')).sort();
(async () => {
  await t('mirror is not "ready" before the first full load; ready after it', async () => {
    await eng.ensureHydrated(); assert.strictEqual(eng.isMirrorReady(), false); await eng.trigger('full'); await idle(); await eng.tick(); await idle(); assert.strictEqual(eng.isMirrorReady(), true); assert(eng.syncedAt());
  });
  await t('PAYLOAD FROM THE MIRROR == a full scrape\'s payload for the same rGuest data (reservations, kinds, KPIs, rooms)', async () => {
    const reference = await eng.getReference(client); const mirror = await buildMirrorPayload({ pool, client, propertyKey: 'default', reference });
    const direct = computeForecast({ rooms: JSON.parse(JSON.stringify(rooms)), roomTypes: await client.listRoomTypes(), reservations: [...world.values()].map(r => JSON.parse(JSON.stringify(r))), metrics: null, vipStatuses: [], ratePlans: await client.getRatePlans(),
      roomTypeMapping: (await pool.query('SELECT * FROM room_type_mapping')).rows, config: (await pool.query('SELECT * FROM forecast_config')).rows[0], forecastDate: TODAY });
    const km = key(mirror), kd = key(direct); assert.deepStrictEqual(km, kd, 'only mirror: ' + JSON.stringify(km.filter(x => !kd.includes(x))) + ' | only direct: ' + JSON.stringify(kd.filter(x => !km.includes(x)))); assert.deepStrictEqual(mirror.kpis, direct.kpis); assert.deepStrictEqual(mirror.byRoomType, direct.byRoomType); assert.strictEqual(mirror.forecastDate, TODAY);
    assert.strictEqual(mirror.source, 'mirror'); assert.strictEqual(mirror.futureWindowDays, 365); assert(mirror.reservations.some(r => r.kind === 'future') && mirror.reservations.some(r => r.kind === 'arrival') && mirror.reservations.some(r => r.kind === 'stayover'));
    assert(!mirror.reservations.some(r => r.status === 'CXL'), 'cancelled rows never reach the pages');
  });
  await t('typed status wins over the stored raw row: an arrival the sync recorded (RES→INH) shows as in-house; a departure as departed', async () => {
    world.get(arrToday).status = 'INH'; world.get(arrToday).roomNumber = '104'; world.get(arrToday).roomId = 'room104'; world.get(inh2).status = 'DPT';
    nowMs += 6 * 60000; await eng.trigger('frequent'); await idle(); await eng.flushNow();
    const raw = (await pool.query('SELECT raw->>\'status\' AS raw_status, status FROM reservation_history WHERE reservation_id=$1', [inh2])).rows[0]; assert.strictEqual(raw.status, 'DPT'); assert.strictEqual(raw.raw_status, 'INH', 'raw row is the older scan (only the typed column was patched)');
    const p = await buildMirrorPayload({ pool, client, propertyKey: 'default', reference: await eng.getReference(client) }); const r = Object.fromEntries(p.reservations.map(x => [x.id, x]));
    assert.strictEqual(r[arrToday].status, 'INH'); assert.strictEqual(r[inh2].status, 'DPT');
  });
  await t('rows without a stored raw payload (legacy / raw storage off) are skipped, never half-built', async () => {
    await pool.query(`INSERT INTO reservation_history (reservation_id, status, arrival_date, departure_date, guest_name) VALUES ($1,'RES',$2,$3,'Legacy Only')`, [uuid(999), addDays(TODAY, 4), addDays(TODAY, 5)]);
    const p = await buildMirrorPayload({ pool, client, propertyKey: 'default', reference: await eng.getReference(client) }); assert(!p.reservations.some(r => r.id === uuid(999)));
  });
  await t('"ready" requires raw rows kept and a sync within 24 h', async () => {
    assert.strictEqual(eng.isMirrorReady(), true); nowMs += 25 * 3600e3; assert.strictEqual(eng.isMirrorReady(), false, 'stale mirror → pages fall back to the last snapshot'); nowMs -= 25 * 3600e3;
    await eng.updateSettings({ storeRaw: false }); assert.strictEqual(eng.isMirrorReady(), false); await eng.updateSettings({ storeRaw: true });
  });
  await t('flushPending writes only when something is waiting; the onFlushed hook fires with counts (used for guest-detail refresh); a throwing hook is harmless', async () => {
    const seen = []; eng.setOnFlushed(async (out) => { seen.push(out); throw new Error('hook boom'); });
    assert.strictEqual(await eng.flushPending(), null, 'nothing pending → no write');
    mk('RES', addDays(TODAY, 1), addDays(TODAY, 2)); nowMs += 6 * 60000; await eng.trigger('frequent'); await idle(); assert((await eng.getStatus()).pending.events >= 1);
    const out = await eng.flushPending(); assert(out && out.wrote >= 1); await sleep(30); assert(seen.length >= 1 && seen[seen.length - 1].wrote >= 1); eng.setOnFlushed(null);
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); await pool.end(); try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* ignore */ } sh(`rm -rf ${DIR}`); process.exit(process.exitCode || 0);
})().catch(async (e) => { console.error('HARNESS FAILED', e.stack); try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* ignore */ } process.exit(1); });
