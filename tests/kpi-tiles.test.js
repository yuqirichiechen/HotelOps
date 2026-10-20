// Sprint 22.7 — Reservations tiles: "left" numbers first, status rings, count-up animation, and the room lists (left to sell / dirty + occupied clean)
// with manager (numbers only) vs dev (guest details / last stay) content.   node tests/kpi-tiles.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true }); w.scrollTo = () => {};
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils'); const { computeForecast } = require(ROOT + '/server/forecast/compute');
const TODAY = '2026-10-19'; const calls = []; let lastStaysResp = { ok: true, data: { success: true, stays: {} } };
const R = (n, f, occ, hk, type = 'rt1', o = {}) => ({ id: 'room' + n, roomNumber: String(n), roomTypeId: type, floorId: f, status: true, currentOccupancyStatus: occ, housekeepingRoomStatus: hk, roomInventoryStatus: occ, ...o });
const rooms = [R(101, '01', 'VAC', 'VI'), R(102, '01', 'VAC', 'VI'), R(103, '01', 'VAC', 'PU'), R(104, '01', 'VAC', 'D'), R(105, '01', 'VAC', 'IP'), R(106, '01', 'OCC', 'OC'), R(107, '01', 'OCC', 'OC'), R(108, '01', 'OCC', 'D'),
  R(109, '01', 'VAC', 'VI', 'rt1', { roomInventoryStatus: 'OOO' }), R(110, '02', 'VAC', 'VI', 'rt2'), R(28, 'G', 'VAC', 'VI', 'rt1', { endDate: '2023-02-28', status: false })];
const roomTypes = [{ id: 'rt1', typeCode: 'NQRR', name: 'Double Queen' }, { id: 'rt2', typeCode: 'NKRRP', name: 'King Pets' }];
const inh = (id, n, first, last, arr, dep) => ({ id, status: 'INH', roomType: 'rt1', roomId: 'room' + n, roomNumber: String(n), arrivalDateLocalDate: arr, departureDateLocalDate: dep, arrivalDate: arr + 'T07:00:00Z', departureDate: dep + 'T07:00:00Z', confirmationId: 'CF' + n, ratePlanCode: 'BAR', primaryGuestInfo: { firstName: first, lastName: last } });
const res = (id, first, last, arr, dep) => ({ id, status: 'RES', roomType: 'rt1', arrivalDateLocalDate: arr, departureDateLocalDate: dep, arrivalDate: arr + 'T07:00:00Z', departureDate: dep + 'T07:00:00Z', confirmationId: 'RS' + id, ratePlanCode: 'BAR', primaryGuestInfo: { firstName: first, lastName: last } });
const metrics = { remainingArrivalsSummary: { total: 44, remaining: 2 }, remainingDeparturesSummary: { total: 34, remaining: 0 }, totalGuestsSummary: { total: 71 }, roomConditionSummary: [] };
const payload = computeForecast({ rooms, roomTypes, reservations: [inh('i6', 106, 'Ann', 'Lee', '2026-10-17', '2026-10-21'), inh('i7', 107, 'Bob', 'Ray', '2026-10-18', '2026-10-20'), inh('i8', 108, 'Cy', 'Young', '2026-10-19', '2026-10-22'), res('r1', 'Dee', 'Late', TODAY, '2026-10-21'), res('r2', 'Eve', 'Later', TODAY, '2026-10-20')],
  metrics, vipStatuses: [], ratePlans: [], roomTypeMapping: [], config: {}, forecastDate: TODAY });
const apiFetch = async (p, o = {}) => { calls.push({ p, method: o.method || 'GET' });
  if (p === '/admin/forecast/current') return { ok: true, data: { success: true, source: 'mirror', sync: { state: 'ok', everyMinutes: 5 }, snapshot: { snapshot_id: null, scraped_at: new Date().toISOString(), status: 'success', payload } } };
  if (p.startsWith('/dev/rooms/last-stays')) return lastStaysResp;
  if (p.startsWith('/admin/forecast/jobs/latest')) return { ok: true, data: { success: true, job: null } };
  if (p.startsWith('/admin/reservations/summaries')) return { ok: true, data: { success: true, summaries: {} } };
  if (p.startsWith('/admin/sync/events')) return { ok: true, data: { success: true, events: [], summary: {}, hasMore: false } };
  return { ok: false, status: 404, data: { message: 'no mock ' + p } }; };
