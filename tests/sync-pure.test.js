// Sprint 22 — pure logic: settings validation, windows (PT, DST, wrap), scheduler decisions, normalize + diff + events.
// node tests/sync-pure.test.js "$PWD"
const ROOT = process.argv[2] + '/server'; const assert = require('assert');
const S = require(ROOT + '/sync/settings'), { decideRuns, nextDue, syncHealth } = require(ROOT + '/sync/schedule'), N = require(ROOT + '/sync/normalize'), M = require(ROOT + '/sync/mirror'), { sliceGridStart } = require(ROOT + '/sync/engine');
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
const PT = (iso) => new Date(iso);   // helper: absolute instants; PDT = UTC−7 until 2026-11-01, PST = UTC−8 after

(async () => {
  await t('defaults are valid and match the agreed schedule (5-min 12:00–24:00 PT, hourly otherwise)', () => {
    const r = S.validateSettings({}); assert.deepStrictEqual(r.errors, []); const d = r.settings;
    assert.deepStrictEqual([d.frequent.from, d.frequent.to, d.frequent.everyMinutes, d.hourly.everyMinutes, d.timezone], ['12:00', '24:00', 5, 60, 'America/Los_Angeles']);
  });
  await t('validation: rejects bad values with messages, keeps the rest, accepts partial patches and numeric strings', () => {
    const bad = S.validateSettings({ frequent: { everyMinutes: 0, from: '25:00', to: '24:00' }, hourly: { everyMinutes: 'abc' }, timezone: 'Mars/Base', flushEveryMinutes: 1000, storeRaw: 'yes' });
    assert(bad.errors.length >= 6, bad.errors.join('|')); assert.strictEqual(bad.settings.frequent.everyMinutes, 5, 'invalid fields keep their previous value'); assert.strictEqual(bad.settings.frequent.to, '24:00');
    const ok = S.validateSettings({ frequent: { everyMinutes: '10', from: '11:30' }, flushEveryMinutes: 30 }); assert.deepStrictEqual(ok.errors, []); assert.strictEqual(ok.settings.frequent.everyMinutes, 10); assert.strictEqual(ok.settings.frequent.from, '11:30'); assert.strictEqual(ok.settings.flushEveryMinutes, 30);
    assert.strictEqual(S.validateSettings({ frequent: { to: '24:00' } }).errors.length, 0); assert.strictEqual(S.validateSettings({ frequent: { from: '24:00' } }).errors.length, 1, '24:00 is only valid as an end');
  });
  await t('parseStored: garbage / missing JSON falls back to defaults field by field', () => {
    assert.deepStrictEqual(S.parseStored('not json'), S.DEFAULTS); assert.deepStrictEqual(S.parseStored(null), S.DEFAULTS);
    const p = S.parseStored(JSON.stringify({ frequent: { everyMinutes: 15 }, hourly: { everyMinutes: -3 } })); assert.strictEqual(p.frequent.everyMinutes, 15); assert.strictEqual(p.hourly.everyMinutes, 60);
  });
  await t('windows: 12:00–24:00 is [12:00, 24:00); wrap windows work; equal bounds = never', () => {
    const w = (m, a, b) => S.inWindow(m, a, b);
    assert(!w(11 * 60 + 59, '12:00', '24:00') && w(12 * 60, '12:00', '24:00') && w(23 * 60 + 59, '12:00', '24:00') && !w(0, '12:00', '24:00'));
    assert(w(23 * 60, '22:00', '02:00') && w(60, '22:00', '02:00') && !w(12 * 60, '22:00', '02:00')); assert(!w(600, '10:00', '10:00'));
  });
  await t('local clock in America/Los_Angeles across DST: noon PT is 19:00Z in summer, 20:00Z in winter', () => {
    assert.strictEqual(S.localClock(PT('2026-10-12T19:00:00Z'), 'America/Los_Angeles').minutes, 720); assert.strictEqual(S.localClock(PT('2026-11-03T20:00:00Z'), 'America/Los_Angeles').minutes, 720);
    assert.strictEqual(S.localClock(PT('2026-10-12T07:30:00Z'), 'America/Los_Angeles').ymd, '2026-10-12'); assert.strictEqual(S.localClock(PT('2026-10-12T06:59:00Z'), 'America/Los_Angeles').ymd, '2026-10-11', 'before 7Z it is still the previous PT day');
  });
  await t('scheduler: frequent only inside the window and only every N minutes (45 s ping jitter tolerated)', () => {
    const st = { lastFrequentAt: PT('2026-10-12T19:00:00Z'), lastHourlyAt: PT('2026-10-12T19:00:00Z'), lastReconcileAt: PT('2026-10-12T11:30:00Z'), backfillDone: true };
    const at = (iso, o = {}) => decideRuns(PT(iso), S.DEFAULTS, { ...st, ...o }).kinds;
    assert.deepStrictEqual(at('2026-10-12T19:03:00Z'), [], 'only 3 min since the last run'); assert.deepStrictEqual(at('2026-10-12T19:04:20Z'), ['frequent'], '4:20 ≥ 5 min − 45 s slack'); assert.deepStrictEqual(at('2026-10-12T19:05:00Z'), ['frequent']);
    assert.deepStrictEqual(at('2026-10-12T18:50:00Z', { lastFrequentAt: PT('2026-10-12T18:40:00Z') }), [], '11:50 PT is before the window'); assert(at('2026-10-13T06:50:00Z', { lastFrequentAt: PT('2026-10-13T06:40:00Z') }).includes('frequent'), '23:50 PT is still inside the window'); assert(!at('2026-10-13T07:00:30Z', { lastFrequentAt: PT('2026-10-13T06:50:00Z') }).includes('frequent'), '00:00:30 PT is outside');
  });
  await t('scheduler: window end 00:00 PT stops the 5-minute scans; hourly continues; hourly due after 60 min', () => {
    const base = { lastFrequentAt: PT('2026-10-13T06:55:00Z'), lastHourlyAt: PT('2026-10-13T06:10:00Z'), lastReconcileAt: PT('2026-10-12T11:30:00Z'), backfillDone: true };
    assert.deepStrictEqual(decideRuns(PT('2026-10-13T07:01:00Z'), S.DEFAULTS, base).kinds, [], '00:01 PT: window closed, hourly not yet due');
    assert.deepStrictEqual(decideRuns(PT('2026-10-13T07:11:00Z'), S.DEFAULTS, base).kinds, ['hourly']);
  });
  await t('scheduler: reconcile once per local day after 04:30 PT; paused/disabled → nothing; backfill until done; fresh start runs hourly', () => {
    const st = { lastFrequentAt: null, lastHourlyAt: PT('2026-10-12T11:45:00Z'), lastReconcileAt: PT('2026-10-11T12:00:00Z'), backfillDone: true };
    assert(!decideRuns(PT('2026-10-12T11:20:00Z'), S.DEFAULTS, st).kinds.includes('reconcile'), '04:20 PT is too early');
    assert(decideRuns(PT('2026-10-12T11:35:00Z'), S.DEFAULTS, st).kinds.includes('reconcile'), '04:35 PT');
    assert(!decideRuns(PT('2026-10-12T20:00:00Z'), S.DEFAULTS, { ...st, lastReconcileAt: PT('2026-10-12T11:40:00Z') }).kinds.includes('reconcile'), 'already done today');
    assert.deepStrictEqual(decideRuns(PT('2026-10-12T20:00:00Z'), { ...S.DEFAULTS, paused: true }, st), { kinds: [], reason: 'paused' }); assert.strictEqual(decideRuns(PT('2026-10-12T20:00:00Z'), { ...S.DEFAULTS, enabled: false }, st).reason, 'disabled');
    assert(decideRuns(PT('2026-10-12T20:00:00Z'), S.DEFAULTS, { ...st, backfillDone: false }).kinds.includes('backfill'));
    assert(decideRuns(PT('2026-10-12T07:30:00Z'), S.DEFAULTS, { lastFrequentAt: null, lastHourlyAt: null, lastReconcileAt: null, backfillDone: true }).kinds.includes('hourly'));
  });
  await t('custom schedule from dev settings: 10-minute scans 08:00–20:00', () => {
    const s = S.validateSettings({ frequent: { from: '08:00', to: '20:00', everyMinutes: 10 } }).settings; const st = { lastFrequentAt: PT('2026-10-12T15:00:00Z'), lastHourlyAt: PT('2026-10-12T15:00:00Z'), lastReconcileAt: PT('2026-10-12T11:30:00Z'), backfillDone: true };
    assert.deepStrictEqual(decideRuns(PT('2026-10-12T15:05:00Z'), s, st).kinds, []); assert.deepStrictEqual(decideRuns(PT('2026-10-12T15:10:00Z'), s, st).kinds, ['frequent']);   // 08:10 PT
  });
  await t('slice grid is stable: slices are anchored to a fixed 30-day grid, not to "today"', () => {
    assert.strictEqual(sliceGridStart('2026-10-12'), sliceGridStart('2026-10-13')); assert.notStrictEqual(sliceGridStart('2026-10-12'), sliceGridStart('2027-01-12'));
  });

  await t('nextDue: next quick scan = last + N min inside the window, else the next window start; hourly = last + 60; reconcile = next 04:30 PT; paused/disabled → none', () => {
    const st = { lastFrequentAt: PT('2026-10-12T19:30:00Z'), lastHourlyAt: PT('2026-10-12T19:00:00Z'), lastReconcileAt: PT('2026-10-12T11:40:00Z') };   // 12:30 PT scan, 12:00 hourly, reconcile done 04:40 PT today
    let n = nextDue(PT('2026-10-12T19:32:00Z'), S.DEFAULTS, st); assert.strictEqual(n.frequent, '2026-10-12T19:35:00.000Z'); assert.strictEqual(n.hourly, '2026-10-12T20:00:00.000Z'); assert.strictEqual(n.reconcile, '2026-10-13T11:30:00.000Z', 'tomorrow 04:30 PDT');
    n = nextDue(PT('2026-10-13T07:20:00Z'), S.DEFAULTS, { ...st, lastFrequentAt: PT('2026-10-13T06:55:00Z') }); assert.strictEqual(n.frequent, '2026-10-13T19:00:00.000Z', '00:20 PT → the window reopens at noon PT');
    assert.deepStrictEqual(nextDue(PT('2026-10-12T19:32:00Z'), { ...S.DEFAULTS, paused: true }, st), { frequent: null, hourly: null, reconcile: null, reason: 'paused' }); assert.strictEqual(nextDue(PT('2026-10-12T19:32:00Z'), { ...S.DEFAULTS, frequent: { ...S.DEFAULTS.frequent, enabled: false } }, st).frequent, null);
    assert.strictEqual(nextDue(PT('2026-10-12T19:32:00Z'), S.DEFAULTS, { ...st, lastReconcileAt: null }).reconcile, '2026-10-12T19:35:00.000Z', 'reconcile overdue → at the next ping');
  });
  await t('syncHealth: ok / stale / down / off — thresholds follow the schedule in force (5-min window vs hourly)', () => {
    const noon = PT('2026-10-12T19:30:00Z'), night = PT('2026-10-12T09:30:00Z');          // 12:30 PT (inside the window) / 02:30 PT (outside)
    const ago = (now, min) => new Date(now.getTime() - min * 60000).toISOString(); const ok = [{ status: 'success' }];
    assert.strictEqual(syncHealth(noon, S.DEFAULTS, ok, null, ago(noon, 4)).state, 'ok'); assert.strictEqual(syncHealth(noon, S.DEFAULTS, ok, null, ago(noon, 14)).state, 'ok', '3 × 5 = 15 min tolerance');
    assert.strictEqual(syncHealth(noon, S.DEFAULTS, ok, null, ago(noon, 20)).state, 'stale'); assert.strictEqual(syncHealth(noon, S.DEFAULTS, ok, null, ago(noon, 20)).everyMinutes, 5);
    assert.strictEqual(syncHealth(night, S.DEFAULTS, ok, null, ago(night, 100)).state, 'ok', 'overnight the expected interval is the hour → 180 min tolerance'); assert.strictEqual(syncHealth(night, S.DEFAULTS, ok, null, ago(night, 200)).state, 'stale');
    assert.strictEqual(syncHealth(noon, S.DEFAULTS, ok, null, null).state, 'stale', 'never synced');
    assert.strictEqual(syncHealth(noon, { ...S.DEFAULTS, paused: true }, ok, null, ago(noon, 1)).state, 'down'); assert.strictEqual(syncHealth(noon, S.DEFAULTS, ok, { message: 'x' }, ago(noon, 1)).state, 'down');
    const bad = [{ status: 'failed' }, { status: 'failed' }, { status: 'failed' }]; assert.strictEqual(syncHealth(noon, S.DEFAULTS, bad, null, ago(noon, 1)).state, 'down'); assert.strictEqual(syncHealth(noon, S.DEFAULTS, [{ status: 'failed' }, { status: 'success' }, { status: 'failed' }], null, ago(noon, 1)).state, 'ok');
    assert.strictEqual(syncHealth(noon, { ...S.DEFAULTS, enabled: false }, ok, null, ago(noon, 1)).state, 'off'); assert.strictEqual(syncHealth(noon, S.DEFAULTS, ok, null, ago(noon, 4)).ageMinutes, 4);
  });
  // ── normalize / diff / events ──
  const ctx = { roomTypeById: new Map([['rt1', { id: 'rt1', typeCode: 'NQRR' }], ['rt2', { id: 'rt2', typeCode: 'NKRRP' }]]), roomById: new Map([['room9', { id: 'room9', floorId: '03' }]]),
    ratePlanByCode: new Map([['BAR', { code: 'BAR', name: 'Best Available Rate' }]]), vipById: new Map(), mappingByCode: new Map() };
  const raw = (o = {}) => ({ id: 'a1111111-1111-4111-8111-111111111111', status: 'RES', confirmationId: 'C1', roomType: 'rt1', arrivalDateLocalDate: '2026-10-20', departureDateLocalDate: '2026-10-22', ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'Ann', lastName: 'Lee' }, ...o });
  await t('normalize: typed columns, rate plan name, floor + high-floor flag, pet flag, raw kept/omitted; fingerprint tracks only meaningful fields', () => {
    const r = N.normalizeRow(raw({ roomId: 'room9', roomNumber: '312' }), ctx); assert.deepStrictEqual([r.type_code, r.base_code, r.source, r.floor_id, r.is_high_floor, r.nights, r.guest_name, r.room_number, r.is_pre_assigned], ['NQRR', 'NQRR', 'Best Available Rate', '03', true, 2, 'Ann Lee', '312', true]);
    assert.strictEqual(N.normalizeRow(raw({ roomType: 'rt2' }), ctx).is_pet_friendly, true); assert(r.raw && r.raw.id); assert.strictEqual(N.normalizeRow(raw(), ctx, { storeRaw: false }).raw, null);
    const a = N.normalizeRow(raw(), ctx).fingerprint; assert.strictEqual(a, N.normalizeRow(raw({ unrelatedNoise: 123 }), ctx).fingerprint); assert.notStrictEqual(a, N.normalizeRow(raw({ roomNumber: '101' }), ctx).fingerprint); assert.notStrictEqual(a, N.normalizeRow(raw({ departureDateLocalDate: '2026-10-23' }), ctx).fingerprint);
  });
  await t('diff: new / unchanged / changed with field-level changes; legacy rows (no fingerprint) are adopted silently', () => {
    const idx = new Map(); const r1 = N.normalizeRow(raw(), ctx);
    let d = M.diffRows(idx, [r1]); assert.strictEqual(d.counts.new, 1); assert.strictEqual(d.writes[0].type, 'new');
    d = M.diffRows(idx, [N.normalizeRow(raw(), ctx)]); assert.strictEqual(d.counts.unchanged, 1); assert.strictEqual(d.writes.length, 0);
    d = M.diffRows(idx, [N.normalizeRow(raw({ roomNumber: '101', roomId: 'room9' }), ctx)]); assert.strictEqual(d.writes[0].type, 'changed'); assert.deepStrictEqual(d.writes[0].changes.room_number, [null, '101']);
    const legacy = new Map([[r1.reservation_id, { fp: null, vals: {}, status: 'RES', gone: false }]]); d = M.diffRows(legacy, [r1]); assert.strictEqual(d.counts.adopted, 1); assert.strictEqual(d.writes[0].type, null);
    d = M.diffRows(new Map(), [r1], { emitNew: false }); assert.strictEqual(d.writes[0].type, null, 'silent during backfill');
  });
  await t('events: arrived / departed / cancelled / no_show / moved / reappeared / changed', () => {
    const e = M.eventTypeFor; const p = (status, gone = false) => ({ status, gone });
    assert.strictEqual(e(p('RES'), { status: 'INH' }), 'arrived'); assert.strictEqual(e(p('INH'), { status: 'DPT' }), 'departed'); assert.strictEqual(e(p('RES'), { status: 'CXL' }), 'cancelled');
    assert.strictEqual(e(p('RES'), { status: 'NSG' }), 'no_show'); assert.strictEqual(e(p('RES'), { status: 'MOV' }), 'moved'); assert.strictEqual(e(p('CXL', true), { status: 'RES' }), 'reappeared'); assert.strictEqual(e(p('RES'), { status: 'RES' }), 'changed'); assert.strictEqual(e(null, { status: 'RES' }), 'new');
  });
  await t('vanished detection only looks at open RES rows inside the slice and ignores gone/fetched ones', () => {
    const idx = new Map([['x', { status: 'RES', arrival_date: '2026-10-20', gone: false }], ['y', { status: 'RES', arrival_date: '2026-10-20', gone: true }], ['z', { status: 'RES', arrival_date: '2026-12-01', gone: false }], ['w', { status: 'CXL', arrival_date: '2026-10-20', gone: false }], ['f', { status: 'RES', arrival_date: '2026-10-21', gone: false }]]);
    assert.deepStrictEqual(M.vanishedInSlice(idx, new Set(['f']), '2026-10-15', '2026-11-01'), ['x']);
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
})();
