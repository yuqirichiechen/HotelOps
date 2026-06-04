// Sprint 17.2 — Forecast compute (pure function).
//
// Takes raw output from server/agilysys/client.js + the admin's
// room_type_mapping + forecast_config and returns the snapshot
// payload that gets stored in forecast_snapshot.payload and rendered
// by the Forecast page.
//
// No I/O. No DB calls. Testable. Caller (server.js scrape route)
// handles fetching + persistence; this file is just maths.

'use strict';

// ── Lookup tables (stable enums from rGuest) ────────────────
// Hardcoded here because they're tiny + don't change. If rGuest
// ever adds a new HK status, the worst case is the new code shows
// up unlabelled in the UI — easy to spot, easy to add.

const HK_STATUS_LABELS = {
  D:  'Dirty',
  PU: 'Pickup',
  VI: 'Vacant Inspected',
  IP: 'In Progress',
  C:  'Clean',
};

// The 4 base room buckets the Snoqualmie GM defined. New codes
// with a different 4-char prefix get base_code=null and surface
// in the admin "needs review" list.
const BASE_LABELS = {
  NKRR: 'King Standard',
  NKJZ: 'King Studio',
  NQRR: 'Double Queen Standard',
  NQJZ: 'Double Queen Studio',
};

// Common suffixes seen in Snoqualmie's rGuest. Unrecognized suffixes
// get sub_label='Other' so they're spottable in the admin override
// UI.
const SUB_LABELS = {
  '':  'Standard',
  A:   'Accessible',
  P:   'Pets',
  D:   'Hearing Accessible / ADA Tub',
  G:   'Hearing Accessible',
  B:   'Roll-In',
};


// ── Helpers ────────────────────────────────────────────────

// Pulls a YYYY-MM-DD out of either the LocalDate field (preferred,
// already local) or the ISO timestamp (fallback). rGuest uses both
// shapes inconsistently across endpoints.
function isoDate(reservation, field) {
  const local = reservation[`${field}LocalDate`];
  if (local) return local;
  const iso = reservation[field];
  if (typeof iso === 'string' && iso.length >= 10) return iso.slice(0, 10);
  return null;
}

// Classify a reservation for the forecast date.
//   arrival   — arrives today
//   departure — departs today (and arrived earlier)
//   stayover  — arrived earlier, departs later (in-house today)
//   null      — doesn't affect today
//
// Same-day arrival+departure (rare; a no-show-then-rebook?) counts
// as 'arrival' since the room still gets prepped.
function classifyForDate(reservation, forecastDate) {
  const arr = isoDate(reservation, 'arrivalDate');
  const dep = isoDate(reservation, 'departureDate');
  if (!arr || !dep) return null;
  if (arr === forecastDate) return 'arrival';
  if (dep === forecastDate) return 'departure';
  if (arr < forecastDate && dep > forecastDate) return 'stayover';
  return null;
}

// Derive a room_type_mapping row from a typeCode + optional display
// name (from /config/roomTypes). Used to auto-onboard typeCodes the
// admin hasn't seen yet.
function deriveMapping(typeCode, typeName) {
  if (!typeCode || typeCode.length < 4) {
    return {
      type_code:  typeCode,
      type_name:  typeName || typeCode || '(unknown)',
      base_code:  null,
      base_label: null,
      sub_suffix: '',
      sub_label:  'Other',
    };
  }
  const base   = typeCode.slice(0, 4);
  const suffix = typeCode.slice(4);
  const baseLabel = BASE_LABELS[base] || null;
  // Unknown base → base_code stays null so it surfaces in the
  // admin "needs review" filter.
  return {
    type_code:  typeCode,
    type_name:  typeName || typeCode,
    base_code:  baseLabel ? base : null,
    base_label: baseLabel,
    sub_suffix: suffix,
    sub_label:  SUB_LABELS[suffix] || (suffix ? 'Other' : 'Standard'),
  };
}

