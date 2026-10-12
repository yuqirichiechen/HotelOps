// Sprint 21 — the REAL Forecast page in jsdom with a synthetic *morning* payload that has shortages
// (the live hotel is rarely short, so shortage/“clean first” states need a fixture).  node tests/forecastpage.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/' }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils');
let snapshot; const gone = [];
const load = (file) => { const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { apiFetch: async () => ({ ok: true, data: { success: true, snapshot } }) };
    if (id === '../../shells/ViewContext') return { useView: () => ({ goTo: (v) => gone.push(v) }) }; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); };
  m._compile(code, file); return m.exports; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };

// ── morning scenario ──
const TODAY = '2026-10-12';
const room = (n, typeCode, occ, hk) => ({ roomNumber: n, typeCode, baseCode: typeCode.slice(0, 4), baseLabel: typeCode.slice(0, 4) === 'NQRR' ? 'Double Queen Standard' : 'King Standard', subLabel: 'Standard', occupancyStatus: occ, hkStatus: hk, inventoryStatus: occ, blocked: false });
const rooms = [room('101', 'NQRR', 'VAC', 'VI'), room('102', 'NQRR', 'VAC', 'D'), room('103', 'NQRR', 'VAC', 'D'), room('104', 'NQRR', 'OCC', 'OC'), room('105', 'NQRR', 'OCC', 'D'),
  room('201', 'NKRR', 'OCC', 'D'), room('202', 'NKRR', 'OCC', 'D')];
let n = 0; const R = (o) => ({ id: 'r' + (++n), guestName: 'Guest ' + n, status: 'RES', typeCode: 'NQRR', baseCode: 'NQRR', roomNumber: null, isPreAssigned: false, source: 'BAR', statusLabel: 'Pending', ...o });
const reservations = [
  R({ arrivalDate: TODAY, departureDate: '2026-10-14' }), R({ arrivalDate: TODAY, departureDate: '2026-10-14' }), R({ arrivalDate: TODAY, departureDate: '2026-10-13' }),   // 3 NQRR arriving, only 1 ready
  R({ typeCode: 'NKRR', baseCode: 'NKRR', arrivalDate: TODAY, departureDate: '2026-10-13' }), R({ typeCode: 'NKRR', baseCode: 'NKRR', arrivalDate: TODAY, departureDate: '2026-10-13' }),  // 2 NKRR arriving, 0 ready
  R({ status: 'INH', typeCode: 'NKRR', baseCode: 'NKRR', roomNumber: '201', arrivalDate: '2026-10-10', departureDate: TODAY }),     // frees 201
  R({ status: 'INH', typeCode: 'NQRR', baseCode: 'NQRR', roomNumber: '104', arrivalDate: '2026-10-10', departureDate: '2026-10-15' }),
  R({ status: 'INH', typeCode: 'NQRR', baseCode: 'NQRR', roomNumber: '105', arrivalDate: '2026-10-11', departureDate: '2026-10-13' }),
];
const mkSnapshot = (o = {}, scrapedAgoH = 0.2) => ({ scraped_at: new Date(Date.now() - scrapedAgoH * 3600e3).toISOString(), status: 'success', payload: { forecastDate: TODAY, futureWindowDays: 30, perRoomSheet: rooms, reservations, metricsSnapshot: {}, ...o } });

