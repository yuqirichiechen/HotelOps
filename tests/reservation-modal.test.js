// Sprint 26.3 — dev reservation list: "More details" is a pop-up card (portal dialog; Esc / backdrop / × close it; the row itself does not expand), the audit-log
// search, and the Recent changes card layout (type badge on top, time under it).   node tests/reservation-modal.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils');
const { buildExtras } = require(ROOT + '/server/forecast/extras');
const mkEntry = (n, text) => ({ timestamp: `2026-11-09T${String(23 - n).padStart(2, '0')}:13:00Z`, user: n % 2 ? 'richie' : 'SiteMinder', changes: [{ type: 'ADD', path: [{ value: text, type: 'FIELD' }], to: [{ value: 'v' + n }] }] });
const raw = { auditLog: { totalElements: 8, entries: [mkEntry(0, 'status'), mkEntry(1, 'roomNumber'), mkEntry(2, 'discloseRoomType'), mkEntry(3, 'status'), mkEntry(4, 'rate'), mkEntry(5, 'rate'), mkEntry(6, 'rate'), mkEntry(7, 'rate')] }, authHistory: [], reservationComments: [], profileComments: [] };
const ok = { auditLog: { ok: true }, authHistory: { ok: true }, reservationComments: { ok: true }, profileComments: { ok: true } };
const apiFetch = async (p) => { if (/\/extras$/.test(p)) return { ok: true, data: { success: true, extras: buildExtras(raw, ok) } };
  if (p.startsWith('/admin/sync/events')) return { ok: true, data: { success: true, hasMore: false, summary: { new: 1 }, events: [{ event_id: 1, event_type: 'new', occurred_at: new Date().toISOString(), guest_name: 'Tiffany Wilson', type_code: 'NKRR', confirmation_id: '4DYVH3YW', source: 'SiteMinder', arrival_date: '2027-05-27', departure_date: '2027-05-28' }] } };
  return { ok: false, status: 404, data: {} }; };
const modCache = new Map(); const load = (file) => { if (modCache.has(file)) return modCache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); modCache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { apiFetch, authFetch: apiFetch }; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); };
  m._compile(code, file); return m.exports; };
const Item = load(ROOT + '/src/components/Forecasting/ResnItem.js').default; const Extras = load(ROOT + '/src/components/Forecasting/ResnExtras.js'); const Recent = load(ROOT + '/src/components/Forecasting/RecentChanges.js').default;
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
const r = { id: 'rid-1', guestName: 'Ann Lee', confirmationId: 'ABC123', statusLabel: 'In house', roomNumber: '101', arrivalDate: '2026-11-08', departureDate: '2026-11-10', nights: 2 };
const entry = { summary: { guest: { name: 'Ann Lee', phone: '555' }, stay: {}, booking: {}, money: {}, cards: [], comments: [], flags: {} }, fetchedAt: new Date().toISOString(), failedSections: [] };
function Host() { const [open, setOpen] = React.useState(false); const onRefresh = React.useCallback(() => {}, []);
  return React.createElement('ul', null, React.createElement(Item, { r, entry, flags: [], statusCls: 'inhouse', open, onToggle: () => setOpen(o => !o), onRefresh, onForget: async () => true, refreshing: false, jobRunning: false, beyondDetailWindow: false, rguestUrl: '#', attention: [] })); }
