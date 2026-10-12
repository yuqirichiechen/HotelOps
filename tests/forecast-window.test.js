// Sprint 21.5: the stored LIST window (365 d) is separate from the guest-DETAIL window (30 d).
// node tests/forecast-window.test.js "$PWD"
const ROOT = process.argv[2]; const assert = require('assert');
const { computeForecast } = require(ROOT + '/server/forecast/compute'); const { withinDetailWindow, selectTargets } = require(ROOT + '/server/forecast/detailJob');
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const TODAY = '2026-10-12';
const roomTypes = [{ id: 'rt1', typeCode: 'NQRR', name: 'Double Queen Standard' }];
const rooms = [{ id: 'room1', roomNumber: '101', roomTypeId: 'rt1', floorId: '01', currentOccupancyStatus: 'VAC', housekeepingRoomStatus: 'VI' }];
let n = 0; const resn = (arrOffset, nights = 2, status = 'RES') => ({ id: 'id-' + (++n), status, roomType: 'rt1', arrivalDate: addDays(TODAY, arrOffset) + 'T07:00:00Z', arrivalDateLocalDate: addDays(TODAY, arrOffset), departureDate: addDays(TODAY, arrOffset + nights) + 'T07:00:00Z', departureDateLocalDate: addDays(TODAY, arrOffset + nights), primaryGuestInfo: { firstName: 'G', lastName: String(n) } });
const reservations = [resn(0), resn(5), resn(29), resn(30), resn(31), resn(90), resn(364), resn(365), resn(366), resn(500)];
const run = (config = {}) => computeForecast({ rooms, roomTypes, reservations, metrics: null, vipStatuses: [], ratePlans: [], roomTypeMapping: [], config, forecastDate: TODAY });
(async () => {
  await t('default: bookings up to 365 days ahead are listed; payload says list=365, detail=30', () => {
    const p = run(); const arr = p.reservations.map(r => r.arrivalDate);
    assert(arr.includes(addDays(TODAY, 364)) && arr.includes(addDays(TODAY, 365)), 'a year out is stored');
    assert(!arr.includes(addDays(TODAY, 366)) && !arr.includes(addDays(TODAY, 500)), 'beyond the list window is not');
    assert.strictEqual(p.futureWindowDays, 365); assert.strictEqual(p.detailWindowDays, 30);
    assert.strictEqual(p.reservations.filter(r => r.kind === 'future').length, 7, '5,29,30,31,90,364,365 (today\'s arrival is kind=arrival)');
  });
  await t('list window follows config.future_list_days but is never narrower than the detail window', () => {
    assert.strictEqual(run({ future_list_days: 90 }).reservations.filter(r => r.kind === 'future').length, 5);   // 5,29,30,31,90
    const p = run({ future_window_days: 60, future_list_days: 10 }); assert.strictEqual(p.futureWindowDays, 60); assert.strictEqual(p.detailWindowDays, 60);
  });
  await t('guest-detail job only targets bookings arriving within the detail window; same-day/past/undated rows are kept', () => {
    const p = run(); const kept = withinDetailWindow(p.reservations, p.forecastDate, p.detailWindowDays).map(r => r.arrivalDate);
    assert(kept.includes(TODAY) && kept.includes(addDays(TODAY, 30)) && !kept.includes(addDays(TODAY, 31)) && !kept.includes(addDays(TODAY, 364)));
    assert.strictEqual(withinDetailWindow([{ id: 'x' }, { id: 'y', arrivalDate: '2020-01-01' }], TODAY).length, 2);
    assert.strictEqual(withinDetailWindow(null, TODAY).length, 0); assert.strictEqual(withinDetailWindow([{ id: 'z', arrivalDate: '2030-01-01' }], null).length, 1, 'no date → no filtering');
  });
  await t('effect on the job: a full-year list queues only the near-term ones (far bookings are not fetched)', () => {
    const p = run(); const all = selectTargets(p.reservations, new Map(), Date.now(), false).targets.length;
    const near = selectTargets(withinDetailWindow(p.reservations, p.forecastDate, p.detailWindowDays), new Map(), Date.now(), false).targets.length;
    assert(all > near && near === p.reservations.filter(r => r.arrivalDate <= addDays(TODAY, 30)).length, `${all} vs ${near}`);
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
})();
