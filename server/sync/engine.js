// Sprint 22 — the incremental sync engine.
//
//   tick()  ← called by the EXTERNAL scheduler every ~5 min (POST /api/sync/tick). Decides in memory (no database
//             access once warm) which runs are due, starts them in the background, returns immediately.
//   runs    frequent  today (+N days) RES + in-house            every 5 min inside the window (default 12:00–24:00 PT)
//           hourly    count-gate over 30-day RES slices         re-fetches only slices whose count changed
//           reconcile exact fetch of every future RES           once a day: catches same-count swaps + marks vanished rows
//           backfill  resumable history + forward window        N chunks per tick until done (also "full" = reset + all)
//
// Cost design (Neon bills awake time): scan state lives in memory; results are written WRITE-BEHIND in one transaction at most
// every `flushEveryMinutes` (hourly/reconcile/backfill runs flush at their end). A frequent scan with no changes writes nothing.
// rGuest safety: ONE shared client (token reused — no login per run), one run at a time, per-run call/detail budgets, and an
// auth failure pauses the engine instead of retrying (the client never re-logs-in after a 401 on credentials).
'use strict';
const crypto = require('crypto');
const { decideRuns, nextDue } = require('./schedule');
const { loadSettings, saveSettings, validateSettings, localClock } = require('./settings');
const { normalizeRow, fingerprintOf, pickFp } = require('./normalize');
const { deriveMapping } = require('../forecast/compute');
const M = require('./mirror');

