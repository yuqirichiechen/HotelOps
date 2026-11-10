// Sprint 26.2 — audit log / authorization & payment history / comments of a reservation: the client fetchers (simulated rGuest, no network), the light
// "extras" refetch, the pure formatter, the job's target selection, and the dev-only route.   node tests/reservation-extras.test.js "$PWD"
const ROOT = process.argv[2] + '/server'; const assert = require('assert');
process.env.AGILYSYS_USER = 'fake-user'; process.env.AGILYSYS_PASS = 'fake-pass';
process.env.PORT = '3993'; process.env.JWT_SECRET = 'x'.repeat(40); process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
const pg = require(ROOT + '/node_modules/pg'); const jwt = require(ROOT + '/node_modules/jsonwebtoken');

// ── simulated rGuest ─────────────────────────────────────────
const RID = 'ae8b3759-0f02-4ec9-81b3-962fd88f6b5f', PID = '6ad55f1400463a5d0aedc05b', ACC = '6af24c02379f1654325948bd';
const auditRows = Array.from({ length: 230 }, (_, i) => ({ type: 'reservation', id: 'a' + i, user: i % 2 ? 'richie' : 'stay-integration-serviceRuntimeUser-1', timestamp: new Date(Date.UTC(2026, 10, 9, 23, 0) - i * 60000).toISOString(), changes: [{ path: [{ value: 'discloseRoomType', type: 'FIELD' }], type: 'ADD', from: [], to: [{ value: 'Yes' }] }] }));
const comments = { [RID]: [
  { id: 'c1', text: 'Mom sent CC form', commentTypeId: 'T1', importance: 'CRITICAL', createdBy: 'lmmasters', createdAt: '2026-10-12T17:47:55.944Z', lastModifiedBy: 'lmmasters', lastModifiedAt: '2026-10-12T17:47:55.944Z', displayAsAlert: true, metadata: { deleted: false, history: [] } },
  { id: 'c2', text: 'old, archived', commentTypeId: 'T1', importance: 'MEDIUM', createdBy: 'richie', createdAt: '2026-10-10T10:00:00Z', lastModifiedBy: 'richie', lastModifiedAt: '2026-10-11T10:00:00Z', metadata: { deleted: true, history: [{}] } }],
  [PID]: [{ id: 'c3', text: 'Prefers quiet room', commentTypeId: 'T1', importance: 'LOW', createdBy: 'amy', createdAt: '2026-09-01T10:00:00Z', lastModifiedBy: 'amy', lastModifiedAt: '2026-09-01T10:00:00Z', metadata: { deleted: false } }] };
const log = []; let failAuth = false, typeCalls = 0;
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url); if (/^http:\/\/127\.0\.0\.1:3993/.test(u)) return realFetch(url, init); const json = (o, st = 200) => ({ ok: st < 400, status: st, text: async () => JSON.stringify(o), json: async () => o });
  if (/\/users\/login$/.test(u)) return json({ token: 'tok' });
  log.push(`${(init && init.method) || 'GET'} ${u.replace(/^https?:\/\/[^/]+/, '')}`);
  let m;
  if ((m = u.match(/\/audit\/reservation\/([^/?]+)\?page=(\d+)&size=(\d+)/))) { const p = +m[2], s = +m[3]; return json({ content: auditRows.slice(p * s, (p + 1) * s), number: p, size: s, totalElements: auditRows.length, last: (p + 1) * s >= auditRows.length }); }
  if (/\/payment-service\/v1\/tenants\/\d+\/properties\/\d+\/accounts\/[^/]+\/authorizationHistory$/.test(u)) return failAuth ? json({ message: 'nope' }, 404) : json([{ authCode: 'BWDG7E', cardNumber: '3178', amount: 160.61, issuer: 'Mastercard', transactionDate: '2026-11-09', transactionTime: '14:41', user: 'SiteMinder', authorizationType: 'PAYMENT', failureReason: '', success: true }]);
  if (/config\/commentTypes$/.test(u)) { typeCalls++; return json([{ id: 'T1', name: 'Check-In', code: 'CIN' }]); }
  if ((m = u.match(/\/comments\?associatedObjectId=([^&]+)$/))) return json(comments[m[1]] || []);
  throw new Error('unexpected fetch ' + u);
};
const { createAgilysysClient } = require(ROOT + '/agilysys/client'); const c = createAgilysysClient();
const { buildExtras, formatAuditEntry, changeLine, userLabel } = require(ROOT + '/forecast/extras');
const { selectTargets, lacksExtras, EXTRA_SECTIONS } = require(ROOT + '/forecast/detailJob');
const { summarizeDetail } = require(ROOT + '/forecast/summarize');
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };

