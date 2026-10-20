// The REAL Forecast page in jsdom (Sprint 21.3): live board, no Sync, PU/VI split, action lists, workload-only future days,
// ghost room, live-failure fallback, idle pause.   node tests/forecastpage.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils');
let snapshot, liveBoard, liveOk = true, appSettings = {}; const calls = [], gone = [];
const apiFetch = async (p) => { calls.push(p);
  if (p === '/admin/forecast/snapshots/latest' || p === '/admin/forecast/current') return { ok: true, data: { success: true, snapshot, source: process.env.FC_SOURCE || 'snapshot' } };
  if (p === '/admin/forecast/live') return liveOk ? { ok: true, data: { success: true, live: liveBoard } } : { ok: false, status: 502, data: { success: false } };
  if (p === '/admin/settings') return { ok: true, data: { success: true, settings: appSettings } };
  return { ok: false, data: null }; };
const load = (file) => { const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { apiFetch }; if (id === '../../shells/ViewContext') return { useView: () => ({ goTo: (v) => gone.push(v) }) };
    if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); };
  m._compile(code, file); return m.exports; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };

// ── fixtures: a MORNING with real tightness ──
const TODAY = '2026-10-12';
const room = (n, typeCode, occ, hk, x = {}) => ({ roomNumber: n, typeCode, baseCode: typeCode.slice(0, 4), baseLabel: typeCode.slice(0, 4) === 'NQRR' ? 'Double Queen Standard' : 'King Standard', subLabel: typeCode.length > 4 ? 'Pets' : 'Standard', occupancyStatus: occ, hkStatus: hk, inventoryStatus: occ, blocked: false, status: true, ...x });
const rooms = [room('101', 'NQRR', 'VAC', 'VI'), room('102', 'NQRR', 'VAC', 'PU'), room('103', 'NQRR', 'VAC', 'D'), room('104', 'NQRR', 'OCC', 'OC'), room('105', 'NQRR', 'OCC', 'D'),
  room('201', 'NKRR', 'OCC', 'D'), room('202', 'NKRR', 'VAC', 'IP'), room('G28', 'NKRRP', 'OCC', 'OC')];
