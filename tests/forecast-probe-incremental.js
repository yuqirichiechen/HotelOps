// Sprint 22 (READ-ONLY probe, one login, ~40 calls): does rGuest's reservation search support "created/modified since"
// filters or sorting we can use for cheap incremental syncs?   node tests/forecast-probe-incremental.js "$PWD"
const ROOT = process.argv[2];
require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env', override: true });
const { createAgilysysClient } = require(ROOT + '/server/agilysys/client');
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
(async () => {
  const c = createAgilysysClient(); const cfg = c._config;
  const P = `/reservation-service/v2/tenants/${cfg.tenantId}/properties/${cfg.propertyId}/reservations/search/date`;
  const pd = await c.getPropertyDate(); const today = String(typeof pd === 'string' ? pd : (pd.propertyDate || pd.date)).slice(0, 10);
  const base = { date: today, endDate: addDays(today, 400), statuses: ['RES'], page: 0, size: 5 };
  const r0 = await c._call('POST', P, base);
  console.log('baseline total', r0.totalElements, '| response keys:', Object.keys(r0).join(','), '| sort:', JSON.stringify(r0.sort));
  const firstIds = (r) => (r.content || []).map(x => x.id.slice(0, 8)).join(',');
  console.log('baseline first ids', firstIds(r0), '| first arrivals', (r0.content || []).map(x => x.arrivalDateLocalDate).join(','));
  const since = new Date(Date.now() - 24 * 3600e3).toISOString(), sinceD = since.slice(0, 10);
  const filters = ['createdFrom', 'createdAfter', 'createdSince', 'createdDateFrom', 'createTimeFrom', 'reservationCreateTimeFrom', 'bookedFrom', 'bookingDateFrom',
    'modifiedFrom', 'modifiedAfter', 'modifiedSince', 'updatedFrom', 'updatedAfter', 'updatedSince', 'lastModifiedFrom', 'lastModified', 'updateTimeFrom', 'changedSince', 'since'];
  console.log('\n-- filter candidates (a real filter would shrink total from ' + r0.totalElements + ') --');
  for (const f of filters) for (const v of [since, sinceD]) {
    try { const r = await c._call('POST', P, { ...base, [f]: v }); if (r.totalElements !== r0.totalElements) console.log('  CHANGED', f, '=', v, '→ total', r.totalElements); }
    catch (e) { console.log('  error', f, String(e.message).slice(-60)); }
  }
  console.log('  (no CHANGED lines above = every candidate was ignored)');
  console.log('\n-- sort candidates (a real sort changes the first ids) --');
  const sorts = [['sort', 'createTime,desc'], ['sort', 'reservationCreateTime,desc'], ['sort', 'updateTime,desc'], ['sort', 'createdDateTime,desc'], ['sortBy', 'createTime'], ['orderBy', 'createTime'], ['sort', [{ property: 'createTime', direction: 'DESC' }]], ['sort', { field: 'createTime', direction: 'DESC' }]];
  for (const [k, v] of sorts) {
    try { const r = await c._call('POST', P, { ...base, [k]: v }); const ids = firstIds(r); if (ids !== firstIds(r0)) console.log('  CHANGED', k, JSON.stringify(v), '→', ids, (r.content || []).map(x => x.arrivalDateLocalDate).join(',')); }
    catch (e) { console.log('  error', k, JSON.stringify(v), String(e.message).slice(-60)); }
  }
  // query-string sort on the same path
  for (const q of ['?sort=createTime,desc', '?sort=updateTime,desc', '?sort=arrivalDate,desc']) {
    try { const r = await c._call('POST', P + q, base); const ids = firstIds(r); console.log('  qs', q, ids === firstIds(r0) ? 'same order' : 'CHANGED → ' + ids + ' ' + (r.content || []).map(x => x.arrivalDateLocalDate).join(',')); } catch (e) { console.log('  qs', q, 'error', String(e.message).slice(-60)); }
  }
  // fields present on a list row that could act as a change marker
  const x = (r0.content || [])[0] || {}; console.log('\nlist-row fields that might mark changes:', Object.keys(x).filter(k => /version|update|modif|stamp|etag|hash|revision/i.test(k)).join(', ') || '(none)');
  console.log('sample estimatedTimeDetails / guestValidation keys:', Object.keys(x.estimatedTimeDetails || {}).join(',') || '-', '|', Object.keys(x.guestValidation || {}).join(',') || '-');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
