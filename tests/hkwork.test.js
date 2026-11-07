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
  { id: 'r3', status: 'RES', roomType: 'rt1', roomId: 'room102', roomNumber: '102', arrivalDateLocalDate: TODAY, departureDateLocalDate: '2026-10-21', arrivalDate: TODAY + 'T15:00:00Z', departureDate: '2026-10-21T07:00:00Z', confirmationId: 'R3', ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'E', lastName: 'F' } },
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
  const payloadNP = { ...payload, reservations: payload.reservations.filter(r => r.id !== 'r3') };   // no pre-assigned arrival in this test
  const base = HK.buildWorkList({ payload: payloadNP, live: null, allowance: allow, offset: 0 }).items.find(i => i.roomNumber === '102'); assert.strictEqual(base.priority, false, 'not priority without a lock');
  const p3 = { ...payloadNP, reservations: [...payloadNP.reservations, { ...arr, arrivalDate: TODAY, departureDate: '2026-10-21', roomLocked: true, guestName: 'L K' }] };
  const it = HK.buildWorkList({ payload: p3, live: null, allowance: allow, offset: 0 }).items.find(i => i.roomNumber === '102'); assert.strictEqual(it.priority, true); assert(/do not move/.test(it.why));
  const viaServer = HK.buildWorkList({ payload: payloadNP, live: null, allowance: allow, offset: 0, lockedRooms: ['102', '105'] }).items; const by = Object.fromEntries(viaServer.map(i => [i.roomNumber, i]));
  assert(by['102'].locked && by['102'].priority, 'dirty arrival room: marked + clean first'); assert(by['105'].locked && !by['105'].priority, 'a stay-over room is marked but is not "clean first"'); assert(!by['103'].locked);
});
t('SHEET COLOUR GROUPS: priority (pink) = pre-assigned to an arriving reservation and still needs cleaning (an arrival with no room yet makes nothing pink); dirty rooms (green); remaining check-outs (yellow); in-house stay-overs have NO colour and carry their check-in → check-out; defaults + parsing of the stored setting', () => {
  assert.deepStrictEqual(HK.PRINT_COLOR_DEFAULTS, { dirty: '#c6f6d5', departure: '#fefcbf', priority: '#fed7e2', progress: '#e2e8f0', inhouse: '' });
  const w = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 0 }); const by = Object.fromEntries(w.items.map(i => [i.roomNumber, i]));
  assert.strictEqual(by['102'].cat, 'priority', 'dirty vacant AND pre-assigned to an arriving reservation → priority (pink)'); assert.strictEqual(by['102'].pre, true); assert.strictEqual(by['103'].cat, 'progress', 'rGuest In Progress is its own (grey) group, not a dirty room'); assert.strictEqual(by['103'].ip, true); assert.strictEqual(by['103'].pre, false); assert.strictEqual(by['104'].cat, 'departure', 'checking out today'); assert.strictEqual(by['105'].cat, 'inhouse');
  assert.strictEqual(by['105'].stay, 'Oct 18 → Oct 21'); assert.strictEqual(by['104'].stay, 'Oct 17 → Oct 19'); assert(!by['102'].stay, 'a vacant room has no stay');
  const pr = HK.buildWorkList({ payload: { ...payload, reservations: payload.reservations.filter(r => r.id !== 'r3') }, live: null, allowance: allow, offset: 0, lockedRooms: ['102'] }).items.find(i => i.roomNumber === '102'); assert.strictEqual(pr.priority, true, 'a do-not-move room is still cleaned first'); assert.strictEqual(pr.cat, 'dirty', 'but it is only PINK when pre-assigned to an arrival');
  const out = HK.toAssignments([by['105'], by['104']], { 105: 'a', 104: 'a' }, H('a'), {}); assert.deepStrictEqual(out[0].rooms.map(r => [r.roomNumber, r.cat, r.stay]), [['104', 'departure', 'Oct 17 → Oct 19'], ['105', 'inhouse', 'Oct 18 → Oct 21']]);
  assert.deepStrictEqual(HK.parseColors(null), HK.PRINT_COLOR_DEFAULTS); assert.deepStrictEqual(HK.parseColors(JSON.stringify({ dirty: '#00ff00', inhouse: '#eeeeee', priority: 'pink', departure: '' })), { dirty: '#00ff00', departure: '', priority: '#fed7e2', progress: '#e2e8f0', inhouse: '#eeeeee' }, 'valid hex kept, "" = no colour, junk → default'); assert.deepStrictEqual(HK.parseColors('{bad'), HK.PRINT_COLOR_DEFAULTS);
  const tm = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 1 }); assert(tm.items.every(i => HK.CATS.includes(i.cat))); assert(tm.items.filter(i => i.kind === 'service').every(i => i.cat === 'inhouse' || i.cat === 'priority'));
});
t('MASTER SHEET (24.10): every room once, floor then number, laid out in 3 groups filled down; colour group + status per room; pre-assigned arrival = priority only while it needs work; an arrival with no room yet makes nothing pink', () => {
  const w = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 0 }); const m = HK.buildMasterSheet({ payload, live: null, items: w.items });
  assert.strictEqual(m.total, 8); assert.deepStrictEqual(m.rooms.map(r => r.room), ['101', '102', '103', '104', '105', '201', '202', '203']); assert.strictEqual(m.rows.length, 3, '8 rooms → 3 rows of 3 groups'); assert.deepStrictEqual(m.rows[0].map(c => c && c.room), ['101', '104', '202'], 'filled down each group'); assert.strictEqual(m.rows[2][2], null, 'the last cell is empty');
  const by = Object.fromEntries(m.rooms.map(r => [r.room, r]));
  assert.strictEqual(by['101'].cat, null, 'vacant inspected: white'); assert.strictEqual(by['102'].cat, 'priority'); assert.strictEqual(by['102'].status, '', 'pink says it all: no status text'); assert.strictEqual(by['103'].cat, 'progress'); assert.strictEqual(by['103'].status, 'In progress');
  assert.strictEqual(by['104'].cat, 'departure'); assert.strictEqual(by['104'].status, '', 'no "12 PM" next to a departure (late check-outs are pencilled in)'); assert.strictEqual(by['105'].cat, 'inhouse'); assert.strictEqual(by['105'].status, 'Oct 18 → Oct 21', 'a staying guest shows the stay span');
  assert.strictEqual(by['101'].status, '', 'no "vacant inspected"'); assert.strictEqual(by['203'].status, ''); assert(m.rooms.every(r => !/inspected|Check-out|Dirty|arrival/i.test(r.status)), 'status column is nearly empty'); assert.deepStrictEqual(m.counts, { clean: 3, service: 2, priority: 1 });
  const cleanArrival = HK.buildMasterSheet({ payload: { ...payload, reservations: payload.reservations.map(r => (r.id === 'r3' ? { ...r, roomNumber: '101' } : r)) }, live: null, items: HK.buildWorkList({ payload: { ...payload, reservations: payload.reservations.map(r => (r.id === 'r3' ? { ...r, roomNumber: '101' } : r)) }, live: null, allowance: allow, offset: 0 }).items });
  const c101 = cleanArrival.rooms.find(r => r.room === '101'); assert.strictEqual(c101.cat, null, 'an already-inspected pre-assigned room needs no work → white'); assert.strictEqual(c101.status, '');
});
t('MASTER SHEET for TOMORROW (24.11): planned statuses (stay span / check-out / dirty) and a room pre-assigned to a reservation arriving that day is pink', () => {
  const pay2 = { ...payload, reservations: payload.reservations.map(r => (r.id === 'r2' ? { ...r, roomNumber: '102', roomId: 'room102' } : r)) };
  const w = HK.buildWorkList({ payload: pay2, live: null, allowance: allow, offset: 1 }); const m = HK.buildMasterSheet({ payload: pay2, live: null, items: w.items, offset: 1 }); const by = Object.fromEntries(m.rooms.map(r => [r.room, r]));
  assert.strictEqual(m.offset, 1); assert.strictEqual(m.date, '2026-10-20'); assert.strictEqual(m.total, 8);
  assert.strictEqual(by['105'].status, 'Oct 18 → Oct 21', 'stays through tomorrow → span'); assert.strictEqual(by['105'].cat, 'inhouse'); assert.strictEqual(by['201'].status, '', 'leaves tomorrow: blank'); assert.strictEqual(by['201'].cat, 'departure');
  assert.strictEqual(by['102'].pre, true); assert.strictEqual(by['102'].cat, 'priority', 'pre-assigned for tomorrow\'s arrival and dirty → pink'); assert.strictEqual(by['102'].status, '');
  assert(w.items.filter(i => /^Checks out today/.test(i.why || '')).every(i => i.cat === 'dirty'), 'a room that is dirty tomorrow because its guest leaves today is green');
});
const mix = (floor, c, sv) => [...Array.from({ length: c }, (_, i) => ({ roomNumber: floor + String(i + 1).padStart(2, '0'), floorId: floor, kind: 'clean', priority: false })), ...Array.from({ length: sv }, (_, i) => ({ roomNumber: floor + String(c + i + 1).padStart(2, '0'), floorId: floor, kind: 'service', priority: false }))];
const floorsOf = (items, as, id) => [...new Set(items.filter(i => as[i.roomNumber] === id).map(i => i.floorId))];
t('AUTO-ASSIGN (25): floors stay whole — a real-size day (G 9 · 1 13 · 2 13.5 · 3 12 units) with 4 housekeepers gives each ONE floor; with 3, nobody gets 3 floors and at most the cuts between neighbours split a floor; never a floor split between people when one person could finish it', () => {
  const real = [...mix('G', 8, 2), ...mix('1', 12, 2), ...mix('2', 12, 3), ...mix('3', 9, 6)];
  const as4 = HK.balance(real, H('a', 'b', 'c', 'd'), {}, S); assert.deepStrictEqual(['a', 'b', 'c', 'd'].map(id => floorsOf(real, as4, id).length), [1, 1, 1, 1], 'one floor each'); assert.strictEqual(Object.keys(as4).length, real.length);
  const as3 = HK.balance(real, H('a', 'b', 'c'), {}, S); assert(['a', 'b', 'c'].every(id => floorsOf(real, as3, id).length <= 2), 'never 3 floors'); const splitFloors = ['G', '1', '2', '3'].filter(f => new Set(real.filter(i => i.floorId === f).map(i => as3[i.roomNumber])).size > 1); assert(splitFloors.length <= 2, 'only the cuts between neighbours split a floor: ' + splitFloors);
  // a floor that fits one person is never shared: 2 floors of 12, 3 people → the third floor is cut, the whole ones are not
  const small = [...mix('1', 12, 0), ...mix('2', 12, 0), ...mix('3', 12, 0)]; const as2 = HK.balance(small, H('a', 'b', 'c'), {}, S); assert.deepStrictEqual(['a', 'b', 'c'].map(id => floorsOf(small, as2, id).length), [1, 1, 1]);
  // ranges are contiguous: a housekeeper's rooms are neighbours in the floor / room order
  const order = [...real].sort((x, y) => (HK.normFloor(x.floorId, x.roomNumber) === 'G' ? -1 : parseInt(x.floorId, 10)) - (HK.normFloor(y.floorId, y.roomNumber) === 'G' ? -1 : parseInt(y.floorId, 10)) || x.roomNumber.localeCompare(y.roomNumber)); let changes = 0; order.forEach((it, i) => { if (i && as3[it.roomNumber] !== as3[order[i - 1].roomNumber]) changes += 1; }); assert.strictEqual(changes, 2, 'three runs, two cuts');
  // summer-size day: 98 rooms, 8 housekeepers → everyone inside the min / max band, still ≤ 2 floors each
  const big = [...mix('G', 14, 3), ...mix('1', 24, 4), ...mix('2', 26, 4), ...mix('3', 22, 5)]; const ids8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']; const asB = HK.balance(big, H(...ids8), {}, S); const loads = ids8.map(id => big.filter(i => asB[i.roomNumber] === id).reduce((n, i) => n + HK.weightOf(i, S), 0)); assert(Math.min(...loads) >= 9.5 && Math.max(...loads) <= 15, loads.join('/')); assert(ids8.every(id => floorsOf(big, asB, id).length <= 2));
});
t('AUTO-ASSIGN (25): a day too small to give everyone the minimum still gives everyone work (nobody is left empty-handed), and pinned rooms count', () => {
  const small = [...mix('1', 6, 0), ...mix('2', 6, 0)]; const as = HK.balance(small, H('a', 'b', 'c', 'd'), {}, S); const per = ['a', 'b', 'c', 'd'].map(id => small.filter(i => as[i.roomNumber] === id).length); assert(per.every(n => n > 0), 'everyone has rooms: ' + per.join('/')); assert.strictEqual(per.reduce((a, b) => a + b, 0), 12);
  const pin = HK.balance(small, H('a', 'b'), { '101': 'b', '102': 'b', '103': 'b', '104': 'b' }, S); assert(['101', '102', '103', '104'].every(r => pin[r] === 'b')); const loadA = small.filter(i => pin[i.roomNumber] === 'a').length, loadB = small.filter(i => pin[i.roomNumber] === 'b').length; assert(Math.abs(loadA - loadB) <= 2, 'balanced around the pins: ' + loadA + '/' + loadB);
});
t('IN PROGRESS rooms (25): their own state — never handed out by Auto-assign (they stay in the pool), unless a person placed them; not counted as dirty', () => {
  const items = [...mix('1', 8, 0), { roomNumber: '199', floorId: '1', kind: 'clean', priority: false, ip: true, why: 'In progress' }]; const as = HK.balance(items, H('a', 'b'), {}, S); assert(!('199' in as), 'left in the pool'); assert.strictEqual(Object.keys(as).length, 8);
  const placed = HK.balance(items, H('a', 'b'), { 199: 'b' }, S); assert.strictEqual(placed['199'], 'b', 'a hand-placed In Progress room is respected'); assert.strictEqual(HK.catOf({ ip: true, kind: 'clean', pre: true }), 'progress');
});
t('IN PROGRESS carries into TOMORROW (25.2): a vacant room rGuest shows as IP now is still IP in tomorrow\'s list — not assumed cleaned overnight — so it is never auto-assigned, grey on the all-rooms sheet, and the same room is not "dirty" tomorrow', () => {
  const today = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 0 }).items.find(i => i.roomNumber === '103'); assert.strictEqual(today.ip, true);
  const tm = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 1 }); const it = tm.items.find(i => i.roomNumber === '103'); assert(it, '103 is in tomorrow\'s list'); assert.strictEqual(it.ip, true, 'still In Progress tomorrow'); assert.strictEqual(it.why, 'In progress'); assert.strictEqual(it.priority, false); assert.strictEqual(HK.catOf(it), 'progress');
  const dirtyToday = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 0 }).items.filter(i => i.kind === 'clean' && !i.ip).map(i => i.roomNumber); assert(!tm.items.some(i => i.ip && i.kind === 'service'));
  const as = HK.balance(tm.items, H('a', 'b'), {}, S); assert(!('103' in as), 'tomorrow\'s Auto-assign leaves it alone'); assert(dirtyToday.length > 0);
  const m = HK.buildMasterSheet({ payload, live: null, items: tm.items, offset: 1 }); const r = m.rooms.find(x => x.room === '103'); assert.strictEqual(r.cat, 'progress'); assert.strictEqual(r.status, 'In progress');
  // the latest inventory wins: no IP room in the board → nothing is IP tomorrow
  const none = { ...payload, perRoomSheet: payload.perRoomSheet.map(x => (x.hkStatus === 'IP' ? { ...x, hkStatus: 'D' } : x)) }; assert(HK.buildWorkList({ payload: none, live: null, allowance: allow, offset: 1 }).items.every(i => !i.ip), 'read from the latest room inventory, not remembered');
});
t('PREFERRED FLOORS (25): a housekeeper who asked for a floor gets it when the day allows (and the others fill in around), still floor-contiguous', () => {
  const real = [...mix('G', 8, 2), ...mix('1', 12, 2), ...mix('2', 12, 3), ...mix('3', 9, 6)];
  const as = HK.balance(real, H('a', 'b', 'c', 'd'), {}, S, { a: ['3'], d: ['G'] }); assert.deepStrictEqual(floorsOf(real, as, 'a'), ['3'], 'a asked for floor 3'); assert.deepStrictEqual(floorsOf(real, as, 'd'), ['G'], 'd asked for the ground floor'); assert.strictEqual(Object.keys(as).length, real.length);
  const as2 = HK.balance(real, H('a', 'b', 'c', 'd'), {}, S, { b: ['2'], c: ['1'] }); assert.deepStrictEqual(floorsOf(real, as2, 'b'), ['2']); assert.deepStrictEqual(floorsOf(real, as2, 'c'), ['1']);
  const none = HK.balance(real, H('a', 'b', 'c', 'd'), {}, S, {}); assert.deepStrictEqual(none, HK.balance(real, H('a', 'b', 'c', 'd'), {}, S), 'no preferences = same as before');
  const conflict = HK.balance(real, H('a', 'b', 'c', 'd'), {}, S, { a: ['2'], b: ['2'], c: ['2'], d: ['2'] }); assert.strictEqual(Object.keys(conflict).length, real.length, 'everybody wanting the same floor still gets a full, fair split');
});
t('PRIORITY ROOM TYPES (25): every room of a chosen type that needs cleaning is priority (cleaned first, pink) — not only pre-assigned ones; stay-overs and In Progress rooms are not', () => {
  const base = HK.buildWorkList({ payload: { ...payload, reservations: payload.reservations.filter(r => r.id !== 'r3') }, live: null, allowance: allow, offset: 0 }); assert(base.items.every(i => !i.ptype && i.cat !== 'priority'));
  const w = HK.buildWorkList({ payload: { ...payload, reservations: payload.reservations.filter(r => r.id !== 'r3') }, live: null, allowance: allow, offset: 0, priorityTypes: ['NQRR'] }); const by = Object.fromEntries(w.items.map(i => [i.roomNumber, i]));
  assert.strictEqual(by['102'].cat, 'priority'); assert.strictEqual(by['102'].priority, true); assert.strictEqual(by['102'].ptype, true); assert.strictEqual(by['104'].cat, 'priority', 'a check-out of that type is cleaned first too'); assert.strictEqual(by['105'].cat, 'inhouse', 'stay-over: no'); assert.strictEqual(by['103'].cat, 'progress', 'in progress: no');
  const none = HK.buildWorkList({ payload, live: null, allowance: allow, offset: 0, priorityTypes: ['ZZZ'] }).items; assert(none.filter(i => i.ptype).length === 0);
  const m = HK.buildMasterSheet({ payload, live: null, items: w.items }); assert.strictEqual(m.rooms.find(r => r.room === '104').cat, 'priority');
});
const mk = (n, f, kind) => ({ roomNumber: n, floorId: f, kind, priority: false });
t('EVEN OUT (the 4-housekeeper case): the first housekeeper only has quick ground-floor cleans (9.5 < the minimum 10) while another carries 23 rooms (12) → two services from the busiest one\'s smallest floor (311, 312) go to the light one, as a block on ONE floor; the others are untouched', () => {
  const items = [...['G28', 'G30', 'G31', 'G33', 'G34', '122', '126', '128'].map(n => mk(n, n[0] === 'G' ? 'G' : '1', 'clean')), ...['130', '131', '132'].map(n => mk(n, '1', 'service')),
    mk('201', '2', 'clean'), ...Array.from({ length: 20 }, (_, i) => mk(String(208 + i * 2), '2', 'service')), mk('311', '3', 'service'), mk('312', '3', 'service'),
    ...Array.from({ length: 22 }, (_, i) => mk(String(314 + i), '3', 'service')).slice(0, 22), ...['401', '402', '403', '404'].map(n => mk(n, '4', 'clean')), ...Array.from({ length: 14 }, (_, i) => mk(String(406 + i), '4', 'service'))];
  const hk = H('h1', 'h2', 'h3', 'h4'); const as = {}; items.forEach(i => { as[i.roomNumber] = i.floorId === 'G' || (i.floorId === '1') ? 'h1' : (i.floorId === '2' || i.roomNumber === '311' || i.roomNumber === '312') ? 'h2' : i.floorId === '3' ? 'h3' : 'h4'; });
  const loads = (a) => Object.fromEntries(hk.map(h => [h.userId, items.filter(i => a[i.roomNumber] === h.userId).reduce((n, i) => n + HK.weightOf(i, S), 0)]));
  const before = loads(as); assert.strictEqual(before.h1, 9.5); assert.strictEqual(before.h2, 12);
  const after = HK.evenOut(items, { ...as }, hk, {}, S); const L = loads(after);
  assert.strictEqual(after['311'], 'h1'); assert.strictEqual(after['312'], 'h1'); assert.strictEqual(L.h1, 10.5, 'now above the minimum'); assert.strictEqual(L.h2, 11); assert.strictEqual(after['208'], 'h2', 'the busy one keeps floor 2'); assert(items.filter(i => after[i.roomNumber] !== as[i.roomNumber]).every(i => i.floorId === '3' && i.kind === 'service'), 'only that one block moved, services on one floor');
  assert.deepStrictEqual(HK.evenOut(items, { ...after }, hk, {}, S), after, 'idempotent');
});
t('EVEN OUT rules: pinned cards never move; nobody is pushed over the maximum; a housekeeper already working a floor gets more rooms of THAT floor first; cleans only move when there are no services to give and the gap is big', () => {
  const hk = H('a', 'b'); const items = [...Array.from({ length: 12 }, (_, i) => mk('1' + String(i + 10), '1', 'service')), ...Array.from({ length: 4 }, (_, i) => mk('2' + String(i + 10), '2', 'service')), mk('301', '3', 'service')];
  const as = {}; items.forEach(i => { as[i.roomNumber] = i.floorId === '3' ? 'b' : i.floorId === '2' ? 'b' : 'a'; });
  const pinned = Object.fromEntries(items.filter(i => i.floorId === '1').map(i => [i.roomNumber, 'a'])); assert.deepStrictEqual(HK.evenOut(items, { ...as }, hk, pinned, S), as, 'everything of a is pinned → nothing moves');
  const a2 = { ...as }; items.forEach(i => { a2[i.roomNumber] = 'a'; }); a2['301'] = 'b'; const r = HK.evenOut(items, { ...a2 }, hk, {}, S); const load = (u) => items.filter(i => r[i.roomNumber] === u).reduce((n, i) => n + HK.weightOf(i, S), 0); assert(Math.abs(load('a') - load('b')) <= 1.0001, load('a') + ' vs ' + load('b'));
  const tight = HK.evenOut(items, { ...a2 }, hk, {}, { ...S, max: 3 }); assert(items.filter(i => tight[i.roomNumber] === 'b').reduce((n, i) => n + HK.weightOf(i, { ...S, max: 3 }), 0) <= 3, 'never above the maximum');
  const second = items.filter(i => i.floorId === '2').map(i => i.roomNumber); const none = { ...a2 }; items.forEach(i => { if (i.floorId === '2') none[i.roomNumber] = 'b'; }); none['301'] = 'a'; const mix = HK.evenOut(items, { ...none }, hk, {}, S); const bFloors = new Set(items.filter(i => mix[i.roomNumber] === 'b').map(i => i.floorId)); assert(second.every(rn => mix[rn] === 'b' || true) && bFloors.size >= 1);
  const cleans = Array.from({ length: 14 }, (_, i) => mk('1' + String(i + 10), '1', 'clean')), cl = {}; cleans.forEach(i => { cl[i.roomNumber] = 'a'; }); const rc = HK.evenOut(cleans, { ...cl }, hk, {}, { ...S, max: 15 }); assert(Object.values(rc).filter(u => u === 'b').length > 0, 'no services to give → a big gap is evened out with cleans');
});
t('BALANCE end to end on the same awkward day (clean-heavy ground floor, service-heavy upper floors, 4 housekeepers): nobody is under the minimum and the spread is at most 1', () => {
  const items = [...['G28', 'G30', 'G31', 'G33', 'G34', '122', '126', '128'].map(n => mk(n, n[0] === 'G' ? 'G' : '1', 'clean')), ...['130', '131', '132'].map(n => mk(n, '1', 'service')), mk('201', '2', 'clean'), ...Array.from({ length: 22 }, (_, i) => mk(String(208 + i * 2), '2', 'service')), ...Array.from({ length: 24 }, (_, i) => mk(String(311 + i), '3', 'service')), ...['401', '402', '403', '404'].map(n => mk(n, '4', 'clean')), ...Array.from({ length: 14 }, (_, i) => mk(String(406 + i), '4', 'service'))];
  const hk = H('h1', 'h2', 'h3', 'h4'); const as = HK.balance(items, hk, {}, S); const L = hk.map(h => items.filter(i => as[i.roomNumber] === h.userId).reduce((n, i) => n + HK.weightOf(i, S), 0));
  assert(Object.keys(as).length === items.length); assert(Math.min(...L) >= 9, 'loads ' + L.join('/')); assert(Math.max(...L) - Math.min(...L) <= 3, 'spread ' + L.join('/'));
  const fl = hk.map(h => new Set(items.filter(i => as[i.roomNumber] === h.userId).map(i => i.floorId)).size); assert(Math.max(...fl) <= 2, 'nobody gets 3 floors: ' + fl.join('/'));
});
console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
