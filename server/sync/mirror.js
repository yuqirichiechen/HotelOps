// Sprint 22 — the reservation mirror: in-memory index + diff (PURE) and the write-behind buffer + flush (DB).
// reservation_history is the mirror table (see migration 028). Rows are NEVER deleted — a reservation that stops
// appearing is looked up individually and marked (cancelled / arrived / departed / no_show / moved / not_found).
'use strict';
const { FP_FIELDS, pickFp } = require('./normalize');

const ACTIVE = new Set(['RES', 'INH', 'DPT']);
const CLOSED = new Set(['CXL', 'NS', 'NSG', 'MOV']);
const GONE_REASON = { CXL: 'cancelled', NS: 'no_show', NSG: 'no_show', MOV: 'moved' };

/** Event type for a status transition (or 'changed' for any other fingerprint change). */
function eventTypeFor(prev, next) {
  if (!prev) return 'new';
  if (prev.status !== next.status) {
    if (next.status === 'INH') return 'arrived';
    if (next.status === 'DPT') return 'departed';
    if (next.status === 'CXL') return 'cancelled';
    if (next.status === 'NS' || next.status === 'NSG') return 'no_show';
    if (next.status === 'MOV') return 'moved';
  }
  if (prev.gone && ACTIVE.has(next.status)) return 'reappeared';
  return 'changed';
}

const changesBetween = (prevVals, nextVals) => {
  const out = {};
  for (const k of FP_FIELDS) {
    const a = prevVals && prevVals[k] !== undefined ? prevVals[k] : null, b = nextVals[k] !== undefined ? nextVals[k] : null;
    if (a !== b) out[k] = [a, b];
  }
  return out;
};
const infoOf = (row) => ({ confirmation_id: row.confirmation_id, type_code: row.type_code, arrival_date: row.arrival_date,
  departure_date: row.departure_date, room_number: row.room_number, status: row.status, ...(row.booked_by ? { booked_by: row.booked_by } : {}) });

/**
 * Compare freshly fetched rows with the in-memory index and update the index.
 * @param {Map}   index   reservation_id → { fp, vals, status, gone }
 * @param {Array} rows    normalized rows
 * @param {object} opts   { emitNew: bool (suppressed during backfill / before initialisation), emitChanges: bool }
 * @returns {{ writes: Array<{row, prev, type|null}>, unchanged: string[], counts }}
 */
function diffRows(index, rows, { emitNew = true, emitChanges = true } = {}) {
  const writes = [], unchanged = [];
  const counts = { new: 0, changed: 0, unchanged: 0, adopted: 0 };
  for (const row of rows) {
    const prev = index.get(row.reservation_id);
    if (prev && prev.fp === row.fingerprint && !prev.gone) { unchanged.push(row.reservation_id); counts.unchanged++; continue; }
    let type = null;
    if (!prev) { counts.new++; if (emitNew) type = 'new'; }
    else if (prev.fp == null) { counts.adopted++; /* legacy row written before the sync existed → adopt silently */ }
    else { counts.changed++; if (emitChanges) type = eventTypeFor(prev, row); }
    writes.push({ row, prev: prev || null, type, changes: prev && prev.fp != null ? changesBetween(prev.vals, pickFp(row)) : {} });
    index.set(row.reservation_id, { fp: row.fingerprint, vals: pickFp(row), status: row.status, gone: CLOSED.has(row.status), arrival_date: row.arrival_date, departure_date: row.departure_date });
  }
  return { writes, unchanged, counts };
}

/** Mirror RES rows in [from, to) that were NOT in the fetched set (only valid when the slice fetch was complete). */
function vanishedInSlice(index, fetchedIds, from, to, statuses = ['RES']) {
  const out = [];
  for (const [id, e] of index) {
    if (e.gone || !statuses.includes(e.status) || fetchedIds.has(id)) continue;
    const a = e.arrival_date;
    if (a && a >= from && a < to) out.push(id);
  }
  return out;
}

// ── write-behind buffer ──
function createBuffer() {
  return { upserts: new Map(), patches: new Map(), events: [], touch: new Set(), runs: [], state: null, sliceCounts: null };
}
const bufferSize = (b) => b.upserts.size + b.patches.size + b.events.length + b.touch.size + b.runs.length;

function addWrites(buf, writes, runId, nowIso) {
  for (const w of writes) {
    buf.upserts.set(w.row.reservation_id, w.row);
    buf.touch.delete(w.row.reservation_id);
    if (w.type) buf.events.push({ reservation_id: w.row.reservation_id, event_type: w.type, occurred_at: nowIso, changes: w.changes || {}, info: infoOf(w.row), run_id: runId });
  }
}

