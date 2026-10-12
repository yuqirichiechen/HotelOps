// Sprint 21.4 (READ-ONLY): which raw fields exist for floors (rooms) and booking-creation date (reservations).
// Few calls, one login.  node tests/forecast-probe-fields.js "$PWD"
const ROOT = process.argv[2];
require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env', override: true });
const { createAgilysysClient } = require(ROOT + '/server/agilysys/client');
(async () => {
  const c = createAgilysysClient(); const rooms = await c.listRooms();
  console.log('ROOM keys:', Object.keys(rooms[0]).join(', '));
  const floorish = Object.keys(rooms[0]).filter(k => /floor|level|building|wing|tower|section|zone|location|group|sort|seq/i.test(k));
  console.log('floor-ish keys:', floorish.join(', ') || '(none)');
  floorish.forEach(k => console.log('  ', k, '=>', JSON.stringify([...new Set(rooms.map(r => r[k]))].slice(0, 20))));
  const nums = rooms.filter(r => !r.isDeleted).map(r => String(r.roomNumber));
  const byLen = {}; nums.forEach(n => { byLen[n.length] = (byLen[n.length] || 0) + 1; });
  console.log('room number lengths:', JSON.stringify(byLen), '| sample:', nums.slice(0, 40).join(' '));
  const byFirst = {}; nums.forEach(n => { const k = n.length >= 3 ? n[0] : '(short)'; byFirst[k] = (byFirst[k] || 0) + 1; });
  console.log('by first digit:', JSON.stringify(byFirst));
  const today = (await c.getPropertyDate());
  const ymd = (typeof today === 'string' ? today : (today.propertyDate || today.date || JSON.stringify(today))).slice(0, 10);
  const d2 = new Date(ymd + 'T12:00:00Z'); d2.setUTCDate(d2.getUTCDate() + 1); const next = d2.toISOString().slice(0, 10);
  const r = await c._call('POST', '/reservation-service/tenants/' + c._config.tenantId + '/properties/' + c._config.propertyId + '/reservations/search', { date: ymd, endDate: next, statuses: ['RES'], page: 0, size: 3 }).catch(e => ({ err: e.message }));
  console.log('property date', ymd);
  const x = (r.content || [])[0];
  if (!x) return console.log('no reservation / err', JSON.stringify(r).slice(0, 300));
  console.log('RES keys:', Object.keys(x).join(', '));
  const dateish = Object.keys(x).filter(k => /date|created|booked|modified|time|cancel|source|channel|origin|market/i.test(k));
  dateish.forEach(k => console.log('  ', k, '=>', JSON.stringify(x[k])));
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
