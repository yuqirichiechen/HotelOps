// /api/admin/forecast/live: auth, cache, in-flight dedupe, failure handling, and — critically — ZERO database access
// (so a Forecast page left open can't keep Neon awake).  node tests/forecastlive-route.test.js "$PWD"
const ROOT = process.argv[2] + '/server'; const assert = require('assert');
process.env.PORT = '3994'; process.env.JWT_SECRET = 'x'.repeat(40); process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
const pg = require(ROOT + '/node_modules/pg'); const jwt = require(ROOT + '/node_modules/jsonwebtoken');
const dbCalls = []; pg.Pool.prototype.query = async function (sql) { dbCalls.push(String(sql).replace(/\s+/g, ' ').slice(0, 60)); return { rows: [], rowCount: 0 }; };
// fake rGuest client (patched BEFORE server.js destructures it)
let liveCalls = 0, failNext = false, delayMs = 0;
const clientMod = require(ROOT + '/agilysys/client'); const realCreate = clientMod.createAgilysysClient;
clientMod.createAgilysysClient = () => ({ ...realCreate({ username: 'u', password: 'p' }), async fetchTodayLive() { liveCalls++; if (delayMs) await new Promise(r => setTimeout(r, delayMs)); if (failNext) { failNext = false; throw new Error('rGuest 500 secret-internal-detail'); } return { forecastDate: '2026-10-11', fetchedAt: new Date().toISOString(), rooms: [], remainingArrivals: [], stillDeparting: [], n: liveCalls }; }, clearLogs() {} });
require(ROOT + '/server.js');
const admin = jwt.sign({ sub: 'a', role: 'admin', type: 'admin' }, process.env.JWT_SECRET), staff = jwt.sign({ sub: '11111111-1111-4111-8111-111111111111', role: 'employee', type: 'staff' }, process.env.JWT_SECRET);
const get = async (p, tok) => { const r = await fetch('http://127.0.0.1:3994' + p, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} }); return { status: r.status, body: await r.json().catch(() => null) }; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); const L = '/api/admin/forecast/live';
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
(async () => {
  await sleep(600);
  await t('admin-only: no token 401, staff 403, admin 200', async () => { assert.strictEqual((await get(L)).status, 401); assert.strictEqual((await get(L, staff)).status, 403); const r = await get(L, admin); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.live.forecastDate, '2026-10-11'); });
  await t('ZERO database queries for the live route — even though every other /api request triggers the 5-min shift-cap query', async () => {
    dbCalls.length = 0; for (let i = 0; i < 5; i++) await get(L, admin); assert.strictEqual(dbCalls.length, 0, 'db calls: ' + dbCalls.join(' | '));
    dbCalls.length = 0; await get('/api/admin/forecast/snapshots/latest', admin); assert(dbCalls.length >= 1, 'control: a normal admin route DOES query the DB');
  });
  await t('20 s cache: repeated polls reuse one rGuest pull; after the TTL it refetches', async () => {
    const realNow = Date.now; liveCalls = 0; Date.now = () => realNow() + 60 * 1000; await get(L, admin); const base = liveCalls;
    const r2 = await get(L, admin); assert.strictEqual(r2.body.cached, true); assert.strictEqual(liveCalls, base);
    Date.now = () => realNow() + 60 * 1000 + 25 * 1000; await get(L, admin); assert.strictEqual(liveCalls, base + 1, 'refetched after TTL'); Date.now = realNow;
  });
  await t('in-flight dedupe: 8 simultaneous requests (several tabs / admins) cause ONE rGuest pull', async () => {
    const realNow = Date.now; Date.now = () => realNow() + 10 * 60 * 1000; liveCalls = 0; delayMs = 80;
    const rs = await Promise.all(Array.from({ length: 8 }, () => get(L, admin))); delayMs = 0; Date.now = realNow;
    assert.strictEqual(liveCalls, 1); assert(rs.every(r => r.status === 200));
  });
  await t('rGuest failure → generic 502 (no internal detail leaked), nothing cached, next call recovers', async () => {
    const realNow = Date.now; Date.now = () => realNow() + 20 * 60 * 1000; failNext = true;
    const bad = await get(L, admin); assert.strictEqual(bad.status, 502); assert(!JSON.stringify(bad.body).includes('secret-internal-detail')); assert.strictEqual(bad.body.success, false);
    const ok = await get(L, admin); assert.strictEqual(ok.status, 200, 'recovered immediately'); Date.now = realNow;
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
