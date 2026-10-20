// Sprint 21.4: late-booking allowance settings: admin-only, validated, stored as strings in app_settings.
// node tests/forecast-allowance-settings.test.js "$PWD"
const ROOT = process.argv[2] + '/server'; const assert = require('assert');
process.env.PORT = '3993'; process.env.JWT_SECRET = 'x'.repeat(40); process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
const pg = require(ROOT + '/node_modules/pg'); const jwt = require(ROOT + '/node_modules/jsonwebtoken');
const store = {}; const writes = [];
pg.Pool.prototype.query = async function (sql, params) {
  const q = String(sql).replace(/\s+/g, ' ');
  if (/INSERT INTO app_settings/.test(q)) { store[params[0]] = params[1]; writes.push([params[0], params[1]]); return { rows: [], rowCount: 1 }; }
  if (/SELECT key, value FROM app_settings ORDER BY key/.test(q)) return { rows: Object.entries(store).map(([key, value]) => ({ key, value })) };
  return { rows: [], rowCount: 0 };
};
require(ROOT + '/server.js');
const admin = jwt.sign({ sub: 'dev', role: 'dev', type: 'dev' }, process.env.JWT_SECRET)   /* Sprint 22.4: forecast_* settings are dev-only */, staff = jwt.sign({ sub: '11111111-1111-4111-8111-111111111111', role: 'employee', type: 'staff' }, process.env.JWT_SECRET);
const call = async (m, p, tok, body) => { const r = await fetch('http://127.0.0.1:3993' + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
(async () => {
  await sleep(600);
  await t('admin-only', async () => {
    assert.strictEqual((await call('PUT', '/api/admin/settings', null, { forecast_allowance_scale_pct: '100' })).status, 401);
    assert.strictEqual((await call('PUT', '/api/admin/settings', staff, { forecast_allowance_scale_pct: '100' })).status, 403);
  });
  await t('valid values are saved as strings and read back through GET /admin/settings', async () => {
    const r = await call('PUT', '/api/admin/settings', admin, { forecast_allowance_enabled: 'true', forecast_allowance_scale_pct: '130', forecast_allowance_min_extra: '3' });
    assert.strictEqual(r.status, 200); const g = await call('GET', '/api/admin/settings', admin);
    assert.strictEqual(g.body.settings.forecast_allowance_scale_pct, '130'); assert.strictEqual(g.body.settings.forecast_allowance_min_extra, '3'); assert.strictEqual(g.body.settings.forecast_allowance_enabled, 'true');
  });
  await t('invalid values are rejected and nothing is written', async () => {
    writes.length = 0;
    for (const bad of [{ forecast_allowance_scale_pct: '10' }, { forecast_allowance_scale_pct: '999' }, { forecast_allowance_scale_pct: 'abc' }, { forecast_allowance_min_extra: '-1' }, { forecast_allowance_min_extra: '11' }, { forecast_allowance_enabled: 'maybe' }]) {
      const r = await call('PUT', '/api/admin/settings', admin, bad); assert.strictEqual(r.status, 400, JSON.stringify(bad));
    }
    assert.strictEqual(writes.length, 0);
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