// Compress a guest name to "L., F." (last-comma-first-initial) for
// the printable sheet. Pulls from rGuest's primaryGuestInfo shape.
function shortGuestName(reservation) {
  const g = reservation.primaryGuestInfo || {};
  const first = (g.firstName || '').trim();
  const last  = (g.lastName  || '').trim();
  if (!first && !last) return '';
  if (!last) return first;
  if (!first) return last;
  return `${last}, ${first.charAt(0)}.`;
}

// Picks the cleaning category for a room on the forecast date.
//   checkoutClean   — room had a guest depart today; needs full turn
//   stayoverService — room has a guest still in-house today
//   none            — nothing scheduled (vacant or arrival-only)
function actionForRoom(room, classifiedResn) {
  const reservations = classifiedResn.filter(r => r.roomId === room.id || r.roomNumber === room.roomNumber);
  if (reservations.some(r => r._kind === 'departure')) return 'checkoutClean';
  if (reservations.some(r => r._kind === 'stayover'))  return 'stayoverService';
  return 'none';
}

// Floor display label. Snoqualmie's floorId is single-letter or
// two-char (G, 01, 2, 3…); pretty it up for the UI.
function floorLabel(floorId) {
  if (!floorId)        return 'Unknown';
  if (floorId === 'G') return 'Ground Floor';
  // Strip leading zero, single digit → "Floor 2", etc.
  const n = parseInt(floorId, 10);
  if (!Number.isNaN(n)) return `Floor ${n}`;
  return floorId;
}


// ── Main compute ───────────────────────────────────────────

/**
 * @param {Object} input
 * @param {Array}  input.rooms             — from client.listRooms()
 * @param {Array}  input.roomTypes         — from client.listRoomTypes()
 * @param {Array}  input.reservations      — from client.searchAllReservationsByDate()
 * @param {Array}  input.roomTypeMapping   — rows from room_type_mapping table
 * @param {Object} input.config            — row from forecast_config
 * @param {string} input.forecastDate      — YYYY-MM-DD
 * @returns {Object} snapshot payload
 */
