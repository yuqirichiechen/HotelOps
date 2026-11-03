// Sprint 24 — the front-desk portal's server side (`/api/frontdesk/*`): who may call what, that no guest identifier ever leaves,
// that the live board stays DB-free, and that the manager routes still behave exactly as before. DB + rGuest fully faked.
//   node tests/frontdesk-server.test.js "$PWD"
const ROOT = process.argv[2] + '/server'; const assert = require('assert');
process.env.PORT = '3992'; process.env.JWT_SECRET = 'y'.repeat(40); process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
const jwt = require(ROOT + '/node_modules/jsonwebtoken');
const pg = require(ROOT + '/node_modules/pg');

const PAYLOAD = {
  forecastDate: '2026-11-02', kpis: { arrivals: 5, remainingArrivals: 3, inHouse: 20 },
  reservations: [
    { id: 'r1', guestName: 'Ada Lovelace', confirmationId: 'CONF123', primaryGuestProfileId: 'p-9', vipUuid: 'v1', vipLabel: 'VIP', roomNumber: '101', status: 'INH', baseCode: 'NQRR', kind: 'inhouse' },
    { id: 'r2', guestName: 'Grace Hopper', confirmationId: 'CONF456', roomNumber: null, status: 'RES', baseCode: 'NKRR', kind: 'arrival' },
  ],
  perRoomSheet: [{ roomNumber: '101', typeCode: 'NQRR', hkStatus: 'D', guestName: 'Ada L.' }],
  byFloor: [{ floorId: '1', rooms: [{ roomNumber: '101', guestName: 'Ada L.' }] }],
  inactiveRooms: [],
};
const LIVE = { forecastDate: '2026-11-02', fetchedAt: '2026-11-02T18:00:00Z', complete: true, rooms: [{ roomNumber: '101', typeCode: 'NQRR', hkStatus: 'VI', occupancyStatus: 'VAC' }], remainingArrivals: [], stillDeparting: [] };

const store = { hk_print_colors: '{"dirty":"#c6f6d5"}', forecast_allowance_scale_pct: '120', login_secret_thing: 'MANAGER-ONLY', overtime_threshold_hours: '40' };
const plans = new Map(); let queries = 0;
pg.Pool.prototype.query = async function (sql, params) {
  const q = String(sql).replace(/\s+/g, ' '); queries++;
  if (/FROM forecast_snapshot/.test(q)) return { rows: [{ snapshot_id: 's1', scraped_at: '2026-11-02T17:55:00Z', forecast_date: '2026-11-02', status: 'success', payload: PAYLOAD }] };
  if (/FROM app_settings WHERE key = ANY/.test(q)) return { rows: params[0].filter(k => k in store).map(k => ({ key: k, value: store[k] })) };
  if (/FROM app_settings/.test(q)) return { rows: Object.entries(store).map(([key, value]) => ({ key, value })) };
  if (/FROM users u LEFT JOIN departments/.test(q)) return { rows: [{ user_id: 'u1', name: 'Bryan', active: true, department_id: 'd1', department: 'Housekeeping' }] };
  if (/FROM hk_plans/.test(q) && /BETWEEN/.test(q)) return { rows: [] };
  if (/FROM hk_plans/.test(q)) { const r = plans.get(params[0] + '|' + params[1]); return { rows: r ? [{ date: params[1], settings: r.settings, assignments: r.assignments, updated_at: r.at }] : [] }; }
  if (/INSERT INTO hk_plans/.test(q)) { const at = new Date('2026-11-02T15:00:00Z'); plans.set(params[0] + '|' + params[1], { settings: JSON.parse(params[2]), assignments: JSON.parse(params[3]), by: params[4], at }); return { rows: [{ updated_at: at }] }; }
  if (/FROM reservation_history/.test(q)) return { rows: [{ room_number: '204' }] };
  return { rows: [], rowCount: 0 };
};
pg.Pool.prototype.connect = async function () { return { query: async () => ({ rows: [], rowCount: 0 }), release() {} }; };
const clientMod = require(ROOT + '/agilysys/client'); const down = async () => { throw new Error('fake rGuest down'); };
let liveCalls = 0;
clientMod.createAgilysysClient = () => ({ getPropertyDate: down, listRooms: down, listRoomTypes: down, getRatePlans: down, getVipStatuses: down, fetchSliceExact: down, countSlice: down, getReservationDetail: down, getReservationMetrics: down, fetchTodayLive: async () => { liveCalls++; return LIVE; }, clearLogs() {} });

