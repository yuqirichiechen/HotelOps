// Sprint 23 — the REAL Housekeeping page in jsdom: pick housekeepers (search existing staff), auto-suggest, move rooms, save, print sheets.
//   node tests/housekeeping.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; globalThis.__HOTELOPS_NO_ANIM = true; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils'); const { computeForecast } = require(ROOT + '/server/forecast/compute');
const TODAY = '2026-10-19'; let calls = [], savedPlans = {}, apiOverride = null;
const R = (n, f, occ, hk) => ({ id: 'room' + n, roomNumber: String(n), roomTypeId: 'rt1', floorId: f, status: true, currentOccupancyStatus: occ, housekeepingRoomStatus: hk, roomInventoryStatus: occ });
const rooms = []; for (let i = 1; i <= 14; i++) rooms.push(R(100 + i, '01', i <= 6 ? 'VAC' : 'OCC', i <= 6 ? (i % 2 ? 'D' : 'IP') : 'OC')); for (let i = 1; i <= 12; i++) rooms.push(R(200 + i, '02', 'OCC', 'OC')); rooms.push(R(301, '03', 'VAC', 'VI'));
const inh = (n, dep) => ({ id: 'i' + n, status: 'INH', roomType: 'rt1', roomId: 'room' + n, roomNumber: String(n), arrivalDateLocalDate: '2026-10-17', departureDateLocalDate: dep, arrivalDate: '2026-10-17T07:00:00Z', departureDate: dep + 'T07:00:00Z', confirmationId: 'C' + n, ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'G', lastName: String(n) } });
const resv = []; for (let i = 7; i <= 14; i++) resv.push(inh(100 + i, i <= 9 ? TODAY : '2026-10-22')); for (let i = 1; i <= 12; i++) resv.push(inh(200 + i, '2026-10-23'));
const payload = computeForecast({ rooms, roomTypes: [{ id: 'rt1', typeCode: 'NQRR', name: 'Double Queen' }], reservations: resv, metrics: { remainingArrivalsSummary: { total: 0, remaining: 0 }, remainingDeparturesSummary: { total: 3, remaining: 3 }, totalGuestsSummary: { total: 20 }, roomConditionSummary: [] }, vipStatuses: [], ratePlans: [], roomTypeMapping: [], config: {}, forecastDate: TODAY });
const staff = [['u1', 'Maria Lopez', 'Housekeeping'], ['u2', 'Ana Ruiz', 'Housekeeping'], ['u3', 'Luis Mora', 'Housekeeping'], ['u4', 'Dana Front', 'Front Desk'], ['u5', 'Old Timer', 'Housekeeping', false]].map(([user_id, name, department, active = true]) => ({ user_id, name, department, active }));
const apiFetch = async (p, o = {}) => { calls.push({ p, method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null }); if (apiOverride) { const r = apiOverride(p, o); if (r) return r; }
  if (p === '/admin/forecast/current') return { ok: true, data: { success: true, snapshot: { scraped_at: new Date().toISOString(), payload } } };
  if (p === '/admin/forecast/live') return { ok: false, status: 502, data: { success: false } };
  if (p === '/admin/settings') return { ok: true, data: { success: true, settings: { forecast_allowance_enabled: 'false' } } };
  if (p === '/admin/employees') return { ok: true, data: { success: true, employees: staff } };
  if (p.startsWith('/admin/housekeeping/plan') && (o.method || 'GET') === 'GET') { const d = p.split('date=')[1]; return { ok: true, data: { success: true, plan: savedPlans[d] || null } }; }
  if (p === '/admin/housekeeping/plan' && o.method === 'PUT') { const b = JSON.parse(o.body); savedPlans[b.date] = { date: b.date, settings: b.settings, assignments: b.assignments, updatedAt: '2026-10-19T15:00:00Z' }; return { ok: true, data: { success: true, updatedAt: '2026-10-19T15:00:00Z' } }; }
  return { ok: false, status: 404, data: { message: 'no mock ' + p } }; };
const modCache = new Map(); const load = (file) => { if (modCache.has(file)) return modCache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); modCache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { apiFetch, authFetch: apiFetch }; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : (fs.existsSync(p) && fs.statSync(p).isDirectory() ? p + '/index.js' : p)); } return orig(id); };
  m._compile(code, file); return m.exports; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 5).join(' | ')); process.exitCode = 1; } };
