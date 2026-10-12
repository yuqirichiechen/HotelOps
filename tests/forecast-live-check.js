// Sprint 21.3 (READ-ONLY live): the live today-board + ghost-room filter vs rGuest's own numbers.
// Run: node tests/forecast-live-check.js "$PWD"
const ROOT = process.argv[2]; const assert = require('assert');
require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env', override: true });
const { createAgilysysClient } = require(ROOT + '/server/agilysys/client'); const { computeForecast, isActiveRoom } = require(ROOT + '/server/forecast/compute');
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.message); process.exitCode = 1; } };
(async () => {
  const c = createAgilysysClient(); const t0 = Date.now(); const live = await c.fetchTodayLive(); const ms = Date.now() - t0;
  const inputs = await c.fetchForecastInputs(null, { futureWindowDays: 30 }); const m = inputs.metrics;
  const T = live.forecastDate; const active = live.rooms.filter(r => isActiveRoom(r, T));
  console.log(`live board for ${T} in ${ms} ms | rooms ${live.rooms.length} (active ${active.length}) | remaining arrivals ${live.remainingArrivals.length} | still departing ${live.stillDeparting.length} | arrivals today ${live.arrivalsToday} | departed ${live.departedToday}`);
  await t('ghost room "28" (deactivated 2023) is excluded; every other room is active', () => {
    const inactive = live.rooms.filter(r => !isActiveRoom(r, T)).map(r => r.roomNumber); assert.deepStrictEqual(inactive, ['28']); assert.strictEqual(active.length, 99);
  });
  await t('active room count and HK conditions match rGuest\'s roomConditionSummary (IP / VI / OC / D)', () => {
    const cond = Object.fromEntries((m.roomConditionSummary || []).map(x => [x.name, x.value])); const ours = {}; active.forEach(r => { ours[r.hkStatus] = (ours[r.hkStatus] || 0) + 1; });
    for (const k of ['IP', 'VI', 'OC', 'D']) assert.strictEqual(ours[k] || 0, cond[k] || 0, `${k}: ours ${ours[k] || 0} vs rGuest ${cond[k] || 0}`);
    assert.strictEqual(active.length, Object.values(cond).reduce((a, b) => a + b, 0), 'total rooms');
  });
  await t('live remaining arrivals = rGuest remaining arrivals; arrivals today = rGuest total', () => {
    assert.strictEqual(live.rguestRemaining, m.remainingArrivalsSummary.remaining); assert.strictEqual(live.remainingArrivals.length, m.remainingArrivalsSummary.remaining); assert.strictEqual(live.arrivalsToday, m.remainingArrivalsSummary.total);
    assert(live.remainingArrivals.every(a => a.typeCode), 'every remaining arrival resolves to a room type');
  });
  await t('still-departing + departed = rGuest departures total; live pull completes complete=true in < 5 s', () => {
    assert.strictEqual(live.stillDeparting.length + live.departedToday, m.remainingDeparturesSummary.total); assert.strictEqual(live.complete, true); assert(ms < 5000, ms + ' ms');
  });
  await t('computeForecast now drops inactive rooms (99 rooms, NKRRP no longer shows a phantom room) and reports them', () => {
    const p = computeForecast({ rooms: inputs.rooms, roomTypes: inputs.roomTypes, reservations: inputs.reservations, metrics: m, vipStatuses: inputs.vipStatuses, ratePlans: inputs.ratePlans, roomTypeMapping: [], config: {}, forecastDate: T });
    assert.strictEqual(p.perRoomSheet.length, 99); assert.deepStrictEqual(p.inactiveRooms, ['28']); assert(!p.perRoomSheet.some(r => r.roomNumber === '28'));
    const pets = p.perRoomSheet.filter(r => r.typeCode === 'NKRRP'); assert(pets.every(r => !(r.occupancyStatus === 'VAC' && (r.hkStatus === 'VI' || r.hkStatus === 'PU'))), 'no phantom clean NKRRP');
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
