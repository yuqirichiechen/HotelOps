// Sprint 22.4 — server-verified DEV role: sign-in (env credentials, rate limit), dev ⊇ admin, and the dev-only surfaces
// (forecast settings, auto-sync settings/status/runs, snapshot history, logs) are closed to managers. DB + rGuest fully faked.
//   node tests/dev-auth.test.js "$PWD"
const ROOT = process.argv[2] + '/server'; const assert = require('assert');
process.env.PORT = '3991'; process.env.JWT_SECRET = 'x'.repeat(40); process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none'; process.env.SYNC_TICK_SECRET = 's3cret-'.repeat(4);
const bcrypt = require(ROOT + '/node_modules/bcryptjs'); const jwt = require(ROOT + '/node_modules/jsonwebtoken');
const DEV_PW = 'correct horse battery staple'; const HASH = bcrypt.hashSync(DEV_PW, 4);
const pg = require(ROOT + '/node_modules/pg'); const store = {}; const sqls = [];
pg.Pool.prototype.query = async function (sql, params) { const q = String(sql).replace(/\s+/g, ' '); sqls.push(q.slice(0, 60));
  if (/SELECT value FROM app_settings WHERE key = \$1/.test(q)) return { rows: store[params[0]] ? [{ value: store[params[0]] }] : [] };
  if (/INSERT INTO app_settings/.test(q)) { store[params[0]] = params[1]; return { rows: [], rowCount: 1 }; }
  if (/FROM scrape_job/.test(q)) return { rows: [{ job_id: 'j1', status: 'success' }] };
  if (/FROM forecast_snapshot/.test(q) || /FROM forecast_config/.test(q) || /FROM room_type_mapping/.test(q)) return { rows: [{ config_id: 1, type_code: 'NQRR', snapshot_id: 's1', payload: { forecastDate: '2026-10-20' } }] };
  if (/FROM sync_runs ORDER/.test(q)) return { rows: [] }; if (/FROM sync_state/.test(q) || /FROM reservation_history/.test(q)) return { rows: [] };
  if (/FROM app_settings/.test(q)) return { rows: Object.entries(store).map(([key, value]) => ({ key, value })) };
  return { rows: [], rowCount: 0 }; };