async function mount() {
  const Forecast = load(ROOT + '/src/components/Forecast/index.js').default; const el = document.getElementById('root'); el.innerHTML = ''; const root = createRoot(el);
  await act(async () => { root.render(React.createElement(Forecast)); }); await act(async () => { await sleep(30); });
  const click = async (node) => { await act(async () => { node.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await act(async () => { await sleep(10); }); };
  const rowFor = (code) => [...el.querySelectorAll('tbody tr')].find(tr => (tr.querySelector('code') || {}).textContent === code);
  const cells = (tr) => [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
  return { el, root, click, rowFor, cells, unmount: () => act(async () => root.unmount()) };
}

(async () => {
  await t('TODAY (morning): NQRR is "Clean first 2", NKRR is "Short 1" even after cleaning; headline stats and notes agree', async () => {
    sessionStorage.clear(); snapshot = mkSnapshot(); const h = await mount();
    const head = [...h.el.querySelectorAll('thead th')].map(x => x.textContent); assert(head.includes('Ready now') && head.includes('Clean first') && head.includes('Short'), head.join('|'));
    const q = h.cells(h.rowFor('NQRR')); // group row for NQRR: [code,label,total,ready,dirty,freeing,arriving,cleanFirst,short,status]
    assert.deepStrictEqual(q.slice(2), ['5', '1', '2', '0', '3', '2', '0', 'Clean first']);
    const k = h.cells(h.rowFor('NKRR')); assert.deepStrictEqual(k.slice(2), ['2', '0', '0', '1', '2', '2', '1', 'Short']);   // 2 arriving, 0 ready, 0 dirty, 1 freeing → short 1
    const stats = Object.fromEntries([...h.el.querySelectorAll('.fb-stat')].map(s => [s.querySelector('.fb-stat-label').textContent, s.querySelector('.fb-stat-value').textContent]));
    assert.strictEqual(stats['Clean these first'], '4'); assert.strictEqual(stats['Short even after cleaning'], '1'); assert.strictEqual(stats['Clean rooms ready'], '1');
    const notes = [...h.el.querySelectorAll('.fb-note')].map(x => x.textContent); assert(notes.some(x => /Double Queen Standard: only 1 clean room ready for 3 arriving — clean 2 more first/.test(x)), notes.join(' | ')); assert(notes.some(x => /King Standard: short 1/.test(x)));
    await h.unmount();
  });
  await t('outlook strip: 14 days, today flagged short, colours/flags; selecting Tomorrow switches the whole page to availability mode', async () => {
    sessionStorage.clear(); snapshot = mkSnapshot(); const h = await mount();
    const days = [...h.el.querySelectorAll('.fb-day')]; assert.strictEqual(days.length, 14); assert(days[0].classList.contains('fb-day-short')); assert(/short/.test(days[0].textContent)); assert(days[0].classList.contains('active'));
    await h.click(days[1]); const head = [...h.el.querySelectorAll('thead th')].map(x => x.textContent);
    assert(head.includes('Available') && head.includes('Staying over') && !head.includes('Ready now'), head.join('|')); assert(/Need by Room Type · Tue, Oct 13/.test(h.el.textContent));
    assert([...h.el.querySelectorAll('.fb-stat-label')].map(x => x.textContent).includes('Occupied that night')); assert(/Arrivals · Tue, Oct 13/.test(h.el.textContent));
    assert.strictEqual(sessionStorage.getItem('hotelops-fc-day'), '1'); await h.unmount();
  });
  await t('future day math in the UI: NQRR on Oct 13 → staying over 3, available 2 of 5, arriving 0 → +2', async () => {
    sessionStorage.clear(); sessionStorage.setItem('hotelops-fc-day', '1'); snapshot = mkSnapshot(); const h = await mount();
    const q = h.cells(h.rowFor('NQRR')); // [code,label,total,unavail,staying,available,arriving,balance,short,status]
    // continuing through the night of 10/13: 104 (→10/15) + the two RES arriving today that leave 10/14 = 3. Departing ON 10/13 (free for arrivals): 105 and the RES leaving 10/13.
    assert.deepStrictEqual(q.slice(2, 9), ['5', '0', '3', '2', '0', '+2', '0'], q.join('|'));
    await h.unmount();
  });
  await t('selected day is remembered across a remount', async () => {
    sessionStorage.clear(); snapshot = mkSnapshot(); let h = await mount(); await h.click(h.el.querySelectorAll('.fb-day')[3]); await h.unmount();
    h = await mount(); assert(h.el.querySelectorAll('.fb-day')[3].classList.contains('active')); await h.unmount();
  });
  await t('days beyond the reliable data window are disabled and labelled (never a confident zero)', async () => {
    sessionStorage.clear(); snapshot = mkSnapshot({ futureWindowDays: 5 }); const h = await mount(); const days = [...h.el.querySelectorAll('.fb-day')];
    assert(!days[5].disabled && days[6].disabled && days[13].disabled); assert(days[6].classList.contains('fb-day-nodata')); assert(/no data/.test(days[6].textContent)); await h.unmount();
  });
  await t('stale snapshot (5 h old) shows a warning with a path to refresh; a fresh one does not', async () => {
    sessionStorage.clear(); snapshot = mkSnapshot({}, 5); let h = await mount(); assert(h.el.querySelector('.fb-stale') && /5 hours old/.test(h.el.querySelector('.fb-stale').textContent));
    await h.click(h.el.querySelector('.fb-stale .fb-empty-link')); assert.deepStrictEqual(gone, ['reservations']); await h.unmount();
    snapshot = mkSnapshot({}, 0.5); h = await mount(); assert(!h.el.querySelector('.fb-stale')); await h.unmount();
  });
  await t('out-of-order rooms are excluded: marking 101 OOO turns NQRR from "Clean first" into a bigger shortage', async () => {
    sessionStorage.clear(); const rs = rooms.map(r => r.roomNumber === '101' ? { ...r, inventoryStatus: 'OOO' } : r); snapshot = mkSnapshot({ perRoomSheet: rs }); const h = await mount();
    const q = h.cells(h.rowFor('NQRR')); assert.strictEqual(q[2], '5'); assert.strictEqual(q[3], '0', 'ready 0 now'); assert.strictEqual(q[q.length - 1], 'Short'); assert(/out of order \/ blocked/.test(h.el.textContent)); await h.unmount();
  });
  await t('no snapshot yet → friendly empty state; no crash', async () => {
    sessionStorage.clear(); snapshot = null; const h = await mount(); assert(/No forecast yet/.test(h.el.textContent)); await h.unmount();
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
