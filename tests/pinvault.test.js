// Sprint 24.4 — PIN vault: encrypted PIN copy that ONLY dev can reveal. Crypto, set/change/reset hooks, login backfill, reveal route (auth matrix,
// audit log, every "can't show it" reason), and the pre-migration fallback. DB fully faked.   node tests/pinvault.test.js "$PWD"
const ROOT = process.argv[2] + '/server'; const assert = require('assert');
process.env.PORT = '3993'; process.env.JWT_SECRET = 'z'.repeat(40); process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none'; delete process.env.PIN_VIEW_KEY;
const jwt = require(ROOT + '/node_modules/jsonwebtoken'); const bcrypt = require(ROOT + '/node_modules/bcryptjs'); const pg = require(ROOT + '/node_modules/pg');
const UID = '11111111-1111-4111-8111-111111111111', UID2 = '22222222-2222-4222-8222-222222222222';
const db = { users: { [UID]: { name: 'Fran', pin_hash: null, pin_enc: null, pin_required: true, pin_must_set: false }, [UID2]: { name: 'Hana', pin_hash: bcrypt.hashSync('4321', 4), pin_enc: null, pin_required: true, pin_must_set: false } }, audit: [], missingColumn: false, log: [] };
pg.Pool.prototype.query = async function (sql, p) { const q = String(sql).replace(/\s+/g, ' '); db.log.push(q.slice(0, 70));
  if (/WHERE key = 'enabled_login_methods'/.test(q)) return { rows: [] };
  if (/pin_enc/.test(q) && db.missingColumn) { const e = new Error('column "pin_enc" does not exist'); e.code = '42703'; throw e; }
  if (/pin_hash/.test(q) && /FROM users u LEFT JOIN departments/.test(q)) { const u = Object.entries(db.users).find(([, v]) => v.phone === p[0]); return { rows: u ? [{ user_id: u[0], name: u[1].name, role: 'employee', department_id: 1, department: 'Front Desk', pin_hash: u[1].pin_hash, pin_required: u[1].pin_required, pin_must_set: u[1].pin_must_set, preferred_language: 'en' }] : [] }; }
  if (/^UPDATE users SET pin_hash = \$1, pin_enc = \$2, pin_must_set = false/.test(q)) { Object.assign(db.users[p[2]], { pin_hash: p[0], pin_enc: p[1], pin_must_set: false }); return { rows: [{ user_id: p[2] }] }; }
  if (/^UPDATE users SET pin_hash = \$1, pin_must_set = false WHERE user_id = \$2/.test(q)) { Object.assign(db.users[p[1]], { pin_hash: p[0], pin_must_set: false }); return { rows: [{ user_id: p[1] }] }; }
  if (/^UPDATE users SET pin_enc = \$1 WHERE user_id = \$2 AND pin_enc IS NULL/.test(q)) { if (!db.users[p[1]].pin_enc) db.users[p[1]].pin_enc = p[0]; return { rows: [], rowCount: 1 }; }
  if (/^UPDATE users SET pin_enc = NULL/.test(q)) { db.users[p[0]].pin_enc = null; return { rows: [], rowCount: 1 }; }
  if (/^UPDATE users SET pin_hash = NULL, pin_must_set = true/.test(q)) { Object.assign(db.users[p[0]], { pin_hash: null, pin_must_set: true }); return { rows: [{ user_id: p[0], pin_required: true, pin_must_set: true, has_pin: false }] }; }
  if (/SELECT pin_hash FROM users/.test(q)) return { rows: [{ pin_hash: db.users[p[0]].pin_hash }] };
  if (/SELECT name, pin_hash, pin_enc FROM users/.test(q)) { const u = db.users[p[0]]; return { rows: u ? [{ name: u.name, pin_hash: u.pin_hash, pin_enc: u.pin_enc }] : [] }; }
  if (/INSERT INTO audit_logs/.test(q)) { db.audit.push({ q, p }); return { rows: [], rowCount: 1 }; }
  return { rows: [], rowCount: 0 }; };