pg.Pool.prototype.connect = async function () { return { query: async () => ({ rows: [], rowCount: 0 }), release() {} }; };
const clientMod = require(ROOT + '/agilysys/client'); const down = async () => { throw new Error('fake rGuest down'); };
clientMod.createAgilysysClient = () => ({ getPropertyDate: down, listRooms: down, listRoomTypes: down, getRatePlans: down, getVipStatuses: down, fetchSliceExact: down, countSlice: down, getReservationDetail: down, fetchTodayLive: down, getReservationMetrics: down, clearLogs() {} });
const sign = (o) => jwt.sign(o, process.env.JWT_SECRET); const T = { admin: sign({ sub: 'mgr', role: 'admin', type: 'admin' }), dev: sign({ sub: 'dev', role: 'dev', type: 'dev' }), staff: sign({ sub: '11111111-1111-4111-8111-111111111111', role: 'employee', type: 'staff' }) };
const http = (p, o = {}) => fetch('http://127.0.0.1:3991' + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}), ...(o.headers || {}) }, body: o.body ? JSON.stringify(o.body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => null), retry: r.headers.get('retry-after') }));
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
const login = (u, p, h = {}) => http('/api/auth/dev/login', { method: 'POST', body: { username: u, password: p }, headers: h });
(async () => {
  delete process.env.DEV_PASSWORD_HASH; require(ROOT + '/server.js'); const auth = require(ROOT + '/auth'); await sleep(600);
  await t('dev sign-in is DISABLED (503) until DEV_PASSWORD_HASH is configured — there is no default password', async () => { const r = await login('dev', 'dev'); assert.strictEqual(r.status, 503); assert(!r.body.token); });
  process.env.DEV_PASSWORD_HASH = HASH;
  await t('wrong password / wrong username / missing fields are rejected without saying which was wrong; "dev"/"dev" no longer works', async () => {
    auth._resetDevLimiter(); for (const [u, p, st] of [['dev', 'dev', 401], ['dev', 'nope', 401], ['nobody', DEV_PW, 401], ['', '', 400]]) { const r = await login(u, p); assert.strictEqual(r.status, st, u + '/' + p); assert(!r.body.token); }
    assert.strictEqual((await login('dev', 'x')).body.message, (await login('nobody', DEV_PW)).body.message, 'same message either way');
  });
  await t('correct credentials → a token with role dev; /api/me recognises it; the token works on admin routes', async () => {
    auth._resetDevLimiter(); const r = await login('dev', DEV_PW); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.user.role, 'dev'); const dev = jwt.verify(r.body.token, process.env.JWT_SECRET); assert.strictEqual(dev.role, 'dev');
    const me = await http('/api/me', { token: r.body.token }); assert.strictEqual(me.body.user.role, 'dev'); assert.strictEqual((await http('/api/admin/settings', { token: r.body.token })).status, 200);
  });
  await t('DEBUG convenience: a DEV_PASSWORD_HASH that is not a bcrypt hash is treated as the plain password (still rate-limited, still never a default)', async () => {
    auth._resetDevLimiter(); process.env.DEV_PASSWORD_HASH = 'dev';
    const ok = await login('dev', 'dev'); assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.user.role, 'dev'); assert.strictEqual((await login('dev', 'devx')).status, 401); assert.strictEqual((await login('dev', 'DEV')).status, 401); assert.strictEqual((await login('other', 'dev')).status, 401);
    for (let i = 0; i < 5; i++) await login('dev', 'bad' + i, { 'cf-connecting-ip': '203.0.113.99' }); assert.strictEqual((await login('dev', 'dev', { 'cf-connecting-ip': '203.0.113.99' })).status, 429, 'brute force still blocked');
    delete process.env.DEV_PASSWORD_HASH; auth._resetDevLimiter(); assert.strictEqual((await login('dev', 'dev')).status, 503, 'unset → disabled, no default'); process.env.DEV_PASSWORD_HASH = HASH; auth._resetDevLimiter();
    assert.strictEqual((await login('dev', DEV_PW)).status, 200, 'a real bcrypt hash still works');
  });
  await t('DEV_USERNAME is honoured', async () => { auth._resetDevLimiter(); process.env.DEV_USERNAME = 'richie'; assert.strictEqual((await login('dev', DEV_PW)).status, 401); assert.strictEqual((await login('richie', DEV_PW)).status, 200); delete process.env.DEV_USERNAME; });
  await t('RATE LIMIT: 5 failures from one client → 429 (even with the right password) + Retry-After; other clients unaffected; success clears the count', async () => {
    auth._resetDevLimiter(); const A = { 'cf-connecting-ip': '203.0.113.7' }, B = { 'cf-connecting-ip': '203.0.113.8' };
    for (let i = 0; i < 5; i++) assert.strictEqual((await login('dev', 'bad' + i, A)).status, 401);
    const blocked = await login('dev', DEV_PW, A); assert.strictEqual(blocked.status, 429); assert(Number(blocked.retry) > 0); assert.strictEqual((await login('dev', DEV_PW, B)).status, 200, 'another client is fine');
    auth._resetDevLimiter(); for (let i = 0; i < 4; i++) await login('dev', 'bad', A); assert.strictEqual((await login('dev', DEV_PW, A)).status, 200); for (let i = 0; i < 4; i++) await login('dev', 'bad', A); assert.strictEqual((await login('dev', 'bad', A)).status, 401, 'count restarted after a success');
  });
  await t('global cap: 30 failures from many addresses lock dev sign-in for everyone for a while', async () => {
    auth._resetDevLimiter(); for (let i = 0; i < 30; i++) await login('dev', 'bad', { 'cf-connecting-ip': '198.51.100.' + (i % 250) }); assert.strictEqual((await login('dev', DEV_PW, { 'cf-connecting-ip': '198.51.100.250' })).status, 429); auth._resetDevLimiter();
  });

  const DEV_ONLY = [['GET', '/api/admin/forecast/config'], ['PUT', '/api/admin/forecast/config', { productivity_target: 6 }], ['GET', '/api/admin/forecast/mapping'], ['PUT', '/api/admin/forecast/mapping/NQRR', { base_label: 'x' }],
    ['GET', '/api/admin/forecast/snapshots'], ['GET', '/api/admin/forecast/snapshots/00000000-0000-4000-8000-000000000001'], ['DELETE', '/api/admin/forecast/snapshots/00000000-0000-4000-8000-000000000001'],
    ['GET', '/api/admin/sync/status'], ['PUT', '/api/admin/sync/settings', { paused: false }], ['GET', '/api/admin/sync/runs'], ['GET', '/api/admin/forecast/accuracy'], ['GET', '/api/dev/jobs']];
  await t('DEV-ONLY surfaces: no token 401 · staff 403 · MANAGER (admin) 403 · dev allowed — for every forecast-settings / auto-sync / snapshot-history / logs route', async () => {
    for (const [m, p, b] of DEV_ONLY) {
      assert.strictEqual((await http(p, { method: m, body: b })).status, 401, 'none ' + p); assert.strictEqual((await http(p, { method: m, body: b, token: T.staff })).status, 403, 'staff ' + p);
      assert.strictEqual((await http(p, { method: m, body: b, token: T.admin })).status, 403, 'admin ' + p); const d = await http(p, { method: m, body: b, token: T.dev }); assert(![401, 403].includes(d.status), 'dev ' + p + ' → ' + d.status);
    }
  });
  await t('what MANAGERS still have: current forecast data, a plain health summary, change feed, refresh', async () => {
    for (const p of ['/api/admin/forecast/current', '/api/admin/sync/health', '/api/admin/sync/events']) { const r = await http(p, { token: T.admin }); assert.strictEqual(r.status, 200, p + ' → ' + r.status + JSON.stringify(r.body)); }
    const h = (await http('/api/admin/sync/health', { token: T.admin })).body.health; assert(['ok', 'stale', 'down', 'off'].includes(h.state)); assert(!('settings' in h) && !('recentRuns' in h), 'no technical detail for managers'); assert.strictEqual(typeof h.running, 'boolean', 'health says whether a run is in progress (the refresh button waits on it)');
    assert.strictEqual((await http('/api/admin/sync/run', { method: 'POST', token: T.admin, body: { kind: 'refresh' } })).status, 202);
  });
  await t('managers cannot start any other sync run; dev can', async () => {
    await sleep(200); for (const kind of ['hourly', 'frequent', 'reconcile', 'backfill', 'full']) assert.strictEqual((await http('/api/admin/sync/run', { method: 'POST', token: T.admin, body: { kind } })).status, 403, kind);
    await sleep(200); assert.strictEqual((await http('/api/admin/sync/run', { method: 'POST', token: T.dev, body: { kind: 'hourly' } })).status, 202);
  });
  await t('settings: managers keep their normal settings but NOT forecast_/sync_/guest-data ones (dev only)', async () => {
    assert.strictEqual((await http('/api/admin/settings', { method: 'PUT', token: T.admin, body: { pay_period_start_day: '1' } })).status, 200);
    for (const b of [{ forecast_allowance_scale_pct: '120' }, { forecast_allowance_enabled: 'false' }, { guest_detail_retention_days: '30' }, { pay_period_start_day: '1', forecast_allowance_min_extra: '3' }]) assert.strictEqual((await http('/api/admin/settings', { method: 'PUT', token: T.admin, body: b })).status, 403, JSON.stringify(b));
    assert.strictEqual((await http('/api/admin/settings', { method: 'PUT', token: T.dev, body: { forecast_allowance_scale_pct: '120', guest_detail_retention_days: '30' } })).status, 200); assert.strictEqual(store.forecast_allowance_scale_pct, '120');
  });
  await t('the sync tick endpoint is unaffected (secret header only)', async () => { assert.strictEqual((await http('/api/sync/tick', { method: 'POST', token: T.dev })).status, 401); });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