const COLS = ['reservation_id', 'confirmation_id', 'guest_name', 'primary_guest_profile_id', 'arrival_date', 'departure_date', 'nights', 'room_id', 'room_number',
  'floor_id', 'type_code', 'base_code', 'base_label', 'sub_label', 'rate_plan_code', 'source', 'status', 'status_label', 'vip_uuid', 'vip_label',
  'is_pre_assigned', 'is_pet_friendly', 'is_group_booking', 'is_early_arrival', 'is_red_eye', 'is_day_use', 'is_high_floor', 'scheduled_for_room_move',
  'fingerprint', 'raw', 'pms_created_at', 'booked_by', 'property_id', 'gone_at', 'gone_reason'];
const UPDATE_COLS = COLS.filter(c => !['reservation_id', 'pms_created_at', 'booked_by', 'raw', 'gone_at', 'gone_reason'].includes(c));
const BATCH = 100;

async function upsertBatch(db, rows, propertyId) {
  const values = [], tuples = [];
  rows.forEach((r, i) => {
    tuples.push('(' + COLS.map((_, j) => `$${i * COLS.length + j + 1}`).join(',') + ')');
    const closed = CLOSED.has(r.status);
    COLS.forEach(c => values.push(c === 'raw' ? (r.raw == null ? null : JSON.stringify(r.raw)) : c === 'property_id' ? propertyId : c === 'gone_at' ? (closed ? new Date().toISOString() : null) : c === 'gone_reason' ? (closed ? GONE_REASON[r.status] : null) : (r[c] === undefined ? null : r[c])));
  });
  await db.query(
    `INSERT INTO reservation_history (${COLS.join(',')}) VALUES ${tuples.join(',')}
     ON CONFLICT (reservation_id) DO UPDATE SET
       ${UPDATE_COLS.map(c => `${c} = EXCLUDED.${c}`).join(', ')},
       raw = COALESCE(EXCLUDED.raw, reservation_history.raw),
       pms_created_at = COALESCE(EXCLUDED.pms_created_at, reservation_history.pms_created_at),
       booked_by = COALESCE(EXCLUDED.booked_by, reservation_history.booked_by),
       gone_at = CASE WHEN EXCLUDED.gone_at IS NULL THEN NULL ELSE COALESCE(reservation_history.gone_at, EXCLUDED.gone_at) END,
       gone_reason = EXCLUDED.gone_reason,
       last_changed_at = NOW(), last_seen_at = NOW()`,
    values);
}