pg.Pool.prototype.connect = async function () { return { query: async () => ({ rows: [], rowCount: 0 }), release() {} }; };
db.users[UID].phone = '4155550101'; db.users[UID2].phone = '4155550102';
const sign = (o) => jwt.sign(o, process.env.JWT_SECRET); const T = { none: null, staff: sign({ sub: UID, role: 'employee', type: 'staff' }), staff2: sign({ sub: UID2, role: 'employee', type: 'staff' }), admin: sign({ sub: 'mgr', role: 'admin', type: 'admin' }), dev: sign({ sub: 'dev', role: 'dev', type: 'dev' }) };
const http = (p, o = {}) => fetch('http://127.0.0.1:3993' + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => null), cache: r.headers.get('cache-control') }));
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
(async () => {
  const V = require(ROOT + '/pinvault');
  await t('crypto: round-trip, random IV, tamper / wrong key / no key → null; nothing is stored without a key', () => {
    assert.strictEqual(V.configured(), false); assert.strictEqual(V.encryptPin('1234'), null); assert.strictEqual(V.decryptPin('v1.a.b.c'), null);
    process.env.PIN_VIEW_KEY = 'a-long-secret-for-tests'; assert(V.configured()); const a = V.encryptPin('1234'), b = V.encryptPin('1234'); assert(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/.test(a)); assert.notStrictEqual(a, b, 'fresh IV each time'); assert(!a.includes('1234'));
    assert.strictEqual(V.decryptPin(a), '1234'); assert.strictEqual(V.decryptPin(a.slice(0, -2) + 'AA'), null, 'tampered'); assert.strictEqual(V.decryptPin('garbage'), null); assert.strictEqual(V.decryptPin(null), null);
    process.env.PIN_VIEW_KEY = 'a-different-secret-xyz'; assert.strictEqual(V.decryptPin(a), null, 'wrong key'); process.env.PIN_VIEW_KEY = 'short'; assert.strictEqual(V.configured(), false, 'under 16 characters = off'); process.env.PIN_VIEW_KEY = 'a-long-secret-for-tests'; assert.strictEqual(V.decryptPin(a), '1234');
  });
  delete process.env.PIN_VIEW_KEY; require(ROOT + '/server.js'); await sleep(600);
  const reveal = (id, who) => http(`/api/dev/employees/${id}/pin/reveal`, { method: 'POST', token: T[who] });
  await t('NO KEY configured: setting a PIN works exactly as before, nothing is stored, dev is told why', async () => {
    const r = await http('/api/auth/staff/set-pin', { method: 'POST', token: T.staff, body: { pin: '2468' } }); assert.strictEqual(r.status, 200); assert(await bcrypt.compare('2468', db.users[UID].pin_hash)); assert.strictEqual(db.users[UID].pin_enc, null);
    const v = await reveal(UID, 'dev'); assert.deepStrictEqual([v.status, v.body.pin, v.body.reason], [200, null, 'not_configured']); assert.strictEqual(db.audit.length, 0);
  });
  process.env.PIN_VIEW_KEY = 'a-long-secret-for-tests';
  await t('with a key: set-pin and change-pin store an encrypted copy (never the plain PIN) and sign-in still uses the hash', async () => {
    let r = await http('/api/auth/staff/set-pin', { method: 'POST', token: T.staff, body: { pin: '1357' } }); assert.strictEqual(r.status, 200); assert(await bcrypt.compare('1357', db.users[UID].pin_hash)); assert.strictEqual(V.decryptPin(db.users[UID].pin_enc), '1357'); assert(!/1357/.test(db.users[UID].pin_enc));
    r = await http('/api/auth/staff/change-pin', { method: 'POST', token: T.staff, body: { currentPin: '1357', newPin: '9753' } }); assert.strictEqual(r.status, 200); assert.strictEqual(V.decryptPin(db.users[UID].pin_enc), '9753'); assert(await bcrypt.compare('9753', db.users[UID].pin_hash));
    assert.strictEqual((await http('/api/auth/staff/login', { method: 'POST', body: { identifier: '4155550101', pin: '9753' } })).status, 200); assert.strictEqual((await http('/api/auth/staff/login', { method: 'POST', body: { identifier: '4155550101', pin: '1111' } })).status, 401);
  });
  await t('REVEAL: no token 401 · staff 403 · MANAGER (admin) 403 · dev gets the PIN, no-store, and an audit row (who, whose) — the admin routes never carry it', async () => {
    assert.strictEqual((await reveal(UID, 'none')).status, 401); assert.strictEqual((await reveal(UID, 'staff')).status, 403); const a = await reveal(UID, 'admin'); assert.strictEqual(a.status, 403); assert(!JSON.stringify(a.body).includes('9753'));
    db.audit.length = 0; const d = await reveal(UID, 'dev'); assert.strictEqual(d.status, 200); assert.strictEqual(d.body.pin, '9753'); assert.strictEqual(d.cache, 'no-store'); assert.strictEqual(db.audit.length, 1); assert(/dev_pin_reveal/.test(db.audit[0].q));
    assert.deepStrictEqual(JSON.parse(db.audit[0].p[1]), { dev: 'dev', employee: 'Fran' }); assert.strictEqual(db.audit[0].p[0], UID); assert(!db.audit[0].p.join('|').includes('9753'), 'the PIN itself is never written to the audit log');
    { const g = await http(`/api/dev/employees/${UID}/pin/reveal`, { token: T.dev }); assert(g.status !== 200 && !JSON.stringify(g.body).includes('9753'), 'GET never returns the PIN'); } assert.strictEqual((await reveal('not-an-id', 'dev')).status, 400);
  });
  await t('an older PIN (set before the vault) shows "not stored" — then fills in the next time its owner signs in WITH it; a wrong PIN never stores anything', async () => {
    let v = await reveal(UID2, 'dev'); assert.deepStrictEqual([v.body.pin, v.body.reason], [null, 'not_stored']);
    assert.strictEqual((await http('/api/auth/staff/login', { method: 'POST', body: { identifier: '4155550102', pin: '0000' } })).status, 401); await sleep(30); assert.strictEqual(db.users[UID2].pin_enc, null);
    assert.strictEqual((await http('/api/auth/staff/login', { method: 'POST', body: { identifier: '4155550102', pin: '4321' } })).status, 200); await sleep(60); v = await reveal(UID2, 'dev'); assert.strictEqual(v.body.pin, '4321');
  });
  await t('reset clears the copy and the hash; a person with no PIN → "no_pin"; unknown id → 404; a wrong key reads as "not stored"', async () => {
    assert.strictEqual((await http(`/api/admin/employees/${UID}/pin/reset`, { method: 'POST', token: T.admin })).status, 200); assert.strictEqual(db.users[UID].pin_enc, null); const v = await reveal(UID, 'dev'); assert.deepStrictEqual([v.body.pin, v.body.reason], [null, 'no_pin']);
    assert.strictEqual((await reveal('99999999-9999-4999-8999-999999999999', 'dev')).status, 404);
    process.env.PIN_VIEW_KEY = 'rotated-key-rotated-key'; const w = await reveal(UID2, 'dev'); assert.deepStrictEqual([w.body.pin, w.body.reason], [null, 'not_stored']); process.env.PIN_VIEW_KEY = 'a-long-secret-for-tests';
  });
  await t('BEFORE migration 031 (column missing) setting a PIN still works, login still works, reveal says "not stored" — nothing breaks', async () => {
    db.missingColumn = true; const r = await http('/api/auth/staff/set-pin', { method: 'POST', token: T.staff, body: { pin: '5555' } }); assert.strictEqual(r.status, 200); assert(await bcrypt.compare('5555', db.users[UID].pin_hash));
    assert.strictEqual((await http('/api/auth/staff/login', { method: 'POST', body: { identifier: '4155550101', pin: '5555' } })).status, 200); const v = await reveal(UID, 'dev'); assert.deepStrictEqual([v.status, v.body.pin, v.body.reason], [200, null, 'not_stored']); db.missingColumn = false;
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
