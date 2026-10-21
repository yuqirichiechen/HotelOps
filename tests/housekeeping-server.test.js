// Sprint 23 — saved housekeeping plans: validation (pure), the routes (admin/dev only, bad input refused), and migration 030 + the route's real SQL on postgres.
//   node tests/housekeeping-server.test.js "$PWD"
const ROOT = process.argv[2]; const SRV = ROOT + '/server'; const assert = require('assert'); const { execSync } = require('child_process'); const fs = require('fs');
process.env.PORT = '3993'; process.env.JWT_SECRET = 'x'.repeat(40); process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
const jwt = require(SRV + '/node_modules/jsonwebtoken'); const pg = require(SRV + '/node_modules/pg'); const { sanitizePlan } = require(SRV + '/housekeeping');
const rows = new Map(); const sqls = []; const settingsStore = {};
pg.Pool.prototype.query = async function (sql, params) { const q = String(sql).replace(/\s+/g, ' '); sqls.push({ q, params });
  if (/INSERT INTO app_settings/.test(q)) { settingsStore[params[0]] = params[1]; return { rows: [], rowCount: 1 }; }
  if (/FROM app_settings/.test(q)) return { rows: Object.entries(settingsStore).map(([key, value]) => ({ key, value })) };
  if (/doNotMoveRoom/.test(q)) return { rows: params[1] === '2026-10-19' ? [{ room_number: '102' }, { room_number: '110' }] : [] };
  if (/BETWEEN \$2 AND \$3/.test(q)) { const out = []; for (const [k, r] of rows) { const [pp, d] = k.split('|'); if (pp === params[0] && d >= params[1] && d <= params[2]) out.push({ date: d, hks: r.assignments.length, rooms: r.assignments.reduce((n, a) => n + a.rooms.length, 0), updated_at: r.at }); } return { rows: out }; }
  if (/FROM hk_plans/.test(q)) { const r = rows.get(params[0] + '|' + params[1]); return { rows: r ? [{ date: params[1], settings: r.settings, assignments: r.assignments, updated_at: r.at }] : [] }; }
  if (/INSERT INTO hk_plans/.test(q)) { const at = new Date('2026-10-19T15:00:00Z'); rows.set(params[0] + '|' + params[1], { settings: JSON.parse(params[2]), assignments: JSON.parse(params[3]), by: params[4], at }); return { rows: [{ updated_at: at }] }; }
  return { rows: [], rowCount: 0 }; };