let n = 0; const R = (o) => ({ id: 'r' + (++n), guestName: 'Guest ' + n, status: 'RES', typeCode: 'NQRR', baseCode: 'NQRR', roomNumber: null, isPreAssigned: false, source: 'BAR', statusLabel: 'Pending', ...o });
const reservations = [
  R({ arrivalDate: TODAY, departureDate: '2026-10-14' }), R({ arrivalDate: TODAY, departureDate: '2026-10-14' }), R({ arrivalDate: TODAY, departureDate: '2026-10-13' }),
  R({ typeCode: 'NKRR', baseCode: 'NKRR', arrivalDate: TODAY, departureDate: '2026-10-13' }), R({ typeCode: 'NKRR', baseCode: 'NKRR', arrivalDate: TODAY, departureDate: '2026-10-13' }),
  R({ status: 'INH', typeCode: 'NKRR', baseCode: 'NKRR', roomNumber: '201', arrivalDate: '2026-10-10', departureDate: TODAY }),
  R({ status: 'INH', roomNumber: '104', arrivalDate: '2026-10-10', departureDate: '2026-10-15' }), R({ status: 'INH', roomNumber: '105', arrivalDate: '2026-10-11', departureDate: '2026-10-13' }),
];
const mkSnapshot = (o = {}, agoH = 0.2) => ({ scraped_at: new Date(Date.now() - agoH * 3600e3).toISOString(), status: 'success', payload: { forecastDate: TODAY, futureWindowDays: 30, perRoomSheet: rooms, reservations, metricsSnapshot: {}, ...o } });
const mkLive = (o = {}) => ({ forecastDate: TODAY, fetchedAt: new Date().toISOString(), complete: true, rooms: rooms.map(r => ({ ...r })),
  remainingArrivals: [{ typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NKRR' }, { typeCode: 'NKRR' }], stillDeparting: [{ roomNumber: '201', typeCode: 'NKRR' }, { roomNumber: '105', typeCode: 'NQRR' }], arrivalsToday: 5, departedToday: 0, ...o });

let intervals;
async function mount() {
  intervals = []; const realSI = w.setInterval; globalThis.setInterval = (fn, ms) => { intervals.push({ fn, ms }); return realSI.call(w, fn, 1e9); };   // capture the page's timers
  calls.length = 0; const Forecast = load(ROOT + '/src/components/Forecast/index.js').default; const el = document.getElementById('root'); el.innerHTML = ''; const root = createRoot(el);
  await act(async () => { root.render(React.createElement(Forecast)); }); await act(async () => { await sleep(30); });
  const click = async (node) => { await act(async () => { node.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await act(async () => { await sleep(10); }); };
  const rowFor = (code) => [...el.querySelectorAll('tbody tr')].find(tr => (tr.querySelector('code') || {}).textContent === code);
  const cells = (tr) => [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
  const heads = () => [...el.querySelector('.fb-need-table').querySelectorAll('thead th')].map(x => x.textContent);   // the room-type table only
  const stats = () => Object.fromEntries([...el.querySelectorAll('.fb-stat')].map(s => [s.querySelector('.fb-stat-label').textContent, s.querySelector('.fb-stat-value').textContent]));
  return { el, root, click, rowFor, cells, heads, stats, unmount: () => act(async () => { root.unmount(); globalThis.setInterval = realSI; }) };
}
const fresh = (o = {}) => { sessionStorage.clear(); liveOk = true; snapshot = mkSnapshot(o.snap, o.age); liveBoard = mkLive(o.live); };

(async () => {
  await t('TODAY (live): VI / PU / dirty split, still-departing, still-arriving, left-to-sell and the sell/close status per type', async () => {
    fresh(); const h = await mount(); const head = h.heads();
    for (const c of ['Inspected (VI)', 'Awaiting inspection (PU)', 'Dirty / in progress', 'Still departing', 'Still arriving', 'Left to sell now', 'Status']) assert(head.includes(c), c + ' | ' + head.join('|'));
    const q = h.cells(h.rowFor('NQRR'));   // [code,label,rooms,VI,PU,dirty,departing,arriving,left,status]
    assert.deepStrictEqual(q.slice(2), ['5', '1', '1', '1', '1', '3', '0', 'Clean first'], q.join('|'));          // 2 clean rooms for 3 arriving: nothing left now; 1 dirty + 1 departing can still cover
    const k = h.cells(h.rowFor('NKRR')); assert.deepStrictEqual(k.slice(2), ['3', '0', '0', '1', '1', '2', '0', 'Sold out'], k.join('|'));   // 0 clean; 1 dirty + 1 departing = exactly the 2 arriving → nothing left to sell
    await h.unmount();
  });
  await t('there is NO Sync button and no "Sync arrivals" anywhere; the live badge shows time; header keeps Generate forecast', async () => {
    fresh(); const h = await mount(); assert(!/Sync arrivals/.test(h.el.textContent), 'no sync text'); assert(![...h.el.querySelectorAll('button')].some(b => /sync/i.test(b.textContent)));
    assert(/Rooms live/.test(h.el.querySelector('.fb-sync-badge').textContent)); assert([...h.el.querySelectorAll('button')].some(b => /Generate forecast/.test(b.textContent))); await h.unmount();
  });
  await t('headline stats + notes + action lists for today: inspect PU rooms; turn dirty rooms first for types the clean rooms can\'t cover', async () => {
    fresh(); const h = await mount(); const s = h.stats();
    assert.strictEqual(s['Awaiting inspection (PU)'], '1'); assert.strictEqual(s['Still arriving'], '5'); assert.strictEqual(s['Left to sell now'], '0');
    const rail = h.el.querySelector('.fb-body').textContent; assert(/Front desk — inspect now/.test(rail) && /102/.test(rail)); assert(/Housekeeping — turn these first/.test(rail));
    assert(/waiting for front-desk inspection/.test(rail)); await h.unmount();
  });
  await t('statuses reach the page: a type with nothing left (and no way to make more) says "Sold out" + the SiteMinder note', async () => {
    fresh({ live: { remainingArrivals: [{ typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NKRR' }, { typeCode: 'NKRR' }], arrivalsToday: 6 } });   // NQRR: 4 arriving vs 2 clean + 1 dirty + 1 departing = 4
    const h = await mount(); assert.strictEqual(h.cells(h.rowFor('NQRR')).pop(), 'Sold out'); assert(/consider closing it on SiteMinder/.test(h.el.querySelector('.fb-body').textContent)); await h.unmount();
  });
  await t('GHOST ROOM: a deactivated room that rGuest still lists as vacant/inspected is not counted (the NKRRP bug)', async () => {
    const ghost = { ...room('28', 'NKRRP', 'VAC', 'VI'), startDate: '2023-02-26', endDate: '2023-02-28', deactivateDate: '2023-02-28T08:00:00Z' };
    fresh({ live: { rooms: rooms.map(r => ({ ...r })).concat([ghost]) } }); const h = await mount(); const pets = h.rowFor('NKRRP'); const c = h.cells(pets);
    assert.strictEqual(c[2], '1', 'only G28 counts'); assert.strictEqual(c[3], '0', 'no phantom inspected pet room'); await h.unmount();
  });
  await t('TOMORROW: cleaning priority table — Booked / Expected / Departing / Staying over / Already empty / Turn first + Priority; no sell/close language; info popover', async () => {
    fresh(); const h = await mount(); await h.click(h.el.querySelectorAll('.fb-day')[1]); const head = h.heads();
    assert.deepStrictEqual(head.slice(2), ['Rooms', 'Booked', 'Expected', 'Departing', 'Staying over', 'Already empty', 'Turn first', 'Priority']); assert(!head.includes('Status') && !head.includes('Left to sell now'));
    assert(/Cleaning priority · Tue, Oct 13/.test(h.el.textContent)); assert(!/oversold|sold out|SiteMinder/i.test(h.el.querySelector('.fb-body').textContent + h.el.querySelector('.fb-table-wrap').textContent));
    const s = h.stats(); for (const k of ['Booked arrivals', 'Expected arrivals', 'Departing', 'Staying over', 'Rooms to turn first']) assert(k in s, k); assert(!('Left to sell now' in s)); assert(!h.el.querySelector('.fb-body').textContent.includes('inspect now'), 'action list is today-only');
    assert(h.el.querySelector('.fb-body').textContent.includes('Housekeeping plan'));
    // methodology is NOT printed on the page — it sits behind the "i" button
    assert(!/already empty = rooms not occupied/i.test(h.el.textContent), 'method text hidden until the i is opened'); const tip = h.el.querySelector('.fb-need-table').closest('.fb-card').querySelector('.fb-infotip-btn'); assert(tip, 'info button exists');
    await h.click(tip); assert(/Already empty<\/strong> = rooms not occupied|Already empty.*rooms not occupied/s.test(h.el.querySelector('.fb-infotip-pop').textContent), 'popover explains the method'); await h.click(tip); assert(!h.el.querySelector('.fb-infotip-pop'));
    assert.strictEqual(sessionStorage.getItem('hotelops-fc-day'), '1'); await h.unmount();
  });
  await t('TOMORROW with bookings: expected = booked + weekday allowance (capped by free rooms), "May run short" reaches the table, plan card and outlook flag', async () => {
    const extra = [1, 2, 3].map(() => R({ arrivalDate: '2026-10-13', departureDate: '2026-10-14' }));
    fresh({ snap: { reservations: [...reservations, ...extra] } }); const h = await mount(); await h.click(h.el.querySelectorAll('.fb-day')[1]);
    const q = h.cells(h.rowFor('NQRR'));   // [code,label,rooms,booked,expected,departing,staying,empty,turn,priority]
    assert.deepStrictEqual(q.slice(2), ['5', '3', '3', '2', '3', '0', '2', 'May run short'], q.join('|'));
    const rail = h.el.querySelector('.fb-body').textContent; assert(/Housekeeping plan/.test(rail) && /clean every departure early/.test(rail), rail.slice(0, 300));
    const flag = h.el.querySelectorAll('.fb-day')[1].textContent; assert(/to prioritise/.test(flag), flag); await h.unmount();
  });
  await t('settings: a saved allowance reaches the page (disabled → expected = booked; scale applies)', async () => {
    const extra = [1, 2, 3, 4].map(() => R({ typeCode: 'NKRR', baseCode: 'NKRR', arrivalDate: '2026-10-13', departureDate: '2026-10-14' }));
    const bigger = [...rooms, ...['301', '302', '303', '304', '305', '306'].map(x => room(x, 'NKRR', 'VAC', 'VI'))];
    appSettings = { forecast_allowance_enabled: 'false' }; fresh({ snap: { perRoomSheet: bigger, reservations: [...reservations, ...extra] } }); let h = await mount(); await h.click(h.el.querySelectorAll('.fb-day')[1]);
    assert.strictEqual(h.cells(h.rowFor('NKRR'))[4], '4', 'no allowance → expected = booked'); await h.unmount();
    appSettings = { forecast_allowance_enabled: 'true', forecast_allowance_scale_pct: '100', forecast_allowance_min_extra: '2' }; fresh({ snap: { perRoomSheet: bigger, reservations: [...reservations, ...extra] } }); h = await mount(); await h.click(h.el.querySelectorAll('.fb-day')[1]);
    assert(Number(h.cells(h.rowFor('NKRR'))[4]) > 4, 'allowance adds rooms'); appSettings = {}; await h.unmount();
  });
  await t('PRINT SHEET follows the selected day (today vs tomorrow) and is built from the same model', async () => {
    fresh(); const h = await mount(); const open = async () => { await h.click([...h.el.querySelectorAll('button')].find(b => /Generate forecast/.test(b.textContent))); return h.el.querySelector('.fc-sheet'); };
    let sheet = await open(); assert(/today/i.test(sheet.querySelector('h1').textContent) && /Mon|Monday/.test(sheet.textContent) === false || /October 12, 2026/.test(sheet.textContent), sheet.querySelector('h1').textContent);
    assert(/Left to sell/.test(sheet.textContent) && /Inspect \(PU\)/.test(sheet.textContent)); assert(/Floor 1|Ground/.test(sheet.textContent), 'rooms grouped by floor');
    await h.click(h.el.querySelector('.fc-sheet-btn-secondary')); await h.click(h.el.querySelectorAll('.fb-day')[1]); sheet = await open();
    assert(/Housekeeping plan/.test(sheet.querySelector('h1').textContent) && /October 13, 2026/.test(sheet.textContent), sheet.querySelector('h1').textContent + ' | ' + sheet.textContent.slice(0, 200));
    assert(/Clean first, by room type/.test(sheet.textContent) && /Expected/.test(sheet.textContent)); assert(!/Left to sell/.test(sheet.textContent)); await h.unmount();
  });
  await t('outlook: today shows the live verdict + "to sell"; later days show "to service" and no verdict flags', async () => {
    fresh(); const h = await mount(); const days = [...h.el.querySelectorAll('.fb-day')]; assert.strictEqual(days.length, 14);
    assert(/to sell/.test(days[0].textContent) && /clean first|sold out|oversold/.test(days[0].textContent)); assert(days.slice(1).every(d => /to service/.test(d.textContent) && !/clean first|sold out|oversold/.test(d.textContent))); await h.unmount();
  });
  await t('days beyond the reliable data window are disabled and labelled', async () => {
    fresh({ snap: { futureWindowDays: 5 } }); const h = await mount(); const days = [...h.el.querySelectorAll('.fb-day')]; assert(!days[5].disabled && days[6].disabled && /no data/.test(days[6].textContent)); await h.unmount();
  });
  await t('live pull is polled every 2 minutes; the page itself never re-queries the snapshot on that timer', async () => {
    fresh(); const h = await mount(); const tick = intervals.find(i => i.ms === 120000); assert(tick, 'a 120 s interval exists'); calls.length = 0;
    await act(async () => { tick.fn(); await sleep(10); }); assert.deepStrictEqual(calls, ['/admin/forecast/live']); await h.unmount();
  });
  await t('idle pause: after 30 min without activity polling stops with a notice; any activity resumes and refreshes immediately', async () => {
    fresh(); const h = await mount(); const tick = intervals.find(i => i.ms === 120000); const realNow = Date.now; Date.now = () => realNow() + 31 * 60 * 1000;
    calls.length = 0; await act(async () => { tick.fn(); await sleep(10); });
    assert(/Live updates are paused/.test(h.el.textContent)); assert(/Live paused/.test(h.el.querySelector('.fb-sync-badge').textContent)); assert.strictEqual(calls.length, 0, 'no live call while paused');
    await act(async () => { window.dispatchEvent(new w.MouseEvent('mousemove')); await sleep(20); }); assert(!/Live updates are paused/.test(h.el.textContent)); assert(calls.includes('/admin/forecast/live'), 'resumed + refreshed'); Date.now = realNow; await h.unmount();
  });
  await t('live failure falls back to the last scrape with a clear notice (no crash, badge turns amber)', async () => {
    fresh(); liveOk = false; const h = await mount(); assert(/Live room data is unavailable/.test(h.el.textContent)); assert(/Live unavailable/.test(h.el.querySelector('.fb-sync-badge').textContent));
    assert(h.el.querySelectorAll('.fb-day').length === 14 && h.cells(h.rowFor('NQRR')).length > 5, 'still renders from the snapshot'); await h.unmount();
  });
  await t('stale scrape: banner only where it matters (a future day, or when live is down) — not for live "today"', async () => {
    fresh({ age: 5 }); let h = await mount(); assert(!h.el.querySelector('.fb-stale'), 'today is live → no stale banner');
    await h.click(h.el.querySelectorAll('.fb-day')[2]); assert(/last scrape, 5 hours ago/.test(h.el.querySelector('.fb-stale').textContent)); await h.click(h.el.querySelector('.fb-stale .fb-empty-link')); assert(gone.includes('reservations')); await h.unmount();
  });
  await t('business-date mismatch (scrape from yesterday, rGuest rolled over) is called out', async () => {
    fresh({ live: { forecastDate: '2026-10-13' } }); const h = await mount(); assert(/rGuest’s business date is now/.test(h.el.textContent)); await h.unmount();
  });
  await t('no snapshot yet → friendly empty state without any Sync wording', async () => {
    fresh(); snapshot = null; const h = await mount(); assert(/No forecast yet/.test(h.el.textContent) && !/Sync/.test(h.el.textContent)); await h.unmount();
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
