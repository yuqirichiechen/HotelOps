// Sprint 22 — turn a raw rGuest reservation list row into the typed mirror row (+ a change-detection fingerprint).
// PURE. Reuses the forecast compute helpers so the mirror and the forecast agree on type codes / names / flags.
'use strict';
const crypto = require('crypto');
const { resolveReservationTypeCode, fullGuestName, nightsBetween, isoDate, statusLabel, deriveMapping } = require('../forecast/compute');

// The list-level fields whose change means "this reservation changed". (Deliberately NOT date-relative things such as kind.)
const FP_FIELDS = ['status', 'arrival_date', 'departure_date', 'room_number', 'type_code', 'nights', 'rate_plan_code',
  'guest_name', 'vip_uuid', 'is_day_use', 'scheduled_for_room_move', 'confirmation_id'];

const fingerprintOf = (vals) => crypto.createHash('sha256').update(JSON.stringify(FP_FIELDS.map(k => (vals[k] === undefined ? null : vals[k])))).digest('hex');
const pickFp = (row) => Object.fromEntries(FP_FIELDS.map(k => [k, row[k] === undefined ? null : row[k]]));

/**
 * @param {object} r    raw list row (search/date result)
 * @param {object} ctx  { roomTypeById, roomById, ratePlanByCode, vipById, mappingByCode } (Maps; any may be empty)
 */
function normalizeRow(r, ctx, { storeRaw = true } = {}) {
  const arr = isoDate(r, 'arrivalDate'), dep = isoDate(r, 'departureDate');
  const typeCode = resolveReservationTypeCode(r, ctx.roomTypeById || new Map());
  const mapping = typeCode ? ((ctx.mappingByCode && ctx.mappingByCode.get(typeCode)) || deriveMapping(typeCode, null)) : null;
  const room = r.roomId && ctx.roomById ? ctx.roomById.get(r.roomId) : null;
  const vipUuid = (r.primaryGuestInfo && r.primaryGuestInfo.vipStatus) || null;
  const vip = vipUuid && ctx.vipById ? ctx.vipById.get(vipUuid) : null;
  const plan = r.ratePlanCode && ctx.ratePlanByCode ? ctx.ratePlanByCode.get(r.ratePlanCode) : null;
  const floorId = room ? (room.floorId || null) : null;
  const floorN = parseInt(floorId, 10);
  const row = {
    reservation_id: r.id,
    confirmation_id: r.confirmationId || null,
    guest_name: fullGuestName(r) || null,
    primary_guest_profile_id: r.primaryGuestProfileId || null,
    arrival_date: arr, departure_date: dep, nights: nightsBetween(arr, dep),
    room_id: r.roomId || null, room_number: r.roomNumber ? String(r.roomNumber) : null, floor_id: floorId,
    type_code: typeCode || null,
    base_code: mapping ? mapping.base_code : null, base_label: mapping ? mapping.base_label : null, sub_label: mapping ? mapping.sub_label : null,
    rate_plan_code: r.ratePlanCode || null,
    source: (plan && plan.name) || r.ratePlanCode || null,
    status: r.status || null, status_label: statusLabel(r.status, !!r.roomId),
    vip_uuid: vipUuid, vip_label: vip ? (vip.name || vip.displayName || vip.label || 'VIP') : null,
    is_pre_assigned: !!r.roomId,
    is_pet_friendly: typeof typeCode === 'string' && typeCode.endsWith('P'),
    is_group_booking: !!r.group,
    is_early_arrival: !!r.earlyArrival,
    is_red_eye: !!(r.redEyeArrival && typeof r.redEyeArrival === 'object' && Object.keys(r.redEyeArrival).length),
    is_day_use: !!r.dayUse,
    is_high_floor: Number.isFinite(floorN) && floorN >= 3,
    scheduled_for_room_move: !!r.scheduledForRoomMove,
    raw: storeRaw ? r : null,
  };
  row.fingerprint = fingerprintOf(row);
  return row;
}

module.exports = { FP_FIELDS, fingerprintOf, pickFp, normalizeRow };
