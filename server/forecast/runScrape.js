// Sprint 17.2 — Forecast scrape orchestration.
//
// One entry point: runScrape({ pool, source, triggeredBy, forecastDate? }).
// Loads config + mapping, calls the rGuest client, runs the pure
// compute fn, dedups by payload hash, upserts any newly-seen
// typeCodes into room_type_mapping, and inserts a forecast_snapshot
// row. Returns the inserted (or deduped existing) snapshot.
//
// All errors are caught and result in a forecast_snapshot row with
// status='failed' + error_message, so the admin history view shows
// failures alongside successes.

'use strict';

const crypto = require('crypto');

const { createAgilysysClient } = require('../agilysys/client');
const { computeForecast }       = require('./compute');

// "Today" in Snoqualmie's local timezone. Uses Intl so we don't pull
// a tz library.
const _laDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year:  'numeric',
  month: '2-digit',
  day:   '2-digit',
});
function todayInLA() {
  return _laDateFmt.format(new Date()); // 'YYYY-MM-DD'
}

// SHA256 of a *normalized* payload — strips fields that change run
// to run without representing a real data delta (timestamps), so two
// scrapes 5 minutes apart with the same room/reservation state
// produce the same hash and dedup correctly.
function hashPayload(payload) {
  const norm = {
    forecastDate: payload.forecastDate,
    kpis:         payload.kpis,
    perRoomSheet: (payload.perRoomSheet || []).map(r => ({
      roomNumber:      r.roomNumber,
      action:          r.action,
      hkStatus:        r.hkStatus,
      occupancyStatus: r.occupancyStatus,
      reservationId:   r.reservationId,
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

async function loadConfig(pool) {
  const { rows } = await pool.query(
    `SELECT productivity_target, avg_min_per_clean, dedup_window_minutes
     FROM forecast_config WHERE config_id = 1`,
  );
  if (!rows.length) {
    throw new Error('forecast_config singleton missing — did migration 024 run?');
  }
  return rows[0];
}

async function loadMapping(pool) {
  const { rows } = await pool.query(
    `SELECT type_code, type_name, base_code, base_label,
            sub_suffix, sub_label, admin_override
       FROM room_type_mapping`,
  );
  return rows;
}

// Upsert NEW typeCodes only — never overwrite existing rows (which
// may carry admin_override=TRUE edits).
async function upsertNewMappings(pool, newMappings) {
  if (!newMappings || !newMappings.length) return 0;
  let inserted = 0;
  for (const m of newMappings) {
    const r = await pool.query(
      `INSERT INTO room_type_mapping
         (type_code, type_name, base_code, base_label, sub_suffix, sub_label)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (type_code) DO NOTHING
       RETURNING type_code`,
      [m.type_code, m.type_name, m.base_code, m.base_label, m.sub_suffix, m.sub_label],
    );
    inserted += r.rowCount;
  }
  return inserted;
}

// Look for a non-failed snapshot with the same hash within the
// dedup window. If found, return it instead of inserting.
async function findDedupSnapshot(pool, hash, windowMinutes) {
  const { rows } = await pool.query(
    `SELECT *
       FROM forecast_snapshot
      WHERE payload_hash = $1
        AND status = 'success'
        AND scraped_at > NOW() - ($2 || ' minutes')::interval
      ORDER BY scraped_at DESC
      LIMIT 1`,
    [hash, String(windowMinutes)],
  );
  return rows[0] || null;
}

// Sprint 18.5 — upsert the snapshot's reservation list into
// `reservation_history` so past guest data survives snapshot
// pruning. Batched in chunks of 50 to keep the query parameter
// count well under pg's 65k limit (29 cols × 50 = 1450 params).
// Best-effort: if this fails the snapshot still counts as a
// success — we log the error inline and move on.
const HISTORY_BATCH = 50;
async function upsertReservationHistory(pool, reservations, snapshotId, logs) {
  if (!Array.isArray(reservations) || reservations.length === 0) return 0;
  const rows = reservations.filter(r => r && r.id);
  if (rows.length === 0) return 0;
  const COLS = 29;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += HISTORY_BATCH) {
    const chunk = rows.slice(i, i + HISTORY_BATCH);
    const placeholders = [];
    const values = [];
    chunk.forEach((r, idx) => {
      const base = idx * COLS;
      placeholders.push(
        `(${Array.from({ length: COLS }, (_, j) => `$${base + j + 1}`).join(',')})`,
      );
      values.push(
        r.id,
        r.confirmationId         || null,
        r.guestName              || null,
        r.primaryGuestProfileId  || null,
        r.arrivalDate            || null,
        r.departureDate          || null,
        Number.isFinite(r.nights) ? r.nights : null,
        r.roomId                 || null,
        r.roomNumber             || null,
        r.floorId                || null,
        r.typeCode               || null,
        r.baseCode               || null,
        r.baseLabel              || null,
        r.subLabel               || null,
        r.source                 || null,
        r.status                 || null,
        r.statusLabel            || null,
        r.kind                   || null,
        r.vipUuid                || null,
        r.vipLabel               || null,
        !!r.isPreAssigned,
        !!r.isPetFriendly,
        !!r.isGroupBooking,
        !!r.isEarlyArrival,
        !!r.isRedEye,
        !!r.isDayUse,
        !!r.isHighFloor,
        !!r.scheduledForRoomMove,
        snapshotId,
      );
    });
    const q = `
      INSERT INTO reservation_history (
        reservation_id, confirmation_id, guest_name, primary_guest_profile_id,
        arrival_date, departure_date, nights,
        room_id, room_number, floor_id,
        type_code, base_code, base_label, sub_label,
        source, status, status_label, kind,
        vip_uuid, vip_label,
        is_pre_assigned, is_pet_friendly, is_group_booking,
        is_early_arrival, is_red_eye, is_day_use, is_high_floor,
        scheduled_for_room_move,
        last_snapshot_id
      ) VALUES ${placeholders.join(',')}
      ON CONFLICT (reservation_id) DO UPDATE SET
        confirmation_id          = EXCLUDED.confirmation_id,
        guest_name               = EXCLUDED.guest_name,
        primary_guest_profile_id = EXCLUDED.primary_guest_profile_id,
        arrival_date             = EXCLUDED.arrival_date,
        departure_date           = EXCLUDED.departure_date,
        nights                   = EXCLUDED.nights,
        room_id                  = EXCLUDED.room_id,
        room_number              = EXCLUDED.room_number,
        floor_id                 = EXCLUDED.floor_id,
        type_code                = EXCLUDED.type_code,
        base_code                = EXCLUDED.base_code,
        base_label               = EXCLUDED.base_label,
        sub_label                = EXCLUDED.sub_label,
        source                   = EXCLUDED.source,
        status                   = EXCLUDED.status,
        status_label             = EXCLUDED.status_label,
        kind                     = EXCLUDED.kind,
        vip_uuid                 = EXCLUDED.vip_uuid,
        vip_label                = EXCLUDED.vip_label,
        is_pre_assigned          = EXCLUDED.is_pre_assigned,
        is_pet_friendly          = EXCLUDED.is_pet_friendly,
        is_group_booking         = EXCLUDED.is_group_booking,
        is_early_arrival         = EXCLUDED.is_early_arrival,
        is_red_eye               = EXCLUDED.is_red_eye,
        is_day_use               = EXCLUDED.is_day_use,
        is_high_floor            = EXCLUDED.is_high_floor,
        scheduled_for_room_move  = EXCLUDED.scheduled_for_room_move,
        last_seen_at             = NOW(),
        last_snapshot_id         = EXCLUDED.last_snapshot_id
    `;
    try {
      const res = await pool.query(q, values);
      upserted += res.rowCount;
    } catch (err) {
      logs && logs.push({
        at:      new Date().toISOString(),
        level:   'warn',
        message: 'reservation_history.batch_failed',
        context: { batchStart: i, batchSize: chunk.length, error: err.message },
      });
    }
  }
  return upserted;
}

async function insertSnapshot(pool, row) {
  const q = `
    INSERT INTO forecast_snapshot
      (forecast_date, source, triggered_by, status, records_processed,
       payload, payload_hash, logs, error_message)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`;
  const { rows } = await pool.query(q, [
    row.forecast_date,
    row.source,
    row.triggered_by,
    row.status,
    row.records_processed,
    row.payload,
    row.payload_hash,
    JSON.stringify(row.logs || []),
    row.error_message || null,
  ]);
  return rows[0];
}


/**
 * Run one scrape end-to-end.
 *
 * @param {Object} args
 * @param {Pool}   args.pool             — pg Pool
 * @param {string} args.source           — 'manual' | 'cron'
 * @param {string} [args.triggeredBy]    — user_id UUID (null for admin / cron)
 * @param {string} [args.forecastDate]   — YYYY-MM-DD; defaults to today PT
 * @returns {Promise<Object>} the forecast_snapshot row (with a `.deduped` flag if reused)
 */
async function runScrape({ pool, source, triggeredBy = null, forecastDate }) {
  if (!['manual', 'cron'].includes(source)) {
    throw new Error(`runScrape: bad source: ${source}`);
  }

  const client = createAgilysysClient();
  // Hoisted so the catch block can use it when reporting the
  // failure snapshot's forecast_date. Filled in by the try block
  // once we've resolved rGuest's propertyDate.
  let effectiveDate = null;
  try {
    const config  = await loadConfig(pool);
    const mapping = await loadMapping(pool);

    // Sprint 17.14 — pass the (possibly null) requested date to
    // the client. If null, the client resolves the date from
    // rGuest's propertyDate (the property's business day) so our
    // forecastDate matches whatever rGuest's dashboard widgets
    // are operating on. `todayInLA()` is the last-resort fallback
    // only used when both requested date AND propertyDate fail.
    const inputs = await client.fetchForecastInputs(forecastDate || null);
    effectiveDate = inputs.effectiveDate || forecastDate || todayInLA();

    const payload = computeForecast({
      rooms:           inputs.rooms,
      roomTypes:       inputs.roomTypes,
      reservations:    inputs.reservations,
      metrics:         inputs.metrics,
      vipStatuses:     inputs.vipStatuses,  // 18.3 — label resolution
      ratePlans:       inputs.ratePlans,    // 18.9 — channel/rate name resolution
      roomTypeMapping: mapping,
      config,
      forecastDate:    effectiveDate,
    });

    const inserted = await upsertNewMappings(pool, payload.newMappings);

    const hash   = hashPayload(payload);
    const window = Number(config.dedup_window_minutes) || 60;
    const existing = await findDedupSnapshot(pool, hash, window);

    if (existing) {
      client.getLogs(); // drain — we don't store these, the existing snapshot already has its own
      return { ...existing, deduped: true, newMappingsInserted: inserted };
    }

    const recordsProcessed =
      (inputs.rooms        ? inputs.rooms.length        : 0) +
      (inputs.roomTypes    ? inputs.roomTypes.length    : 0) +
      (inputs.reservations ? inputs.reservations.length : 0);

    const snapshot = await insertSnapshot(pool, {
      forecast_date:     effectiveDate,
      source,
      triggered_by:      triggeredBy,
      status:            'success',
      records_processed: recordsProcessed,
      payload,
      payload_hash:      hash,
      logs:              client.getLogs(),
      error_message:     null,
    });

    // Sprint 18.5 — upsert per-reservation rows into the new
    // long-lived `reservation_history` table. Best-effort: if it
    // fails the snapshot still counts as a success (the bulk
    // payload survives in forecast_snapshot.payload as fallback).
    const historyLogs = [];
    const upserted = await upsertReservationHistory(
      pool, payload.reservations, snapshot.snapshot_id, historyLogs,
    );
    if (historyLogs.length) {
      // Surface batch failures in the snapshot's logs so the admin
      // history view shows them.
      await pool.query(
        `UPDATE forecast_snapshot
            SET logs = logs || $1::jsonb
          WHERE snapshot_id = $2`,
        [JSON.stringify(historyLogs), snapshot.snapshot_id],
      ).catch(() => { /* if even the log-merge fails, just drop */ });
    }

    return {
      ...snapshot,
      deduped: false,
      newMappingsInserted: inserted,
      historyUpserted: upserted,
    };
  } catch (err) {
    // Log the failure as a snapshot row so it surfaces in the admin
    // history. The original error is re-thrown so the route handler
    // can also return a 500.
    const logs = client.getLogs();
    logs.push({
      at:      new Date().toISOString(),
      level:   'error',
      message: 'scrape.failed',
      context: { error: err.message, stack: (err.stack || '').split('\n').slice(0, 5).join('\n') },
    });
    // Best-effort date for the failure record. Use whatever was
    // resolved before the throw; fall back to forecastDate, then
    // local clock, so the row at least has a non-null
    // forecast_date.
    const failureDate = effectiveDate || forecastDate || todayInLA();
    const emptyPayload = { forecastDate: failureDate, error: err.message };
    await insertSnapshot(pool, {
      forecast_date:     failureDate,
      source,
      triggered_by:      triggeredBy,
      status:            'failed',
      records_processed: 0,
      payload:           emptyPayload,
      payload_hash:      hashPayload(emptyPayload),
      logs,
      error_message:     err.message,
    }).catch(insertErr => {
      // If even the failure-record insert fails (DB down?), just log
      // — we already have the original error to throw.
      console.error('[forecast.runScrape] failed to record failure:', insertErr);
    });
    throw err;
  }
}

module.exports = {
  runScrape,
  todayInLA,
  hashPayload,
};