(async () => {
  await t('audit log: pages through every entry (230 rows over 100-row pages)', async () => {
    log.length = 0; const r = await c.getReservationAuditLog(RID);
    assert.strictEqual(r.entries.length, 230); assert.strictEqual(r.totalElements, 230); assert.strictEqual(r.truncated, false);
    assert.strictEqual(log.filter(l => /\/audit\/reservation\//.test(l)).length, 3, log.join('\n'));
  });
  await t('payment history uses the v1 payment-service path and returns the rows', async () => {
    log.length = 0; const r = await c.getAuthorizationHistory(ACC); assert.strictEqual(r.length, 1);
    assert(log[0].includes('/payment-service/v1/tenants/1566/properties/481/accounts/' + ACC + '/authorizationHistory'), log[0]);
  });
  await t('comments: type names filled in from the catalog, which is cached across calls', async () => {
    const r = await c.getCommentsFor(RID); assert.strictEqual(r[0].commentTypeName, 'Check-In'); await c.getCommentsFor(PID); assert.strictEqual(typeCalls, 1);
    assert.deepStrictEqual(await c.getCommentsFor('nobody'), []);
  });
  const stored = { reservation: { accountId: ACC, primaryGuestInfo: { profileId: PID }, confirmationCode: 'X' }, folios: [{ id: 'f' }] };
  await t('deepFetchExtras: adds the four new sections to a stored reservation, keeps everything else, and makes no call for the core reservation', async () => {
    log.length = 0; const out = await c.deepFetchExtras(RID, { prior: { detail: stored, sections: { folios: { ok: true } } } });
    assert.deepStrictEqual(EXTRA_SECTIONS.filter(k => !out.sections[k] || out.sections[k].ok !== true), []);
    assert.strictEqual(out.detail.folios.length, 1); assert.strictEqual(out.detail.reservationComments.length, 2); assert.strictEqual(out.detail.profileComments.length, 1); assert.strictEqual(out.detail.auditLog.entries.length, 230);
    assert(!log.some(l => /\/reservations\/[0-9a-f-]+$/.test(l)), 'no core refetch: ' + log.join(' | ')); assert(log.length <= 8, `${log.length} calls`);
  });
  await t('a failing section is isolated and flagged; the others still arrive', async () => {
    failAuth = true; const out = await c.deepFetchExtras(RID, { prior: { detail: { ...stored, authHistory: [{ old: 1 }] }, sections: {} } }); failAuth = false;
    assert.strictEqual(out.sections.authHistory.ok, false); assert.strictEqual(out.sections.authHistory.hasPrior, true); assert.strictEqual(out.sections.auditLog.ok, true);
    assert.deepStrictEqual(out.detail.authHistory, [{ old: 1 }], 'previous good data kept');
  });

  await t('formatter: audit lines read like the rGuest popup; service accounts are named', () => {
    assert.strictEqual(changeLine({ type: 'ADD', path: [{ value: 'discloseRoomType', type: 'FIELD' }], to: [{ value: 'Yes' }] }), 'Added Disclose Room Type Yes');
    assert.strictEqual(changeLine({ type: 'MODIFY', path: [{ value: 'departureDate', type: 'FIELD' }], from: [{ value: '11-10' }], to: [{ value: '11-12' }] }), 'Changed Departure Date from 11-10 to 11-12');
    assert.strictEqual(changeLine({ type: 'REMOVE', path: [{ value: 'status', type: 'FIELD' }], from: [{ value: 'RES' }] }), 'Removed Status RES');
    assert.strictEqual(userLabel('stay-integration-serviceRuntimeUser-9'), 'Stay integration user'); assert.strictEqual(userLabel('richie'), 'richie');
    const big = formatAuditEntry({ timestamp: 'x', user: 'a', changes: Array.from({ length: 55 }, () => ({ type: 'ADD', path: [{ value: 'k', type: 'FIELD' }], to: [{ value: 'v' }] })) }); assert.strictEqual(big.lines.length, 40); assert.strictEqual(big.more, 15);
  });
  await t('buildExtras: payments newest-first with totals, card masked, comments split + archived flagged, "loaded" only once a section ran', () => {
    const d = { auditLog: { totalElements: 1, entries: auditRows.slice(0, 1) }, authHistory: [{ transactionDate: '2026-11-08', transactionTime: '09:00', amount: 50, authorizationType: 'PAYMENT', success: true, cardNumber: '3178' }, { transactionDate: '2026-11-09', transactionTime: '14:41', amount: 160.61, authorizationType: 'PAYMENT', success: true, cardNumber: '3178' }, { transactionDate: '2026-11-09', transactionTime: '15:00', amount: 99, authorizationType: 'AUTHORIZED', success: false, failureReason: 'declined' }],
      reservationComments: comments[RID].map(x => ({ ...x, commentTypeName: 'Check-In' })), profileComments: comments[PID] };
    const x = buildExtras(d, { auditLog: { ok: true }, authHistory: { ok: true } });
    assert.strictEqual(x.payments.rows[0].time, '15:00'); assert.strictEqual(x.payments.rows[0].status, 'Failed'); assert.strictEqual(x.payments.totals.payment, 210.61); assert.strictEqual(x.payments.totals.authorized, 0); assert.strictEqual(x.payments.rows[1].card, '************3178');
    assert.strictEqual(x.comments.reservation.length, 2); assert.strictEqual(x.comments.reservation.find(k => k.id === 'c2').archived, true); assert.strictEqual(x.comments.reservation.find(k => k.id === 'c1').type, 'Check-In'); assert.strictEqual(x.comments.profile[0].author, 'amy');
    assert.strictEqual(x.loaded, true); assert.strictEqual(buildExtras({}, {}).loaded, false);
    assert(!JSON.stringify(x).includes('3178') || x.payments.rows.every(r => !r.card || /^\*{12}3178$/.test(r.card)), 'only the last 4 digits ever appear');
  });
  await t('summary: comment flag now reads the real comments and ignores archived ones', () => {
    const live = summarizeDetail({ reservation: {}, reservationComments: [{ text: 'hello', metadata: { deleted: false } }], profileComments: [] }, {});
    assert.strictEqual(live.flags ? live.flags.hasComments : live.hasComments, true);
    const gone = summarizeDetail({ reservation: {}, reservationComments: [{ text: 'old', metadata: { deleted: true } }] }, {});
    assert.strictEqual(gone.flags ? gone.flags.hasComments : gone.hasComments, false);
  });
  await t('job: a stored reservation without the new sections is re-fetched (light, reason new-sections); one that has them is left alone', () => {
    const r = { id: 'r1', status: 'INH', kind: 'inhouse', roomNumber: '101' }; const { fingerprintOf } = require(ROOT + '/forecast/detailJob');
    const row = (sections) => new Map([['r1', { list_fingerprint: fingerprintOf(r), fetched_at: new Date(), remote_state: 'ok', sections }]]);
    assert.strictEqual(selectTargets([r], row({ reservation: { ok: true } })).targets[0].reason, 'new-sections');
    const full = Object.fromEntries(EXTRA_SECTIONS.map(k => [k, { ok: true, at: new Date().toISOString() }]));
    assert.strictEqual(selectTargets([r], row(full)).targets.length, 0); assert.strictEqual(lacksExtras(full), false);
  });

  // ── route ──
  const stored2 = { detail: { reservation: {}, auditLog: { totalElements: 1, entries: auditRows.slice(0, 1) }, authHistory: [], reservationComments: comments[RID], profileComments: [] }, sections: { auditLog: { ok: true } }, fetched_at: new Date().toISOString(), remote_state: 'ok' };
  pg.Pool.prototype.query = async function (sql) { return /FROM reservation_detail/.test(sql) ? { rows: [stored2], rowCount: 1 } : { rows: [], rowCount: 0 }; };
  require(ROOT + '/server.js'); await new Promise(r => setTimeout(r, 600));
  const tok = (role, type) => jwt.sign({ sub: 'u', role, type }, process.env.JWT_SECRET);
  const get = async (p, tk) => { const r = await fetch('http://127.0.0.1:3993' + p, { headers: tk ? { Authorization: 'Bearer ' + tk } : {} }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const E = `/api/admin/reservations/${RID}/extras`;
  await t('route is DEV-only: no token 401; admin, manager-side staff and front desk are refused; dev gets the data', async () => {
    assert.strictEqual((await get(E)).status, 401); assert.strictEqual((await get(E, tok('admin', 'admin'))).status, 403); assert.strictEqual((await get(E, tok('front_desk', 'staff'))).status, 403);
    const r = await get(E, tok('dev', 'admin')); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.extras.loaded, true); assert.strictEqual(r.body.extras.comments.reservation.length, 2);
    assert.strictEqual((await get('/api/admin/reservations/not-a-uuid/extras', tok('dev', 'admin'))).status, 400);
  });
  console.log(`\n${pass} passed`); process.exit(process.exitCode || 0);
})();
