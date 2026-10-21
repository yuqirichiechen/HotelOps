// Sprint 23 — housekeeping work list + assignment (pure).   node tests/hkwork.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core');
const cache = new Map(); const load = (file) => { if (cache.has(file)) return cache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); cache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); }; m._compile(code, file); return m.exports; };
const { computeForecast } = require(ROOT + '/server/forecast/compute'); const HK = load(ROOT + '/src/components/Housekeeping/hkWork.js');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };

const TODAY = '2026-10-19';
const R = (n, f, occ, hk, type = 'rt1') => ({ id: 'room' + n, roomNumber: String(n), roomTypeId: type, floorId: f, status: true, currentOccupancyStatus: occ, housekeepingRoomStatus: hk, roomInventoryStatus: occ });
const rooms = [R(101, '01', 'VAC', 'VI'), R(102, '01', 'VAC', 'D'), R(103, '01', 'VAC', 'IP'), R(104, '01', 'OCC', 'OC'), R(105, '01', 'OCC', 'OC'), R(201, '02', 'OCC', 'OC'), R(202, '02', 'VAC', 'PU'), R(203, '02', 'VAC', 'VI', 'rt1')];
const roomTypes = [{ id: 'rt1', typeCode: 'NQRR', name: 'Double Queen' }];
const inh = (id, n, arr, dep) => ({ id, status: 'INH', roomType: 'rt1', roomId: 'room' + n, roomNumber: String(n), arrivalDateLocalDate: arr, departureDateLocalDate: dep, arrivalDate: arr + 'T07:00:00Z', departureDate: dep + 'T07:00:00Z', confirmationId: 'C' + n, ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'G', lastName: String(n) } });
const resv = [inh('a', 104, '2026-10-17', TODAY), inh('b', 105, '2026-10-18', '2026-10-21'), inh('c', 201, '2026-10-17', '2026-10-20'),
  { id: 'r1', status: 'RES', roomType: 'rt1', arrivalDateLocalDate: TODAY, departureDateLocalDate: '2026-10-21', arrivalDate: TODAY + 'T07:00:00Z', departureDate: '2026-10-21T07:00:00Z', confirmationId: 'R1', ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'A', lastName: 'B' } },
  { id: 'r2', status: 'RES', roomType: 'rt1', arrivalDateLocalDate: '2026-10-20', departureDateLocalDate: '2026-10-22', arrivalDate: '2026-10-20T07:00:00Z', departureDate: '2026-10-22T07:00:00Z', confirmationId: 'R2', ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'C', lastName: 'D' } }];
const payload = computeForecast({ rooms, roomTypes, reservations: resv, metrics: { remainingArrivalsSummary: { total: 1, remaining: 1 }, remainingDeparturesSummary: { total: 1, remaining: 1 }, totalGuestsSummary: { total: 3 }, roomConditionSummary: [] }, vipStatuses: [], ratePlans: [], roomTypeMapping: [], config: {}, forecastDate: TODAY });
const allow = { enabled: false, scalePct: 100, minExtra: 0 };

