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
const mkItems = (spec) => spec.flatMap(([floor, n, kind = 'clean'], fi) => Array.from({ length: n }, (_, i) => ({ roomNumber: `${floor}${String(i + 1).padStart(2, '0')}${fi ? 'x' : ''}`.slice(0, 8), floorId: floor, kind, priority: false })));
const H = (...ids) => ids.map(id => ({ userId: id, name: id })); const S = { min: 10, max: 15, cleanWeight: 1, serviceWeight: 0.5 };
const owners = (items, as) => items.reduce((m, i) => { const u = as[i.roomNumber]; (m[u] = m[u] || []).push(i); return m; }, {});
t('BALANCE: everyone gets about the same workload; a floor goes to ONE housekeeper when the cut can move to the floor boundary; nothing is left over', () => {
  const items = mkItems([['01', 12], ['02', 12], ['03', 12]]); const as = HK.balance(items, H('a', 'b', 'c'), {}, S); const o = owners(items, as);
  assert.deepStrictEqual(Object.keys(o).sort(), ['a', 'b', 'c']); for (const id of ['a', 'b', 'c']) { assert.strictEqual(o[id].length, 12); assert.strictEqual(new Set(o[id].map(i => i.floorId)).size, 1, id + ' has ONE floor'); }
  const items2 = mkItems([['01', 14], ['02', 10]]); const o2 = owners(items2, HK.balance(items2, H('a', 'b'), {}, S)); assert.deepStrictEqual([o2.a.length, o2.b.length], [14, 10], 'cut snapped to the floor boundary (12/12 would split floor 1)'); assert.strictEqual(Object.keys(HK.balance(items2, H('a', 'b'), {}, S)).length, 24);
  const items3 = mkItems([['01', 20]]); const o3 = owners(items3, HK.balance(items3, H('a', 'b'), {}, S)); assert.deepStrictEqual([o3.a.length, o3.b.length], [10, 10], 'one floor must be split when there is no boundary to use');
});
t('BALANCE adapts as housekeepers are added: 1 person → everything (over the max → warning); 2 → halves; 3 → thirds; none → no owners', () => {
  const items = mkItems([['01', 12], ['02', 12], ['03', 12], ['04', 12]]); const count = (ids) => Object.values(owners(items, HK.balance(items, H(...ids), {}, S))).map(l => l.length).sort((a, b) => a - b);
  assert.deepStrictEqual(count(['a']), [48]); assert.deepStrictEqual(count(['a', 'b']), [24, 24]); assert.deepStrictEqual(count(['a', 'b', 'c']), [16, 16, 16], 'never a floor-aligned split that pushes someone over the max (12/12/24)'); assert.deepStrictEqual(count(['a', 'b', 'c', 'd']), [12, 12, 12, 12]); assert.deepStrictEqual(HK.balance(items, [], {}, S), {});
  const sum1 = HK.summarize(items, HK.balance(items, H('a'), {}, S), H('a'), S); const w1 = HK.warnings(sum1, 48, S); assert(/Too many rooms for 1 housekeeper: about 48 each \(maximum 15\)\. Add 3 more\./.test(w1.overall), w1.overall); assert.strictEqual(w1.perHk.a, 'over');
  const sum4 = HK.summarize(items, HK.balance(items, H('a', 'b', 'c', 'd'), {}, S), H('a', 'b', 'c', 'd'), S); assert.strictEqual(HK.warnings(sum4, 48, S).overall, null); assert.strictEqual(HK.warnings({ hks: [] }, 20, S).overall.startsWith('Add a housekeeper'), true);
  const few = HK.summarize(items.slice(0, 6), HK.balance(items.slice(0, 6), H('a'), {}, S), H('a'), S); assert.strictEqual(HK.warnings(few, 6, S).perHk.a, 'under');
});
t('PINNED cards stay where a person put them (and count toward that person\'s load); null keeps a card in the pool; removing the person frees their pins', () => {
  const items = mkItems([['01', 10], ['02', 10]]); const first = items[0].roomNumber, last = items[19].roomNumber;
  const as = HK.balance(items, H('a', 'b'), { [first]: 'b', [last]: null }, S); assert.strictEqual(as[first], 'b'); assert(!(last in as), 'held in the pool'); const o = owners(items.filter(i => i.roomNumber !== last), as);
  assert(Math.abs(o.a.length - o.b.length) <= 1, 'the rest is balanced around the pins: ' + o.a.length + '/' + o.b.length);
  const gone = HK.balance(items, H('a'), { [first]: 'ghost' }, S); assert.strictEqual(gone[first], 'a', 'a pin to someone no longer working is ignored');
  const all = HK.balance(items, H('a', 'b'), Object.fromEntries(items.map(i => [i.roomNumber, 'a'])), S); assert(Object.values(all).every(u => u === 'a'), 'everything pinned → nothing moves');
});
t('RECONCILE a saved plan: housekeepers kept, hand-placed rooms are pinned, the rest come back as auto-assigned, rooms that no longer need work drop out', () => {
  const saved = { assignments: [{ userId: 'a', name: 'Ann', rooms: [{ roomNumber: '102', kind: 'clean', pinned: true }, { roomNumber: '103', kind: 'clean' }, { roomNumber: '999', kind: 'clean', pinned: true }] }, { userId: 'b', name: 'Bo', rooms: [{ roomNumber: '105', kind: 'service', pinned: true }] }] };
  const w = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 0 }); const r = HK.reconcile(saved, w.items);
  assert.deepStrictEqual(r.hks.map(h => h.name), ['Ann', 'Bo']); assert.deepStrictEqual(r.pinned, { 102: 'a', 105: 'b' }); assert.deepStrictEqual(r.auto, { 103: 'a' }); assert.deepStrictEqual(HK.reconcile(null, w.items), { hks: [], pinned: {}, auto: {} });
});
t('RESOLVE what is on screen: hand-placed beats auto; pin to null = held in the pool; people who left are ignored; no auto-assignment unless Auto-assign ran (empty maps → everything in the pool)', () => {
  const items = [{ roomNumber: '1' }, { roomNumber: '2' }, { roomNumber: '3' }, { roomNumber: '4' }], hks = H('a', 'b');
  assert.deepStrictEqual(HK.resolveAssign(items, hks, {}, {}), {}, 'nothing assigned by itself');
  assert.deepStrictEqual(HK.resolveAssign(items, hks, { 1: 'b', 2: null }, { 1: 'a', 2: 'a', 3: 'a', 4: 'ghost' }), { 1: 'b', 3: 'a' }, 'pin beats auto; null pin keeps 2 in the pool; ghost ignored');
});
t('FLOORS are normalised: "02" and "2" are ONE floor (the stay-over rooms carry the reservation\'s raw floor id) — no duplicate floor groups', () => {
  const p4 = JSON.parse(JSON.stringify(payload)); p4.reservations.forEach(r => { if (r.status === 'INH') r.floorId = '0' + (String(r.roomNumber)[0] || '1'); });
  for (const off of [0, 1]) { const w = HK.buildWorkList({ payload: p4, live: null, allowance: allow, offset: off }); const ids = [...new Set(w.items.map(i => i.floorId))]; assert(ids.every(f => f === 'G' || f === 'unknown' || /^[1-9]\d?$/.test(f)), 'normalised: ' + ids.join(',')); assert.strictEqual(new Set(w.items.map(i => i.floorLabel)).size, ids.length, 'one label per floor'); }
});
t('toAssignments (saved/printed): clean-first first, then floor/room; keeps priority, pinned, type and reason', () => {
  const items = [{ roomNumber: '101', floorId: '01', typeCode: 'NQRR', why: 'Dirty', kind: 'clean', priority: false }, { roomNumber: '102', floorId: '01', kind: 'service', priority: false }, { roomNumber: '201', floorId: '02', kind: 'clean', priority: true }];
  const out = HK.toAssignments(items, { 101: 'a', 102: 'a', 201: 'a' }, H('a', 'b'), { 101: 'a' });
  assert.deepStrictEqual(out[0].rooms, [{ roomNumber: '201', kind: 'clean', priority: true }, { roomNumber: '101', kind: 'clean', pinned: true, typeCode: 'NQRR', why: 'Dirty' }, { roomNumber: '102', kind: 'service' }]); assert.deepStrictEqual(out[1], { userId: 'b', name: 'b', rooms: [] });
});
t('TOMORROW: reservations with no room number yet still count BY ROOM TYPE as placeholder cards (TBD · type) that can be handed out; ids are unique and short enough to save', () => {
  const noRoom = (id, arr, dep) => ({ id, status: 'RES', roomType: 'rt1', arrivalDateLocalDate: arr, departureDateLocalDate: dep, arrivalDate: arr + 'T07:00:00Z', departureDate: dep + 'T07:00:00Z', confirmationId: id, ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'N', lastName: id } });
  const p2 = computeForecast({ rooms, roomTypes, reservations: [...resv, noRoom('n1', TODAY, '2026-10-20'), noRoom('n2', TODAY, '2026-10-20')], metrics: { remainingArrivalsSummary: { total: 1, remaining: 1 }, remainingDeparturesSummary: { total: 1, remaining: 1 }, totalGuestsSummary: { total: 3 }, roomConditionSummary: [] }, vipStatuses: [], ratePlans: [], roomTypeMapping: [], config: {}, forecastDate: TODAY });
  const w = HK.buildWorkList({ payload: p2, live: null, allowance: allow, offset: 1 }); const tbd = w.items.filter(i => i.tbd);
  assert(tbd.length >= 2, 'two 1-night bookings checking out tomorrow → two TBD cards, got ' + tbd.length); assert(tbd.every(i => i.typeCode === 'NQRR' && /^[A-Za-z0-9-]{1,8}$/.test(i.roomNumber) && i.floorId === 'unknown')); assert.strictEqual(new Set(w.items.map(i => i.roomNumber)).size, w.items.length);
});
t('DO NOT MOVE rooms (rGuest "Do not move" on an arriving reservation): marked on the card, and cleaned first when they need cleaning — from the server list or a payload flag', () => {
  assert.strictEqual(HK.isRoomLocked({ roomLocked: true }), true); assert.strictEqual(HK.isRoomLocked({}), false);
  const arr = { id: 'L1', status: 'RES', roomType: 'rt1', roomId: 'room102', roomNumber: '102', arrivalDateLocalDate: TODAY, departureDateLocalDate: '2026-10-21', arrivalDate: TODAY, departureDate: '2026-10-21', confirmationId: 'L1', primaryGuestInfo: { firstName: 'L', lastName: 'K' } };
  const base = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 0 }).items.find(i => i.roomNumber === '102'); assert.strictEqual(base.priority, false, 'not priority without a lock');
  const p3 = { ...payload, reservations: [...payload.reservations, { ...arr, arrivalDate: TODAY, departureDate: '2026-10-21', roomLocked: true, guestName: 'L K' }] };
  const it = HK.buildWorkList({ payload: p3, live: null, allowance: allow, offset: 0 }).items.find(i => i.roomNumber === '102'); assert.strictEqual(it.priority, true); assert(/do not move/.test(it.why));
  const viaServer = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 0, lockedRooms: ['102', '105'] }).items; const by = Object.fromEntries(viaServer.map(i => [i.roomNumber, i]));
  assert(by['102'].locked && by['102'].priority, 'dirty arrival room: marked + clean first'); assert(by['105'].locked && !by['105'].priority, 'a stay-over room is marked but is not "clean first"'); assert(!by['103'].locked);
});
console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