/** Write everything pending in ONE transaction. Throws on failure (buffer is left intact so the next flush retries). */
async function flush(pool, buf, { propertyId, state }) {
  if (!bufferSize(buf) && !(buf.state || state)) return { wrote: 0 };
  const db = await pool.connect();
  let wrote = 0;
  try {
    await db.query('BEGIN');
    const rows = [...buf.upserts.values()];
    for (let i = 0; i < rows.length; i += BATCH) { await upsertBatch(db, rows.slice(i, i + BATCH), propertyId); wrote += Math.min(BATCH, rows.length - i); }
    for (const [id, p] of buf.patches) {
      const sets = [], vals = [id];
      for (const [k, v] of Object.entries(p)) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
      if (sets.length) await db.query(`UPDATE reservation_history SET ${sets.join(', ')}, last_changed_at = NOW() WHERE reservation_id = $1`, vals);
    }
    const touch = [...buf.touch];
    for (let i = 0; i < touch.length; i += 1000) await db.query('UPDATE reservation_history SET last_seen_at = NOW() WHERE reservation_id = ANY($1::uuid[])', [touch.slice(i, i + 1000)]);
    for (const e of buf.events) {
      await db.query(`INSERT INTO reservation_events (property_id, reservation_id, event_type, occurred_at, changes, info, run_id) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
        [propertyId, e.reservation_id, e.event_type, e.occurred_at, JSON.stringify(e.changes || {}), JSON.stringify(e.info || {}), e.run_id || null]);
    }
    for (const r of buf.runs) {
      await db.query(`INSERT INTO sync_runs (run_id, property_id, kind, trigger, status, started_at, finished_at, duration_ms, calls, fetched, new_count, changed, gone, unchanged, complete, error, details)
                      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb) ON CONFLICT (run_id) DO NOTHING`,
        [r.run_id, propertyId, r.kind, r.trigger, r.status, r.started_at, r.finished_at, r.duration_ms, r.calls, r.fetched, r.new_count, r.changed, r.gone, r.unchanged, r.complete, r.error || null, JSON.stringify(r.details || {})]);
    }
    if (state) {
      await db.query(
        `INSERT INTO sync_state (property_id, initialized, slice_counts, backfill, last_frequent_at, last_hourly_at, last_reconcile_at, last_full_at, updated_at)
         VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,NOW())
         ON CONFLICT (property_id) DO UPDATE SET initialized = EXCLUDED.initialized, slice_counts = EXCLUDED.slice_counts, backfill = EXCLUDED.backfill,
           last_frequent_at = EXCLUDED.last_frequent_at, last_hourly_at = EXCLUDED.last_hourly_at, last_reconcile_at = EXCLUDED.last_reconcile_at, last_full_at = EXCLUDED.last_full_at, updated_at = NOW()`,
        [propertyId, !!state.initialized, JSON.stringify(state.sliceCounts || {}), JSON.stringify(state.backfill || {}), state.lastFrequentAt || null, state.lastHourlyAt || null, state.lastReconcileAt || null, state.lastFullAt || null]);
    }
    await db.query('COMMIT');
  } catch (err) { await db.query('ROLLBACK').catch(() => {}); throw err; } finally { db.release(); }
  const out = { wrote, events: buf.events.length, runs: buf.runs.length };
  buf.upserts.clear(); buf.patches.clear(); buf.events.length = 0; buf.touch.clear(); buf.runs.length = 0;
  return out;
}

/** Load the in-memory index (every open reservation + the last 7 days) and the persisted sync state. */
async function hydrate(pool, propertyId) {
  const { rows } = await pool.query(
    `SELECT reservation_id, fingerprint, status, gone_at IS NOT NULL AS gone, confirmation_id,
            to_char(arrival_date,'YYYY-MM-DD') AS arrival_date, to_char(departure_date,'YYYY-MM-DD') AS departure_date,
            room_number, type_code, nights, rate_plan_code, guest_name, vip_uuid, is_day_use, scheduled_for_room_move
       FROM reservation_history
      WHERE property_id = $1 AND (status IN ('RES','INH') OR departure_date >= CURRENT_DATE - 7 OR arrival_date >= CURRENT_DATE - 7)`, [propertyId]);
  const index = new Map();
  for (const r of rows) index.set(r.reservation_id, { fp: r.fingerprint ? String(r.fingerprint).trim() : null, vals: pickFp(r), status: r.status, gone: r.gone, arrival_date: r.arrival_date, departure_date: r.departure_date });
  const st = (await pool.query('SELECT * FROM sync_state WHERE property_id = $1', [propertyId])).rows[0] || null;
  return { index, state: st };
}

/** Load index entries for ids not in memory (backfill / full runs touch rows outside the hydrated window). */
async function loadMissing(pool, index, ids, propertyId) {
  const need = ids.filter(id => !index.has(id));
  for (let i = 0; i < need.length; i += 1000) {
    const { rows } = await pool.query(
      `SELECT reservation_id, fingerprint, status, gone_at IS NOT NULL AS gone, confirmation_id,
              to_char(arrival_date,'YYYY-MM-DD') AS arrival_date, to_char(departure_date,'YYYY-MM-DD') AS departure_date,
              room_number, type_code, nights, rate_plan_code, guest_name, vip_uuid, is_day_use, scheduled_for_room_move
         FROM reservation_history WHERE property_id = $2 AND reservation_id = ANY($1::uuid[])`, [need.slice(i, i + 1000), propertyId]);
    for (const r of rows) index.set(r.reservation_id, { fp: r.fingerprint ? String(r.fingerprint).trim() : null, vals: pickFp(r), status: r.status, gone: r.gone, arrival_date: r.arrival_date, departure_date: r.departure_date });
  }
}

/** Put an un-flushed (failed) buffer back in front of `target` — newer data in `target` wins. */
function mergeBack(target, old) {
  for (const [id, row] of old.upserts) if (!target.upserts.has(id)) target.upserts.set(id, row);
  for (const [id, p] of old.patches) target.patches.set(id, { ...p, ...(target.patches.get(id) || {}) });
  old.touch.forEach(id => { if (!target.upserts.has(id)) target.touch.add(id); });
  target.events.unshift(...old.events); target.runs.unshift(...old.runs);
}

module.exports = { mergeBack, eventTypeFor, diffRows, vanishedInSlice, createBuffer, bufferSize, addWrites, flush, hydrate, loadMissing, changesBetween };
