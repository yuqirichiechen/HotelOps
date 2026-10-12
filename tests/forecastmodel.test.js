// Forecast model tests (Sprint 21.3 semantics).  Offline:  node tests/forecastmodel.test.js "$PWD"
//                                               Live:     node tests/forecastmodel.test.js "$PWD" --live   (read-only GETs)
const fs = require('fs'), assert = require('assert'); const ROOT = process.argv[2]; const LIVE = process.argv.includes('--live');
const src = fs.readFileSync(ROOT + '/src/components/Forecast/forecastModel.js', 'utf8').replace(/^export /gm, '');
const M = new Function(src + '\nreturn { buildDayModel, buildOutlook, deriveNotes, isSellable, isActiveRoom, classifyToday, addDays };')();
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
    const notes = M.deriveNotes(m).map(x => x.text); assert(notes.some(x => /to service/.test(x)) && notes.some(x => /depends on that day’s cleaning and inspection/.test(x))); assert(!notes.some(x => /short|oversold|close/i.test(x)));
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
