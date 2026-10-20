// Sprint 22.3 — build the Forecast / Reservations payload from the MIRROR (reservation_history) instead of a full rGuest scrape.
// Same shape as forecast_snapshot.payload (it IS computeForecast's output), so the pages need no new model. rGuest calls: property date,
// rooms (live housekeeping status) and reservationMetrics — three small calls instead of ~20 s of reservation paging.
'use strict';
const { computeForecast } = require('../forecast/compute');

const propertyDateOf = (pd) => String(typeof pd === 'string' ? pd : (pd && (pd.propertyDate || pd.date))).slice(0, 10);

/** Open reservations + today's departures, from the mirror, as raw rGuest rows (the typed `status` column is the truth). */
async function loadMirrorReservations(pool, propertyKey, today) {
  const { rows } = await pool.query(
    `SELECT raw, status FROM reservation_history
      WHERE property_id = $1 AND raw IS NOT NULL
        AND ((status IN ('RES','INH') AND departure_date >= $2::date) OR (status = 'DPT' AND departure_date = $2::date))`, [propertyKey, today]);
  return rows.map(r => ({ ...r.raw, status: r.status }));
}

async function buildMirrorPayload({ pool, client, propertyKey, reference }) {
  const today = propertyDateOf(await client.getPropertyDate());
  const [rooms, metrics, reservations, mapping, cfg] = await Promise.all([
    client.listRooms(),
    client.getReservationMetrics(today).catch(() => null),
    loadMirrorReservations(pool, propertyKey, today),
    pool.query('SELECT type_code, type_name, base_code, base_label, sub_suffix, sub_label, admin_override FROM room_type_mapping'),
    pool.query('SELECT productivity_target, avg_min_per_clean, dedup_window_minutes FROM forecast_config WHERE config_id = 1'),
  ]);
  const payload = computeForecast({
    rooms, roomTypes: reference.roomTypes || [], reservations, metrics, vipStatuses: reference.vip || [], ratePlans: reference.ratePlans || [],
    roomTypeMapping: mapping.rows, config: cfg.rows[0] || {}, forecastDate: today,
  });
  payload.source = 'mirror';
  payload.reservationsComplete = true;
  return payload;
}

module.exports = { buildMirrorPayload, loadMirrorReservations, propertyDateOf };
