// Sprint 22.6 — the room status sheet: pure builder (floors, available/unavailable/occupied, check-out day) + the printable/downloadable component.
//   node tests/roomsheet.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true }); Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils');
const cache = new Map(); const load = (file) => { if (cache.has(file)) return cache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); cache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); }; m._compile(code, file); return m.exports; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };
const RS = load(ROOT + '/src/components/Forecast/roomSheet.js'); const Sheet = load(ROOT + '/src/components/Forecast/RoomStatusSheet.js').default;

const TODAY = '2026-10-12';
const room = (n, f, occ, hk, o = {}) => ({ roomNumber: n, typeCode: n.startsWith('2') ? 'NKRRP' : 'NQRR', floorId: f, occupancyStatus: occ, hkStatus: hk, inventoryStatus: occ, blocked: false, ...o });
const rooms = [room('G30', 'G', 'VAC', 'VI'), room('101', '01', 'OCC', 'OC'), room('102', '01', 'VAC', 'PU'), room('103', '01', 'VAC', 'D'), room('104', '01', 'VAC', 'IP'), room('105', '01', 'VAC', 'VI', { blocked: true }),
  room('201', '02', 'OCC', 'OC'), room('202', '02', 'OCC', 'OC'), room('203', '02', 'OCC', 'OC'), room('204', '02', 'VAC', 'VI', { inventoryStatus: 'OOO' }), room('28', 'G', 'VAC', 'VI', { endDate: '2023-02-28', status: false })];
const labelled = rooms.map(r => ({ ...r, baseLabel: r.typeCode === 'NQRR' ? 'Double Queen Standard' : 'King Standard', subLabel: r.typeCode === 'NKRRP' ? 'Pets' : 'Standard' }));
const resv = [{ id: 'a', status: 'INH', roomNumber: '101', guestName: 'Secret Guest', arrivalDate: '2026-10-10', departureDate: TODAY }, { id: 'b', status: 'INH', roomNumber: '201', guestName: 'Another Person', arrivalDate: '2026-10-11', departureDate: '2026-10-13' },
  { id: 'c', status: 'INH', roomNumber: '202', guestName: 'Long Stayer', arrivalDate: '2026-10-09', departureDate: '2026-10-16' }, { id: 'd', status: 'RES', roomNumber: '102', guestName: 'Arriving Gal', arrivalDate: TODAY, departureDate: '2026-10-14' }];
const payload = { forecastDate: TODAY, perRoomSheet: labelled, reservations: resv, inactiveRooms: ['28'] };
const live = { forecastDate: TODAY, fetchedAt: '2026-10-12T20:30:00Z', rooms };