t('TODAY work list: vacant dirty/in-progress → clean; occupied guest checking out today → clean; every other occupied room → stay-over service; clean vacant rooms need nothing', () => {
  const w = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 0 }); const by = Object.fromEntries(w.items.map(i => [i.roomNumber, i]));
  assert.deepStrictEqual(w.items.map(i => i.roomNumber), ['102', '103', '104', '105', '201'], 'sorted by floor then number'); assert.strictEqual(w.date, TODAY);
  assert.deepStrictEqual([by['102'].kind, by['102'].why], ['clean', 'Dirty']); assert.deepStrictEqual([by['103'].kind, by['103'].why], ['clean', 'In progress']); assert.deepStrictEqual([by['104'].kind, by['104'].why], ['clean', 'Check-out today']);
  assert.deepStrictEqual([by['105'].kind, by['201'].kind], ['service', 'service']); assert(!by['101'] && !by['202'] && !by['203']); assert.strictEqual(by['201'].floorLabel, 'Floor 2');
});
t('TOMORROW work list comes from the second-night plan: clean-first rooms are flagged, check-outs are cleaned, stay-overs serviced; no room appears twice', () => {
  const w = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 1 }); assert.strictEqual(w.date, '2026-10-20'); const nums = w.items.map(i => i.roomNumber); assert.strictEqual(new Set(nums).size, nums.length);
  const by = Object.fromEntries(w.items.map(i => [i.roomNumber, i])); assert(by['105'] && by['105'].kind === 'service', 'staying over tomorrow → service'); assert(by['201'] && by['201'].kind === 'clean', 'checks out tomorrow → clean');
  assert(w.items.every(i => i.kind === 'clean' || i.kind === 'service')); assert(w.unplaced && typeof w.unplaced.clean === 'number');
});
t('weights + summary: clean 1, service 0.5; totals per housekeeper and for the unassigned pile', () => {
  const items = [{ roomNumber: '1', kind: 'clean' }, { roomNumber: '2', kind: 'clean' }, { roomNumber: '3', kind: 'service' }, { roomNumber: '4', kind: 'service' }];
  const s = HK.summarize(items, { 1: 'a', 2: 'a', 3: 'b' }, [{ userId: 'a', name: 'Ann' }, { userId: 'b', name: 'Bo' }], { min: 2, cleanWeight: 1, serviceWeight: 0.5 });
  assert.deepStrictEqual(s.hks.map(h => [h.name, h.rooms, h.clean, h.service, h.units, h.belowMin]), [['Ann', 2, 2, 0, 2, false], ['Bo', 1, 0, 1, 0.5, true]]); assert.deepStrictEqual([s.unassigned.rooms, s.unassigned.units], [1, 0.5]);
});
t('AUTO-SUGGEST: only as many housekeepers as the minimum allows (no token loads), floor by floor, balanced; everyone gets something when the work is big enough', () => {
  const mk = (n, kind = 'clean') => Array.from({ length: n }, (_, i) => ({ roomNumber: String(100 + i), floorId: String(1 + Math.floor(i / 10)), kind, priority: false }));
  const hks = ['a', 'b', 'c', 'd'].map(id => ({ userId: id, name: id })); const S = { min: 10, cleanWeight: 1, serviceWeight: 0.5 };
  const count = (as) => Object.values(as).reduce((m, id) => (m[id] = (m[id] || 0) + 1, m), {});
  assert.deepStrictEqual(count(HK.suggest(mk(25), hks, S)), { a: 12, b: 13 }, '25 units / 10 → 2 housekeepers'); assert.deepStrictEqual(Object.keys(count(HK.suggest(mk(8), hks, S))), ['a'], 'under the minimum → one person');
  assert.deepStrictEqual(Object.values(count(HK.suggest(mk(60), hks, S))).sort(), [15, 15, 15, 15], '60 rooms → all four, even'); assert.deepStrictEqual(HK.suggest(mk(60), [], S), {}); assert.deepStrictEqual(HK.suggest([], hks, S), {});
  const ov = HK.suggest(mk(25), hks, { ...S, min: 5 }); assert.strictEqual(Object.keys(count(ov)).length, 4, 'the minimum is adjustable (min 5 → all four used)');
  const as = HK.suggest(mk(20), hks, S); const first = Object.entries(as).filter(([, id]) => id === 'a').map(([r]) => Number(r)); assert(Math.max(...first) - Math.min(...first) === first.length - 1, 'a housekeeper gets a CONTIGUOUS run of rooms');
  const mixed = [...mk(10, 'clean'), ...mk(10, 'service').map(i => ({ ...i, roomNumber: 'S' + i.roomNumber }))]; assert.deepStrictEqual(Object.keys(count(HK.suggest(mixed, hks, S))), ['a', 'b'].slice(0, 1), '10 clean + 10 service = 15 units → one housekeeper at min 10');
});
t('RECONCILE a saved plan: rooms that no longer need work drop out, new rooms come back unassigned, housekeepers are kept', () => {
  const saved = { assignments: [{ userId: 'a', name: 'Ann', rooms: [{ roomNumber: '102', kind: 'clean' }, { roomNumber: '999', kind: 'clean' }] }, { userId: 'b', name: 'Bo', rooms: [{ roomNumber: '105', kind: 'service' }] }] };
  const w = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 0 }); const r = HK.reconcile(saved, w.items);
  assert.deepStrictEqual(r.hks.map(h => h.name), ['Ann', 'Bo']); assert.deepStrictEqual(r.assign, { 102: 'a', 105: 'b' }); assert(!('103' in r.assign)); assert.deepStrictEqual(HK.reconcile(null, w.items), { hks: [], assign: {} });
});
t('toAssignments (what is saved/printed): per housekeeper, clean-first rooms first, then by floor and room; priority kept', () => {
  const items = [{ roomNumber: '101', floorId: '01', kind: 'clean', priority: false }, { roomNumber: '102', floorId: '01', kind: 'service', priority: false }, { roomNumber: '201', floorId: '02', kind: 'clean', priority: true }];
  const out = HK.toAssignments(items, { 101: 'a', 102: 'a', 201: 'a' }, [{ userId: 'a', name: 'Ann' }, { userId: 'b', name: 'Bo' }]);
  assert.deepStrictEqual(out[0].rooms, [{ roomNumber: '201', kind: 'clean', priority: true }, { roomNumber: '101', kind: 'clean' }, { roomNumber: '102', kind: 'service' }]); assert.deepStrictEqual(out[1], { userId: 'b', name: 'Bo', rooms: [] });
});
console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
