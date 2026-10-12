// Sprint 21 — unit tests for src/components/Forecast/forecastModel.js (offline fixtures) + optional LIVE
// consistency checks against rGuest.  Offline:  node tests/forecastmodel.test.js "$PWD"
//                                      Live:     node tests/forecastmodel.test.js "$PWD" --live   (read-only GETs)
const fs = require('fs'), assert = require('assert'); const ROOT = process.argv[2]; const LIVE = process.argv.includes('--live');
const src = fs.readFileSync(ROOT + '/src/components/Forecast/forecastModel.js', 'utf8').replace(/^export /gm, '');
const M = new Function(src + '\nreturn { buildDayModel, buildOutlook, deriveNotes, isSellable, addDays, UNSELLABLE_INVENTORY };')();
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };

// ── fixture hotel: 2 base types (NQRR 4 rooms, NKRR 3 rooms incl. 1 pet subtype NKRRP) ──
const room = (n, typeCode, occ, hk, extra = {}) => ({ roomNumber: n, typeCode, baseCode: typeCode.slice(0, 4), baseLabel: typeCode.slice(0, 4), subLabel: typeCode.length > 4 ? 'Pets' : 'Standard', occupancyStatus: occ, hkStatus: hk, inventoryStatus: occ, blocked: false, ...extra });
const rooms = [
  room('101', 'NQRR', 'VAC', 'VI'), room('102', 'NQRR', 'VAC', 'PU'), room('103', 'NQRR', 'VAC', 'D'), room('104', 'NQRR', 'OCC', 'OC'),
  room('201', 'NKRR', 'OCC', 'D'), room('202', 'NKRR', 'VAC', 'IP'), room('203', 'NKRRP', 'VAC', 'VI'),
];
let n = 0; const res = (o) => ({ id: 'r' + (++n), status: 'RES', typeCode: 'NQRR', baseCode: 'NQRR', roomNumber: null, isPreAssigned: false, ...o });
const TODAY = '2026-10-11';
const reservations = [
  res({ arrivalDate: TODAY, departureDate: '2026-10-13', typeCode: 'NQRR' }),                      // remaining arrival NQRR
  res({ arrivalDate: TODAY, departureDate: '2026-10-12', typeCode: 'NQRR' }),                      // remaining arrival NQRR
  res({ arrivalDate: TODAY, departureDate: '2026-10-12', typeCode: 'NKRR' }),                      // remaining arrival NKRR (generic → may take NKRRP)
  res({ status: 'INH', arrivalDate: '2026-10-09', departureDate: TODAY, typeCode: 'NKRR', roomNumber: '201' }),   // departing today, frees 201
  res({ status: 'INH', arrivalDate: '2026-10-10', departureDate: '2026-10-14', typeCode: 'NQRR', roomNumber: '104' }), // stayover in 104
  res({ status: 'INH', arrivalDate: TODAY, departureDate: '2026-10-12', typeCode: 'NQRR', roomNumber: '999' }),   // checked in today (room unknown → booked type)
  res({ arrivalDate: '2026-10-12', departureDate: '2026-10-14', typeCode: 'NQRR' }),               // tomorrow arrival
  res({ arrivalDate: '2026-10-12', departureDate: '2026-10-13', typeCode: 'NQRR' }),               // tomorrow arrival
  res({ status: 'DPT', arrivalDate: '2026-10-09', departureDate: TODAY, typeCode: 'NQRR' }),       // already departed → ignored
  res({ arrivalDate: TODAY, departureDate: TODAY, typeCode: 'NQRR' }),                              // day-use → ignored
];
const payload = (o = {}) => ({ forecastDate: TODAY, futureWindowDays: 30, perRoomSheet: rooms, reservations, ...o });
const G = (m, base) => m.groups.find(g => g.baseCode === base);