const modCache = new Map(); const load = (file) => { if (modCache.has(file)) return modCache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); modCache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { apiFetch, authFetch: apiFetch }; if (id === '../../shells/ViewContext') return { useView: () => ({ goTo() {} }) }; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : (fs.existsSync(p) && fs.statSync(p).isDirectory() ? p + '/index.js' : p)); } return orig(id); };
  m._compile(code, file); return m.exports; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };
const RC = load(ROOT + '/src/components/Forecasting/roomCondition.js'); const Page = load(ROOT + '/src/components/Forecasting/index.js').default;
const reduceMotion = (on) => { w.matchMedia = (q) => ({ matches: on && /reduce/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); };
async function mount(mode) { calls.length = 0; sessionStorage.clear(); const el = document.getElementById('root'); el.innerHTML = ''; const root = createRoot(el);
  await act(async () => { root.render(React.createElement(Page, { mode })); }); await act(async () => { await sleep(60); });
  const click = async (n) => { await act(async () => { n.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await act(async () => { await sleep(20); }); };
  const tile = (re) => [...el.querySelectorAll('.fc-kpi-card')].find(c => re.test(c.querySelector('.fc-kpi-label').textContent));
  return { el, click, tile, unmount: () => act(async () => { root.unmount(); }) }; }
const K = payload.kpis;

(async () => {
  await t('room condition (pure): left to sell = vacant VI + PU that are sellable; dirty = D + IP; occupied clean = OC; out-of-order and the deactivated room are excluded; rooms sorted', () => {
    const c = RC.buildRoomCondition(payload); assert.deepStrictEqual(c.counts, { vi: 3, pu: 1, leftToSell: 4, dirty: 2, inProgress: 1, dirtyTotal: 3, occupiedClean: 2 }); assert.deepStrictEqual(c.lists.leftToSell.map(r => r.roomNumber), ['101', '102', '103', '110']);
    assert.deepStrictEqual(c.lists.dirty.map(r => [r.roomNumber, r.hk, r.occupied]), [['104', 'D', false], ['105', 'IP', false], ['108', 'D', true]]); assert.deepStrictEqual(c.lists.occupiedClean.map(r => r.roomNumber), ['106', '107']);
    assert.strictEqual(c.total, 10, 'the ghost room is not a room'); assert.strictEqual(c.sellable, 9, '109 is out of order'); assert(!c.lists.leftToSell.some(r => r.roomNumber === '109')); assert.strictEqual(c.guestByRoom.get('106').guestName, 'Ann Lee');
    assert.strictEqual(RC.fraction(2, 4), 0.5); assert.strictEqual(RC.fraction(1, 0), 0); assert.strictEqual(RC.fraction(9, 4), 1);
  });
  reduceMotion(true);
  await t('TILES lead with what is LEFT: arrivals left (not the day total), check-outs left; "Staying tonight" is gone; the two room tiles are new', async () => {
    const h = await mount('manager'); const labels = [...h.el.querySelectorAll('.fc-kpi-label')].map(x => x.textContent); assert.deepStrictEqual(labels, ['Arrivals left', 'In-house', 'Check-outs left', 'Left to sell', 'Dirty rooms'], labels.join('|'));
    const num = (re) => h.tile(re).querySelector('.fc-kpi-primary').textContent, sub = (re) => h.tile(re).querySelector('.fc-kpi-sublabel').textContent;
    assert.strictEqual(num(/Arrivals left/), String(K.remainingArrivals)); assert.strictEqual(sub(/Arrivals left/), `${K.arrivals - K.remainingArrivals} arrived of ${K.arrivals} today`); assert.strictEqual(num(/Check-outs left/), String(K.remainingDepartures)); assert.strictEqual(sub(/Check-outs left/), `${K.departures - K.remainingDepartures} checked out of ${K.departures} today`);
    assert.strictEqual(num(/In-house/), String(K.inHouse)); assert.strictEqual(num(/Left to sell/), '4'); assert.strictEqual(sub(/Left to sell/), '3 inspected · 1 pickup'); assert.strictEqual(num(/Dirty rooms/), '3'); assert.strictEqual(sub(/Dirty rooms/), '2 dirty · 1 in progress · 2 occupied clean'); assert(!/Staying Tonight/.test(h.el.textContent)); await h.unmount();
  });
  await t('each tile has a status RING: arrived share, rooms occupied, checked-out share, left-to-sell share, dirty share (fractions from the real numbers)', async () => {
    const h = await mount('manager'); const f = (re) => Number(h.tile(re).querySelector('.sr-ring-arc').getAttribute('data-fraction'));
    const near = (a, b) => Math.abs(a - b) < 0.002; assert(near(f(/Arrivals left/), (K.arrivals - K.remainingArrivals) / K.arrivals)); assert(near(f(/Check-outs left/), (K.departures - K.remainingDepartures) / K.departures)); assert(near(f(/In-house/), Math.min(1, K.inHouse / 9)));
    assert(near(f(/Left to sell/), 4 / 9)); assert(near(f(/Dirty rooms/), 3 / 10)); assert(/arrived/.test(h.tile(/Arrivals left/).querySelector('.sr-ring').getAttribute('aria-label'))); await h.unmount();
  });

  // ── count-up: a click (and the first appearance) runs the number from 0 up to the value ──
  await t('COUNT-UP: the number starts at 0 and counts up to its value; clicking the tile restarts it from 0; "reduce motion" shows the value at once', async () => {
    reduceMotion(false); const frames = []; let now = 0; const realRaf = w.requestAnimationFrame; const realCancel = w.cancelAnimationFrame; const realNow = w.performance.now.bind(w.performance);
    globalThis.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; }; globalThis.cancelAnimationFrame = () => {}; globalThis.performance = { now: () => now };
    const run = async (ms) => { now += ms; const cbs = frames.splice(0); await act(async () => { cbs.forEach(cb => cb(now)); }); };
    const h = await mount('manager'); const val = () => h.tile(/Left to sell/).querySelector('.fc-kpi-primary').textContent; const arr = () => h.tile(/In-house/).querySelector('.fc-kpi-primary').textContent;
    assert.strictEqual(val(), '0', 'starts from 0 on first appearance'); await run(350); const mid = Number(val()); assert(mid > 0 && mid < 4 || mid === 4 || mid === 3, 'counting: ' + mid); await run(600); assert.strictEqual(val(), '4', 'ends at the real value'); assert.strictEqual(arr(), String(K.inHouse));
    await h.click(h.tile(/Left to sell/)); assert.strictEqual(val(), '0', 'a click restarts from zero'); await run(900); assert.strictEqual(val(), '4'); await h.unmount();
    globalThis.requestAnimationFrame = realRaf; globalThis.cancelAnimationFrame = realCancel; globalThis.performance = w.performance; reduceMotion(true);
  });

  // ── room lists ──
  await t('LEFT TO SELL list (manager and dev): room numbers with type and Inspected / Pickup, grouped by room type; a second click closes it; the other tiles still switch the tabs', async () => {
    for (const mode of ['manager', 'dev']) {
      const h = await mount(mode); await h.click(h.tile(/Left to sell/)); const panel = h.el.querySelector('.rcp'); assert(panel && /Left to sell · 4 rooms/.test(panel.textContent), mode); const chips = [...panel.querySelectorAll('.rcp-chip')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
      assert.deepStrictEqual(chips, ['110NKRRP · Inspected', '101NQRR · Inspected', '102NQRR · Inspected', '103NQRR · Pickup'], mode + ': ' + chips.join('|')); assert(!/Ann Lee|Bob Ray/.test(panel.textContent));
      await h.click(h.tile(/Left to sell/)); assert(!h.el.querySelector('.rcp'), 'closes'); await h.click(h.tile(/Left to sell/)); await h.click(h.tile(/In-house/)); assert(!h.el.querySelector('.rcp'), 'another tile closes it'); assert(h.tile(/In-house/).className.includes('fc-kpi-active')); await h.unmount();
    }
  });
  await t('DIRTY + OCCUPIED CLEAN, MANAGER: room NUMBERS ONLY — no guest names, stays, confirmations or last-stay lookups', async () => {
    const h = await mount('manager'); await h.click(h.tile(/Dirty rooms/)); const panel = h.el.querySelector('.rcp'); const chips = (title) => [...[...panel.querySelectorAll('.rcp-group')].find(g => title.test(g.querySelector('.rcp-group-title').textContent)).querySelectorAll('.rcp-chip')].map(c => c.textContent.trim());
    assert.deepStrictEqual(chips(/Dirty rooms/), ['104', '105', '108']); assert.deepStrictEqual(chips(/Occupied clean/), ['106', '107']); for (const x of ['Ann Lee', 'Bob Ray', 'Cy Young', 'CF106', 'Last stay', 'Oct']) assert(!panel.textContent.includes(x), x);
    assert(!panel.querySelector('table')); assert(!calls.some(c => /last-stays/.test(c.p)), 'no guest lookups for managers'); await h.unmount();
  });
  await t('DIRTY + OCCUPIED CLEAN, DEV: occupied clean shows the guest (name, stay, confirmation, type); dirty rooms show the LAST PREVIOUS STAY (looked up for vacant rooms only) or the current guest if the room is still occupied', async () => {
    lastStaysResp = { ok: true, data: { success: true, stays: { 104: { room_number: '104', guest_name: 'Zed Prior', confirmation_id: 'OLD104', arrival_date: '2026-10-16', departure_date: '2026-10-19' }, 105: null } } };
    const h = await mount('dev'); await h.click(h.tile(/Dirty rooms/)); const panel = h.el.querySelector('.rcp'); const rowOf = (n) => [...panel.querySelectorAll('tbody tr')].find(r => r.querySelector('td').textContent === n);
    const call = calls.find(c => /last-stays/.test(c.p)); assert(call && decodeURIComponent(call.p).endsWith('rooms=104,105'), 'only the VACANT dirty rooms are looked up: ' + (call && call.p));
    const t106 = rowOf('106').textContent; assert(/Ann Lee/.test(t106) && /Oct 17 → Oct 21/.test(t106) && /CF106/.test(t106) && /NQRR/.test(t106), t106);
    assert(/Zed Prior/.test(rowOf('104').textContent) && /Oct 16 → Oct 19/.test(rowOf('104').textContent) && /OLD104/.test(rowOf('104').textContent)); assert(/No previous stay on record/.test(rowOf('105').textContent));
    const t108 = rowOf('108').textContent; assert(/guest still in room/.test(t108) && /Cy Young/.test(t108) && /in house now/.test(t108), t108); await h.unmount();
  });
  // ── Sprint 22.8 ──
  await t('22.8: no Housekeeping Message Preview; no green "done" background on a 0 tile; the clicked tile is highlighted at once (even when its tab is hidden because the count is 0)', async () => {
    for (const mode of ['manager', 'dev']) {
      const h = await mount(mode); assert(!/Housekeeping Message Preview/.test(h.el.textContent) && !h.el.querySelector('.fc-msg-card'), mode); assert(!h.el.querySelector('.fc-kpi-done'));
      const act = () => [...h.el.querySelectorAll('.fc-kpi-card.fc-kpi-active')].map(c => c.querySelector('.fc-kpi-label').textContent);
      for (const [re, label] of [[/Check-outs left/, 'Check-outs left'], [/Arrivals left/, 'Arrivals left'], [/In-house/, 'In-house'], [/Dirty rooms/, 'Dirty rooms'], [/Left to sell/, 'Left to sell'], [/Check-outs left/, 'Check-outs left']]) { await h.click(h.tile(re)); assert.deepStrictEqual(act(), [label], mode + ' ' + label); }
      await h.unmount();
    }
  });
  await t('22.8: ALL five tiles work the same — the room lists open INSIDE the Guest Reservations card (replacing the table), no separate panel above it; closing returns the guest list', async () => {
    const h = await mount('manager'); await h.click(h.tile(/Dirty rooms/)); const main = h.el.querySelector('.fc-main'); assert(main.querySelector('.rcp'), 'list is inside the card'); assert(!h.el.querySelector('.fc-kpis + .rcp'), 'nothing between tiles and card'); assert(!main.querySelector('.fc-table-header'), 'table hidden');
    await h.click(main.querySelector('.rcp-close')); assert(!h.el.querySelector('.rcp') && h.el.querySelector('.fc-main .fc-table-header')); await h.click(h.tile(/Arrivals left/)); assert(h.el.querySelector('.fc-main .fc-table-header')); await h.unmount();
  });
  await t('22.8: DEV Recent changes is a small card on the RIGHT (aside), manager has none', async () => {
    const d = await mount('dev'); assert(d.el.querySelector('.fc-body.fc-body-dev > .fc-side .rc'), 'right card'); assert(!d.el.querySelector('.fc-main .rc')); await d.unmount();
    const m = await mount('manager'); assert(!m.el.querySelector('.rc') && !m.el.querySelector('.fc-body-dev')); await m.unmount();
  });
  if (process.env.DUMP_MODE) { const h = await mount(process.env.DUMP_MODE); if (process.env.DUMP_TILE) await h.click(h.tile(new RegExp(process.env.DUMP_TILE))); fs.writeFileSync(process.env.DUMP, h.el.innerHTML); }
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
