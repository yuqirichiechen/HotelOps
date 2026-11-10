// Sprint 26.2 (READ-ONLY probe): which rGuest endpoints back (1) the reservation "audit log" popup, (2) the folio "Authorization & Payment History" table and
// (3) the reservation comments (+ profile comments, archived). Found by reading rGuest's own front-end bundle (public static JS), then verified here.
// Every call is a GET, or the POST the rGuest page itself uses as a *search* (audit log filter) — nothing is created or changed.
//   node tests/probe-reservation-extras.js "$PWD" [confirmationCode]
const ROOT = process.argv[2], CODE = process.argv[3] || '4GJBCZ3WF';
require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env', override: true });
const { createAgilysysClient } = require(ROOT + '/server/agilysys/client');
const show = (label, v, n = 1400) => console.log(`\n### ${label}\n` + (typeof v === 'string' ? v : JSON.stringify(v, null, 1)).slice(0, n));
const attempt = async (label, fn) => { try { const r = await fn(); show(label + '  → OK', r); return r; } catch (e) { show(label + '  → FAILED', `${e.status || ''} ${e.message}`.slice(0, 300)); return null; } };
(async () => {
  const c = createAgilysysClient(); const T = c._config.tenantId, P = c._config.propertyId;
  const today = (await c.getPropertyDate()); const ymd = String(typeof today === 'string' ? today : (today.propertyDate || today.date)).slice(0, 10);
  console.log('property date', ymd, 'looking for', CODE);
  let hit = null;
  for (const [from, to, st] of [[ymd, addDay(ymd, 1), ['RES']], [ymd, ymd, ['INH']], [addDay(ymd, -1), ymd, ['DPT']]]) { try { const rows = (await c.fetchSliceExact(from, to, st)).items; hit = rows.find(r => r.confirmationCode === CODE || r.confirmationId === CODE) || null; if (hit) break; if (!hit) hit = hit || null; } catch (e) { console.log('slice failed', st, e.message); } }
  if (!hit) { console.log('code not found in today\'s slices; falling back to any current reservation'); const rows = (await c.fetchSliceExact(ymd, ymd, ["INH"])).items; hit = rows[0]; }
  const id = hit.id || hit.reservationId; console.log('reservation id', id, 'status', hit.status);
  const d = await c.getReservationDetail(id); const accountId = d.accountId, profileId = d.primaryGuestInfo && d.primaryGuestInfo.profileId; console.log('accountId', accountId, 'profileId', profileId);
  const RS = `/reservation-service/tenants/${T}/properties/${P}/audit/reservation/${id}`;
  const body = { page: 0, size: 50, text: null, from: '', to: '', criteria: {} };
  const a = await attempt('POST audit/reservation (what the popup uses)', () => c._call('POST', `${RS}?page=0&size=50`, body));
  if (a && a.content) { console.log('totalElements', a.totalElements, '| keys of one entry:', Object.keys(a.content[0] || {}).join(', ')); show('first two entries', a.content.slice(0, 2), 3000); }
  await attempt('GET  audit/reservation (getEntityLog)', () => c._call('GET', `${RS}?page=0&size=5`));
  await attempt('POST audit/customFields/{id}', () => c._call('POST', `/reservation-service/tenants/${T}/properties/${P}/audit/customFields/${id}?page=0&size=5`, body));
  if (accountId) {
    const h = await attempt('GET  payment-service authorizationHistory', () => c._call('GET', `/payment-service/tenants/${T}/properties/${P}/accounts/${accountId}/authorizationHistory`), 2500);
    if (Array.isArray(h) && h[0]) console.log('history rows', h.length, '| keys:', Object.keys(h[0]).join(', '));
  }
  const cl = await attempt('GET  comment-service comments?associatedObjectId=<reservation>', () => c._call('GET', `/comment-service/tenants/${T}/comments?associatedObjectId=${id}`), 2500);
  if (profileId) await attempt('GET  comment-service comments?associatedObjectId=<profile>', () => c._call('GET', `/comment-service/tenants/${T}/comments?associatedObjectId=${profileId}`), 2500);
  await attempt('GET  comment-service config/commentTypes', () => c._call('GET', `/comment-service/tenants/${T}/config/commentTypes`), 1800);
  await attempt('GET  comment-service reservation/{id} (what we stored as "comments" until now)', () => c._call('GET', `/comment-service/tenants/${T}/reservation/${id}`), 900);
  await attempt('GET  comment audit (…/properties/P/reservation/{id}/audit)', () => c._call('GET', `/comment-service/tenants/${T}/properties/${P}/reservation/${id}/audit`), 1500);
  await attempt('POST comment audit', () => c._call('POST', `/comment-service/tenants/${T}/properties/${P}/reservation/${id}/audit`, body), 1500);
  if (profileId) await attempt('POST reservationPresetCommentsForGuestProfile (profile comments for a reservation)', () => c._call('POST', `/comment-service/tenants/${T}/reservationPresetCommentsForGuestProfile`, { reservationId: id, profileId }), 1500);
})().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
function addDay(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