const sign = (o) => jwt.sign(o, process.env.JWT_SECRET);
const UID = '11111111-1111-4111-8111-111111111111';
const T = { admin: sign({ sub: 'mgr', role: 'admin', type: 'admin' }), dev: sign({ sub: 'dev', role: 'dev', type: 'dev' }),
  employee: sign({ sub: UID, role: 'employee', type: 'staff' }), desk: sign({ sub: UID, role: 'front_desk', type: 'staff' }) };
const http = (p, o = {}) => fetch('http://127.0.0.1:3992' + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };

(async () => {
  const fd = require(ROOT + '/frontdesk');
  await t('redactPayload removes every guest identifier, keeps what the models need, and never mutates the original', () => {
    const before = JSON.stringify(PAYLOAD); const out = fd.redactPayload(PAYLOAD);
    assert.strictEqual(JSON.stringify(PAYLOAD), before, 'original untouched');
    for (const r of out.reservations) for (const f of fd.GUEST_FIELDS) assert(!(f in r), f);
    assert.strictEqual(out.reservations[0].roomNumber, '101'); assert.strictEqual(out.reservations[0].status, 'INH'); assert.strictEqual(out.reservations[0].baseCode, 'NQRR');
    assert(!('guestName' in out.perRoomSheet[0])); assert.strictEqual(out.perRoomSheet[0].hkStatus, 'D'); assert(!('guestName' in out.byFloor[0].rooms[0]));
    assert(!/Ada|Grace|CONF|p-9/.test(JSON.stringify(out)), 'no trace of any guest in the output');
    assert.strictEqual(fd.redactPayload(null), null); assert.deepStrictEqual(fd.redactCurrentResponse({ snapshot: null }), { snapshot: null });
  });
  await t('pickSettings only passes the allow-listed keys', () => {
    const out = fd.pickSettings(Object.entries(store).map(([key, value]) => ({ key, value }))); assert.deepStrictEqual(Object.keys(out).sort(), ['forecast_allowance_scale_pct', 'hk_print_colors']);
  });

  require(ROOT + '/server.js'); await sleep(600);

  const READS = ['/api/frontdesk/forecast/current', '/api/frontdesk/forecast/live', '/api/frontdesk/employees', '/api/frontdesk/settings', '/api/frontdesk/housekeeping/plan?date=2026-11-02',
    '/api/frontdesk/housekeeping/plans?from=2026-10-20&to=2026-11-03', '/api/frontdesk/housekeeping/locked-rooms?date=2026-11-02'];
  await t('every front-desk route: no token 401 · plain employee 403 · front_desk, manager and dev allowed', async () => {
    for (const p of READS) {
      assert.strictEqual((await http(p)).status, 401, 'none ' + p); assert.strictEqual((await http(p, { token: T.employee })).status, 403, 'employee ' + p);
      for (const who of ['desk', 'admin', 'dev']) { const r = await http(p, { token: T[who] }); assert.strictEqual(r.status, 200, who + ' ' + p + ' → ' + r.status + JSON.stringify(r.body)); }
    }
    const body = { date: '2026-11-02', settings: { min: 10 }, assignments: [] };
    assert.strictEqual((await http('/api/frontdesk/housekeeping/plan', { method: 'PUT', body })).status, 401); assert.strictEqual((await http('/api/frontdesk/housekeeping/plan', { method: 'PUT', body, token: T.employee })).status, 403);
  });
  await t('the front-desk portal can NOT use the manager routes (/api/admin/*) — least privilege', async () => {
    for (const p of ['/api/admin/forecast/current', '/api/admin/forecast/live', '/api/admin/employees', '/api/admin/settings', '/api/admin/housekeeping/plan?date=2026-11-02', '/api/admin/reservations/summaries?ids=r1']) {
      assert.strictEqual((await http(p, { token: T.desk })).status, 403, p);
    }
  });
  await t('/frontdesk/forecast/current carries NO guest data; the manager route still does', async () => {
    const d = await http('/api/frontdesk/forecast/current', { token: T.desk }); assert.strictEqual(d.status, 200);
    const txt = JSON.stringify(d.body); assert(!/Ada|Grace|CONF123|CONF456|p-9|"vipLabel"/.test(txt), 'front desk response is clean'); assert.strictEqual(d.body.snapshot.payload.kpis.remainingArrivals, 3); assert.strictEqual(d.body.snapshot.payload.reservations.length, 2);
    const m = await http('/api/admin/forecast/current', { token: T.admin }); assert(/Ada Lovelace/.test(JSON.stringify(m.body)) && /CONF123/.test(JSON.stringify(m.body)), 'managers are unchanged');
  });
  await t('the second request is not served a redacted copy to managers (the cached payload is never mutated)', async () => {
    await http('/api/frontdesk/forecast/current', { token: T.desk }); const m = await http('/api/admin/forecast/current', { token: T.dev }); assert(/Ada Lovelace/.test(JSON.stringify(m.body)));
  });
  await t('employees: names + department only — no phone, pay rate, birthday or PIN state', async () => {
    const r = await http('/api/frontdesk/employees', { token: T.desk }); assert.deepStrictEqual(Object.keys(r.body.employees[0]).sort(), ['active', 'department', 'department_id', 'name', 'user_id']);
  });
  await t('settings: only the allow-listed keys (no manager configuration)', async () => {
    const r = await http('/api/frontdesk/settings', { token: T.desk }); assert.deepStrictEqual(Object.keys(r.body.settings).sort(), ['forecast_allowance_scale_pct', 'hk_print_colors']); assert(!/MANAGER-ONLY/.test(JSON.stringify(r.body)));
  });
  await t('the live board is DB-free for the front desk too (no query, even past the shift-cap throttle) and has no guest data', async () => {
    await http('/api/frontdesk/forecast/live', { token: T.desk }); await sleep(30); const q0 = queries; const calls0 = liveCalls;
    for (let i = 0; i < 3; i++) { const r = await http('/api/frontdesk/forecast/live', { token: T.desk }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.live.forecastDate, '2026-11-02'); }
    assert.strictEqual(queries, q0, 'zero DB queries for live polls'); assert.strictEqual(liveCalls, calls0, 'served from the 20 s cache'); assert(!/guest/i.test(JSON.stringify(LIVE)));
  });
  await t('a front-desk user can save and read back a housekeeping plan; the saver is recorded', async () => {
    const plan = { date: '2026-11-02', settings: { min: 10, max: 15, cleanWeight: 1, serviceWeight: 0.5 }, assignments: [{ userId: UID, name: 'Bryan', rooms: [{ roomNumber: '101', kind: 'clean' }] }] };
    const put = await http('/api/frontdesk/housekeeping/plan', { method: 'PUT', token: T.desk, body: plan }); assert.strictEqual(put.status, 200); assert(put.body.success);
    const got = await http('/api/frontdesk/housekeeping/plan?date=2026-11-02', { token: T.desk }); assert.strictEqual(got.body.plan.assignments[0].rooms[0].roomNumber, '101');
    const same = await http('/api/admin/housekeeping/plan?date=2026-11-02', { token: T.admin }); assert.strictEqual(same.body.plan.assignments[0].name, 'Bryan', 'managers see the desk’s plan');
    assert.strictEqual([...plans.values()][0].by, UID);
    assert.strictEqual((await http('/api/frontdesk/housekeeping/plan', { method: 'PUT', token: T.desk, body: { ...plan, date: 'nope' } })).status, 400, 'same validation as the manager route');
  });
  await t('locked rooms: room numbers only', async () => { const r = await http('/api/frontdesk/housekeeping/locked-rooms?date=2026-11-02', { token: T.desk }); assert.deepStrictEqual(r.body.rooms, ['204']); assert.strictEqual((await http('/api/frontdesk/housekeeping/locked-rooms?date=x', { token: T.desk })).status, 400); });
  await t('role hierarchy: dev-only routes stay closed to front_desk AND managers; front_desk cannot reach admin-only ones', async () => {
    for (const p of ['/api/admin/sync/status', '/api/admin/forecast/accuracy', '/api/dev/jobs']) { assert.strictEqual((await http(p, { token: T.desk })).status, 403, 'desk ' + p); assert.strictEqual((await http(p, { token: T.admin })).status, 403, 'admin ' + p); }
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
