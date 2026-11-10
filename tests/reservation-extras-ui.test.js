// Sprint 26.2 — the dev "rGuest history" panel inside a reservation's details: audit log, authorization & payment history, comments (Include archived,
// reservation / guest-profile tabs), the "not saved yet" state and failures.   node tests/reservation-extras-ui.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils');
const { buildExtras } = require(ROOT + '/server/forecast/extras');
const raw = { auditLog: { totalElements: 7, entries: Array.from({ length: 7 }, (_, i) => ({ timestamp: `2026-11-09T${String(23 - i).padStart(2, '0')}:13:00Z`, user: 'richie', changes: [{ type: 'ADD', path: [{ value: 'discloseRoomType', type: 'FIELD' }], to: [{ value: 'Yes' }] }] })) },
  authHistory: [{ authCode: 'BWDG7E', cardNumber: '3178', amount: 160.61, issuer: 'Mastercard', transactionDate: '2026-11-09', transactionTime: '14:41', user: 'SiteMinder', authorizationType: 'PAYMENT', success: true }],
  reservationComments: [{ id: 'c1', text: 'Mom sent CC form', commentTypeName: 'Check-In', importance: 'CRITICAL', createdBy: 'lmmasters', createdAt: '2026-10-12T17:47:55Z', lastModifiedAt: '2026-10-12T17:47:55Z', metadata: {} }, { id: 'c2', text: 'archived note', importance: 'MEDIUM', createdBy: 'r', createdAt: '2026-10-10T10:00:00Z', lastModifiedAt: '2026-10-10T10:00:00Z', metadata: { deleted: true } }],
  profileComments: [{ id: 'c3', text: 'Prefers quiet room', importance: 'LOW', createdBy: 'amy', createdAt: '2026-09-01T10:00:00Z', lastModifiedAt: '2026-09-01T10:00:00Z', metadata: {} }] };
const ok = { auditLog: { ok: true }, authHistory: { ok: true }, reservationComments: { ok: true }, profileComments: { ok: true } };
let reply; const urls = []; const apiFetch = async (p) => { urls.push(p); return reply; };
const modCache = new Map(); const load = (file) => { if (modCache.has(file)) return modCache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); modCache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { apiFetch, authFetch: apiFetch }; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); };
  m._compile(code, file); return m.exports; };
const Extras = load(ROOT + '/src/components/Forecasting/ResnExtras.js').default;
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
async function mount() { const el = document.getElementById('root'); el.innerHTML = ''; const root = createRoot(el); await act(async () => { root.render(React.createElement(Extras, { id: 'rid-1', version: 'v1' })); }); await act(async () => { await sleep(30); }); return el; }
const click = async (n) => { await act(async () => { n.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); };
(async () => {
  await t('loads from /admin/reservations/:id/extras and shows audit log (first 5, then all), payments with totals, and the comments', async () => {
    reply = { ok: true, data: { success: true, extras: buildExtras(raw, ok) } }; urls.length = 0; const el = await mount();
    assert.deepStrictEqual(urls, ['/admin/reservations/rid-1/extras']);
    assert(/Audit log/.test(el.textContent) && /7 entries/.test(el.textContent)); assert.strictEqual(el.querySelectorAll('.rx-audit > li').length, 5); assert(/Added Disclose Room Type Yes/.test(el.textContent) && /by richie/.test(el.textContent));
    await click([...el.querySelectorAll('button')].find(b => /Show all 7/.test(b.textContent))); assert.strictEqual(el.querySelectorAll('.rx-audit > li').length, 7);
    const th = [...el.querySelectorAll('.rx-table th')].map(x => x.textContent); assert.deepStrictEqual(th, ['Date', 'Time', 'User', 'Auth code', 'Card', 'Type', 'Amount', 'Issuer', 'Status', 'Reason']);
    assert(/BWDG7E/.test(el.textContent) && /\*{12}3178/.test(el.textContent) && /Mastercard/.test(el.textContent) && /160\.61/.test(el.textContent));
    assert(/Mom sent CC form/.test(el.textContent) && /Check-In/.test(el.textContent) && /critical/.test(el.textContent)); assert(!/archived note/.test(el.textContent), 'archived hidden by default');
  });
  await t('Include archived reveals archived comments; the Guest profile tab shows the profile comments', async () => {
    const el = await mount(); const box = el.querySelector('.rx-check input'); assert(box, 'checkbox offered because one is archived'); await act(async () => { box.click(); }); assert(/archived note/.test(el.textContent) && /Archived/.test(el.textContent));
    await click([...el.querySelectorAll('.rx-seg button')].find(b => /Guest profile/.test(b.textContent))); assert(/Prefers quiet room/.test(el.textContent) && !/Mom sent/.test(el.textContent));
  });
  await t('a reservation saved before this sprint says it is not saved yet and points at Refresh', async () => {
    reply = { ok: true, data: { success: true, extras: buildExtras({ reservation: {} }, { reservation: { ok: true } }) } }; const el = await mount();
    assert(/Not saved yet/.test(el.textContent) && /Refresh/.test(el.textContent)); assert.strictEqual(el.querySelectorAll('.rx-table').length, 0);
  });
  await t('empty sections read as empty, a failed section is flagged, and a request error is shown', async () => {
    reply = { ok: true, data: { success: true, extras: buildExtras({ auditLog: { totalElements: 0, entries: [] }, authHistory: [], reservationComments: [], profileComments: [] }, { ...ok, authHistory: { ok: false, error: 'HTTP 404' } }) } }; let el = await mount();
    assert(/No history recorded/.test(el.textContent) && /No authorizations or payments/.test(el.textContent) && /No comments on this reservation/.test(el.textContent) && /Couldn.t refresh: HTTP 404/.test(el.textContent));
    reply = { ok: false, status: 403, data: { success: false, message: 'Forbidden' } }; el = await mount(); assert(/Forbidden/.test(el.textContent));
  });
  console.log(`\n${pass} passed`); process.exit(process.exitCode || 0);
})();
