// Forecast model tests (Sprint 21.3 semantics).  Offline:  node tests/forecastmodel.test.js "$PWD"
//                                               Live:     node tests/forecastmodel.test.js "$PWD" --live   (read-only GETs)
const fs = require('fs'), assert = require('assert'); const ROOT = process.argv[2]; const LIVE = process.argv.includes('--live');
const src = fs.readFileSync(ROOT + '/src/components/Forecast/forecastModel.js', 'utf8').replace(/^export /gm, '');
const M = new Function(src + '\nreturn { buildDayModel, buildOutlook, deriveNotes, isSellable, isActiveRoom, classifyToday, addDays, lateAllowanceRatio, normFloor, DEFAULT_ALLOWANCE };')();
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };

const room = (n, typeCode, occ, hk, extra = {}) => ({ roomNumber: n, typeCode, baseCode: typeCode.slice(0, 4), baseLabel: typeCode.slice(0, 4), subLabel: typeCode.length > 4 ? 'Pets' : 'Standard', occupancyStatus: occ, hkStatus: hk, inventoryStatus: occ, blocked: false, ...extra });
// NQRR: 101 VI, 102 PU, 103 dirty, 104 occupied (stayover), 105 occupied (departing today) | NKRR: 201 occupied, 202 in-progress | NKRRP: 203 VI
const rooms = [room('101', 'NQRR', 'VAC', 'VI'), room('102', 'NQRR', 'VAC', 'PU'), room('103', 'NQRR', 'VAC', 'D'), room('104', 'NQRR', 'OCC', 'OC'), room('105', 'NQRR', 'OCC', 'D'),
  room('201', 'NKRR', 'OCC', 'D'), room('202', 'NKRR', 'VAC', 'IP'), room('203', 'NKRRP', 'VAC', 'VI')];
