// Sprint 24 — what the front-desk portal (`/api/frontdesk/*`, role `front_desk`) is allowed to read.
//
// The portal's Home shows counts only (tiles + "sellable vs arriving") and its Housekeeping page shares rooms out, so it never
// needs a guest's name, confirmation number or profile id. The room/reservation payload that powers the manager pages carries
// those fields, so every front-desk response goes through `redactPayload` first (least privilege: it is the server, not the
// UI, that withholds them).

// Reservation-level fields that identify a guest.
const GUEST_FIELDS = ['guestName', 'primaryGuestProfileId', 'confirmationId', 'vipUuid', 'vipLabel'];
// Room-level (perRoomSheet / byFloor rows) fields that can carry a guest name.
const ROOM_GUEST_FIELDS = ['guestName', 'guestFirstName', 'guestLastName'];

const strip = (row, fields) => {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const f of fields) delete out[f];
  return out;
};

/** A copy of a forecast payload with every guest identifier removed. Never mutates the cached original. */
function redactPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload };
  if (Array.isArray(out.reservations)) out.reservations = out.reservations.map(r => strip(r, GUEST_FIELDS));
  if (Array.isArray(out.perRoomSheet)) out.perRoomSheet = out.perRoomSheet.map(r => strip(r, ROOM_GUEST_FIELDS));
  if (Array.isArray(out.byFloor)) {
    out.byFloor = out.byFloor.map(f => (f && Array.isArray(f.rooms) ? { ...f, rooms: f.rooms.map(r => strip(r, ROOM_GUEST_FIELDS)) } : f));
  }
  return out;
}

/** The same `{ snapshot: { payload } }` response shape as the manager route, with the payload redacted. */
function redactCurrentResponse(body) {
  if (!body || !body.snapshot) return body;
  return { ...body, snapshot: { ...body.snapshot, payload: redactPayload(body.snapshot.payload) } };
}

// app_settings keys the portal may read (Housekeeping print colours + the late-booking allowance the Forecast model uses).
// An allow-list on purpose: app_settings also holds login-method, overtime and other manager-only configuration.
const SETTINGS_ALLOWED = [
  'hk_print_colors',
  'hk_print_two_sheets',   // Sprint 24.9
  'forecast_allowance_enabled',
  'forecast_allowance_scale_pct',
  'forecast_allowance_min_extra',
];

/** @param {{key:string,value:string}[]} rows */
function pickSettings(rows) {
  const out = {};
  for (const r of rows || []) if (SETTINGS_ALLOWED.includes(r.key)) out[r.key] = r.value;
  return out;
}

module.exports = { redactPayload, redactCurrentResponse, pickSettings, SETTINGS_ALLOWED, GUEST_FIELDS };