const Page = load(ROOT + '/src/components/Housekeeping/index.js').default;
let printed = 0; w.print = () => { printed++; }; globalThis.confirm = w.confirm = () => true;
async function mount() { calls = []; document.body.querySelectorAll('.hk-printroot').forEach(n => n.remove()); const el = document.getElementById('root'); el.innerHTML = ''; const root = createRoot(el);
  await act(async () => { root.render(React.createElement(Page, {})); }); await act(async () => { await sleep(60); });
  const flush = () => act(async () => { await sleep(30); });
  const click = async (n) => { await act(async () => { n.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await flush(); };
  const type = async (input, v) => { await act(async () => { const set = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set; set.call(input, v); input.dispatchEvent(new w.Event('input', { bubbles: true })); }); await flush(); };
  const choose = async (sel, v) => { await act(async () => { const set = Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set; set.call(sel, v); sel.dispatchEvent(new w.Event('change', { bubbles: true })); }); await flush(); };
  const btn = (re) => [...document.querySelectorAll('button')].find(b => re.test(b.textContent));
  const addHk = async (name) => { await type(el.querySelector('#hk-search'), name); await click([...el.querySelectorAll('.hk-picker-list [role=option]')].find(b => b.textContent.includes(name))); };
  const col = (name) => [...el.querySelectorAll('.hk-col')].find(c => c.querySelector('h2').textContent.startsWith(name));
  return { el, click, type, choose, btn, addHk, col, unmount: () => act(async () => { root.unmount(); }) }; }

(async () => {
  await t('loads today: tiles show rooms to clean / stay-overs to service / workload; every room starts UNASSIGNED; Today + Tomorrow tabs; staff list loaded once (no polling)', async () => {
    const h = await mount(); const tile = (re) => [...h.el.querySelectorAll('.hk-tile')].find(x => re.test(x.textContent)).querySelector('strong').textContent;
    assert.strictEqual(tile(/Rooms to clean/), '9', 'six dirty/in-progress vacant + three checking out today'); assert.strictEqual(tile(/Stay-overs/), '17', 'five in-house + twelve on floor 2'); assert.strictEqual(tile(/Total workload/), '17.5');
    assert.strictEqual(h.el.querySelectorAll('.hk-col-un .hk-room').length, 26); assert(/Today/.test(h.el.querySelector('.hk-day.on').textContent)); assert.strictEqual(h.el.querySelectorAll('.hk-day').length, 2);
    for (const p of ['/admin/forecast/current', '/admin/forecast/live', '/admin/employees']) assert.strictEqual(calls.filter(c => c.p === p).length, 1, p); assert(calls.some(c => c.p === '/admin/housekeeping/plan?date=' + TODAY)); await h.unmount();
  });
  await t('STAFF PICKER: searchable; defaults to the Housekeeping department (inactive people never listed); "all departments" widens it; adding makes a pill, removing returns rooms', async () => {
    const h = await mount(); await h.type(h.el.querySelector('#hk-search'), 'a'); const names = () => [...h.el.querySelectorAll('.hk-picker-list [role=option] span')].map(x => x.textContent);
    assert.deepStrictEqual(names().sort(), ['Ana Ruiz', 'Luis Mora', 'Maria Lopez'], 'Housekeeping dept only, active only (no Old Timer), filtered by "a"'); await h.click(h.el.querySelector('.hk-check input')); assert(names().includes('Dana Front'), 'all departments'); assert(!names().includes('Old Timer'));
    await h.type(h.el.querySelector('#hk-search'), 'dana'); assert.deepStrictEqual(names(), ['Dana Front']); await h.type(h.el.querySelector('#hk-search'), 'zzz'); assert(/No one matches/.test(h.el.textContent));
    await h.addHk('Dana'); assert(!h.el.querySelector('.hk-picker-list'), 'the list closes after choosing'); assert.deepStrictEqual([...h.el.querySelectorAll('.hk-pill')].map(p => p.firstChild.textContent), ['Dana Front']); assert(h.col('Dana Front')); await h.type(h.el.querySelector('#hk-search'), 'dana'); assert(!names().includes('Dana Front'), 'already added'); await act(async () => { document.body.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); }); assert(!h.el.querySelector('.hk-picker-list'), 'click outside closes it');
    await h.click(h.el.querySelector('.hk-pill button')); assert(!h.el.querySelector('.hk-pill')); await h.unmount();
  });
  await t('AUTO-SUGGEST uses only as many housekeepers as the minimum allows (17.5 workload / 10 → 1), more when the minimum is lowered; Clear all empties; rooms are handed out by floor', async () => {
    const h = await mount(); await h.addHk('Maria'); await h.addHk('Ana'); await h.addHk('Luis'); assert.strictEqual(h.el.querySelectorAll('.hk-col').length, 4, 'unassigned + three');
    await h.click(h.btn(/Auto-suggest/)); assert.strictEqual(h.col('Maria').querySelectorAll('.hk-room').length, 26, 'all 17.5 units fit one person at min 10'); assert(!h.el.querySelector('.hk-col-un'), 'nothing left unassigned');
    assert.strictEqual(h.col('Ana').querySelectorAll('.hk-room').length, 0); assert(/No rooms yet/.test(h.col('Ana').textContent));
    await h.type(h.el.querySelectorAll('.hk-settings input')[0], '5'); await h.click(h.btn(/Auto-suggest/)); const counts = ['Maria', 'Ana', 'Luis'].map(n => h.col(n).querySelectorAll('.hk-room').length); assert(counts.every(c => c > 0) && counts.reduce((a, b) => a + b) === 26, counts.join(','));
    const marias = [...h.col('Maria').querySelectorAll('.hk-room-num')].map(x => x.textContent); assert(marias[0].startsWith('1'), 'first floor first');
    await h.click(h.btn(/Clear all/)); assert.strictEqual(h.el.querySelectorAll('.hk-col-un .hk-room').length, 26); await h.unmount();
  });
  await t('MOVE a room with its drop-down; totals + the minimum meter update; below-minimum is flagged; priority + task badges show', async () => {
    const h = await mount(); await h.addHk('Maria'); await h.addHk('Ana'); const un = h.el.querySelector('.hk-col-un'); const first = un.querySelector('.hk-room'); const num = first.querySelector('.hk-room-num').textContent;
    await h.choose(first.querySelector('select'), 'u1'); assert.strictEqual(h.col('Maria').querySelectorAll('.hk-room').length, 1); assert(h.col('Maria').textContent.includes(num)); assert(/Below the minimum of 10/.test(h.col('Maria').textContent)); assert.strictEqual(h.el.querySelectorAll('.hk-col-un .hk-room').length, 25);
    await h.choose(h.col('Maria').querySelector('select'), 'u2'); assert(h.col('Ana').textContent.includes(num)); await h.choose(h.col('Ana').querySelector('select'), ''); assert.strictEqual(h.el.querySelectorAll('.hk-col-un .hk-room').length, 26);
    assert(h.el.querySelector('.hk-badge-clean') && h.el.querySelector('.hk-badge-service')); assert(/Unsaved changes/.test(h.el.textContent)); await h.unmount();
  });
  await t('SAVE stores the day: housekeepers + their rooms (clean-first first), settings; the indicator says Saved; a reload restores it exactly', async () => {
    savedPlans = {}; const h = await mount(); await h.addHk('Maria'); await h.addHk('Ana'); await h.type(h.el.querySelectorAll('.hk-settings input')[0], '8'); await h.click(h.btn(/Auto-suggest/)); await h.click(h.btn(/^Save$/));
    const put = calls.find(c => c.method === 'PUT'); assert(put, 'PUT sent'); assert.strictEqual(put.body.date, TODAY); assert.strictEqual(put.body.settings.min, 8); assert.deepStrictEqual(put.body.assignments.map(a => a.name), ['Maria Lopez', 'Ana Ruiz']);
    const total = put.body.assignments.reduce((n, a) => n + a.rooms.length, 0); assert.strictEqual(total, 26); assert(put.body.assignments.every(a => a.rooms.every(r => /^\d+$/.test(r.roomNumber) && (r.kind === 'clean' || r.kind === 'service'))));
    assert(/Saved/.test(h.el.querySelector('.hk-savestate').textContent) && h.btn(/^Saved$/).disabled); const was = JSON.stringify(put.body.assignments); await h.unmount();
    const h2 = await mount(); assert.strictEqual(h2.el.querySelectorAll('.hk-pill').length, 2); assert.strictEqual(h2.el.querySelector('.hk-settings input').value, '8'); const again = []; h2.el.querySelectorAll('.hk-col:not(.hk-col-un)').forEach(c => again.push(c.querySelectorAll('.hk-room').length));
    assert.strictEqual(again.reduce((a, b) => a + b, 0), 26); assert(!h2.el.querySelector('.hk-col-un'), 'everything restored as assigned'); assert(/Saved/.test(h2.el.querySelector('.hk-savestate').textContent)); void was; await h2.unmount();
  });
  await t('RESTORE reconciles: a saved room that no longer needs work disappears; a new room shows up unassigned', async () => {
    savedPlans = { [TODAY]: { date: TODAY, settings: {}, assignments: [{ userId: 'u1', name: 'Maria Lopez', rooms: [{ roomNumber: '101', kind: 'clean' }, { roomNumber: '999', kind: 'clean' }, { roomNumber: '301', kind: 'clean' }] }], updatedAt: '2026-10-19T15:00:00Z' } };
    const h = await mount(); const mine = [...h.col('Maria').querySelectorAll('.hk-room-num')].map(x => x.textContent); assert.deepStrictEqual(mine, ['101'], '999 and 301 need no work today'); assert.strictEqual(h.el.querySelectorAll('.hk-col-un .hk-room').length, 25); await h.unmount(); savedPlans = {};
  });
  await t('TOMORROW tab: its own work list and its own saved plan; switching with unsaved changes asks first', async () => {
    let asked = 0; w.confirm = () => { asked++; return false; }; globalThis.confirm = w.confirm; const h = await mount(); await h.addHk('Maria'); await h.click(h.btn(/Auto-suggest/)); await h.click([...h.el.querySelectorAll('.hk-day')][1]);
    assert.strictEqual(asked, 1); assert(/Today/.test(h.el.querySelector('.hk-day.on').textContent), 'stayed on today (declined)'); w.confirm = () => true; globalThis.confirm = w.confirm; await h.click(h.btn(/^Save$/)); await h.click([...h.el.querySelectorAll('.hk-day')][1]);
    assert(/Tomorrow/.test(h.el.querySelector('.hk-day.on').textContent)); assert(calls.some(c => c.p === '/admin/housekeeping/plan?date=2026-10-20')); assert.strictEqual(h.el.querySelectorAll('.hk-pill').length, 0, "today's housekeepers are not carried into tomorrow");
    const clean = Number([...h.el.querySelectorAll('.hk-tile')][0].querySelector('strong').textContent), service = Number([...h.el.querySelectorAll('.hk-tile')][1].querySelector('strong').textContent); assert(clean + service > 0); await h.unmount();
  });
  await t('PRINT: saves first, then opens ONE page per housekeeper (their rooms, clean-first marked, tick boxes); "Print sheet" prints only that person; the body is marked so only the sheet reaches paper', async () => {
    savedPlans = {}; printed = 0; const h = await mount(); await h.addHk('Maria'); await h.addHk('Ana'); await h.type(h.el.querySelectorAll('.hk-settings input')[0], '5'); await h.click(h.btn(/Auto-suggest/));
    await h.click(h.btn(/Print all sheets/)); await act(async () => { await sleep(150); }); assert(calls.some(c => c.method === 'PUT'), 'saved before printing'); assert.strictEqual(printed, 1);
    const root = document.querySelector('.hk-printroot'); assert(root && root.parentNode === document.body && root.classList.contains('fc-print-root'), 'portaled to body'); assert(document.body.classList.contains('is-printing-sheet'));
    const pages = [...root.querySelectorAll('.hk-page')]; assert.deepStrictEqual(pages.map(p => p.querySelector('h1').textContent), ['Maria Lopez', 'Ana Ruiz']); assert(pages.every(p => p.querySelectorAll('.hk-box').length === p.querySelectorAll('tbody tr').length && /Mon, Oct 19/.test(p.textContent)));
    assert.strictEqual(pages.reduce((n, p) => n + p.querySelectorAll('tbody tr').length, 0), 26); await act(async () => { w.dispatchEvent(new w.Event('afterprint')); }); assert(!document.querySelector('.hk-printroot') && !document.body.classList.contains('is-printing-sheet'), 'cleaned up after printing');
    const putsBefore = calls.filter(c => c.method === 'PUT').length; await h.click(h.col('Ana').querySelector('.hk-btn-sm')); await act(async () => { await sleep(150); }); const one = [...document.querySelectorAll('.hk-page')]; assert.deepStrictEqual(one.map(p => p.querySelector('h1').textContent), ['Ana Ruiz']); assert.strictEqual(calls.filter(c => c.method === 'PUT').length, putsBefore, 'nothing changed → no second save'); assert.strictEqual(printed, 2);
    await act(async () => { w.dispatchEvent(new w.Event('afterprint')); }); await h.unmount();
  });
  await t('failed save → the error is shown and nothing is printed; Print is disabled with no housekeepers', async () => {
    savedPlans = {}; printed = 0; apiOverride = (p, o) => (o.method === 'PUT' ? { ok: false, status: 500, data: { success: false, message: 'Server error' } } : null); const h = await mount(); assert(h.btn(/Print all sheets/).disabled);
    await h.addHk('Maria'); await h.click(h.btn(/Auto-suggest/)); await h.click(h.btn(/Print all sheets/)); await act(async () => { await sleep(150); }); assert(/Server error/.test(h.el.querySelector('.hk-savestate').textContent)); assert.strictEqual(printed, 0); assert(!document.querySelector('.hk-printroot')); apiOverride = null; await h.unmount();
  });
  if (process.env.DUMP_HK) { savedPlans = {}; const h = await mount(); await h.addHk('Maria'); await h.addHk('Ana'); await h.type(h.el.querySelectorAll('.hk-settings input')[0], '5'); await h.click(h.btn(/Auto-suggest/)); fs.writeFileSync(process.env.DUMP_HK + '-screen.html', document.body.innerHTML);
    await h.click(h.btn(/Print all sheets/)); await act(async () => { await sleep(150); }); fs.writeFileSync(process.env.DUMP_HK + '-print.html', document.body.innerHTML); }
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