(async () => {
  await t('TODAY: ready = VI|PU vacant; dirty = other vacant; freeing from departing INH by ROOM type; demand = remaining RES arrivals', () => {
    const m = M.buildDayModel(payload(), TODAY); const q = G(m, 'NQRR').totals, k = G(m, 'NKRR').totals;
    assert.strictEqual(q.ready, 2); assert.strictEqual(q.dirty, 1); assert.strictEqual(q.freeing, 0); assert.strictEqual(q.arrivals, 2);
    assert.strictEqual(k.ready, 1); assert.strictEqual(k.dirty, 1); assert.strictEqual(k.freeing, 1); assert.strictEqual(k.arrivals, 1);
    assert.strictEqual(m.totals.cleanFirst, 0, 'ready covers arrivals in both groups'); assert.strictEqual(m.totals.roomsShort, 0);
    assert.strictEqual(q.netReady, 0); assert.strictEqual(q.netProjected, 1); assert.strictEqual(k.netReady, 0); assert.strictEqual(k.netProjected, 2);
  });
  await t('TODAY: status = short only if short even AFTER cleaning; "tight" = enough rooms but not clean yet', () => {
    const only = reservations.concat([res({ arrivalDate: TODAY, departureDate: '2026-10-12', typeCode: 'NQRR' }), res({ arrivalDate: TODAY, departureDate: '2026-10-12', typeCode: 'NQRR' })]);
    const m = M.buildDayModel(payload({ reservations: only }), TODAY); const q = G(m, 'NQRR').totals;   // 4 arrivals vs ready 2 + dirty 1 = 3
    assert.strictEqual(q.status, 'short'); assert.strictEqual(q.needed, 1);
    const m2 = M.buildDayModel(payload({ reservations: reservations.concat([res({ arrivalDate: TODAY, departureDate: '2026-10-12', typeCode: 'NQRR' })]) }), TODAY);  // 3 arrivals: ready 2 → tight (clean 1 more)
    assert.strictEqual(G(m2, 'NQRR').totals.status, 'tight'); assert.strictEqual(G(m2, 'NQRR').totals.needed, 1); assert.strictEqual(m2.totals.cleanFirst, 1);
    assert.strictEqual(m2.status, 'tight');
  });
  await t('substitutability: group total pools subtypes, but a subtype-specific booking is short on its own', () => {
    const rs = [res({ arrivalDate: TODAY, departureDate: '2026-10-12', typeCode: 'NKRRP' }), res({ arrivalDate: TODAY, departureDate: '2026-10-12', typeCode: 'NKRRP' })];
    const m = M.buildDayModel(payload({ reservations: rs }), TODAY); const g = G(m, 'NKRR'); const v = g.variants.find(x => x.typeCode === 'NKRRP');
    assert.strictEqual(v.arrivals, 2); assert.strictEqual(v.status, 'short'); assert.strictEqual(v.needed, 1);   // 1 pet room, 2 pet bookings
    assert.notStrictEqual(g.totals.status, 'short', 'group pools NKRR + NKRRP rooms');
    assert(M.deriveNotes(m).some(x => /NKRRP.*short 1.*specific type/.test(x.text)));
  });
  await t('FUTURE day: available = sellable − stays continuing through D; departures ON D free their rooms; arrivals = RES on D', () => {
    const m = M.buildDayModel(payload(), '2026-10-12'); const q = G(m, 'NQRR').totals;
    // NQRR stays continuing through the night of 10/12: INH 104 (10/10→10/14) + the RES that arrives today and leaves 10/13.
    // NOT counted: INH 999 and the other RES (both depart ON 10/12 → their rooms are free for 10/12's arrivals).
    assert.strictEqual(q.occupied, 2); assert.strictEqual(q.sellable, 4); assert.strictEqual(q.available, 2); assert.strictEqual(q.arrivals, 2); assert.strictEqual(q.net, 0);
    assert.strictEqual(q.status, 'even'); assert.strictEqual(q.ready, 0, 'future days do not use today\'s HK status');
    assert.strictEqual(m.totals.arrivals, 2); assert.strictEqual(m.totals.departures, 3);   // 999 + the two RES that leave on the 12th
  });
  await t('unsellable rooms (OOO / OTM / HOLD / blocked / NA) are excluded from supply on every day', () => {
    const rs = rooms.map(r => r.roomNumber === '101' ? { ...r, inventoryStatus: 'OOO' } : r.roomNumber === '102' ? { ...r, blocked: true } : r.roomNumber === '103' ? { ...r, occupancyStatus: 'NA' } : r);
    const today = M.buildDayModel(payload({ perRoomSheet: rs }), TODAY); const q = G(today, 'NQRR').totals;
    assert.strictEqual(q.unsellable, 3); assert.strictEqual(q.sellable, 1); assert.strictEqual(q.ready, 0); assert.strictEqual(q.dirty, 0); assert.strictEqual(q.status, 'short');
    const fut = M.buildDayModel(payload({ perRoomSheet: rs }), '2026-10-13'); assert.strictEqual(G(fut, 'NQRR').totals.sellable, 1);
    assert(M.deriveNotes(today).some(x => /out of order \/ blocked/.test(x.text))); assert(M.isSellable(rooms[0]) && !M.isSellable({ ...rooms[0], inventoryStatus: 'HOLD' }) && !M.isSellable(null));
  });
  await t('outside the data window: day is flagged "nodata" and the note says why (never a confident 0)', () => {
    const m = M.buildDayModel(payload(), M.addDays(TODAY, 31)); assert.strictEqual(m.outsideWindow, true); assert.strictEqual(m.status, 'nodata');
    assert(/No reliable data/.test(M.deriveNotes(m)[0].text)); assert.strictEqual(M.buildDayModel(payload(), M.addDays(TODAY, 30)).outsideWindow, false);
    assert.strictEqual(M.buildDayModel(payload({ futureWindowDays: 14 }), M.addDays(TODAY, 15)).outsideWindow, true);
  });
  await t('conservation identity across days: occupiedTonight(D+1) = occupiedTonight(D) − departures(D+1) + arrivals(D+1)', () => {
    const o = M.buildOutlook(payload(), 6); const mm = (i) => M.buildDayModel(payload(), M.addDays(TODAY, i));
    for (let i = 0; i + 1 < o.length; i++) {
      const a = mm(i).totals, b = mm(i + 1).totals; assert.strictEqual(b.occupiedTonight, a.occupiedTonight - b.departures + b.arrivals, `day ${i}→${i + 1}`);
    }
    assert.strictEqual(o.length, 6); assert.strictEqual(o[0].offset, 0); assert.strictEqual(o[1].date, '2026-10-12');
  });
  await t('hostile input: empty / null payload, rooms without type, reservations without dates never throw', () => {
    for (const p of [null, {}, { forecastDate: TODAY }, payload({ perRoomSheet: [{ roomNumber: '1' }], reservations: [{ id: 'x' }, { id: 'y', status: 'RES', arrivalDate: TODAY }] })]) { assert.doesNotThrow(() => { M.buildDayModel(p, TODAY); M.deriveNotes(M.buildDayModel(p, TODAY)); }); }
    assert.deepStrictEqual(M.buildOutlook(null), []);
  });

  if (LIVE) {
    require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env', override: true });
    const { createAgilysysClient } = require(ROOT + '/server/agilysys/client'); const { computeForecast } = require(ROOT + '/server/forecast/compute');
    const c = createAgilysysClient(); const inputs = await c.fetchForecastInputs(null, { futureWindowDays: 30 });
    const live = computeForecast({ rooms: inputs.rooms, roomTypes: inputs.roomTypes, reservations: inputs.reservations, metrics: inputs.metrics, vipStatuses: inputs.vipStatuses, ratePlans: inputs.ratePlans, roomTypeMapping: [], config: {}, forecastDate: inputs.effectiveDate });
    const T = live.forecastDate, m0 = M.buildDayModel(live, T), k = live.kpis;
    await t('LIVE today: remaining arrivals + arrivals-today match rGuest; supply buckets match the room list', () => {
      const ra = inputs.metrics.remainingArrivalsSummary; assert.strictEqual(m0.totals.remainingArrivals, ra.remaining, 'remaining arrivals'); assert.strictEqual(m0.totals.arrivals, ra.total, 'arrivals today');
      const vc = live.perRoomSheet.filter(r => r.occupancyStatus === 'VAC' && (r.hkStatus === 'VI' || r.hkStatus === 'PU')).length; assert.strictEqual(m0.totals.ready, vc);
      assert.strictEqual(m0.totals.ready + m0.totals.dirty, live.perRoomSheet.filter(r => r.occupancyStatus === 'VAC').length, 'all vacant rooms are ready or dirty');
      assert.strictEqual(m0.totals.departures, inputs.metrics.remainingDeparturesSummary.total, 'departures today = rGuest total');
    });
    await t('LIVE: occupied-tonight today ≈ rooms occupied now + remaining arrivals − remaining departures', () => {
      const occNow = live.perRoomSheet.filter(r => r.occupancyStatus === 'OCC').length; const expect = occNow + m0.totals.remainingArrivals - m0.totals.freeing;
      assert.strictEqual(m0.totals.occupiedTonight, expect, `model ${m0.totals.occupiedTonight} vs rooms ${expect}`);
    });
    await t('LIVE 14-day outlook: conservation identity holds on real data; every in-window day has data', () => {
      const days = Array.from({ length: 14 }, (_, i) => M.buildDayModel(live, M.addDays(T, i)));
      for (let i = 0; i + 1 < days.length; i++) { const a = days[i].totals, b = days[i + 1].totals; assert.strictEqual(b.occupiedTonight, a.occupiedTonight - b.departures + b.arrivals, `day ${i}→${i + 1}`); }
      assert(days.every(d => !d.outsideWindow)); console.log('       outlook:', days.map(d => `${d.date.slice(5)}:${d.totals.occupancyPct}%/${d.status}`).join(' '));
    });
  }
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
})();
