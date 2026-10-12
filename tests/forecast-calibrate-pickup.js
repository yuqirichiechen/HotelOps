// Sprint 21.4 (READ-ONLY, one login, throttled): how many of a day's arrivals were booked shortly before arrival?
// This is the only uncertain part of the "rooms to clean" target (booked arrivals + late-booking allowance).
//   node tests/forecast-calibrate-pickup.js "$PWD" [weeks=8] [samplePerDay=20] [outFile=/tmp/pickup.json]
// Method: past reservations (DPT/INH) via the list search, deduped by id, keep those whose ARRIVAL date is in the
// window; sample up to N per arrival date; fetch each one's detail for reservationCreateTime (not in list rows).
// Caveat: the list search drops ~15–19% of rows at random — harmless for a ratio, but not an exact census.
const ROOT = process.argv[2]; const WEEKS = +(process.argv[3] || 8), PER_DAY = +(process.argv[4] || 20), OUT = process.argv[5] || '/tmp/pickup.json';
require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env', override: true });
const { createAgilysysClient } = require(ROOT + '/server/agilysys/client'); const fs = require('fs');
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const laDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const diffDays = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
(async () => {
  const c = createAgilysysClient(); const cfg = c._config;
  const P = `/reservation-service/v2/tenants/${cfg.tenantId}/properties/${cfg.propertyId}/reservations/search/date`;
  const pd = await c.getPropertyDate(); const today = String(typeof pd === 'string' ? pd : (pd.propertyDate || pd.date)).slice(0, 10);
  const last = addDays(today, -1), first = addDays(last, -(WEEKS * 7 - 1));
  console.log(`window arrivals ${first}..${last} (${WEEKS} weeks), sample ≤${PER_DAY}/day`);
  const byId = new Map(); let calls = 0;
  for (let d = addDays(first, -1); d <= addDays(last, 1); d = addDays(d, 1)) {
    let page = 0, tp = 1;
    do { const r = await c._call('POST', P, { date: d, endDate: addDays(d, 1), statuses: ['DPT', 'INH'], page, size: 99 }); calls++; (r.content || []).forEach(x => byId.set(x.id, x)); tp = r.totalPages || 1; page++; } while (page < tp);
  }
  const arrivals = [...byId.values()].filter(x => x.arrivalDateLocalDate >= first && x.arrivalDateLocalDate <= last);
  const perDay = {}; arrivals.forEach(x => (perDay[x.arrivalDateLocalDate] = perDay[x.arrivalDateLocalDate] || []).push(x));
  const sample = []; Object.values(perDay).forEach(list => { list.sort(() => rnd() - 0.5); sample.push(...list.slice(0, PER_DAY)); });
  console.log(`list calls ${calls} | arrivals found ${arrivals.length} | sampled for detail ${sample.length}`);
  const rows = []; let idx = 0, done = 0; const t0 = Date.now();
  const worker = async () => { while (idx < sample.length) { const x = sample[idx++]; try { const d = await c.getReservationDetail(x.id);
    const created = d.reservationCreateTime || d.createdDateTime || d.createTime; if (!created) { rows.push({ skip: 'nocreate' }); continue; }
    rows.push({ arr: x.arrivalDateLocalDate, dep: x.departureDateLocalDate, type: (x.roomType && (x.roomType.typeCode || x.roomType.code)) || null, created, createdLocal: laDate(created), lead: diffDays(laDate(created), x.arrivalDateLocalDate),
      by: d.sourceInfo && d.sourceInfo.bookedBy, walkIn: !!(d.sourceInfo && d.sourceInfo.walkIn), iface: d.sourceInterfaceId || null }); } catch (e) { rows.push({ skip: e.message.slice(0, 60) }); }
    if (++done % 100 === 0) console.log(`  detail ${done}/${sample.length} (${Math.round((Date.now() - t0) / 1000)} s)`); } };
  await Promise.all([worker(), worker(), worker()]);
  fs.writeFileSync(OUT, JSON.stringify({ first, last, listCalls: calls, arrivalsFound: arrivals.length, perDayFound: Object.fromEntries(Object.entries(perDay).map(([k, v]) => [k, v.length])), rows }, null, 1));
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s → ${OUT} | usable rows ${rows.filter(r => r.arr).length}, skipped ${rows.filter(r => r.skip).length}`);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
