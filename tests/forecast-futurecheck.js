// Sprint 21 (READ-ONLY live): do payload.reservations reproduce rGuest's own per-day arrivals/departures
// for the next 14 days? Ground truth = reservationMetrics(date). Run: node tests/forecast-futurecheck.js "$PWD"
const ROOT = process.argv[2];
require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env', override: true });
const { createAgilysysClient } = require(ROOT + '/server/agilysys/client'); const { computeForecast } = require(ROOT + '/server/forecast/compute');
const add = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
(async () => {
  const c = createAgilysysClient(); const inputs = await c.fetchForecastInputs(null, { futureWindowDays: 30 }); const T = inputs.effectiveDate;
  const payload = computeForecast({ rooms: inputs.rooms, roomTypes: inputs.roomTypes, reservations: inputs.reservations, metrics: inputs.metrics, vipStatuses: inputs.vipStatuses, ratePlans: inputs.ratePlans, roomTypeMapping: [], config: {}, forecastDate: T });
  const R = payload.reservations;
  console.log('today', T, '| payload', R.length, 'rows | kinds', JSON.stringify(R.reduce((o, r) => (o[r.kind + '/' + r.status] = (o[r.kind + '/' + r.status] || 0) + 1, o), {})));
  console.log('\nday        | arrivals ours/rGuest | departures ours/rGuest | stayovers(ours) | in-house tonight(ours)');
  for (let i = 1; i <= 14; i++) {
    const D = add(T, i);
    const arr = R.filter(r => r.arrivalDate === D && ['RES', 'INH'].includes(r.status)).length;
    const dep = R.filter(r => r.departureDate === D && ['RES', 'INH'].includes(r.status)).length;
    const stay = R.filter(r => r.arrivalDate < D && r.departureDate > D && ['RES', 'INH'].includes(r.status)).length;
    let ra = '?', rd = '?';
    try { const m = await c.getReservationMetrics(D); ra = m.remainingArrivalsSummary && m.remainingArrivalsSummary.total; rd = m.remainingDeparturesSummary && m.remainingDeparturesSummary.total; } catch (e) { ra = rd = 'ERR'; }
    console.log(`${D} | ${String(arr).padStart(8)} / ${String(ra).padEnd(8)} ${arr === ra ? 'OK ' : 'DIFF'} | ${String(dep).padStart(9)} / ${String(rd).padEnd(8)} ${dep === rd ? 'OK ' : 'DIFF'} | ${String(stay).padStart(8)} | ${String(stay + arr).padStart(8)}`);
    await new Promise(r => setTimeout(r, 200));
  }
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
