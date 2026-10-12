// Sprint 21 diagnostic (READ-ONLY live): compare what the Forecast page computes against independent
// ground truth from rGuest (room conditions, remaining arrivals). Run: node tests/forecast-diagnose.js "$PWD"
const ROOT = process.argv[2];
require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env', override: true });
const { createAgilysysClient } = require(ROOT + '/server/agilysys/client'); const { computeForecast } = require(ROOT + '/server/forecast/compute');
(async () => {
  const c = createAgilysysClient(); const inputs = await c.fetchForecastInputs(null); const m = inputs.metrics || {};
  const payload = computeForecast({ rooms: inputs.rooms, roomTypes: inputs.roomTypes, reservations: inputs.reservations, metrics: m, vipStatuses: inputs.vipStatuses, ratePlans: inputs.ratePlans, roomTypeMapping: [], config: {}, forecastDate: inputs.effectiveDate });
  console.log('date', inputs.effectiveDate, '| rooms', inputs.rooms.length, '| reservations in payload', payload.reservations.length, '| complete', inputs.reservationsComplete);
  console.log('\nrGuest metrics.roomConditionSummary :', JSON.stringify(m.roomConditionSummary));
  console.log('rGuest metrics.roomStatusSummary    :', JSON.stringify(m.roomStatusSummary));
  console.log('rGuest remaining arrivals / departures:', JSON.stringify(m.remainingArrivalsSummary), JSON.stringify(m.remainingDeparturesSummary));
  // our supply view
  const tally = {}; payload.perRoomSheet.forEach(r => { const k = `${r.occupancyStatus}/${r.hkStatus}`; tally[k] = (tally[k] || 0) + 1; });
  console.log('\nOUR per-room occupancy/HK tally (', payload.perRoomSheet.length, 'rooms):', JSON.stringify(tally));
  const vc = payload.perRoomSheet.filter(r => r.occupancyStatus === 'VAC' && (r.hkStatus === 'VI' || r.hkStatus === 'PU'));
  console.log('Vacant-clean per the page rule (VAC & VI|PU):', vc.length);
  // demand
  const rem = payload.reservations.filter(r => r.kind === 'arrival' && r.status === 'RES');
  console.log('Remaining arrivals (kind=arrival,status=RES):', rem.length, '| with typeCode:', rem.filter(r => r.typeCode).length, '| pre-assigned room:', rem.filter(r => r.isPreAssigned).length);
  const byType = {}; rem.forEach(r => { byType[r.typeCode || '(none)'] = (byType[r.typeCode || '(none)'] || 0) + 1; });
  console.log('remaining arrivals by typeCode:', JSON.stringify(byType));
  const vcBy = {}; vc.forEach(r => { vcBy[r.typeCode || '(none)'] = (vcBy[r.typeCode || '(none)'] || 0) + 1; }); console.log('vacant-clean by typeCode       :', JSON.stringify(vcBy));
  // rooms that WILL free up: in-house departing today
  const remDep = payload.reservations.filter(r => r.kind === 'departure' && r.status === 'INH');
  console.log('\nin-house departing today (will free rooms):', remDep.length, '| all INH', payload.reservations.filter(r => r.status === 'INH').length);
  console.log('departed today (rooms now dirty/pickup):', payload.reservations.filter(r => r.status === 'DPT').length);
  console.log('payload.kpis:', JSON.stringify(payload.kpis));
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