(async () => {
  const sh = RS.buildRoomSheet(payload, live);
  await t('floors in order (Ground, 1, 2), rooms sorted, counts per floor and in total; the deactivated ghost room is not listed', () => {
    assert.deepStrictEqual(sh.floors.map(f => f.label), ['Ground', 'Floor 1', 'Floor 2']); assert.deepStrictEqual(sh.floors[1].rooms.map(r => r.roomNumber), ['101', '102', '103', '104', '105']); assert(!sh.floors[0].rooms.some(r => r.roomNumber === '28'));
    assert.deepStrictEqual(sh.floors.map(f => f.counts), [{ available: 1, unavailable: 0, occupied: 0 }, { available: 1, unavailable: 3, occupied: 1 }, { available: 0, unavailable: 1, occupied: 3 }]); assert.deepStrictEqual(sh.totals, { available: 2, unavailable: 4, occupied: 4, rooms: 10 });
  });
  await t('available = vacant AND inspected/awaiting inspection; unavailable = dirty, being cleaned, blocked, out of order — each with its reason', () => {
    const by = Object.fromEntries(sh.floors.flatMap(f => f.rooms).map(r => [r.roomNumber, r]));
    assert.deepStrictEqual([by.G30.state, by.G30.detail], ['available', 'Inspected']); assert.deepStrictEqual([by['102'].state, by['102'].detail], ['available', 'Awaiting inspection']); assert.deepStrictEqual([by['103'].state, by['103'].detail], ['unavailable', 'Dirty']);
    assert.deepStrictEqual([by['104'].state, by['104'].detail], ['unavailable', 'Being cleaned']); assert.deepStrictEqual([by['105'].state, by['105'].detail], ['unavailable', 'Out of service']); assert.deepStrictEqual([by['204'].state, by['204'].detail], ['unavailable', 'Out of order']);
  });
  await t('occupied rooms show WHEN they check out: today / tomorrow / a later day (with the standard check-out time); unknown stays honest', () => {
    const by = Object.fromEntries(sh.floors.flatMap(f => f.rooms).map(r => [r.roomNumber, r]));
    assert.strictEqual(by['101'].checkout, 'Oct 10 → Oct 12'); assert.strictEqual(by['201'].checkout, 'Oct 11 → Oct 13'); assert.strictEqual(by['202'].checkout, 'Oct 9 → Oct 16'); assert.strictEqual(by['203'].checkout, 'Stay dates unknown');
    assert.deepStrictEqual(['G30', '102', '103', '104', '101', '105'].map(n => by[n].tone), ['inspected', 'pickup', 'dirty', 'progress', 'occupied', 'off'], 'green / yellow / dirty / blue / red');
    assert.strictEqual(by['102'].arrivingToday, true, 'a pre-assigned arrival is flagged on its vacant room'); assert.strictEqual(by['103'].checkout, '');
  });
  await t('no guest names anywhere (the sheet is printed and handed around); room types carry their labels', () => {
    const json = JSON.stringify(sh); for (const n of ['Secret Guest', 'Another Person', 'Long Stayer', 'Arriving Gal']) assert(!json.includes(n), n); assert.strictEqual(sh.floors[1].rooms[0].typeLabel, 'Double Queen Standard'); assert.strictEqual(sh.floors[2].rooms[0].typeLabel, 'King Standard · Pets');
  });
  await t('without the live board it falls back to the last update\'s rooms and says so', () => { const s2 = RS.buildRoomSheet(payload, undefined); assert.strictEqual(s2.source, 'snapshot'); assert.strictEqual(s2.asOf, null); assert.strictEqual(s2.totals.rooms, 10); assert.strictEqual(sh.source, 'live'); });
  await t('CSV: header + one line per room, quoted where needed, same statuses as the sheet', () => {
    const csv = RS.roomSheetCsv(sh).trim().split('\n'); assert.strictEqual(csv[0], 'Floor,Room,Room type,Status,Details,Stay (check-in → check-out),Arriving today'); assert.strictEqual(csv.length, 11); assert(csv.includes('Floor 1,101,Double Queen Standard,Occupied,,Oct 10 → Oct 12,'));
    assert(csv.includes('Floor 1,102,Double Queen Standard,Pickup,Awaiting inspection,,yes')); assert(RS.roomSheetCsv({ floors: [{ label: 'F', rooms: [{ roomNumber: '1', typeLabel: 'A "quoted", type', state: 'available', detail: '', checkout: '' }] }] }).includes('"A ""quoted"", type"'));
  });

  const mount = async (props) => { const el = document.getElementById('root'); el.innerHTML = ''; const root = createRoot(el); await act(async () => { root.render(React.createElement(Sheet, props)); }); await act(async () => { await sleep(10); }); return { el: document.body, root }; };
  await t('SHEET: header counts, one section per floor with its own counts, the color-coded status words, stay dates (no times), and a legend', async () => {
    const h = await mount({ payload, live, onClose() {} }); const txt = h.el.textContent;
    assert(/Room status/.test(h.el.querySelector('h1').textContent)); assert(/as of \d{1,2}:\d{2}/.test(txt)); assert.strictEqual(h.el.querySelectorAll('.fc-sheet-floor').length, 3); assert(/Floor 1\s*1 available · 3 unavailable · 1 occupied/.test(txt));
    for (const x of [/Pickup/, /Vacant · inspected/, /Out of service/, /In progress/, /Dirty/, /Oct 10 → Oct 12/, /arriving today/]) assert(x.test(txt), String(x)); assert(!/12:00 PM|standard time/.test(txt)); assert(h.el.querySelector('.rs-legend') && h.el.querySelector('.rs-row.rs-occupied') && h.el.querySelector('.rs-row.rs-progress') && h.el.querySelector('.rs-row.rs-pickup')); assert(h.el.querySelector('.fc-print-root').parentNode === document.body, 'portal'); assert(!/Secret Guest/.test(txt)); await act(async () => { h.root.unmount(); });
  });
  await t('SHEET: Print opens the browser print dialog; Download CSV saves room-status-<date>.csv with every room; Esc / Close dismiss it', async () => {
    let printed = 0, saved = null, closed = 0; w.print = () => { printed++; };
    w.URL.createObjectURL = (b) => { saved = { blob: b }; return 'blob:x'; }; w.URL.revokeObjectURL = () => {}; globalThis.Blob = w.Blob; globalThis.URL = w.URL;
    const clicks = []; const origClick = w.HTMLAnchorElement.prototype.click; w.HTMLAnchorElement.prototype.click = function () { clicks.push({ href: this.href, download: this.download }); };
    const h = await mount({ payload, live, onClose: () => { closed++; } }); const btn = (re) => [...h.el.querySelectorAll('button')].find(b => re.test(b.textContent)); const click = async (b) => { await act(async () => { b.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); };
    await click(btn(/Print/)); assert.strictEqual(printed, 1); await click(btn(/Download CSV/)); assert.deepStrictEqual(clicks, [{ href: 'blob:x', download: 'room-status-2026-10-12.csv' }]); assert(saved && saved.blob.size > 100);
    await click(btn(/^Close/)); assert.strictEqual(closed, 1); await act(async () => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); }); assert.strictEqual(closed, 2); w.HTMLAnchorElement.prototype.click = origClick; await act(async () => { h.root.unmount(); });
  });
  if (process.env.DUMP_BIG) { const rs = [], rv = []; let n = 0; for (const f of ['01', '02', '03', '04']) for (let i = 1; i <= 21; i++) { const num = String(Number(f) * 100 + i); const k = n++ % 6; rs.push(room(num, f, k < 3 ? 'OCC' : 'VAC', ['OC', 'OC', 'OC', 'VI', 'PU', 'IP'][k])); if (k < 3) rv.push({ id: 'x' + num, status: 'INH', roomNumber: num, arrivalDate: '2026-10-10', departureDate: '2026-10-1' + (3 + (i % 4)) }); }
    const pl = { forecastDate: TODAY, perRoomSheet: rs.map(r => ({ ...r, baseLabel: 'King Standard', subLabel: 'Standard' })), reservations: rv, inactiveRooms: [] }; const h = await mount({ payload: pl, live: { forecastDate: TODAY, rooms: rs }, onClose() {} }); fs.writeFileSync(process.env.DUMP_BIG, document.body.innerHTML); }
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
