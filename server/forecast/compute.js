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

// Sprint 17.7: rGuest reservation status enum (confirmed from real
// scrape data — see scraper/recon/20260604-141754/requests.jsonl).
//   RES — Reserved / arriving today, not yet checked in
//   INH — In house (checked in, currently in the property)
//   DPT — Departed (already checked out)
//   CXL — Cancelled         ← MUST exclude from all counts
//   NS  — No-show           ← MUST exclude
//   NSG — No-Show (Guaranteed) ← MUST exclude
//   MOV — Moved             ← MUST exclude (duplicates the row)
const EXCLUDED_STATUSES = new Set(['CXL', 'NS', 'NSG', 'MOV']);

// Display label for a status code, taking pre-assignment into
// account. The mockup distinguishes a 'Confirmed' arriving guest
// (room pre-assigned, deposit good) from a 'Pending' one (no
// room picked yet). We approximate that by RES + has roomId.
function statusLabel(rawStatus, hasRoom) {
  if (rawStatus === 'INH') return 'In house';
  if (rawStatus === 'DPT') return 'Departed';
  if (rawStatus === 'RES') return hasRoom ? 'Confirmed' : 'Pending';
  if (rawStatus === 'CXL') return 'Cancelled';
  if (rawStatus === 'NS')  return 'No-show';
  if (rawStatus === 'NSG') return 'No-show (G)';
  if (rawStatus === 'MOV') return 'Moved';
  return rawStatus || '—';
}


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
//
// Sprint 17.7: returns a multi-flag object instead of a single
// kind, because a single reservation can be both an arrival AND a
// departure (day-use), or both an arrival AND in-house (already
// checked in for today's stay). The previous single-kind classifier
// double-counted day-uses and under-counted in-house guests.
//
// Returns null if the reservation should not appear in any count
// (cancelled, no-show, moved, or doesn't actually intersect the
// forecast date).
function classifyForDate(reservation, forecastDate) {
  if (EXCLUDED_STATUSES.has(reservation.status)) return null;
  const arr = isoDate(reservation, 'arrivalDate');
  const dep = isoDate(reservation, 'departureDate');
  if (!arr || !dep) return null;
  const status = reservation.status;
  // Sprint 18.1 — `isFuture` includes RES (not-yet-arrived) bookings
  // beyond today. The new Reservations page's "Future" filter chip
  // surfaces them; the existing today-relevant KPIs ignore the flag
  // (arrivesToday/etc. are mutually exclusive with isFuture by date
  // comparison).
  const isFuture = arr > forecastDate && status === 'RES';
  const meta = {
    arrivesToday:  arr === forecastDate,
    departsToday:  dep === forecastDate,
    isStayover:    arr < forecastDate && dep > forecastDate && status === 'INH',
    isInHouse:     status === 'INH',
    isFuture,
    hasRoom:       !!(reservation.roomId || reservation.roomNumber),
  };
  // A reservation that touches the date in no way (e.g. an INH from
  // earlier this week that's already past departure but somehow
  // surfaced in the search) gets dropped so it doesn't pollute the
  // in-house count. `isFuture` is its own pass-through path.
  const touchesDay = meta.arrivesToday || meta.departsToday || meta.isStayover ||
    (status === 'INH' && arr <= forecastDate && dep >= forecastDate);
  if (!touchesDay && !isFuture) return null;
  return meta;
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

// Full guest name "First Last" — for the per-reservation list in
// 17.8's revised UI.
function fullGuestName(reservation) {
  const g = reservation.primaryGuestInfo || {};
  const first = (g.firstName || '').trim();
  const last  = (g.lastName  || '').trim();
  return [first, last].filter(Boolean).join(' ');
}

// Whole-day count from arrival to departure. Min 0.
function nightsBetween(arr, dep) {
  if (!arr || !dep) return 0;
  const a = new Date(`${arr}T00:00:00`);
  const d = new Date(`${dep}T00:00:00`);
  const n = Math.round((d - a) / 86400000);
  return n > 0 ? n : 0;
}

// Sprint 17.7: resolve a reservation's room type to a `typeCode`.
// rGuest stores `reservation.roomType` as a UUID string pointing at
// the /config/roomTypes record (not an embedded object). Earlier
// guesses assumed `.typeCode` on the field directly and silently
// returned null — that's why baseLabel was missing on every
// reservation in 17.x. The fallback handles a possible object
// shape too in case rGuest ever changes their mind.
function resolveReservationTypeCode(reservation, roomTypeById) {
  const ref = reservation.roomType;
  if (!ref) return null;
  if (typeof ref === 'string') {
    const rt = roomTypeById.get(ref);
    return rt ? rt.typeCode : null;
  }
  if (typeof ref === 'object') {
    return ref.typeCode || ref.code || null;
  }
  return null;
}

// Picks the cleaning category for a room on the forecast date.
//   checkoutClean   — room had a guest depart today; needs full turn
//   stayoverService — room has a guest still in-house today
//   none            — nothing scheduled (vacant or arrival-only)
//
// Sprint 17.7: uses the multi-flag classifier output (`_meta`)
// instead of the old exclusive `_kind` string.
function actionForRoom(room, classifiedResn) {
  const reservations = classifiedResn.filter(r => r.roomId === room.id || r.roomNumber === room.roomNumber);
  if (reservations.some(r => r._meta.departsToday)) return 'checkoutClean';
  if (reservations.some(r => r._meta.isStayover))   return 'stayoverService';
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
function computeForecast({ rooms, roomTypes, reservations, metrics, vipStatuses, roomTypeMapping, config, forecastDate }) {
  if (!forecastDate) throw new Error('computeForecast: forecastDate required');

  // 1. Build lookups.
  const roomTypeById  = new Map(roomTypes.map(rt => [rt.id, rt]));
  const mappingByCode = new Map((roomTypeMapping || []).map(m => [m.type_code, m]));

  // 2. Classify reservations for the forecast date. Multi-flag
  //    model (Sprint 17.7) — a reservation can be both an arrival
  //    AND in-house, or both an arrival AND a departure (day-use).
  //    `_meta = null` means filtered out (CXL / NS / NSG / MOV, or
  //    the reservation doesn't actually intersect today).
  const classifiedResn = reservations
    .map(r => ({ ...r, _meta: classifyForDate(r, forecastDate) }))
    .filter(r => r._meta !== null);

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

  // 4. KPI counters.
  //
  // Sprint 17.7.2: arrivals / departures / totalGuests come
  // straight from rGuest's `reservationMetrics` endpoint when
  // available — that's the authoritative source feeding their FD
  // dashboard widgets (and what the property manager sees). Our
  // /search/date-derived counts kept being off by ~5 because
  // rGuest's UI counts differently than "arrivalDate === today"
  // for some INH cases (modified stays, etc. — we can't tell from
  // the raw data which 5 they exclude).
  //
  // Stayovers + inHouse stay computed locally — rGuest's metrics
  // doesn't expose those directly. They're approximate but
  // useful.
  //
  // If `metrics` is missing (e.g. the endpoint changed), fall back
  // to the multi-flag derived counts so the forecast still
  // populates rather than crashing.
  const fromMetrics = metrics && typeof metrics === 'object';
  const productivity = Number(config.productivity_target) || 6;
  const derivedArrivals   = classifiedResn.filter(r => r._meta.arrivesToday).length;
  const derivedDepartures = classifiedResn.filter(r => r._meta.departsToday).length;
  const derivedStayovers  = classifiedResn.filter(r => r._meta.isStayover).length;
  const derivedInHouse    = classifiedResn.filter(r => r._meta.isInHouse).length;
  const derivedRemainingArrivals = classifiedResn
    .filter(r => r._meta.arrivesToday && r.status === 'RES').length;

  const arrivalsAuth   = fromMetrics ? metrics.remainingArrivalsSummary?.total       : null;
  const arrivalsRem    = fromMetrics ? metrics.remainingArrivalsSummary?.remaining   : null;
  const departuresAuth = fromMetrics ? metrics.remainingDeparturesSummary?.total     : null;
  const departuresRem  = fromMetrics ? metrics.remainingDeparturesSummary?.remaining : null;
  const totalGuests    = fromMetrics ? metrics.totalGuestsSummary?.total             : null;

  const kpis = {
    arrivals:           arrivalsAuth   != null ? arrivalsAuth   : derivedArrivals,
    departures:         departuresAuth != null ? departuresAuth : derivedDepartures,
    stayovers:          derivedStayovers,
    inHouse:            derivedInHouse,
    remainingArrivals:  arrivalsRem    != null ? arrivalsRem    : derivedRemainingArrivals,
    remainingDepartures: departuresRem != null ? departuresRem  : null,
    totalGuests:        totalGuests != null    ? totalGuests    : null,
  };
  kpis.roomsToCleanToday  = kpis.departures + kpis.stayovers;
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
    const departingResn = myResns.find(r => r._meta.departsToday);
    const stayoverResn  = myResns.find(r => r._meta.isStayover);
    const arrivingResn  = myResns.find(r => r._meta.arrivesToday);
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
  // Sprint 17.7: multi-flag — same reservation can bump multiple
  // counters (day-use adds arrival + departure; INH with arrival
  // today adds arrival + an implicit inHouse). Also fixes the
  // longstanding "everything bucketed as Other" bug:
  // r.roomType is a UUID string, not an object — resolve via
  // roomTypeById.
  for (const r of classifiedResn) {
    const rtCode = resolveReservationTypeCode(r, roomTypeById);
    const mapping = rtCode ? mappingByCode.get(rtCode) : null;
    const baseCode  = mapping ? mapping.base_code  : null;
    const baseLabel = mapping ? mapping.base_label : null;
    const row = bucketFor(baseCode, baseLabel);
    if (r._meta.arrivesToday) row.arrivals++;
    if (r._meta.departsToday) row.departures++;
    if (r._meta.isStayover)   row.stayovers++;
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

  // Sprint 18.3 — index rooms by id so we can resolve floor (for
  // "high floor" flag derivation), and build a VIP-statuses lookup
  // for label resolution. `vipStatuses` is the catalog from rGuest;
  // each entry typically has { id, name, … }.
  const roomById = new Map();
  for (const room of rooms || []) {
    if (room.id) roomById.set(room.id, room);
  }
  const vipById = new Map();
  if (Array.isArray(vipStatuses)) {
    for (const v of vipStatuses) {
      if (v && v.id) vipById.set(v.id, v);
    }
  }
  // Snoqualmie tops out at floor 4. "High floor" = 3 and above
  // matches the FD's working definition (upper floors with the
  // better views). Configurable later if needed.
  const HIGH_FLOOR_THRESHOLD = 3;
  function isHighFloor(floorId) {
    if (!floorId) return false;
    const n = parseInt(floorId, 10);
    return Number.isFinite(n) && n >= HIGH_FLOOR_THRESHOLD;
  }

  // 10. Per-reservation array (Sprint 17.7) — the 17.8 UI renders
  //     guest-by-guest cards from this. Includes pre-assignment
  //     flag (`isPreAssigned`), normalized status label, kind tag
  //     for tab filtering, and a guessed source from ratePlanCode.
  //     Sprint 18.3 — adds VIP label, high-floor + pet-friendly +
  //     group flags, and the resolved floorId for display.
  const reservationsOut = classifiedResn.map(r => {
    const arr = isoDate(r, 'arrivalDate');
    const dep = isoDate(r, 'departureDate');
    const rtCode  = resolveReservationTypeCode(r, roomTypeById);
    const mapping = rtCode ? mappingByCode.get(rtCode) : null;
    const isPreAssigned = !!r.roomId;
    // "Kind" — primary bucket for the filter chips in the new UI.
    // Day-uses end up under 'departure' (they require a checkout
    // clean today). Pure stayovers and pure in-house arrivals get
    // their own tags so the UI can split them.
    let kind = null;
    if (r._meta.departsToday) kind = 'departure';
    else if (r._meta.arrivesToday) kind = 'arrival';
    else if (r._meta.isStayover)   kind = 'stayover';
    else if (r._meta.isInHouse)    kind = 'inhouse';
    // Sprint 18.1 — future RES surface as kind='future' so the
    // Reservations page's "Future" filter chip can match them.
    else if (r._meta.isFuture)     kind = 'future';

    // Sprint 18.3 — derived flags.
    const room = r.roomId ? roomById.get(r.roomId) : null;
    const floorId = room ? (room.floorId || null) : null;
    const vipUuid = r.primaryGuestInfo && r.primaryGuestInfo.vipStatus;
    const vipRow  = vipUuid ? vipById.get(vipUuid) : null;
    const vipLabel = vipRow ? (vipRow.name || vipRow.displayName || vipRow.label || 'VIP') : null;
    const isPetFriendly = typeof rtCode === 'string' && rtCode.endsWith('P');
    const isGroupBooking = !!r.group;

    return {
      id:                r.id,
      confirmationId:    r.confirmationId || null,
      guestName:         fullGuestName(r),
      arrivalDate:       arr,
      departureDate:     dep,
      nights:            nightsBetween(arr, dep),
      roomId:            r.roomId    || null,
      roomNumber:        r.roomNumber || null,
      floorId,
      isPreAssigned,
      typeCode:          rtCode || null,
      baseCode:          mapping ? mapping.base_code  : null,
      baseLabel:         mapping ? mapping.base_label : null,
      subLabel:          mapping ? mapping.sub_label  : null,
      source:            r.ratePlanCode || null,
      status:            r.status || null,
      statusLabel:       statusLabel(r.status, isPreAssigned),
      kind,
      isDayUse:          !!r.dayUse,
      isEarlyArrival:    !!r.earlyArrival,
      isRedEye:          r.redEyeArrival && typeof r.redEyeArrival === 'object'
                           && Object.keys(r.redEyeArrival).length > 0,
      scheduledForRoomMove: !!r.scheduledForRoomMove,
      // Sprint 18.3 derived flags.
      isHighFloor:       isHighFloor(floorId),
      isPetFriendly,
      isGroupBooking,
      vipUuid:           vipUuid || null,
      vipLabel,
    };
  });

  // 11. Scraper output card (matches the mockup's right-rail card).
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
    reservations: reservationsOut, // Sprint 17.7 — for the per-guest UI
    dispatchSummary,
    scraperOutput,
    newMappings, // caller upserts into room_type_mapping
    // Sprint 17.7.2 — raw rGuest metrics surfaced on the payload
    // so the UI can render the "Room Condition" widget directly
    // (matches the dashboard the GM sees in rGuest).
    metricsSnapshot: metrics ? {
      remainingArrivals:   metrics.remainingArrivalsSummary  || null,
      remainingDepartures: metrics.remainingDeparturesSummary || null,
      totalGuests:         metrics.totalGuestsSummary         || null,
      roomConditions:      metrics.roomConditionSummary       || [],
      vips:                metrics.vipsSummary                || null,
      digitalRequests:     metrics.digitalRequestSummary      || null,
    } : null,
    meta: buildDiagnostics({
      rooms, roomTypes, reservations, classifiedResn, forecastDate,
      kpis,
      metrics,
      derived: {
        arrivals:          derivedArrivals,
        departures:        derivedDepartures,
        stayovers:         derivedStayovers,
        inHouse:           derivedInHouse,
        remainingArrivals: derivedRemainingArrivals,
      },
    }),
  };
}

// Sprint 17.7.1: detailed diagnostics so we can spot whether a
// discrepancy with rGuest comes from (a) us under/over-fetching,
// (b) us misclassifying a status, or (c) a date-format edge case.
// Everything in this block lands in forecast_snapshot.payload.meta.
function buildDiagnostics({ rooms, roomTypes, reservations, classifiedResn, forecastDate, kpis, metrics, derived }) {
  // Status histogram across ALL raw reservations (incl. filtered).
  const rawByStatus = {};
  // Status × date relation — for each status, count how arr / dep
  // relate to the forecast date. Catches "ghost departures" or
  // arrivals that don't actually match today.
  const statusDateMatrix = {};
  // Per-status breakdown for the headline buckets.
  const arrivalsByStatus   = {};
  const departuresByStatus = {};
  const stayoversByStatus  = {};
  const inHouseByStatus    = {};
  // Reservations whose room assignment doesn't match any room in
  // the rooms list (departure won't show up in perRoomSheet, so
  // departure KPI vs perRoomSheet may diverge).
  const roomIndex = new Set();
  for (const r of rooms) {
    if (r.id)         roomIndex.add(`id:${r.id}`);
    if (r.roomNumber) roomIndex.add(`num:${r.roomNumber}`);
  }
  let unmatchedDepartures = 0;
  let unmatchedArrivals   = 0;

  const dateRel = (val) => {
    if (!val) return 'missing';
    if (val === forecastDate) return 'today';
    if (val <  forecastDate)  return 'past';
    return 'future';
  };

  for (const r of reservations) {
    const st = r.status || '(none)';
    rawByStatus[st] = (rawByStatus[st] || 0) + 1;
    const arrRel = dateRel(r.arrivalDateLocalDate || (r.arrivalDate || '').slice(0, 10));
    const depRel = dateRel(r.departureDateLocalDate || (r.departureDate || '').slice(0, 10));
    const key = `${st} arr=${arrRel} dep=${depRel}`;
    statusDateMatrix[key] = (statusDateMatrix[key] || 0) + 1;
  }
  for (const r of classifiedResn) {
    const st = r.status || '(none)';
    if (r._meta.arrivesToday) {
      arrivalsByStatus[st] = (arrivalsByStatus[st] || 0) + 1;
      const match = (r.roomId    && roomIndex.has(`id:${r.roomId}`)) ||
                    (r.roomNumber && roomIndex.has(`num:${r.roomNumber}`));
      if (!match) unmatchedArrivals++;
    }
    if (r._meta.departsToday) {
      departuresByStatus[st] = (departuresByStatus[st] || 0) + 1;
      const match = (r.roomId    && roomIndex.has(`id:${r.roomId}`)) ||
                    (r.roomNumber && roomIndex.has(`num:${r.roomNumber}`));
      if (!match) unmatchedDepartures++;
    }
    if (r._meta.isStayover) {
      stayoversByStatus[st] = (stayoversByStatus[st] || 0) + 1;
    }
    if (r._meta.isInHouse) {
      inHouseByStatus[st] = (inHouseByStatus[st] || 0) + 1;
    }
  }

  return {
    roomsCount:           rooms.length,
    roomTypesCount:       roomTypes.length,
    reservationsCount:    reservations.length,
    classifiedCount:      classifiedResn.length,
    excludedCount:        reservations.length - classifiedResn.length,
    rawByStatus,
    statusDateMatrix,
    arrivalsByStatus,
    departuresByStatus,
    stayoversByStatus,
    inHouseByStatus,
    unmatchedArrivals,
    unmatchedDepartures,
    // Sanity-check the KPIs against the breakdown sums — if these
    // ever disagree, the per-bucket counter is wrong.
    consistency: {
      arrivalsSum:   Object.values(arrivalsByStatus).reduce((s, n) => s + n, 0),
      departuresSum: Object.values(departuresByStatus).reduce((s, n) => s + n, 0),
      stayoversSum:  Object.values(stayoversByStatus).reduce((s, n) => s + n, 0),
      inHouseSum:    Object.values(inHouseByStatus).reduce((s, n) => s + n, 0),
      kpis,
    },
    // Sprint 17.7.2 — side-by-side rGuest authoritative numbers vs
    // what we'd derive from /search/date. When these disagree the
    // gap is either rGuest's UI semantics (which we don't know) or
    // a status code we haven't seen.
    kpiSourceComparison: metrics ? {
      arrivalsRGuest:     metrics.remainingArrivalsSummary?.total,
      arrivalsDerived:    derived?.arrivals,
      arrivalsGap:        (metrics.remainingArrivalsSummary?.total ?? null)
                          - (derived?.arrivals ?? null),
      departuresRGuest:   metrics.remainingDeparturesSummary?.total,
      departuresDerived:  derived?.departures,
      departuresGap:      (metrics.remainingDeparturesSummary?.total ?? null)
                          - (derived?.departures ?? null),
      remArrivalsRGuest:  metrics.remainingArrivalsSummary?.remaining,
      remArrivalsDerived: derived?.remainingArrivals,
    } : { note: 'reservationMetrics endpoint did not respond — using derived counts' },
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