async function mount(el) { const root = createRoot(el); await act(async () => { root.render(React.createElement(Host)); }); return root; }
const click = async (n) => { await act(async () => { n.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await act(async () => { await sleep(30); }); };
(async () => {
  await t('More details opens a dialog on document.body (not inside the row); the row does not expand; Esc, backdrop and × close it; page scroll is locked while open', async () => {
    const el = document.getElementById('root'); await mount(el); const btn = () => [...el.querySelectorAll('button')].find(b => /More details/.test(b.textContent));
    assert(btn() && !document.querySelector('[role=dialog]')); await click(btn());
    const dlg = document.querySelector('[role=dialog]'); assert(dlg, 'dialog open'); assert(!el.contains(dlg), 'rendered in a portal'); assert.strictEqual(dlg.getAttribute('aria-modal'), 'true');
    assert(/Ann Lee/.test(dlg.textContent) && /ABC123/.test(dlg.textContent) && /rGuest history/.test(dlg.textContent), 'guest title + history panel inside the dialog'); assert(!el.querySelector('.rl-detail'), 'nothing expanded in the row');
    assert.strictEqual(document.body.style.overflow, 'hidden'); assert.strictEqual(document.activeElement.getAttribute('aria-label'), 'Close details', 'focus moves into the dialog');
    await act(async () => { document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); assert(!document.querySelector('[role=dialog]'), 'Esc closes'); assert.notStrictEqual(document.body.style.overflow, 'hidden');
    await click(btn()); await act(async () => { document.querySelector('.rl-modal-back').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); }); assert(!document.querySelector('[role=dialog]'), 'backdrop closes');
    await click(btn()); await click(document.querySelector('.rl-modal-x')); assert(!document.querySelector('[role=dialog]'), '× closes');
    await click(btn()); await act(async () => { document.querySelector('.rl-modal').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); }); assert(document.querySelector('[role=dialog]'), 'a click inside the card does not close it');
  });
  await t('audit search: every word must match (date / user / change), results are highlighted, an empty result says so, clearing restores the first 5', async () => {
    const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el); await act(async () => { root.render(React.createElement(Extras.default, { id: 'rid-1', version: 'v' })); }); await act(async () => { await sleep(30); });
    const items = () => el.querySelectorAll('.rx-audit > li').length, box = el.querySelector('.rx-search input'); assert(box); assert.strictEqual(items(), 5);
    const type = async (v) => { await act(async () => { const set = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set; set.call(box, v); box.dispatchEvent(new w.Event('input', { bubbles: true })); }); };
    await type('rate'); assert.strictEqual(items(), 4, 'searches ALL entries, not just the 5 shown'); assert(el.querySelector('.rx-audit mark') && /rate/i.test(el.querySelector('.rx-audit mark').textContent)); assert(/4 of 8/.test(el.textContent));
    await type('status richie'); assert.strictEqual(items(), 1, 'both words must match (status AND richie → entry 3)'); await type('SITEMINDER'); assert.strictEqual(items(), 4, 'case-insensitive, matches the user');
    await type('zzz'); assert.strictEqual(items(), 0); assert(/No entries match/.test(el.textContent)); await type('a.b(c'); assert.strictEqual(items(), 0, 'regex characters are literal');
    await type(''); assert.strictEqual(items(), 5); assert(!el.querySelector('mark'));
  });
  await t('searchAudit pure: blank returns everything; multi-word AND; matches the formatted date text', () => {
    const E = [{ at: '2026-11-09T23:13:00Z', user: 'a', lines: ['Added Status RES'] }, { at: '2026-11-08T10:00:00Z', user: 'b', lines: ['Changed Room'] }];
    assert.strictEqual(Extras.searchAudit(E, '  ').length, 2); assert.strictEqual(Extras.searchAudit(E, 'status res').length, 1); assert.strictEqual(Extras.searchAudit(E, 'changed status').length, 0);
  });
  await t('Recent changes card: the type badge comes FIRST, then the time, then the guest (badge no longer takes its own column)', async () => {
    const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el); await act(async () => { root.render(React.createElement(Recent, { persistOpen: false })); }); await act(async () => { await sleep(30); });
    const kids = [...el.querySelector('.rc-item').children].map(c => c.className.split(' ')[0]); assert.deepStrictEqual(kids, ['rc-type', 'rc-when', 'rc-main']);
    assert(/New booking/.test(el.querySelector('.rc-type').textContent) && /Tiffany Wilson/.test(el.querySelector('.rc-main').textContent));
  });
  console.log(`\n${pass} passed`); process.exit(process.exitCode || 0);
})();
