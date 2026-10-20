// Sprint 22.6 — the REAL Reservations page: MANAGER view is lean (guest name, stay, confirmation code, room type — nothing else);
// the DEV view keeps every function. node tests/reservations-lean.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
w.scrollTo = () => {};
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils'); const { computeForecast } = require(ROOT + '/server/forecast/compute');
const TODAY = '2026-10-12'; const calls = [];
const rooms = [{ id: 'r1', roomNumber: '101', roomTypeId: 'rt1', floorId: '01', status: true, currentOccupancyStatus: 'OCC', housekeepingRoomStatus: 'OC' }, { id: 'r2', roomNumber: '102', roomTypeId: 'rt2', floorId: '01', status: true, currentOccupancyStatus: 'VAC', housekeepingRoomStatus: 'VI' }];
const roomTypes = [{ id: 'rt1', typeCode: 'NQRR', name: 'Double Queen' }, { id: 'rt2', typeCode: 'NKRRP', name: 'King Pets' }];
const resn = (id, first, last, arr, dep, o = {}) => ({ id, status: 'RES', roomType: 'rt1', arrivalDateLocalDate: arr, departureDateLocalDate: dep, arrivalDate: arr + 'T07:00:00Z', departureDate: dep + 'T07:00:00Z', confirmationId: 'CONF' + id.toUpperCase(), ratePlanCode: 'BAR', primaryGuestInfo: { firstName: first, lastName: last }, ...o });
const payload = computeForecast({ rooms, roomTypes, reservations: [resn('a', 'Ann', 'Lee', TODAY, '2026-10-14'), resn('b', 'Bob', 'Ray', TODAY, '2026-10-13', { roomType: 'rt2' }), resn('c', 'Cy', 'Young', '2026-10-20', '2026-10-22', { roomId: 'r2', roomNumber: '102' }), resn('d', 'Dee', 'Stay', '2026-10-10', '2026-10-15', { status: 'INH', roomId: 'r1', roomNumber: '101' })], metrics: null, vipStatuses: [], ratePlans: [{ code: 'BAR', name: 'Best Available Rate' }], roomTypeMapping: [], config: {}, forecastDate: TODAY });
const apiFetch = async (p, o = {}) => { calls.push({ p, method: o.method || 'GET' });
  if (p === '/admin/forecast/current') return { ok: true, data: { success: true, source: 'mirror', sync: { state: 'ok', everyMinutes: 5 }, snapshot: { snapshot_id: null, scraped_at: new Date().toISOString(), status: 'success', payload } } };
  if (p.startsWith('/admin/forecast/jobs/latest')) return { ok: true, data: { success: true, job: null } };
  if (p.startsWith('/admin/reservations/summaries')) return { ok: true, data: { success: true, summaries: {} } };
  if (p.startsWith('/admin/reservations/search')) return { ok: true, data: { success: true, ids: [] } };
  if (p.startsWith('/admin/sync/events')) return { ok: true, data: { success: true, events: [], summary: {}, hasMore: false } };
  return { ok: false, status: 404, data: { message: 'no mock ' + p } }; };
const modCache = new Map(); const load = (file) => { if (modCache.has(file)) return modCache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); modCache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { apiFetch, authFetch: apiFetch }; if (id === '../../shells/ViewContext') return { useView: () => ({ goTo() {} }) }; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : (fs.existsSync(p) && fs.statSync(p).isDirectory() ? p + '/index.js' : p)); } return orig(id); };
  m._compile(code, file); return m.exports; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };
const Page = load(ROOT + '/src/components/Forecasting/index.js').default;
async function mount(mode) { calls.length = 0; sessionStorage.clear(); const el = document.getElementById('root'); el.innerHTML = ''; const root = createRoot(el);
  await act(async () => { root.render(React.createElement(Page, { mode })); }); await act(async () => { await sleep(60); });
  const click = async (n) => { await act(async () => { n.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await act(async () => { await sleep(20); }); };
  const type = async (input, value) => { const set = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set; await act(async () => { set.call(input, value); input.dispatchEvent(new w.Event('input', { bubbles: true })); }); await act(async () => { await sleep(380); }); };
  return { el, click, type, tab: (re) => [...el.querySelectorAll('[role=tab]')].find(b => re.test(b.textContent)), unmount: () => act(async () => { root.unmount(); }) }; }

(async () => {
  await t('MANAGER: each guest shows ONLY name, stay (dates + nights), confirmation code and room type', async () => {
    const h = await mount('manager'); const rows = [...h.el.querySelectorAll('.rl-lean')]; assert.strictEqual(rows.length, 2, 'Remaining arrivals: Ann + Bob'); const ann = rows.find(r => /Ann Lee/.test(r.textContent));
    assert.strictEqual(ann.children.length, 4, 'exactly four pieces of information'); assert.deepStrictEqual([...ann.children].slice(0, 3).map(c => c.textContent.trim()), ['Ann Lee', 'Oct 12 → Oct 14 · 2 nights', 'CONFA']); assert(/^Double Queen Standard\s*NQRR$/.test(ann.children[3].textContent.trim()), ann.children[3].textContent);
    const bob = rows.find(r => /Bob Ray/.test(r.textContent)); assert(/Pets/.test(bob.textContent) && /NKRRP/.test(bob.textContent) && /CONFB/.test(bob.textContent));
    for (const aux of [/Best Available Rate/, /Pending|Confirmed|In house|Departed/, /Room \d+/, /Conf\./, /Charges/, /More details/, /No room assigned/i, /\$\d/]) assert(!aux.test(h.el.querySelector('.rl-list').textContent), 'aux info: ' + aux); assert(!h.el.querySelector('.rl-main'), 'no full guest card'); await h.unmount();
  });
  await t('MANAGER: no Recent changes, no "No Room Assigned" tile, no "Needs a room" tab, no source filter / sort / CSV / attention chips / expand-all; the freshness badge and refresh stay', async () => {
    const h = await mount('manager'); const txt = h.el.textContent;
    for (const aux of [/Recent changes/, /No Room Assigned/, /Needs a room/, /Needs attention/, /Sort:/, /Export CSV/, /Expand all/]) assert(!aux.test(txt), String(aux)); assert(![...h.el.querySelectorAll('label span')].some(s => s.textContent === 'Source'), 'source filter gone');
    assert([...h.el.querySelectorAll('label span')].some(s => s.textContent === 'Room type'), 'room type filter stays'); assert(/Up to date/.test(txt) && h.el.querySelector('button[aria-label^="Refresh"]')); for (const k of ['Arrivals Today', 'In-house', 'Departures Today', 'Staying Tonight']) assert(txt.includes(k), k); await h.unmount();
  });
  await t('MANAGER: no guest-detail or contact lookups at all (no summaries, no server-side search, no change feed)', async () => {
    const h = await mount('manager'); await h.type(h.el.querySelector('input[type=search]'), 'Ann'); await h.click(h.tab(/In-house/)); const bad = calls.filter(c => /reservations\/summaries|reservations\/search|sync\/events/.test(c.p)); assert.deepStrictEqual(bad, [], JSON.stringify(bad)); await h.unmount();
  });
  await t('MANAGER search looks at the list: guest name, confirmation code, room type (a search spans every tab); tabs and counts still work', async () => {
    const h = await mount('manager'); const search = h.el.querySelector('input[type=search]'); assert(/guest name or confirmation code/.test(search.placeholder));
    await h.type(search, 'CONFC'); let names = [...h.el.querySelectorAll('.rl-lean-name')].map(x => x.textContent); assert.deepStrictEqual(names, ['Cy Young'], 'by confirmation code (a future booking, found from the default tab)');
    await h.type(search, 'young'); assert.deepStrictEqual([...h.el.querySelectorAll('.rl-lean-name')].map(x => x.textContent), ['Cy Young']); await h.type(search, 'zzzz'); assert(/No reservations match/.test(h.el.textContent)); await h.type(search, '');
    assert(/Remaining arrivals\s*2/.test(h.tab(/Remaining arrivals/).textContent)); await h.click(h.tab(/In-house/)); assert.deepStrictEqual([...h.el.querySelectorAll('.rl-lean-name')].map(x => x.textContent), ['Dee Stay']); await h.click(h.tab(/^Future/)); assert.deepStrictEqual([...h.el.querySelectorAll('.rl-lean-name')].map(x => x.textContent), ['Cy Young']); await h.unmount();
  });
  await t('MANAGER print sheet: guest, confirmation, room type, stay — no phone, charges, notes or flags', async () => {
    let printed = 0; w.print = () => { printed++; }; const h = await mount('manager'); await h.click([...h.el.querySelectorAll('button')].find(b => /^Print$/.test(b.textContent))); await act(async () => { await sleep(150); });
    const sheet = document.querySelector('.rl-printsheet'); assert(sheet, 'print sheet mounted'); assert.strictEqual(printed, 1); assert.deepStrictEqual([...sheet.querySelectorAll('th')].map(x => x.textContent), ['✓', 'Guest', 'Confirmation', 'Room type', 'Stay']);
    assert(/Ann Lee/.test(sheet.textContent) && /CONFA/.test(sheet.textContent) && /Double Queen Standard/.test(sheet.textContent) && !/Phone|Charges|Flags/.test(sheet.textContent)); await h.unmount();
  });
  await t('DEV keeps EVERY function: Recent changes, all tiles, "Needs a room" tab, source filter, sort, CSV export, full guest cards (status, room, source), summary lookups, change feed', async () => {
    document.querySelectorAll('.rl-printroot').forEach(n => n.remove()); const h = await mount('dev'); const txt = h.el.textContent;
    for (const x of [/Recent changes/, /No Room Assigned/, /Needs a room/, /Sort:/, /Export CSV/, /Expand all/, /Snapshot history/, /Forecast settings/, /Raw scraper output/]) assert(x.test(txt), String(x));
    assert([...h.el.querySelectorAll('label span')].some(s => s.textContent === 'Source')); assert(h.el.querySelector('.rl-main') && !h.el.querySelector('.rl-lean'), 'full cards'); assert(/Best Available Rate/.test(h.el.querySelector('.rl-list').textContent) && /Pending/.test(h.el.querySelector('.rl-list').textContent));
    assert(calls.some(c => /reservations\/summaries/.test(c.p)) && calls.some(c => /sync\/events/.test(c.p))); await h.type(h.el.querySelector('input[type=search]'), 'Ann'); assert(calls.some(c => /reservations\/search/.test(c.p)), 'server-side contact/notes search'); await h.unmount();
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