function computeForecast({ rooms, roomTypes, reservations, roomTypeMapping, config, forecastDate }) {
  if (!forecastDate) throw new Error('computeForecast: forecastDate required');

  // 1. Build lookups.
  const roomTypeById  = new Map(roomTypes.map(rt => [rt.id, rt]));
  const mappingByCode = new Map((roomTypeMapping || []).map(m => [m.type_code, m]));

  // 2. Classify reservations for the forecast date.
  const classifiedResn = reservations.map(r => ({
    ...r,
    _kind: classifyForDate(r, forecastDate),
  })).filter(r => r._kind !== null);

  // 3. Auto-onboard new typeCodes — anything in roomTypes the admin
  //    hasn't mapped yet. The endpoint upserts these into
  //    room_type_mapping unless admin_override pins the existing row.
  const newMappings = [];
  for (const rt of roomTypes) {
    if (!mappingByCode.has(rt.typeCode)) {
      const derived = deriveMapping(rt.typeCode, rt.name);
      newMappings.push(derived);
      mappingByCode.set(rt.typeCode, derived);
    }
  }

  // 4. KPI counters (top of the page).
  const kpis = {
    arrivals:   classifiedResn.filter(r => r._kind === 'arrival').length,
    departures: classifiedResn.filter(r => r._kind === 'departure').length,
    stayovers:  classifiedResn.filter(r => r._kind === 'stayover').length,
  };
  kpis.roomsToCleanToday = kpis.departures + kpis.stayovers;
  const productivity     = Number(config.productivity_target) || 6;
  kpis.housekeepersNeeded = Math.ceil(kpis.roomsToCleanToday / productivity);

  // 5. Per-room sheet. One row per physical room, with the action
  //    decided for today.
  const avgMin = config.avg_min_per_clean || {};
  const stayoverMin = Number(avgMin.STAYOVER) || 15;
  const defaultMin  = Number(avgMin.DEFAULT)  || 25;

  const perRoomSheet = rooms.map(room => {
    const typeRow  = roomTypeById.get(room.roomTypeId);
    const typeCode = typeRow ? typeRow.typeCode : null;
    const mapping  = typeCode ? mappingByCode.get(typeCode) : null;
    const action   = actionForRoom(room, classifiedResn);

    // Find the reservation that decided this room's action — used
    // to surface checkout date + guest name on the sheet.
    const myResns = classifiedResn.filter(
      r => r.roomId === room.id || r.roomNumber === room.roomNumber,
    );
    const departingResn = myResns.find(r => r._kind === 'departure');
    const stayoverResn  = myResns.find(r => r._kind === 'stayover');
    const arrivingResn  = myResns.find(r => r._kind === 'arrival');
    const relevantResn  = departingResn || stayoverResn || arrivingResn || null;

    return {
      roomNumber:        room.roomNumber,
      floorId:           room.floorId,
      floorLabel:        floorLabel(room.floorId),
      building:          room.building || null,
      typeCode,
      typeName:          typeRow ? typeRow.name : null,
      baseCode:          mapping ? mapping.base_code  : null,
      baseLabel:         mapping ? mapping.base_label : null,
      subSuffix:         mapping ? mapping.sub_suffix : '',
      subLabel:          mapping ? mapping.sub_label  : 'Standard',
      occupancyStatus:   room.currentOccupancyStatus || room.roomInventoryStatus || null,
      hkStatus:          room.housekeepingRoomStatus  || null,
      hkStatusLabel:     HK_STATUS_LABELS[room.housekeepingRoomStatus] || room.housekeepingRoomStatus || null,
      action,
      checkoutDate:      departingResn ? isoDate(departingResn, 'departureDate') : null,
      arrivalDate:       arrivingResn  ? isoDate(arrivingResn,  'arrivalDate')  : null,
      guestName:         relevantResn  ? shortGuestName(relevantResn)            : '',
      reservationId:     relevantResn  ? relevantResn.id                         : null,
    };
  });

  // 6. By cleaning type — donut + table mode.
  const checkoutCleanCount   = perRoomSheet.filter(r => r.action === 'checkoutClean').length;
  const stayoverServiceCount = perRoomSheet.filter(r => r.action === 'stayoverService').length;
  const byCleaningType = [
    {
      key:                'checkoutClean',
      name:               'Check-out Cleans',
      roomsNeeded:        checkoutCleanCount,
      avgMinPerRoom:      defaultMin,
      housekeepersNeeded: Math.ceil(checkoutCleanCount / productivity),
    },
    {
      key:                'stayoverService',
      name:               'Stayover Service',
      roomsNeeded:        stayoverServiceCount,
      avgMinPerRoom:      stayoverMin,
      housekeepersNeeded: Math.ceil(stayoverServiceCount / productivity),
    },
  ];

  // 7. By room type — group by base bucket, count arrivals /
  //    departures / stayovers / cleaning needs per bucket.
  const buckets = new Map(); // baseCode → row
  function bucketFor(baseCode, baseLabel) {
    const key = baseCode || '__OTHER__';
    if (!buckets.has(key)) {
      buckets.set(key, {
        baseCode:           baseCode || null,
        baseLabel:          baseLabel || 'Other',
        arrivals:           0,
        departures:         0,
        stayovers:          0,
        checkoutCleans:     0,
        stayoverService:    0,
        avgMinPerRoom:      Number(avgMin[baseCode]) || defaultMin,
        roomsNeeded:        0,
        housekeepersNeeded: 0,
      });
    }
    return buckets.get(key);
  }

  // First, walk reservations for arrivals/departures/stayovers counts.
  for (const r of classifiedResn) {
    const rtCode = r.roomType && (r.roomType.typeCode || r.roomType.code);
    const mapping = rtCode ? mappingByCode.get(rtCode) : null;
    const baseCode  = mapping ? mapping.base_code  : null;
    const baseLabel = mapping ? mapping.base_label : null;
    const row = bucketFor(baseCode, baseLabel);
    if (r._kind === 'arrival')   row.arrivals++;
    if (r._kind === 'departure') row.departures++;
    if (r._kind === 'stayover')  row.stayovers++;
  }
  // Then derive rooms-needed from per-room sheet (more accurate
  // than reservation-side counts because it reflects actual room
  // assignments).
  for (const sheetRow of perRoomSheet) {
    if (sheetRow.action === 'none') continue;
    const row = bucketFor(sheetRow.baseCode, sheetRow.baseLabel);
    if (sheetRow.action === 'checkoutClean')   row.checkoutCleans++;
    if (sheetRow.action === 'stayoverService') row.stayoverService++;
  }
  for (const row of buckets.values()) {
    row.roomsNeeded        = row.checkoutCleans + row.stayoverService;
    row.housekeepersNeeded = Math.ceil(row.roomsNeeded / productivity);
  }
  const byRoomType = [...buckets.values()].sort((a, b) =>
    (a.baseLabel || '').localeCompare(b.baseLabel || ''),
  );

  // 8. By floor — what the housekeepers actually walk to.
  const floors = new Map(); // floorId → row
  for (const sheetRow of perRoomSheet) {
    const key = sheetRow.floorId || 'unknown';
    if (!floors.has(key)) {
      floors.set(key, {
        floorId:         sheetRow.floorId,
        floorLabel:      sheetRow.floorLabel,
        totalRooms:      0,
        roomsToClean:    0,
        checkoutCleans:  0,
        stayoverService: 0,
        rooms:           [], // every room on this floor for the printable sheet
      });
    }
    const row = floors.get(key);
    row.totalRooms++;
    if (sheetRow.action === 'checkoutClean')   { row.roomsToClean++; row.checkoutCleans++; }
    if (sheetRow.action === 'stayoverService') { row.roomsToClean++; row.stayoverService++; }
    row.rooms.push(sheetRow);
  }
  // Stable floor order: G first, then numeric ascending.
  const byFloor = [...floors.values()].sort((a, b) => {
    if (a.floorId === 'G') return -1;
    if (b.floorId === 'G') return 1;
    const na = parseInt(a.floorId, 10);
    const nb = parseInt(b.floorId, 10);
    if (Number.isNaN(na) && Number.isNaN(nb)) return (a.floorId || '').localeCompare(b.floorId || '');
    if (Number.isNaN(na)) return 1;
    if (Number.isNaN(nb)) return -1;
    return na - nb;
  });

  // 9. Dispatch summary card.
  const dispatchSummary = {
    totalRoomsToService: kpis.roomsToCleanToday,
    productivityTarget:  productivity,
    housekeepersNeeded:  kpis.housekeepersNeeded,
  };

  // 10. Scraper output card (matches the mockup's right-rail card).
  const scraperOutput = {
    source:           'Agilysys rGuest Stay',
    dataWindow:       forecastDate,
    recordsProcessed: rooms.length + roomTypes.length + reservations.length,
  };

  return {
    forecastDate,
    generatedAt: new Date().toISOString(),
    kpis,
    byCleaningType,
    byRoomType,
    byFloor,
    perRoomSheet,
    dispatchSummary,
    scraperOutput,
    newMappings, // caller upserts into room_type_mapping
    meta: {
      roomsCount:        rooms.length,
      roomTypesCount:    roomTypes.length,
      reservationsCount: reservations.length,
      classifiedCount:   classifiedResn.length,
    },
  };
}

module.exports = {
  computeForecast,
  // Exported for tests / re-use.
  deriveMapping,
  classifyForDate,
  floorLabel,
  HK_STATUS_LABELS,
  BASE_LABELS,
  SUB_LABELS,
};