pg.Pool.prototype.connect = async function () { return { query: async () => ({ rows: [], rowCount: 0 }), release() {} }; };
const sign = (o) => jwt.sign(o, process.env.JWT_SECRET); const T = { admin: sign({ sub: 'mgr-1', role: 'admin', type: 'admin' }), dev: sign({ sub: 'dev', role: 'dev', type: 'dev' }), staff: sign({ sub: '11111111-1111-4111-8111-111111111111', role: 'employee', type: 'staff' }) };
const http = (p, o = {}) => fetch('http://127.0.0.1:3993' + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };
const NOW = new Date('2026-10-19T12:00:00Z'); const good = { date: '2026-10-19', settings: { min: 12, max: 14, cleanWeight: 1, serviceWeight: 0.5 }, assignments: [{ userId: 'u1', name: 'Ann', rooms: [{ roomNumber: '101', kind: 'clean', priority: true, pinned: true, typeCode: 'NQRR', why: 'Dirty now', junk: 'x' }, { roomNumber: '102', kind: 'service' }] }, { userId: 'u2', name: 'Bo', rooms: [] }] };
(async () => {
  await t('validation: a good plan passes (priority kept, settings clamped to sane values); bad dates / duplicates / bad rooms / bad kinds / too many are refused', () => {
    const ok = sanitizePlan(good, NOW); assert(!ok.error, ok.error); assert.deepStrictEqual(ok.assignments[0].rooms, [{ roomNumber: '101', kind: 'clean', priority: true, pinned: true, typeCode: 'NQRR', why: 'Dirty now' }, { roomNumber: '102', kind: 'service' }], 'known fields kept, junk dropped'); assert.strictEqual(ok.settings.min, 12); assert.strictEqual(ok.settings.max, 14);
    assert.strictEqual(sanitizePlan({ ...good, assignments: [{ userId: 'u', name: 'n', rooms: [{ roomNumber: '1', kind: 'clean', typeCode: '<script>', why: ' ' }] }] }, NOW).assignments[0].rooms[0].typeCode, undefined, 'bad type codes are dropped');
    assert.deepStrictEqual(sanitizePlan({ ...good, settings: { min: 9999, cleanWeight: -1, serviceWeight: 'x' } }, NOW).settings, { min: 10, max: 15, cleanWeight: 1, serviceWeight: 0.5 }, 'out-of-range → defaults');
    const bad = (patch, re) => { const r = sanitizePlan({ ...good, ...patch }, NOW); assert(r.error && re.test(r.error), JSON.stringify(patch).slice(0, 80) + ' → ' + r.error); };
    bad({ date: 'tomorrow' }, /YYYY/); bad({ date: '2027-06-01' }, /range/); bad({ assignments: 'x' }, /list/); bad({ assignments: Array.from({ length: 61 }, (_, i) => ({ userId: 'u' + i, name: 'n', rooms: [] })) }, /60/);
    bad({ assignments: [good.assignments[0], good.assignments[0]] }, /twice/); bad({ assignments: [{ userId: 'u1', name: 'A', rooms: [{ roomNumber: '1; DROP', kind: 'clean' }] }] }, /room number/);
    bad({ assignments: [{ userId: 'u1', name: 'A', rooms: [{ roomNumber: '101', kind: 'nap' }] }] }, /kind/); bad({ assignments: [{ userId: 'u1', name: 'A', rooms: [{ roomNumber: '101', kind: 'clean' }] }, { userId: 'u2', name: 'B', rooms: [{ roomNumber: '101', kind: 'clean' }] }] }, /twice/);
    bad({ assignments: [{ userId: '', name: 'A', rooms: [] }] }, /userId/); assert(sanitizePlan(null, NOW).error);
  });
  require(SRV + '/server.js'); await sleep(600);
  await t('routes: managers and dev can save and read a plan; staff and anonymous are refused; the plan round-trips; saving twice replaces it (one row per day)', async () => {
    assert.strictEqual((await http('/api/admin/housekeeping/plan?date=2026-10-19')).status, 401); assert.strictEqual((await http('/api/admin/housekeeping/plan?date=2026-10-19', { token: T.staff })).status, 403); assert.strictEqual((await http('/api/admin/housekeeping/plan', { method: 'PUT', token: T.staff, body: good })).status, 403);
    assert.strictEqual((await http('/api/admin/housekeeping/plan?date=2026-10-19', { token: T.admin })).body.plan, null);
    const d = new Date(); const date = d.toISOString().slice(0, 10); const plan = { ...good, date };
    const put = await http('/api/admin/housekeeping/plan', { method: 'PUT', token: T.admin, body: plan }); assert.strictEqual(put.status, 200); assert(put.body.success && put.body.updatedAt);
    const got = await http('/api/admin/housekeeping/plan?date=' + date, { token: T.dev }); assert.deepStrictEqual(got.body.plan.assignments, sanitizePlan(plan, NOW).assignments); assert.strictEqual(got.body.plan.settings.min, 12);
    await http('/api/admin/housekeeping/plan', { method: 'PUT', token: T.dev, body: { ...plan, assignments: [] } }); assert.deepStrictEqual((await http('/api/admin/housekeeping/plan?date=' + date, { token: T.admin })).body.plan.assignments, []); assert.strictEqual(rows.size, 1);
  });
  await t('day strip: /plans lists the days that have a saved plan (counts of housekeepers + rooms), admin/dev only, range validated', async () => {
    const date = new Date().toISOString().slice(0, 10); const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10), to = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    assert.strictEqual((await http(`/api/admin/housekeeping/plans?from=${from}&to=${to}`)).status, 401); assert.strictEqual((await http(`/api/admin/housekeeping/plans?from=${from}&to=${to}`, { token: T.staff })).status, 403);
    await http('/api/admin/housekeeping/plan', { method: 'PUT', token: T.admin, body: { ...good, date } }); const r = await http(`/api/admin/housekeeping/plans?from=${from}&to=${to}`, { token: T.dev });
    assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.body.plans.map(p => [p.date, p.hks, p.rooms]), [[date, 2, 2]]);
    for (const q of ['from=x&to=y', `from=${to}&to=${from}`, 'from=2026-01-01&to=2026-06-01', '']) assert.strictEqual((await http('/api/admin/housekeeping/plans?' + q, { token: T.admin })).status, 400, q);
  });
  await t('do-not-move: /locked-rooms returns room numbers only (no guest data), admin/dev only, date validated', async () => {
    assert.strictEqual((await http('/api/admin/housekeeping/locked-rooms?date=2026-10-19')).status, 401); assert.strictEqual((await http('/api/admin/housekeeping/locked-rooms?date=2026-10-19', { token: T.staff })).status, 403);
    const r = await http('/api/admin/housekeeping/locked-rooms?date=2026-10-19', { token: T.admin }); assert.deepStrictEqual(r.body, { success: true, rooms: ['102', '110'] }); assert.deepStrictEqual((await http('/api/admin/housekeeping/locked-rooms?date=2026-10-20', { token: T.dev })).body.rooms, []);
    assert.strictEqual((await http('/api/admin/housekeeping/locked-rooms?date=nope', { token: T.admin })).status, 400);
  });
  await t('PRINT COLOURS: setting hk_print_colors — only DEV can write it; managers can READ it (their prints use it); bad JSON / unknown groups / bad hex refused', async () => {
    const colors = JSON.stringify({ dirty: '#c6f6d5', departure: '#fefcbf', priority: '#fed7e2', inhouse: '' }); const put = (token, v) => http('/api/admin/settings', { method: 'PUT', token, body: { hk_print_colors: v } });
    assert.strictEqual((await put(T.admin, colors)).status, 403, 'a manager cannot change the colours'); assert.strictEqual((await put(T.dev, colors)).status, 200);
    assert.strictEqual((await http('/api/admin/settings', { token: T.admin })).body.settings.hk_print_colors, colors, 'managers read it');
    for (const bad of ['not json', '[]', JSON.stringify({ dirty: 'green' }), JSON.stringify({ dirty: '#c6f6d5', evil: '#000000' }), JSON.stringify({ dirty: '#12345' }), '"x"']) assert.strictEqual((await put(T.dev, bad)).status, 400, bad);
    assert.strictEqual((await put(T.dev, JSON.stringify({ dirty: '#00ff00' }))).status, 200, 'a partial map is fine (the rest fall back to defaults in the page)');
  });
  await t('plans keep the sheet colour group + stay, and the "by number" flag; junk is dropped', () => {
    const r = sanitizePlan({ date: '2026-10-19', settings: { anonymous: true, min: 10 }, assignments: [{ userId: 'anon-1', name: 'Housekeeper 1', rooms: [{ roomNumber: '101', kind: 'clean', cat: 'dirty', stay: 'Oct 17 → Oct 21' }, { roomNumber: '102', kind: 'service', cat: 'rainbow', stay: '<b>x</b>' }] }] }, NOW);
    assert(!r.error, r.error); assert.strictEqual(r.settings.anonymous, true); assert.deepStrictEqual(r.assignments[0].rooms, [{ roomNumber: '101', kind: 'clean', cat: 'dirty', stay: 'Oct 17 → Oct 21' }, { roomNumber: '102', kind: 'service' }]);
    assert.strictEqual(sanitizePlan({ date: '2026-10-19', settings: { anonymous: 'yes' }, assignments: [] }, NOW).settings.anonymous, undefined);
  });
  await t('routes: bad input → 400 with a reason and NOTHING is written; every query is parameterized and scoped to the property', async () => {
    const n = rows.size; const r = await http('/api/admin/housekeeping/plan', { method: 'PUT', token: T.admin, body: { ...good, assignments: [{ userId: 'u1', name: 'A', rooms: [{ roomNumber: "1'; DROP TABLE users;--", kind: 'clean' }] }] } }); assert.strictEqual(r.status, 400); assert(r.body.message); assert.strictEqual(rows.size, n);
    assert.strictEqual((await http('/api/admin/housekeeping/plan?date=garbage', { token: T.admin })).status, 400);
    for (const s of sqls.filter(x => /hk_plans/.test(x.q))) { assert(/property_id = \$1|VALUES \(\$1/.test(s.q), s.q.slice(0, 80)); assert(!/DROP/.test(s.q)); }
  });
  // migration + the route's REAL SQL on postgres
  const PGBIN = '/opt/homebrew/opt/postgresql@14/bin', DIR = '/tmp/hopdb_hk', PORT = 5438; const sh = (c) => execSync(c, { stdio: 'pipe' }).toString();
  try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* not running */ } sh(`rm -rf ${DIR}`); sh(`${PGBIN}/initdb -D ${DIR} -A trust -U postgres`);
  sh(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l /tmp/hopdb_hk.log -w start`);
  try {
    const psql = (a) => sh(`${PGBIN}/psql -h 127.0.0.1 -p ${PORT} -U postgres ${a}`); psql('-c "CREATE DATABASE t"');
    const real = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 't' }); await real.connect();
    await t('migration 030 applies TWICE cleanly; the route SQL upserts one row per property+day and reads it back as JSON', async () => {
      for (const f of ['tests/real-postgres/base.sql', 'database/migrations/025_sprint18_reservation_history.sql', 'database/migrations/027_sprint20_reservation_detail.sql', 'database/migrations/028_sprint22_sync_engine.sql']) psql(`-d t -v ON_ERROR_STOP=1 -q -f "${ROOT}/${f}"`);
      psql(`-d t -v ON_ERROR_STOP=1 -q -f "${ROOT}/database/migrations/030_sprint23_hk_plans.sql"`); psql(`-d t -v ON_ERROR_STOP=1 -q -f "${ROOT}/database/migrations/030_sprint23_hk_plans.sql"`);
      const src = fs.readFileSync(SRV + '/server.js', 'utf8'); const up = src.match(/`(INSERT INTO hk_plans[\s\S]*?RETURNING updated_at)`/)[1], sel = src.match(/`(SELECT to_char\(plan_date[\s\S]*?plan_date = \$2)`/)[1];
      const a = await real.query(up, ['default', '2026-10-19', JSON.stringify({ min: 10 }), JSON.stringify(good.assignments), 'mgr']); assert(a.rows[0].updated_at);
      await real.query(up, ['default', '2026-10-19', JSON.stringify({ min: 11 }), JSON.stringify([]), 'mgr2']); await real.query(up, ['other', '2026-10-19', '{}', '[]', 'x']);
      const r = (await real.query(sel, ['default', '2026-10-19'])).rows; assert.strictEqual(r.length, 1); assert.strictEqual(r[0].date, '2026-10-19'); assert.deepStrictEqual(r[0].settings, { min: 11 }); assert.deepStrictEqual(r[0].assignments, []);
      assert.strictEqual((await real.query('SELECT count(*)::int n FROM hk_plans')).rows[0].n, 2, 'a second property has its own row');
      await real.query(up, ['default', '2026-10-18', '{}', JSON.stringify(good.assignments), 'mgr']); const list = src.match(/`(SELECT to_char\(plan_date,'YYYY-MM-DD'\) AS date, jsonb_array_length[\s\S]*?ORDER BY plan_date)`/)[1];
      const lockedSql = src.match(/`(SELECT DISTINCT h\.room_number[\s\S]*?ORDER BY h\.room_number)`/)[1]; const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'];
      const hist = (id, room, st, arr, dep, gone) => real.query("INSERT INTO reservation_history (reservation_id, room_number, status, arrival_date, departure_date, gone_at) VALUES ($1,$2,$3,$4,$5,$6)", [id, room, st, arr, dep, gone]);
      await hist(ids[0], '102', 'RES', '2026-10-19', '2026-10-21', null); await hist(ids[1], '103', 'RES', '2026-10-19', '2026-10-21', null); await hist(ids[2], '104', 'INH', '2026-10-17', '2026-10-21', null); await hist(ids[3], '105', 'RES', '2026-10-19', '2026-10-21', new Date()); await hist(ids[4], '106', 'RES', '2026-10-25', '2026-10-27', null);
      const det = (id, dnm) => real.query("INSERT INTO reservation_detail (reservation_id, summary) VALUES ($1,$2::jsonb)", [id, JSON.stringify({ stay: { doNotMoveRoom: dnm } })]); for (const [i, v] of [[0, true], [1, false], [2, true], [3, true], [4, true]]) await det(ids[i], v);
      assert.deepStrictEqual((await real.query(lockedSql, ['default', '2026-10-19'])).rows.map(r => r.room_number), ['102'], 'real SQL: only an ARRIVING (RES) reservation with do-not-move ON, still current, whose stay covers the day');
      assert.deepStrictEqual((await real.query(lockedSql, ['default', '2026-10-26'])).rows.map(r => r.room_number), ['106']); assert.deepStrictEqual((await real.query(lockedSql, ['other', '2026-10-19'])).rows, [], 'scoped to the property');
      const l = (await real.query(list, ['default', '2026-10-01', '2026-10-31'])).rows; assert.deepStrictEqual(l.map(x => [x.date, x.hks, x.rooms]), [['2026-10-18', 2, 2], ['2026-10-19', 0, 0]], 'real SQL: counts housekeepers and rooms per day, scoped to the property');
    });
    await real.end();
  } finally { try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* ignore */ } sh(`rm -rf ${DIR}`); }
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})().catch(e => { console.error('HARNESS FAILED', e.stack); process.exit(1); });
