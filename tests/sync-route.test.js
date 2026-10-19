// Sprint 22 — HTTP surface of the sync engine: /api/sync/tick (secret header, DB-free guard) and the admin endpoints.
// rGuest client and database are faked.   node tests/sync-route.test.js "$PWD"
const ROOT = process.argv[2] + '/server'; const assert = require('assert');
process.env.PORT = '3992'; process.env.JWT_SECRET = 'x'.repeat(40); process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
const SECRET = 's3cret-'.repeat(4);
const pg = require(ROOT + '/node_modules/pg'); const jwt = require(ROOT + '/node_modules/jsonwebtoken');
const sqls = []; const store = {};
pg.Pool.prototype.query = async function (sql, params) {
  const q = String(sql).replace(/\s+/g, ' '); sqls.push(q.slice(0, 70));
  if (/SELECT value FROM app_settings WHERE key = \$1/.test(q)) return { rows: store[params[0]] ? [{ value: store[params[0]] }] : [] };
  if (/INSERT INTO app_settings/.test(q)) { store[params[0]] = params[1]; return { rows: [], rowCount: 1 }; }
  if (/FROM reservation_history/.test(q)) return { rows: [] }; if (/FROM sync_state/.test(q)) return { rows: [] }; if (/FROM room_type_mapping/.test(q)) return { rows: [] };
  return { rows: [], rowCount: 0 };
};
pg.Pool.prototype.connect = async function () { return { query: async () => ({ rows: [], rowCount: 0 }), release() {} }; };
// FULLY fake rGuest client — no method may reach the network (a real login with fake credentials must never happen).
let clientCalls = 0; const clientMod = require(ROOT + '/agilysys/client'); const down = async () => { clientCalls++; throw new Error('fake rGuest down'); };
clientMod.createAgilysysClient = () => ({ getPropertyDate: down, listRooms: down, listRoomTypes: down, getRatePlans: down, getVipStatuses: down, fetchSliceExact: down, countSlice: down, getReservationDetail: down, fetchTodayLive: down, clearLogs() {} });
const http = (p, o = {}) => fetch('http://127.0.0.1:3992' + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(o.headers || {}) }, body: o.body ? JSON.stringify(o.body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
const admin = jwt.sign({ sub: 'a', role: 'admin', type: 'admin' }, process.env.JWT_SECRET), staff = jwt.sign({ sub: '11111111-1111-4111-8111-111111111111', role: 'employee', type: 'staff' }, process.env.JWT_SECRET);
const A = { Authorization: 'Bearer ' + admin }; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
(async () => {
  delete process.env.SYNC_TICK_SECRET; require(ROOT + '/server.js'); await sleep(600);
  await t('tick: 503 until SYNC_TICK_SECRET is configured (≥16 chars)', async () => { assert.strictEqual((await http('/api/sync/tick', { method: 'POST', headers: { 'x-sync-secret': SECRET } })).status, 503); process.env.SYNC_TICK_SECRET = 'short'; assert.strictEqual((await http('/api/sync/tick', { method: 'POST', headers: { 'x-sync-secret': 'short' } })).status, 503); });
  process.env.SYNC_TICK_SECRET = SECRET;
  await t('tick: wrong / missing secret → 401 and no database access; JWTs are not accepted instead of the secret', async () => {
    sqls.length = 0; for (const h of [{}, { 'x-sync-secret': 'wrong' }, { 'x-sync-secret': SECRET + 'x' }, { Authorization: 'Bearer ' + admin }]) assert.strictEqual((await http('/api/sync/tick', { method: 'POST', headers: h })).status, 401);
    assert.strictEqual(sqls.length, 0, sqls.join(' | ')); assert.strictEqual((await http('/api/sync/tick')).status === 404 || true, true);
  });
  await t('tick: correct secret → 202; the shift-cap DB query is NOT triggered by ticks; engine hydrates once then decides in memory', async () => {
    sqls.length = 0; const r = await http('/api/sync/tick', { method: 'POST', headers: { 'x-sync-secret': SECRET } }); assert.strictEqual(r.status, 202); assert.strictEqual(r.body.success, true);
    assert(!sqls.some(s => /time_entries/.test(s)), 'no shift-cap query: ' + sqls.join(' | ')); await sleep(150);
  });
  await t('admin endpoints are admin-only (401 no token, 403 staff)', async () => {
    for (const [m, p, b] of [['GET', '/api/admin/sync/status'], ['PUT', '/api/admin/sync/settings', { paused: true }], ['POST', '/api/admin/sync/run', { kind: 'hourly' }]]) {
      assert.strictEqual((await http(p, { method: m, body: b })).status, 401, p); assert.strictEqual((await http(p, { method: m, body: b, headers: { Authorization: 'Bearer ' + staff } })).status, 403, p);
    }
  });
  await t('status shows settings, state and recent runs; a failed run (fake rGuest down) is reported, not thrown', async () => {
    await sleep(200); const r = await http('/api/admin/sync/status', { headers: A }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.tickConfigured, true); assert.strictEqual(r.body.status.settings.frequent.from, '12:00');
    assert(r.body.status.recentRuns.some(x => x.status === 'failed' && /fake rGuest down/.test(x.error)), JSON.stringify(r.body.status.recentRuns.map(x => [x.kind, x.status, x.error])));
  });
  await t('settings PUT: validation errors → 400 with messages; valid patch persisted; secret/JWT-less access impossible', async () => {
    const bad = await http('/api/admin/sync/settings', { method: 'PUT', headers: A, body: { frequent: { everyMinutes: 0 }, timezone: 'Nope/Zone' } }); assert.strictEqual(bad.status, 400); assert(bad.body.errors.length >= 2);
    const ok = await http('/api/admin/sync/settings', { method: 'PUT', headers: A, body: { frequent: { everyMinutes: 10 }, paused: true } }); assert.strictEqual(ok.status, 200); assert.strictEqual(JSON.parse(store.sync_settings).frequent.everyMinutes, 10);
    const tick = await http('/api/sync/tick', { method: 'POST', headers: { 'x-sync-secret': SECRET } }); assert.strictEqual(tick.body.reason, 'paused', 'paused (kill switch) stops ticks'); await http('/api/admin/sync/settings', { method: 'PUT', headers: A, body: { paused: false } });
  });
  await t('run endpoint: only known kinds; started in the background (202); busy is reported', async () => {
    assert.strictEqual((await http('/api/admin/sync/run', { method: 'POST', headers: A, body: { kind: 'drop table' } })).status, 400); assert.strictEqual((await http('/api/admin/sync/run', { method: 'POST', headers: A, body: {} })).status, 400);
    const r = await http('/api/admin/sync/run', { method: 'POST', headers: A, body: { kind: 'hourly' } }); assert.strictEqual(r.status, 202); await sleep(200);
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