const addDays = (ymd, n) => { const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const epochDay = (ymd) => Math.floor(Date.parse(String(ymd).slice(0, 10) + 'T00:00:00Z') / 864e5);
const fromEpochDay = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
const sliceGridStart = (ymd) => fromEpochDay(Math.floor(epochDay(ymd) / 30) * 30);
const CLOSED = new Set(['CXL', 'NS', 'NSG', 'MOV']);
const GONE_REASON = { CXL: 'cancelled', NS: 'no_show', NSG: 'no_show', MOV: 'moved' };
const REF_TTL = { rooms: 60 * 60e3, other: 6 * 60 * 60e3 };

function createSyncEngine({ getPool, getClient, now = () => new Date(), logger = console, propertyKey = process.env.SYNC_PROPERTY_KEY || 'default' }) {
  let settings = null, index = new Map(), hydrated = false, hydrating = null;
  let st = { initialized: false, sliceCounts: {}, backfill: {}, lastFrequentAt: null, lastHourlyAt: null, lastReconcileAt: null, lastFullAt: null };
  let buf = M.createBuffer(), lastFlushAt = null, running = null, authFailure = null;
  let ref = { ctx: null, roomsAt: 0, otherAt: 0, mapping: null, data: {} };
  let onFlushed = null;
  const recent = [];                       // last 100 run summaries (memory only)
  const bootedAt = now().toISOString(); let lastTickAt = null, tickCount = 0;

  const pool = () => getPool();
  const pendingChanges = () => buf.upserts.size + buf.patches.size + buf.events.length;
  const stateForDecision = () => ({ lastFrequentAt: st.lastFrequentAt, lastHourlyAt: st.lastHourlyAt, lastReconcileAt: st.lastReconcileAt, backfillDone: !!(st.backfill && st.backfill.done), initialized: st.initialized });

  async function ensureHydrated() {
    if (hydrated) return;
    if (!hydrating) hydrating = (async () => {
      const p = pool();
      settings = await loadSettings(p);
      const h = await M.hydrate(p, propertyKey);
      index = h.index;
      if (h.state) st = { initialized: h.state.initialized, sliceCounts: h.state.slice_counts || {}, backfill: h.state.backfill || {}, lastFrequentAt: h.state.last_frequent_at, lastHourlyAt: h.state.last_hourly_at, lastReconcileAt: h.state.last_reconcile_at, lastFullAt: h.state.last_full_at };
      const m = await p.query('SELECT type_code, type_name, base_code, base_label, sub_suffix, sub_label FROM room_type_mapping');
      ref.mapping = new Map(m.rows.map(r => [r.type_code, r]));
      hydrated = true;
    })().finally(() => { hydrating = null; });
    await hydrating;
  }

  // ── reference data (rooms for floors, room types, rate plans, VIPs) — rGuest calls only ──
  async function refreshRef(client, run, force = false) {
    const t = now().getTime(), d = ref.data;
    if (force || !ref.ctx || t - ref.roomsAt > REF_TTL.rooms) { d.rooms = await client.listRooms(); ref.roomsAt = t; run.calls++; }
    if (force || !ref.ctx || t - ref.otherAt > REF_TTL.other) {
      const [roomTypes, ratePlans, vip] = await Promise.all([client.listRoomTypes(), client.getRatePlans().catch(() => []), client.getVipStatuses().catch(() => [])]);
      Object.assign(d, { roomTypes, ratePlans, vip }); ref.otherAt = t; run.calls += 3;
    }
    ref.ctx = {
      roomTypeById: new Map((d.roomTypes || []).map(x => [x.id, x])), roomById: new Map((d.rooms || []).filter(x => x.id).map(x => [x.id, x])),
      ratePlanByCode: new Map((d.ratePlans || []).filter(x => x && x.code).map(x => [x.code, x])), vipById: new Map((d.vip || []).filter(x => x && x.id).map(x => [x.id, x])),
      mappingByCode: ref.mapping || new Map(),
    };
  }

  const newRun = (kind, trigger) => ({ run_id: crypto.randomUUID(), kind, trigger, status: 'success', started_at: now().toISOString(), finished_at: null, duration_ms: 0,
    calls: 0, fetched: 0, new_count: 0, changed: 0, gone: 0, unchanged: 0, complete: true, error: null, details: {}, _t0: Date.now(), _enriched: 0, _checks: 0 });

  // diff + buffer (+ detail for the first few NEW bookings: created time / booked by)
  async function processRows(client, run, rawRows, { emitNew, emitChanges, loadMissing = false }) {
    const rows = rawRows.map(r => normalizeRow(r, ref.ctx, { storeRaw: settings.storeRaw }));
    run.fetched += rows.length;
    if (loadMissing) await M.loadMissing(pool(), index, rows.map(r => r.reservation_id), propertyKey);
    const d = M.diffRows(index, rows, { emitNew, emitChanges });
    run.new_count += d.counts.new; run.changed += d.counts.changed; run.unchanged += d.counts.unchanged;
    for (const w of d.writes) {
      if (!w.prev && w.type === 'new' && run._enriched < settings.detailForNewMax) {
        run._enriched++;
        try { const det = await client.getReservationDetail(w.row.reservation_id); run.calls++; w.row.pms_created_at = det.reservationCreateTime || det.createdDateTime || null; w.row.booked_by = (det.sourceInfo && det.sourceInfo.bookedBy) || null; }
        catch (e) { if (e && (e.fatal || e.status === 401)) throw e; }
      }
    }
    M.addWrites(buf, d.writes, run.run_id, now().toISOString());
    d.unchanged.forEach(id => { if (!buf.upserts.has(id)) buf.touch.add(id); });
    return d;
  }

  // Look up reservations that disappeared from a slice that was fetched COMPLETELY; mark them (never delete).
  async function checkGone(client, run, ids, { emit = true } = {}) {
    for (const id of ids) {
      if (run._checks >= settings.maxDetailChecks) { run.details.checkBudgetHit = true; break; }
      run._checks++;
      const prev = index.get(id); if (!prev) continue;
      let det = null, notFound = false;
      try { det = await client.getReservationDetail(id); run.calls++; }
      catch (e) { if (e && e.status === 404) notFound = true; else if (e && (e.fatal || e.status === 401)) throw e; else { run.details.checkErrors = (run.details.checkErrors || 0) + 1; continue; } }
      const nowIso = now().toISOString();
      if (notFound) {
        buf.patches.set(id, { ...(buf.patches.get(id) || {}), gone_at: nowIso, gone_reason: 'not_found' });
        index.set(id, { ...prev, gone: true });
        if (emit) buf.events.push({ reservation_id: id, event_type: 'gone', occurred_at: nowIso, changes: {}, info: { status: prev.status, arrival_date: prev.arrival_date, confirmation_id: prev.vals && prev.vals.confirmation_id }, run_id: run.run_id });
        run.gone++; continue;
      }
      const status = det.status;
      if (!status || status === prev.status) { run.details.falseVanish = (run.details.falseVanish || 0) + 1; continue; }
      const patch = { status, status_label: status === 'CXL' ? 'Cancelled' : status === 'DPT' ? 'Departed' : status === 'INH' ? 'In house' : status };
      if (det.reservationCreateTime) patch.pms_created_at = det.reservationCreateTime;
      if (det.sourceInfo && det.sourceInfo.bookedBy) patch.booked_by = det.sourceInfo.bookedBy;
      if (CLOSED.has(status)) { patch.gone_at = nowIso; patch.gone_reason = (status === 'CXL' && det.cancellationInfo && det.cancellationInfo.isNoShow) ? 'no_show' : GONE_REASON[status]; run.gone++; }
      buf.patches.set(id, { ...(buf.patches.get(id) || {}), ...patch });
      const vals = { ...(prev.vals || {}), status }; const type = M.eventTypeFor(prev, { status });
      index.set(id, { ...prev, status, vals, fp: fingerprintOf(vals), gone: CLOSED.has(status) });
      if (emit) buf.events.push({ reservation_id: id, event_type: type, occurred_at: nowIso, changes: { status: [prev.status, status] }, info: { status, arrival_date: prev.arrival_date, departure_date: prev.departure_date, confirmation_id: vals.confirmation_id, type_code: vals.type_code }, run_id: run.run_id });
      run.changed++;
    }
  }

  const todayOf = async (client, run) => { const pd = await client.getPropertyDate(); run.calls++; return String(typeof pd === 'string' ? pd : (pd.propertyDate || pd.date)).slice(0, 10); };

  // ── run kinds ──
  async function runFrequent(client, run) {
    await refreshRef(client, run);
    const today = await todayOf(client, run), f = settings.frequent, to = addDays(today, f.daysAhead + 1);
    const [res, inh] = await Promise.all([client.fetchSliceExact(today, to, ['RES']), client.fetchSliceExact(today, today, ['INH'])]);
    run.calls += res.calls + inh.calls; run.complete = res.complete && inh.complete;
    const emit = st.initialized;
    await processRows(client, run, [...res.items, ...inh.items], { emitNew: emit, emitChanges: emit });
    if (res.complete) {
      const seen = new Set([...res.items, ...inh.items].map(r => r.id));
      await checkGone(client, run, M.vanishedInSlice(index, seen, today, to, ['RES']), { emit });
    }
    if (inh.complete) {
      const seen = new Set(inh.items.map(r => r.id));
      await checkGone(client, run, [...index].filter(([id, e]) => e.status === 'INH' && !e.gone && !seen.has(id)).map(([id]) => id), { emit });
    }
    run.details.window = { today, to };
    st.lastFrequentAt = now();
  }

  async function runHourly(client, run) {
    await refreshRef(client, run, true);
    const today = await todayOf(client, run), end = addDays(today, settings.hourly.aheadDays), emit = st.initialized;
    const counts = {}, changed = [], skipped = [];
    let nearCovered = false;
    for (let s = sliceGridStart(today); s < end; s = addDays(s, 30)) {
      const from = s < today ? today : s, to = addDays(s, 30);
      const n = await client.countSlice(from, to, ['RES']); run.calls++;
      counts[s] = n;
      if (st.sliceCounts[s] === n) { skipped.push(s); continue; }
      const r = await client.fetchSliceExact(from, to, ['RES']); run.calls += r.calls; run.complete = run.complete && r.complete;
      await processRows(client, run, r.items, { emitNew: emit, emitChanges: emit });
      if (r.complete) await checkGone(client, run, M.vanishedInSlice(index, new Set(r.items.map(x => x.id)), from, to, ['RES']), { emit });
      else counts[s] = null;                      // not exact → force a re-fetch next hour
      changed.push(s);
      if (from === today || s <= today) nearCovered = true;      // the first slice already covers the near window exactly
    }
    // Edits that keep a slice's COUNT the same (room assigned, dates moved, rate changed) are invisible to the count-gate, so the
    // next `nearDays` are always re-fetched exactly; everything further out is caught by the daily reconcile.
    const nearDays = settings.hourly.nearDays;
    if (nearDays > 0 && !nearCovered) {
      const nTo = addDays(today, nearDays), r = await client.fetchSliceExact(today, nTo, ['RES']); run.calls += r.calls; run.complete = run.complete && r.complete;
      await processRows(client, run, r.items, { emitNew: emit, emitChanges: emit });
      if (r.complete) await checkGone(client, run, M.vanishedInSlice(index, new Set(r.items.map(x => x.id)), today, nTo, ['RES']), { emit });
      run.details.near = { to: nTo, rows: r.items.length };
    }
    st.sliceCounts = Object.fromEntries(Object.entries(counts).filter(([, v]) => v != null));
    const inh = await client.fetchSliceExact(today, today, ['INH']); run.calls += inh.calls; run.complete = run.complete && inh.complete;
    await processRows(client, run, inh.items, { emitNew: emit, emitChanges: emit });
    if (inh.complete) await checkGone(client, run, [...index].filter(([id, e]) => e.status === 'INH' && !e.gone && !inh.items.some(x => x.id === id)).map(([id]) => id), { emit });
    run.details.slices = { checked: Object.keys(counts).length, refetched: changed, unchanged: skipped.length };
    st.lastHourlyAt = now();
  }

  async function runReconcile(client, run) {
    await refreshRef(client, run, true);
    const today = await todayOf(client, run), end = addDays(today, settings.hourly.aheadDays), emit = st.initialized;
    const r = await client.fetchSliceExact(today, end, ['RES']); run.calls += r.calls; run.complete = r.complete;
    await processRows(client, run, r.items, { emitNew: emit, emitChanges: emit });
    if (r.complete) {
      await checkGone(client, run, M.vanishedInSlice(index, new Set(r.items.map(x => x.id)), today, end, ['RES']), { emit });
      // refresh the count-gate baseline from the exact data. RES slice counts are NIGHT-OVERLAP counts (see client.resSliceExact):
      // arrival < to && departure > from, which is exactly what rGuest's totalElements reports for [from, to).
      const base = {};
      for (let s = sliceGridStart(today); s < end; s = addDays(s, 30)) {
        const from = s < today ? today : s, to = addDays(s, 30);
        base[s] = r.items.filter(x => String(x.arrivalDateLocalDate || x.arrivalDate).slice(0, 10) < to && String(x.departureDateLocalDate || x.departureDate).slice(0, 10) > from).length;
      }
      st.sliceCounts = base;
    }
    if (r.complete) captureRollups(today);
    run.details.rows = r.items.length;
    st.lastReconcileAt = now();
  }

  // Forecast-accuracy data (migration 029): bookings on the books THIS morning for each of the next 15 days, and yesterday's actual arrivals.
  const baseOfType = (code) => { if (!code) return null; const m = ref.mapping && ref.mapping.get(code); return (m && m.base_code) || deriveMapping(code, null).base_code || null; };
  function captureRollups(today) {
    const bases = new Set([...(ref.ctx ? ref.ctx.roomTypeById.values() : [])].map(rt => baseOfType(rt.typeCode)).filter(Boolean));
    const horizon = 14, last = addDays(today, horizon), y = addDays(today, -1);
    const booked = new Map(), actual = new Map(); const key = (d, b) => d + '|' + b;
    for (const [, e] of index) {
      const base = baseOfType(e.vals && e.vals.type_code); if (!base) continue; bases.add(base);
      if (e.status === 'RES' && !e.gone && e.arrival_date >= today && e.arrival_date <= last) booked.set(key(e.arrival_date, base), (booked.get(key(e.arrival_date, base)) || 0) + 1);
      if ((e.status === 'INH' || e.status === 'DPT') && e.arrival_date === y) actual.set(key(y, base), (actual.get(key(y, base)) || 0) + 1);
    }
    for (let i = 0; i <= horizon; i++) { const d = addDays(today, i); for (const b of bases) buf.rollups.push({ target_date: d, base_code: b, horizon_days: i, booked: booked.get(key(d, b)) || 0, captured_on: today }); }
    for (const b of bases) buf.actuals.push({ arrival_date: y, base_code: b, arrivals: actual.get(key(y, b)) || 0 });
  }

  async function backfillChunk(client, run) {
    const today = await todayOf(client, run);
    if (!st.backfill || !st.backfill.cursor) st.backfill = { from: addDays(today, -30 * settings.backfill.monthsBack), to: addDays(today, settings.hourly.aheadDays), cursor: addDays(today, -30 * settings.backfill.monthsBack), done: false, chunks: 0, incomplete: [] };
    const bf = st.backfill, a = bf.cursor, b = addDays(a, 30);
    await refreshRef(client, run);
    let complete = true;
    for (const status of ['RES', 'INH', 'DPT', 'CXL']) {
      const r = await client.fetchSliceExact(a, b, [status]); run.calls += r.calls; complete = complete && r.complete;
      await processRows(client, run, r.items, { emitNew: false, emitChanges: false, loadMissing: true });
    }
    if (!complete) { bf.incomplete = [...(bf.incomplete || []), a]; run.complete = false; }
    bf.cursor = b; bf.chunks = (bf.chunks || 0) + 1;
    if (b >= bf.to) { bf.done = true; st.initialized = true; st.lastFullAt = now(); }
    run.details.chunk = { from: a, to: b, done: bf.done };
    return bf.done;
  }
  async function runBackfill(client, run, { all = false } = {}) {
    let n = 0; const max = all ? Infinity : settings.backfill.chunksPerTick;
    while (n < max) { const done = await backfillChunk(client, run); n++; await flushIfDue('backfill', true); if (done) break; }
    run.details.chunks = n;
  }

  const KINDS = { frequent: runFrequent, hourly: runHourly, reconcile: runReconcile, backfill: (c, r) => runBackfill(c, r), full: async (c, r) => {
    const today = await todayOf(c, r); st.initialized = false;
    st.backfill = { from: addDays(today, -30 * settings.backfill.monthsBack), to: addDays(today, settings.hourly.aheadDays), cursor: addDays(today, -30 * settings.backfill.monthsBack), done: false, chunks: 0, incomplete: [] };
    await runBackfill(c, r, { all: true }); } };

  // Swap the buffer out BEFORE the first await so anything added while the transaction is in flight lands in the new buffer (never lost);
  // if the write fails the old contents are merged back and retried on the next flush.
  let flushing = null;
  async function flushBuffer() {
    while (flushing) await flushing.catch(() => {});
    const old = buf; buf = M.createBuffer();
    flushing = (async () => {
      try {
        const out = await M.flush(pool(), old, { propertyId: propertyKey, state: st }); lastFlushAt = now().getTime();
        if (onFlushed) Promise.resolve().then(() => onFlushed(out)).catch(e => logger.error('[sync] onFlushed hook failed:', e && e.message));
        return out;
      }
      catch (err) { M.mergeBack(buf, old); throw err; }
    })();
    try { return await flushing; } finally { flushing = null; }
  }
  async function flushIfDue(kind, force = false) {
    const due = force || kind !== 'frequent' || (pendingChanges() > 0 && (!lastFlushAt || now().getTime() - lastFlushAt >= settings.flushEveryMinutes * 60000));
    return due ? flushBuffer() : null;
  }

  async function runKind(kind, trigger) {
    const run = newRun(kind, trigger); running = { kind, since: run.started_at };
    const client = getClient();
    try { await KINDS[kind](client, run); }
    catch (err) {
      run.status = 'failed'; run.error = String(err && err.message || err).slice(0, 500);
      if (err && (err.fatal || err.status === 401)) {
        authFailure = { at: now().toISOString(), message: run.error }; settings.paused = true;
        await saveSettings(pool(), settings).catch(() => {});
        logger.error('[sync] rGuest authentication failed — sync paused until an admin resumes it');
      } else logger.error(`[sync] ${kind} failed:`, run.error);
    } finally { if (client.clearLogs) client.clearLogs(); }     // `running` stays set until the whole chain (incl. the flush) is done
    if (run.status === 'success' && !run.complete) run.status = 'partial';
    run.finished_at = now().toISOString(); run.duration_ms = Date.now() - run._t0;
    const summary = Object.fromEntries(Object.entries(run).filter(([k]) => !k.startsWith('_')));
    recent.unshift(summary); recent.length = Math.min(recent.length, 100);
    const interesting = kind !== 'frequent' || run.status !== 'success' || run.new_count + run.changed + run.gone > 0;
    if (interesting) buf.runs.push(summary);
    try { await flushIfDue(kind, false); } catch (e) { logger.error('[sync] flush failed (kept in memory, will retry):', e && e.message); }
    return summary;
  }

  async function runChain(kinds, trigger) {
    const out = [];
    for (const k of kinds) {
      if (settings.paused && trigger === 'tick') break;
      const r = await runKind(k, trigger); out.push(r);
      if (r.status === 'failed') break;           // rGuest down / auth problem: don't pile more calls on top — the next ping retries
    }
    return out;
  }

  return {
    /** Called by the scheduler ping. Returns fast; work continues in the background. */
    async tick() {
      lastTickAt = now().toISOString(); tickCount++;
      if (running) return { started: [], reason: `busy (${running.kind})` };
      await ensureHydrated();
      const d = decideRuns(now(), settings, stateForDecision());
      if (!d.kinds.length) {
        if (pendingChanges() > 0 && (!lastFlushAt || now().getTime() - lastFlushAt >= settings.flushEveryMinutes * 60000)) { await flushIfDue('idle', true).catch(e => logger.error('[sync] idle flush failed:', e && e.message)); return { started: [], reason: d.reason, flushed: true }; }
        return { started: [], reason: d.reason };
      }
      running = { kind: d.kinds[0], since: now().toISOString() };      // claim before returning so overlapping pings see "busy"
      runChain(d.kinds, 'tick').catch(e => logger.error('[sync] chain crashed:', e && e.message)).finally(() => { running = null; });
      return { started: d.kinds };
    },
    /** Admin "Run now". kind: frequent | hourly | reconcile | backfill | full */
    async trigger(kind) {
      if (kind !== 'refresh' && !KINDS[kind]) throw Object.assign(new Error('unknown kind'), { status: 400 });
      if (running) return { started: false, reason: `busy (${running.kind})` };
      await ensureHydrated();
      running = { kind, since: now().toISOString() };
      // 'refresh' = what the Reservations page's refresh button does: a quick scan, then an hourly check (which also flushes to the database)
      runChain(kind === 'refresh' ? ['frequent', 'hourly'] : [kind], 'manual').catch(e => logger.error('[sync] manual run crashed:', e && e.message)).finally(() => { running = null; });
      return { started: true, kind };
    },
    async getSettings() { await ensureHydrated(); return settings; },
    ensureHydrated,
    /** Reference data (room types, rate plans, VIPs) for building payloads — refreshed on its own TTL. */
    async getReference(client) { await ensureHydrated(); if (!ref.ctx) await refreshRef(client, { calls: 0 }); return ref.data; },
    /** When the mirror was last refreshed from rGuest (latest of the three scan kinds). */
    syncedAt() { const t = [st.lastFrequentAt, st.lastHourlyAt, st.lastReconcileAt].filter(Boolean).map(x => new Date(x).getTime()); return t.length ? new Date(Math.max(...t)).toISOString() : null; },
    /** The mirror can serve the pages: first full load done, raw rows are being kept, and the sync ran in the last 24 h. */
    isMirrorReady() { const t = this.syncedAt(); return !!(hydrated && st.initialized && settings.storeRaw && t && now().getTime() - new Date(t).getTime() < 24 * 3600e3); },
    /** Write scan results that are still only in memory (so a page that is about to read the database sees them). */
    async flushPending() { if (hydrated && pendingChanges() > 0) return flushBuffer(); return null; },
    setOnFlushed(fn) { onFlushed = fn; },
    async updateSettings(patch) {
      await ensureHydrated();
      const { settings: next, errors } = validateSettings(patch, settings);
      if (errors.length) return { ok: false, errors };
      settings = next; if (patch && patch.paused === false) authFailure = null;
      await saveSettings(pool(), settings);
      return { ok: true, settings };
    },
    async getStatus() {
      await ensureHydrated();
      return { hydrated, running, settings, authFailure, state: { ...st, backfillDone: !!(st.backfill && st.backfill.done) }, indexSize: index.size, lastFlushAt: lastFlushAt && new Date(lastFlushAt).toISOString(),
        pending: { upserts: buf.upserts.size, patches: buf.patches.size, events: buf.events.length, touch: buf.touch.size, runs: buf.runs.length }, recentRuns: recent.slice(0, 30), now: now().toISOString(),
        clock: localClock(now(), settings.timezone), lastTickAt, tickCount, bootedAt, nextDue: nextDue(now(), settings, stateForDecision()) };
    },
    async flushNow() { if (!hydrated) return null; return flushBuffer(); },
    // test hooks
    _peek: () => ({ index, buf, st, settings, recent }),
  };
}

module.exports = { createSyncEngine, sliceGridStart };