let n = 0; const res = (o) => ({ id: 'r' + (++n), status: 'RES', typeCode: 'NQRR', baseCode: 'NQRR', roomNumber: null, isPreAssigned: false, ...o });
const TODAY = '2026-10-11';
const reservations = [
  res({ arrivalDate: TODAY, departureDate: '2026-10-13' }), res({ arrivalDate: TODAY, departureDate: '2026-10-12' }),                         // 2 NQRR still to arrive
  res({ arrivalDate: TODAY, departureDate: '2026-10-12', typeCode: 'NKRR' }),                                                                  // 1 NKRR still to arrive
  res({ status: 'INH', arrivalDate: '2026-10-09', departureDate: TODAY, typeCode: 'NKRR', roomNumber: '201' }),                                // departing today, frees 201
  res({ status: 'INH', arrivalDate: '2026-10-10', departureDate: '2026-10-14', roomNumber: '104' }),                                          // stayover
  res({ status: 'INH', arrivalDate: '2026-10-09', departureDate: TODAY, roomNumber: '105' }),                                                  // departing today, frees 105
  res({ arrivalDate: '2026-10-12', departureDate: '2026-10-14' }), res({ arrivalDate: '2026-10-12', departureDate: '2026-10-13' }),             // tomorrow's arrivals
  res({ status: 'DPT', arrivalDate: '2026-10-09', departureDate: TODAY }),                                                                      // already left today
  res({ arrivalDate: TODAY, departureDate: TODAY }),                                                                                            // day-use → ignored
];
const payload = (o = {}) => ({ forecastDate: TODAY, futureWindowDays: 30, perRoomSheet: rooms, reservations, ...o });
const G = (m, base) => m.groups.find(g => g.baseCode === base);
// live board equivalent to the snapshot above (+ 1 arrival already checked in, 1 already departed)
const liveBoard = (o = {}) => ({ forecastDate: TODAY, rooms: rooms.map(r => ({ ...r })), remainingArrivals: [{ typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NKRR' }], stillDeparting: [{ roomNumber: '201', typeCode: 'NKRR' }, { roomNumber: '105', typeCode: 'NQRR' }], arrivalsToday: 5, departedToday: 1, ...o });

(async () => {
  await t('TODAY buckets: VI = inspected, PU = awaiting inspection, other vacant = dirty; ready = VI+PU; still-departing frees by ROOM type', () => {
    const m = M.buildDayModel(payload(), TODAY); const q = G(m, 'NQRR').totals, k = G(m, 'NKRR').totals;
    assert.deepStrictEqual([q.inspected, q.awaiting, q.ready, q.dirty, q.freeing, q.arrivals], [1, 1, 2, 1, 1, 2]);
    assert.deepStrictEqual([k.inspected, k.awaiting, k.ready, k.dirty, k.freeing, k.arrivals], [1, 0, 1, 1, 1, 1]);   // NKRR group = NKRR(201 occupied,202 IP) + NKRRP(203 VI)
    assert.strictEqual(q.leftNow, 0); assert.strictEqual(q.leftPotential, 2); assert.strictEqual(q.status, 'tight');   // 2 ready for 2 arriving → nothing left NOW; 2 more possible
    assert.strictEqual(k.leftNow, 0); assert.strictEqual(k.status, 'tight');
  });
  await t('statuses: open (rooms left) · tight (only after cleaning) · full (nothing left to sell) · short (oversold)', () => {
    const c = M.classifyToday; assert.strictEqual(c(3, 0, 0, 1).status, 'open'); assert.strictEqual(c(1, 2, 0, 2).status, 'tight'); assert.strictEqual(c(2, 0, 0, 2).status, 'full');   // exactly enough rooms for the remaining arrivals, none left to sell
    assert.strictEqual(c(1, 0, 0, 1).status, 'full'); assert.strictEqual(c(0, 0, 0, 0).status, 'full'); assert.strictEqual(c(1, 0, 0, 3).status, 'short'); assert.strictEqual(c(1, 0, 0, 3).leftPotential, -2);
  });
  await t('the user\'s example: a VAC/VI room of a type rGuest doesn\'t list is NOT counted once the room is deactivated (live rooms carry their end date)', () => {
    const ghost = { ...room('28', 'NKRRP', 'VAC', 'VI'), startDate: '2023-02-26', endDate: '2023-02-28', deactivateDate: '2023-02-28T08:00:00Z' };
    assert.strictEqual(M.isActiveRoom(ghost, TODAY), false); assert.strictEqual(M.isActiveRoom(room('G28', 'NKRRP', 'OCC', 'OC', { startDate: '2022-06-19' }), TODAY), true);
    const m = M.buildDayModel(payload(), TODAY, liveBoard({ rooms: liveBoard().rooms.concat([ghost]) })); const pets = G(m, 'NKRR').variants.find(v => v.typeCode === 'NKRRP');
    assert.strictEqual(pets.totalRooms, 1, 'ghost not counted in inventory'); assert.strictEqual(pets.inspected, 1);   // only room 203
    assert.strictEqual(M.buildDayModel(payload({ inactiveRooms: ['203'] }), TODAY).groups.length >= 1, true);
    const m2 = M.buildDayModel(payload({ inactiveRooms: ['203'] }), TODAY); assert(!G(m2, 'NKRR').variants.some(v => v.typeCode === 'NKRRP'), 'snapshot-reported inactive rooms are dropped too');
  });
  await t('LIVE mode drives today (arrivals, still-departing, totals) and matches the snapshot-derived numbers on the same data', () => {
    const a = M.buildDayModel(payload(), TODAY), b = M.buildDayModel(payload(), TODAY, liveBoard());
    for (const base of ['NQRR', 'NKRR']) for (const k of ['inspected', 'awaiting', 'dirty', 'freeing', 'arrivals', 'leftNow', 'leftPotential', 'status']) assert.strictEqual(G(b, base).totals[k], G(a, base).totals[k], `${base}.${k}`);
    assert.strictEqual(b.isLive, true); assert.strictEqual(a.isLive, false); assert.strictEqual(b.totals.arrivals, 5); assert.strictEqual(b.totals.departures, 3);   // 2 still departing + 1 departed
    // live changes are picked up: a guest checks in → one fewer remaining arrival → NQRR opens up
    const c = M.buildDayModel(payload(), TODAY, liveBoard({ remainingArrivals: [{ typeCode: 'NQRR' }, { typeCode: 'NKRR' }] })); assert.strictEqual(G(c, 'NQRR').totals.leftNow, 1); assert.strictEqual(G(c, 'NQRR').totals.status, 'open');
  });
  await t('PU vs VI: both are sellable, but PU is surfaced as "awaiting inspection" (note + action list)', () => {
    const m = M.buildDayModel(payload(), TODAY, liveBoard()); assert.strictEqual(m.totals.awaiting, 1); assert.deepStrictEqual(m.actions.inspect.map(x => x.roomNumber), ['102']);
    assert(M.deriveNotes(m).some(x => /1 cleaned room is waiting for front-desk inspection/.test(x.text)));
  });
  await t('action lists: "clean first" gives each short group its dirty rooms (in-progress before dirty), only as many as needed', () => {
    const extra = [res({ arrivalDate: TODAY, departureDate: '2026-10-12', typeCode: 'NQRR' }), res({ arrivalDate: TODAY, departureDate: '2026-10-12', typeCode: 'NQRR' })];
    const rooms2 = rooms.concat([room('106', 'NQRR', 'VAC', 'IP'), room('107', 'NQRR', 'VAC', 'D')]);
    const live = liveBoard({ rooms: rooms2, remainingArrivals: [{ typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NQRR' }] });   // 4 NQRR arriving, ready 2 → need 2 turned
    const m = M.buildDayModel(payload({ reservations: reservations.concat(extra), perRoomSheet: rooms2 }), TODAY, live);
    const cf = m.actions.cleanFirst.filter(x => x.baseCode === 'NQRR'); assert.strictEqual(cf.length, 2); assert.strictEqual(cf[0].roomNumber, '106'); assert.strictEqual(cf[0].hkStatus, 'IP'); assert.strictEqual(m.totals.cleanFirst >= 2, true);
  });
  await t('"full" and "short" produce the SiteMinder / oversold notes; a subtype with none left is called out separately', () => {
    const live = liveBoard({ remainingArrivals: [{ typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NKRRP' }, { typeCode: 'NKRRP' }] });   // NQRR: 5 arriving vs ≤3 possible; NKRRP: 2 vs 1
    const m = M.buildDayModel(payload(), TODAY, live); const notes = M.deriveNotes(m).map(x => x.text);
    assert(notes.some(x => /NQRR: oversold by/.test(x)), notes.join(' | ')); assert(notes.some(x => /NKRRP \(Pets\) has none left/.test(x)) || notes.some(x => /NKRR.*oversold|nothing left/.test(x)));
    const full = M.buildDayModel(payload(), TODAY, liveBoard({ remainingArrivals: [{ typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NQRR' }, { typeCode: 'NQRR' }] })); // 4 arriving vs 2 ready + 1 dirty + 1 freeing = 4
    assert.strictEqual(G(full, 'NQRR').totals.status, 'full'); assert(M.deriveNotes(full).some(x => /NQRR: nothing left to sell today — consider closing it on SiteMinder/.test(x.text)));
  });
  await t('FUTURE days are WORKLOAD ONLY: arriving / departing / staying over / rooms to service — no short, no status, no HK status', () => {
    const m = M.buildDayModel(payload(), '2026-10-12'); const q = G(m, 'NQRR').totals;
    assert.strictEqual(m.status, 'workload'); assert.strictEqual(q.status, undefined); assert.strictEqual(q.leftNow, undefined); assert.strictEqual(q.inspected, 0);
    // night of 10/12 in NQRR: continuing stays = 104 (→10/14) + the RES arriving today that leaves 10/13 = 2; leaving ON 10/12: the other RES + 105? (105 left 10/11) → departures 1 RES
    assert.strictEqual(q.arrivals, 2); assert.strictEqual(q.occupied, 2); assert.strictEqual(q.toService, q.departures + q.occupied);
    assert.strictEqual(m.totals.roomsToService, sum2(m.groups.map(g => g.totals.toService))); assert.strictEqual(m.totals.leftToSell, null);
    const notes = M.deriveNotes(m).map(x => x.text); assert(notes.some(x => /to service/.test(x))); assert(!notes.some(x => /oversold|close it|SiteMinder/i.test(x)));
  });

  // ── Sprint 21.4: cleaning priority for days 2–14 ──
  const pr = (n, f, type = 'NQRR', occ = 'VAC', hk = 'VI') => room(n, type, occ, hk, { floorId: f });
  const planRooms = [...['101', '102', '103', '104'].map(n => pr(n, '01')), ...['201', '202', '203', '204', '205', '206'].map(n => pr(n, '02')),
    ...['301', '302', '303', '304'].map(n => pr(n, '03', 'NKRR'))];
  let k = 0; const R = (o) => ({ id: 'p' + (++k), status: 'RES', typeCode: 'NQRR', baseCode: 'NQRR', roomNumber: null, ...o });
  const D1 = '2026-10-12';   // a Monday, 2 days ahead of the fixture's forecast date (the allowance method applies from the 3rd day)
  const planRes = (booked = 6, extra = []) => [
    R({ status: 'INH', arrivalDate: '2026-10-10', departureDate: '2026-10-14', roomNumber: '101' }), R({ status: 'INH', arrivalDate: '2026-10-10', departureDate: '2026-10-14', roomNumber: '102' }),   // stayovers
    ...['103', '201', '202', '203', '204'].map(n => R({ status: 'INH', arrivalDate: '2026-10-09', departureDate: D1, roomNumber: n })),                                                         // 5 departing (1 on floor 1, 4 on floor 2)
    ...Array.from({ length: booked }, () => R({ arrivalDate: D1, departureDate: '2026-10-14' })),
    R({ arrivalDate: D1, departureDate: '2026-10-13', typeCode: 'NKRR', baseCode: 'NKRR' }),                                                                                                  // 1 NKRR arriving
    ...extra];
  const planPayload = (booked, extra, o = {}) => ({ forecastDate: '2026-10-10', futureWindowDays: 30, perRoomSheet: planRooms, reservations: planRes(booked, extra), ...o });
  const P = (m, base) => m.plan.find(x => x.baseCode === base);

  await t('allowance ratio: calibrated table × weekday (Tue high, Fri low), scale and disable work, never applies to today', () => {
    const near = (a, b) => Math.abs(a - b) < 0.02;
    assert(near(M.lateAllowanceRatio(1, 2), 0.47) && near(M.lateAllowanceRatio(1, 5), 0.09) && near(M.lateAllowanceRatio(1, 1), 0.31), 'k=1 Tue/Fri/Mon');
    assert(near(M.lateAllowanceRatio(1, 2, { scalePct: 50 }), 0.235)); assert.strictEqual(M.lateAllowanceRatio(1, 2, { enabled: false }), 0); assert.strictEqual(M.lateAllowanceRatio(0, 2), 0);
    assert(M.lateAllowanceRatio(13, 2) <= 1.5 && M.lateAllowanceRatio(50, 2) <= 1.5, 'capped');
  });
  await t('PRIORITY: expected = booked + allowance, already-empty = sellable − stayover − departing, need = expected − empty → "turn first"', () => {
    const m = M.buildDayModel(planPayload(6), D1); const q = G(m, 'NQRR').totals;
    assert.strictEqual(q.arrivals, 6); assert.strictEqual(q.occupied, 2); assert.strictEqual(q.departures, 5); assert.strictEqual(q.sellable, 10);
    assert.strictEqual(q.alreadyEmpty, 3); assert.strictEqual(q.expected, 8, '6 booked + 2 allowance (Mon k=1 ≈ +31% → 2; capped by 10−2=8 free)');
    assert.strictEqual(q.needFromTurns, 5); assert.strictEqual(q.turnFirst, 5); assert.strictEqual(q.priority, 'first');
    assert.strictEqual(G(m, 'NKRR').totals.priority, 'normal', '1 booked, 4 rooms, none occupied → no turns needed');
    assert.strictEqual(m.plan[0].baseCode, 'NQRR', 'plan is ordered most urgent first'); assert.strictEqual(m.totals.priorityGroups, 1); assert.strictEqual(m.totals.expectedArrivals, 9);
  });
  await t('PRIORITY tiers: early (spare departures) · first (none to spare) · short (even all turns cannot cover)', () => {
    const early = M.buildDayModel(planPayload(6), D1, undefined, { enabled: false }); assert.strictEqual(G(early, 'NQRR').totals.expected, 6); assert.strictEqual(G(early, 'NQRR').totals.priority, 'early'); assert.strictEqual(G(early, 'NQRR').totals.turnFirst, 3);
    const short = M.buildDayModel(planPayload(9), D1); assert.strictEqual(G(short, 'NQRR').totals.priority, 'short'); assert.strictEqual(G(short, 'NQRR').totals.expected, 9, 'booked is never reduced by the capacity cap');
    assert(M.deriveNotes(short).some(x => x.kind === 'urgent' && /May run short|only \d+ rooms can be ready/i.test(x.text)));
    const none = M.buildDayModel(planPayload(2), D1); assert.strictEqual(G(none, 'NQRR').totals.priority, 'normal'); assert.strictEqual(G(none, 'NQRR').totals.turnFirst, 0);
  });
  await t('allowance: minimum extra only applies from 4 booked up; scale 200 doubles the proportional part; tiny groups stay proportional', () => {
    assert.strictEqual(G(M.buildDayModel(planPayload(2), D1), 'NQRR').totals.extra, 1, '2 booked × .47 → 1, no minimum for <4 booked');
    assert.strictEqual(G(M.buildDayModel(planPayload(4), D1), 'NQRR').totals.extra, 2, 'minExtra 2 applies');
    assert.strictEqual(G(M.buildDayModel(planPayload(4), D1, undefined, { minExtra: 0 }), 'NQRR').totals.extra, 2, '4 × 0.47 → 2 without the minimum');
    assert(G(M.buildDayModel(planPayload(4), D1, undefined, { scalePct: 200, minExtra: 0 }), 'NQRR').totals.extra >= 2);
  });
  await t('FLOORS: suggestion lists the known departing rooms by floor, fullest floor first; the first N are flagged', () => {
    const p = P(M.buildDayModel(planPayload(6), D1), 'NQRR');
    assert.deepStrictEqual(p.floors.map(f => f.floorId), ['2', '1']); assert.deepStrictEqual(p.floors[0].rooms.map(r => r.roomNumber), ['201', '202', '203', '204']);
    assert.strictEqual(p.floors.flatMap(f => f.rooms).filter(r => r.first).length, p.turnFirst); assert.strictEqual(p.unplacedFirst, 0);
    const e = P(M.buildDayModel(planPayload(6), D1, undefined, { enabled: false }), 'NQRR');       // turnFirst 3 → all on floor 2 (closest together)
    assert.deepStrictEqual(e.floors[0].rooms.filter(r => r.first).map(r => r.roomNumber), ['201', '202', '203']); assert(e.floors[1].rooms.every(r => !r.first));
  });
  await t('FLOORS: departures without a room number yet are counted as unplaced, not invented; stayovers/departures per floor listed', () => {
    const noRoom = planPayload(6, [R({ arrivalDate: '2026-10-11', departureDate: D1 })]);   // RES arriving today, leaving the 12th: no room yet
    const m = M.buildDayModel(noRoom, D1); assert.strictEqual(m.unassigned.departing, 1); assert.strictEqual(G(m, 'NQRR').totals.departures, 6);
    assert.strictEqual(P(m, 'NQRR').unplacedFirst >= 0, true);
    const f2 = m.floors.find(f => f.floorId === '2'); assert.strictEqual(f2.departing.length, 4); assert.strictEqual(f2.stayover.length, 0);
    assert.deepStrictEqual(m.floors.find(f => f.floorId === '1').stayover.map(r => r.roomNumber), ['101', '102']);
  });
  await t('floor ids normalise: "01"→"1", "G" stays, falls back to the room number, label text', () => {
    assert.strictEqual(M.normFloor('01'), '1'); assert.strictEqual(M.normFloor('G'), 'G'); assert.strictEqual(M.normFloor(null, '312'), '3'); assert.strictEqual(M.normFloor(null, 'G30'), 'G'); assert.strictEqual(M.normFloor('2', '209'), '2');
  });
  await t('TODAY floors: dirty rooms (in-progress first within a floor listing) and PU rooms are grouped per floor from the live board', () => {
    const rs = [pr('101', '01', 'NQRR', 'VAC', 'D'), pr('102', '01', 'NQRR', 'VAC', 'IP'), pr('201', '02', 'NQRR', 'VAC', 'PU'), pr('202', '02', 'NQRR', 'OCC', 'OC')];
    const live = { forecastDate: TODAY, rooms: rs, remainingArrivals: [{ typeCode: 'NQRR' }], stillDeparting: [{ roomNumber: '202', typeCode: 'NQRR' }], arrivalsToday: 1, departedToday: 0 };
    const m = M.buildDayModel({ forecastDate: TODAY, perRoomSheet: rs, reservations: [] }, TODAY, live);
    const f1 = m.floors.find(f => f.floorId === '1'), f2 = m.floors.find(f => f.floorId === '2');
    assert.deepStrictEqual(f1.dirty.map(r => r.roomNumber), ['101', '102']); assert.deepStrictEqual(f2.inspect.map(r => r.roomNumber), ['201']); assert.deepStrictEqual(f2.departing.map(r => r.roomNumber), ['202']);
  });

  // ── Sprint 22.6: the SECOND NIGHT (tomorrow) from tonight's real room state ──
  const T0 = TODAY, T1 = '2026-10-12', T2 = '2026-10-13';          // today / tomorrow / the day after
  const nq = (n, occ, hk, f = '02') => ({ roomNumber: n, typeCode: 'NQRR', baseCode: 'NQRR', baseLabel: 'Double Queen Standard', subLabel: 'Standard', occupancyStatus: occ, hkStatus: hk, inventoryStatus: occ, blocked: false, floorId: f });
  const dtRooms = [nq('101', 'VAC', 'VI'), nq('102', 'VAC', 'PU'), nq('103', 'VAC', 'D'), nq('104', 'VAC', 'IP', '03'), nq('105', 'OCC', 'OC'), nq('106', 'OCC', 'OC'), nq('107', 'OCC', 'OC', '03'), nq('108', 'OCC', 'OC', '03'), nq('109', 'OCC', 'OC', '04')];
  let dn = 0; const DR = (o) => ({ id: 'd' + (++dn), status: 'RES', typeCode: 'NQRR', baseCode: 'NQRR', roomNumber: null, ...o });
  const dtRes = (arriving = 5) => [
    DR({ status: 'INH', roomNumber: '105', arrivalDate: '2026-10-09', departureDate: T0 }),                                  // leaves TODAY (still in the room)
    DR({ status: 'INH', roomNumber: '106', arrivalDate: '2026-10-10', departureDate: T2 }),                                  // stays over tomorrow night
    DR({ status: 'INH', roomNumber: '107', arrivalDate: '2026-10-10', departureDate: T1 }), DR({ status: 'INH', roomNumber: '108', arrivalDate: '2026-10-09', departureDate: T1 }), DR({ status: 'INH', roomNumber: '109', arrivalDate: T0, departureDate: T1 }),   // leave TOMORROW
    DR({ arrivalDate: T0, departureDate: T2 }),                                                                              // arrives tonight, no room yet → stays over tomorrow
    ...Array.from({ length: arriving }, () => DR({ arrivalDate: T1, departureDate: '2026-10-14' }))];
  const dtPayload = (arriving, o = {}) => ({ forecastDate: T0, futureWindowDays: 30, perRoomSheet: dtRooms, reservations: dtRes(arriving), ...o });
  const dtLive = (o = {}) => ({ forecastDate: T0, rooms: dtRooms.map(r => ({ ...r })), remainingArrivals: [{ typeCode: 'NQRR' }], stillDeparting: [{ roomNumber: '105', typeCode: 'NQRR' }], arrivalsToday: 1, departedToday: 0, ...o });

  await t('SECOND NIGHT: booked arrivals are checked against rooms that are clean+vacant NOW (minus tonight\'s arrivals); the shortfall is taken from dirty rooms → tonight\'s check-outs → tomorrow\'s check-outs', () => {
    const m = M.buildDayModel(dtPayload(5), T1, dtLive()); const g = G(m, 'NQRR').totals, d = g.dayTwo;
    assert.strictEqual(g.arrivals, 5); assert.strictEqual(g.expected, 5, 'no late-booking allowance on the second night'); assert.strictEqual(g.extra, 0);
    assert.strictEqual(d.carry, 1, '2 clean vacant − 1 arriving tonight'); assert.strictEqual(d.shortfall, 4); assert.strictEqual(g.needFromTurns, 4); assert.strictEqual(g.turnFirst, 4);
    assert.deepStrictEqual(d.priority.map(r => [r.roomNumber, r.source]), [['104', 'dirty'], ['103', 'dirty'], ['105', 'tonight'], ['107', 'tomorrow']], 'in-progress before dirty, then tonight\'s check-out, then tomorrow\'s');
    assert.deepStrictEqual(d.restDeparts.map(r => r.roomNumber), ['108', '109'], 'the remaining check-outs get a full clean afterwards'); assert.deepStrictEqual(d.restDirty, []); assert.strictEqual(d.unresolved, 0);
    assert.deepStrictEqual(d.stays.map(r => r.roomNumber), ['106']); assert.strictEqual(d.stayUnassigned, 1, 'tonight\'s arrival (no room yet) stays over too');
    assert.strictEqual(d.clean, 6); assert.strictEqual(d.service, 2); assert.deepStrictEqual(m.dayTwo, { clean: 6, service: 2, total: 8 });
    assert.strictEqual(g.priority, 'early', '2 spare sources out of 6'); assert.strictEqual(g.potential, 7); assert.strictEqual(g.leftToSell, 2, '7 rooms can be ready tomorrow night − 5 arriving');
  });
  await t('SECOND NIGHT: floors — the priority rooms are flagged, remaining check-outs follow, grouped by floor (fullest first); stay-overs listed for service', () => {
    const m = M.buildDayModel(dtPayload(5), T1, dtLive()); const p = m.plan.find(x => x.baseCode === 'NQRR');
    assert.deepStrictEqual(p.floors.map(f => [f.floorId, f.rooms.map(r => r.roomNumber + (r.first ? '*' : ''))]), [['3', ['104*', '107*', '108']], ['2', ['103*', '105*']], ['4', ['109']]]);
    assert.strictEqual(p.turnFirst, 4); assert.strictEqual(p.alreadyEmpty, 1); assert(M.deriveNotes(m).some(n => /Tomorrow: 6 rooms to clean and 2 staying over to service \(8 in all\)/.test(n.text)), M.deriveNotes(m).map(n => n.text).join(' | '));
  });
  await t('SECOND NIGHT without the live board: same answer from the snapshot rooms + reservations (tonight\'s arrivals/check-outs derived from the booking list)', () => {
    const a = M.buildDayModel(dtPayload(5), T1, dtLive()), b = M.buildDayModel(dtPayload(5), T1);
    const pick = (m) => { const d = G(m, 'NQRR').totals.dayTwo; return [d.carry, d.shortfall, d.priority.map(r => r.roomNumber), d.restDeparts.map(r => r.roomNumber), d.stays.map(r => r.roomNumber), m.dayTwo]; };
    assert.deepStrictEqual(pick(b), pick(a));
  });
  await t('SECOND NIGHT: a pre-assigned arrival tonight reserves its clean room; nothing short → "normal" and tomorrow is just check-outs + service', () => {
    const m = M.buildDayModel(dtPayload(1), T1, dtLive({ remainingArrivals: [{ typeCode: 'NQRR', roomNumber: '101', isPreAssigned: true }] })); const d = G(m, 'NQRR').totals.dayTwo;
    assert.strictEqual(d.carry, 1, '101 is reserved for tonight, 102 stays clean'); assert.strictEqual(d.shortfall, 0); assert.strictEqual(G(m, 'NQRR').totals.priority, 'normal'); assert.deepStrictEqual(d.priority, []);
    assert.deepStrictEqual(d.restDeparts.map(r => r.roomNumber), ['107', '108', '109']); assert.deepStrictEqual(d.restDirty.map(r => r.roomNumber), ['104', '103', '105'], 'dirty rooms still get cleaned, after the priorities');
  });
  await t('SECOND NIGHT: more arrivals than any source can cover → "short" with the unresolved count (nothing invented)', () => {
    const m = M.buildDayModel(dtPayload(12), T1, dtLive()); const g = G(m, 'NQRR').totals, d = g.dayTwo;
    assert.strictEqual(d.shortfall, 11); assert.strictEqual(d.priority.length, 6, 'every dirty room, tonight\'s check-out and all 3 of tomorrow\'s check-outs'); assert.strictEqual(d.unresolved, 5); assert.strictEqual(g.priority, 'short'); assert.strictEqual(g.turnFirst, 6);
    assert(M.deriveNotes(m).some(n => n.kind === 'urgent' && /expected but only/.test(n.text)));
  });
  await t('"left to sell" for future nights = rooms that could be ready (sellable − staying over) − arrivals; totals add up; outlook day 2 uses the live board, day 3+ the allowance method', () => {
    const m1 = M.buildDayModel(dtPayload(5), T1, dtLive()); assert.strictEqual(m1.totals.leftToSellFuture, 2); assert.strictEqual(m1.totals.potentialRooms, 7);
    const m2 = M.buildDayModel(dtPayload(0, { reservations: [...dtRes(0), DR({ arrivalDate: T2, departureDate: '2026-10-14' }), DR({ arrivalDate: T2, departureDate: '2026-10-14' })] }), T2, dtLive()); const g = G(m2, 'NQRR').totals;
    assert(g.expected >= 2 && g.dayTwo === undefined, 'the third day keeps the allowance method'); assert.strictEqual(g.leftToSell, Math.max(0, g.potential - g.expected));
    const o = M.buildOutlook(dtPayload(5), 4, dtLive()); assert.strictEqual(o[1].priorityGroups, 0); assert.strictEqual(M.buildDayModel(dtPayload(5), T0, dtLive()).totals.leftToSellFuture, null);
  });
  await t('unsellable rooms (OOO / OTM / HOLD / blocked / NA) are excluded on every day', () => {
    const rs = rooms.map(r => r.roomNumber === '101' ? { ...r, inventoryStatus: 'OOO' } : r.roomNumber === '102' ? { ...r, blocked: true } : r.roomNumber === '103' ? { ...r, occupancyStatus: 'NA' } : r);
    const today = M.buildDayModel(payload({ perRoomSheet: rs }), TODAY); const q = G(today, 'NQRR').totals; assert.strictEqual(q.unsellable, 3); assert.strictEqual(q.ready, 0); assert.strictEqual(q.dirty, 0);
    assert.strictEqual(G(M.buildDayModel(payload({ perRoomSheet: rs }), '2026-10-13'), 'NQRR').totals.sellable, 2);   // 104, 105 remain sellable
  });
  await t('outside the data window: flagged "nodata" with an explanation (never a confident zero)', () => {
    const m = M.buildDayModel(payload(), M.addDays(TODAY, 31)); assert.strictEqual(m.outsideWindow, true); assert.strictEqual(m.status, 'nodata'); assert(/No reliable data/.test(M.deriveNotes(m)[0].text)); assert.strictEqual(M.buildDayModel(payload(), M.addDays(TODAY, 30)).outsideWindow, false);
  });
  await t('outlook: today carries a sell/close status; later days only workload numbers; conservation identity holds', () => {
    const o = M.buildOutlook(payload(), 6, liveBoard()); assert.strictEqual(o.length, 6); assert.strictEqual(o[0].isLive, true); assert(['open', 'tight', 'full', 'short'].includes(o[0].status)); assert(o.slice(1).every(d => d.status === 'workload' && d.leftToSell === null));
    const mm = (i) => M.buildDayModel(payload(), M.addDays(TODAY, i)); for (let i = 1; i + 1 < 6; i++) { const a = mm(i).totals, b = mm(i + 1).totals; assert.strictEqual(b.occupiedTonight, a.occupiedTonight - b.departures + b.arrivals, `day ${i}→${i + 1}`); }
  });
  await t('hostile input: empty / null payload, live without rooms, rooms without type never throw', () => {
    for (const [p, l] of [[null, undefined], [{}, undefined], [{ forecastDate: TODAY }, { forecastDate: TODAY, rooms: [{ roomNumber: '1' }] }], [payload(), { forecastDate: TODAY, rooms: [], remainingArrivals: null, stillDeparting: undefined }]]) assert.doesNotThrow(() => { const m = M.buildDayModel(p, TODAY, l); M.deriveNotes(m); });
    assert.deepStrictEqual(M.buildOutlook(null), []);
  });

  if (LIVE) {
    require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env', override: true });
    const { createAgilysysClient } = require(ROOT + '/server/agilysys/client'); const { computeForecast } = require(ROOT + '/server/forecast/compute');
    const c = createAgilysysClient(); const inputs = await c.fetchForecastInputs(null, { futureWindowDays: 30 }); const live = await c.fetchTodayLive();
    const snap = computeForecast({ rooms: inputs.rooms, roomTypes: inputs.roomTypes, reservations: inputs.reservations, metrics: inputs.metrics, vipStatuses: inputs.vipStatuses, ratePlans: inputs.ratePlans, roomTypeMapping: [], config: {}, forecastDate: inputs.effectiveDate });
    const m0 = M.buildDayModel(snap, snap.forecastDate, live), cond = Object.fromEntries((inputs.metrics.roomConditionSummary || []).map(x => [x.name, x.value]));
    await t('LIVE today: inspected = rGuest VI, dirty+in-progress = rGuest D+IP, awaiting = PU, remaining arrivals = rGuest', () => {
      assert.strictEqual(m0.totals.inspected, cond.VI || 0, 'VI'); assert.strictEqual(m0.totals.dirty, (cond.D || 0) - (live.rooms.filter(r => r.hkStatus === 'D' && r.occupancyStatus === 'OCC').length) + (cond.IP || 0), 'vacant dirty + in-progress');
      assert.strictEqual(m0.totals.remainingArrivals, inputs.metrics.remainingArrivalsSummary.remaining); assert.strictEqual(m0.totals.arrivals, inputs.metrics.remainingArrivalsSummary.total);
      assert.strictEqual(m0.totals.departures, inputs.metrics.remainingDeparturesSummary.total); assert.strictEqual(m0.rooms, 99);
    });
    await t('LIVE: occupied tonight = rooms occupied now − still departing + remaining arrivals; 14-day identity holds from the live day 0', () => {
      const occNow = live.rooms.filter(r => r.occupancyStatus === 'OCC').length; assert.strictEqual(m0.totals.occupiedTonight, occNow - live.stillDeparting.length + live.remainingArrivals.length);
      const days = M.buildOutlook(snap, 14, live); console.log('       outlook:', days.map(d => `${d.date.slice(5)}:${d.occupancyPct}%`).join(' '));
      for (let i = 1; i + 1 < 14; i++) { const a = M.buildDayModel(snap, M.addDays(snap.forecastDate, i)).totals, b = M.buildDayModel(snap, M.addDays(snap.forecastDate, i + 1)).totals; assert.strictEqual(b.occupiedTonight, a.occupiedTonight - b.departures + b.arrivals); }
    });
  }
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
})();
function sum2(a) { return a.reduce((x, y) => x + y, 0); }
