// Room forecast model (Sprint 21, revised 21.3 after user review). PURE (no React / I/O) — unit-tested.
//
// TWO DIFFERENT QUESTIONS, deliberately kept apart:
//
// 1) TODAY — "do we still have rooms to SELL today?"  (If a room type runs out, the front desk closes that
//    type on SiteMinder for OTA / website bookings.)  This depends on what housekeeping has cleaned and the
//    front desk has inspected RIGHT NOW, so it uses LIVE room conditions:
//        VI  Vacant Inspected   cleaned AND inspected        → sellable
//        PU  Pickup             cleaned, NOT yet inspected   → sellable once inspected (counted, shown separately)
//        D / IP  dirty / in progress                         → not sellable yet
//    per room type:  leftNow       = (VI + PU) − arriving          (arriving = guests still to check in)
//                    leftPotential = (VI + PU + dirty + still-departing) − arriving
//    status:  open   leftNow > 0
//             tight  leftNow ≤ 0 but leftPotential > 0   (rooms exist, not clean yet — clean/inspect first)
//             full   leftPotential = 0                    (nothing left to sell → consider closing on SiteMinder)
//             short  leftPotential < 0                    (oversold)
//    Substitutability (17.12): a booking of the generic base type (NKRR) can take any subtype room (NKRRA/NKRRP…);
//    a subtype booking needs that subtype → per-variant rows AND group totals (the group is the operational truth).
//
// 2) DAYS 2–14 — "how many rooms will housekeeping need to turn?"  Whether rooms will be sellable that day depends
//    on that day's cleaning/inspection, which nobody can know in advance — so NO short/surplus judgement is made
//    for future days. Only the workload per room type: arriving (rooms that must be ready), departing (full
//    cleans), staying over (service), and occupancy.
//
// Rooms excluded everywhere: out of order / off the market / on hold / blocked / unavailable, and deactivated
// room records (server filters those; see compute.isActiveRoom).

export const UNSELLABLE_INVENTORY = ['OOO', 'OTM', 'HOLD'];
const KNOWN_ORDER = ['NKRR', 'NKJZ', 'NQRR', 'NQJZ'];

export const isSellable = (room) =>
  !!room && !room.blocked && !UNSELLABLE_INVENTORY.includes(room.inventoryStatus) && room.occupancyStatus !== 'NA';

// Mirrors server compute.isActiveRoom — live rooms carry their start/end dates.
export function isActiveRoom(room, ymd) {
  if (!room || room.isDeleted === true || room.status === false) return false;
  const day = (v) => (v ? String(v).slice(0, 10) : null);
  const start = day(room.startDate || room.effectiveDate), end = day(room.endDate || room.deactivateDate);
  if (start && start > ymd) return false;
  if (end && end < ymd) return false;
  return true;
}

export const addDays = (ymd, n) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(String(b).slice(0, 10)) - Date.parse(String(a).slice(0, 10))) / 86400000);
const baseOf = (code) => (code && code.length >= 4 ? code.slice(0, 4) : '__OTHER__');
const sum = (list, k) => list.reduce((s, r) => s + (r[k] || 0), 0);

/** @returns {{status:'open'|'tight'|'full'|'short', leftNow:number, leftPotential:number}} */
export function classifyToday(ready, dirty, freeing, arriving) {
  const leftNow = ready - arriving;
  const leftPotential = ready + dirty + freeing - arriving;
  const status = leftNow > 0 ? 'open' : leftPotential > 0 ? 'tight' : leftPotential === 0 ? 'full' : 'short';
  return { status, leftNow, leftPotential };
}

/**
 * @param {Object} payload  forecast_snapshot.payload (reservations as of the last scrape)
 * @param {string} dateYmd  target date (defaults to the property's today)
 * @param {Object} [live]   GET /api/admin/forecast/live → { rooms, remainingArrivals, stillDeparting, arrivalsToday, departedToday }
 *                          When given and the date is today, today's board is built from LIVE data.
 */
export function buildDayModel(payload, dateYmd, live) {
  const today = (live && live.forecastDate) || (payload && payload.forecastDate) || dateYmd;
  const D = dateYmd || today;
  const offset = daysBetween(today, D);
  const isToday = offset === 0;
  const useLive = !!(isToday && live && Array.isArray(live.rooms));
  const windowDays = Number(payload && payload.futureWindowDays) || 30;
  const snapRooms = (payload && payload.perRoomSheet) || [];
  const resns = (payload && payload.reservations) || [];

  // labels per typeCode (snapshot rooms/reservations carry the mapping-derived labels)
  const labels = new Map();
  const note = (o) => {
    const code = o && o.typeCode; if (!code || labels.has(code)) return;
    labels.set(code, { baseCode: o.baseCode || baseOf(code), baseLabel: o.baseLabel || code, subLabel: o.subLabel || 'Standard', subSuffix: code.length > 4 ? code.slice(4) : '' });
  };
  snapRooms.forEach(note); resns.forEach(note);

  // rooms: live (today) or the snapshot's (other days / live unavailable); never deactivated ones
  const inactive = new Set(((payload && payload.inactiveRooms) || []).map(String));
  const rooms = (useLive ? live.rooms.filter(r => isActiveRoom(r, today)) : snapRooms)
    .filter(r => !inactive.has(String(r.roomNumber)));
  rooms.forEach(note);

  const roomByNumber = new Map(rooms.filter(r => r.roomNumber != null).map(r => [String(r.roomNumber), r]));
  const typeOfRoomNumber = (n, fallback) => { const r = n != null ? roomByNumber.get(String(n)) : null; return (r && r.typeCode) || fallback || null; };

  const V = new Map();
  const v = (code) => {
    if (!V.has(code)) V.set(code, { typeCode: code, totalRooms: 0, unsellable: 0, inspected: 0, awaiting: 0, dirty: 0, freeing: 0, occupied: 0, arrivals: 0, departures: 0 });
    return V.get(code);
  };
  const dirtyRooms = [], awaitingRooms = [];

  for (const r of rooms) {
    if (!r.typeCode) continue;
    const x = v(r.typeCode); x.totalRooms += 1;
    if (!isSellable(r)) { x.unsellable += 1; continue; }
    if (isToday && r.occupancyStatus === 'VAC') {
      if (r.hkStatus === 'VI') x.inspected += 1;
      else if (r.hkStatus === 'PU') { x.awaiting += 1; awaitingRooms.push(r); }
      else { x.dirty += 1; dirtyRooms.push(r); }
    }
  }

  // ── demand / movements ──
  let arrivalsAll = 0, departuresAll = 0, stayoversAll = 0;
  if (useLive) {
    for (const a of live.remainingArrivals || []) { const code = a.typeCode || null; if (code) v(code).arrivals += 1; }
    for (const d of live.stillDeparting || []) { const code = typeOfRoomNumber(d.roomNumber, d.typeCode); if (code) { v(code).freeing += 1; v(code).departures += 1; } }
    arrivalsAll = Number.isFinite(live.arrivalsToday) ? live.arrivalsToday : (live.remainingArrivals || []).length;
    departuresAll = (live.stillDeparting || []).length + (Number.isFinite(live.departedToday) ? live.departedToday : 0);
    // staying over tonight = rooms occupied now that are not departing today
    const occNow = rooms.filter(r => r.occupancyStatus === 'OCC').length;
    stayoversAll = Math.max(0, occNow - (live.stillDeparting || []).length - Math.max(0, arrivalsAll - (live.remainingArrivals || []).length));
    // occupied-now rooms by type minus those leaving today = occupied tonight by type (stayovers + checked-in arrivals)
    for (const r of rooms) { if (r.typeCode && r.occupancyStatus === 'OCC') v(r.typeCode).occupied += 1; }
    for (const d of live.stillDeparting || []) { const code = typeOfRoomNumber(d.roomNumber, d.typeCode); if (code) v(code).occupied = Math.max(0, v(code).occupied - 1); }
  } else {
    const seen = new Set();
    for (const r of resns) {
      if (r.id) { if (seen.has(r.id)) continue; seen.add(r.id); }
      if (r.status === 'DPT' && isToday && r.departureDate === D) { departuresAll += 1; continue; }
      if (r.status !== 'RES' && r.status !== 'INH') continue;
      const arr = r.arrivalDate, dep = r.departureDate;
      if (!arr || !dep || dep <= arr) continue;
      const roomType = typeOfRoomNumber(r.roomNumber, r.typeCode);
      const booked = r.typeCode || roomType;
      if (arr === D && (r.status === 'RES' || !isToday)) { if (booked) v(booked).arrivals += 1; arrivalsAll += 1; }
      else if (arr === D && isToday && r.status === 'INH') arrivalsAll += 1;
      if (dep === D) { departuresAll += 1; if (roomType) v(roomType).departures += 1; if (isToday && r.status === 'INH' && roomType) v(roomType).freeing += 1; }
      if (arr < D && dep > D) { stayoversAll += 1; if (roomType) v(roomType).occupied += 1; }
    }
  }

  // ── variants ──
  const variants = [];
  for (const [code, x] of V) {
    const meta = labels.get(code) || { baseCode: baseOf(code), baseLabel: code, subLabel: 'Standard', subSuffix: code.length > 4 ? code.slice(4) : '' };
    const row = { ...meta, typeCode: code, ...x, sellable: x.totalRooms - x.unsellable };
    row.ready = x.inspected + x.awaiting;
    if (isToday) Object.assign(row, classifyToday(row.ready, x.dirty, x.freeing, x.arrivals));
    else row.toService = x.departures + x.occupied;     // full cleans + stayover service
    variants.push(row);
  }

  // ── groups ──
  const gm = new Map();
  for (const row of variants) {
    const key = row.baseCode || '__OTHER__';
    if (!gm.has(key)) gm.set(key, { baseCode: row.baseCode, baseLabel: row.baseLabel, variants: [] });
    gm.get(key).variants.push(row);
  }
  for (const g of gm.values()) {
    const vs = g.variants;
    const t = { totalRooms: sum(vs, 'totalRooms'), unsellable: sum(vs, 'unsellable'), sellable: sum(vs, 'sellable'), inspected: sum(vs, 'inspected'), awaiting: sum(vs, 'awaiting'),
      ready: sum(vs, 'ready'), dirty: sum(vs, 'dirty'), freeing: sum(vs, 'freeing'), occupied: sum(vs, 'occupied'), arrivals: sum(vs, 'arrivals'), departures: sum(vs, 'departures') };
    if (isToday) Object.assign(t, classifyToday(t.ready, t.dirty, t.freeing, t.arrivals));
    else t.toService = t.departures + t.occupied;
    g.totals = t;
    g.variants.sort((a, b) => (!a.subSuffix && b.subSuffix ? -1 : a.subSuffix && !b.subSuffix ? 1 : a.typeCode.localeCompare(b.typeCode)));
  }
  const groups = [...gm.values()].sort((a, b) => {
    const ai = KNOWN_ORDER.indexOf(a.baseCode), bi = KNOWN_ORDER.indexOf(b.baseCode);
    if (ai >= 0 && bi >= 0) return ai - bi; if (ai >= 0) return -1; if (bi >= 0) return 1;
    return String(a.baseLabel).localeCompare(String(b.baseLabel));
  });
  const GT = groups.map(g => g.totals);

  // ── action lists (today) ──
  let actions = null;
  if (isToday) {
    const num = (r) => String(r.roomNumber);
    const byNum = (a, b) => num(a).localeCompare(num(b), undefined, { numeric: true });
    // groups that can't cover their arrivals with ready rooms need turns; give them the dirty rooms (in-progress first)
    const need = new Map(groups.map(g => [g.baseCode, Math.max(0, g.totals.arrivals - g.totals.ready)]));
    const cleanFirst = [];
    for (const g of groups) {
      let n = need.get(g.baseCode) || 0; if (!n) continue;
      const cand = dirtyRooms.filter(r => (labels.get(r.typeCode) || {}).baseCode === g.baseCode)
        .sort((a, b) => (a.hkStatus === 'IP' ? 0 : 1) - (b.hkStatus === 'IP' ? 0 : 1) || byNum(a, b));
      cand.slice(0, n).forEach(r => cleanFirst.push({ roomNumber: num(r), typeCode: r.typeCode, baseCode: g.baseCode, hkStatus: r.hkStatus }));
    }
    actions = {
      inspect: awaitingRooms.slice().sort(byNum).map(r => ({ roomNumber: num(r), typeCode: r.typeCode, baseCode: (labels.get(r.typeCode) || {}).baseCode })),
      cleanFirst,
      cleanFirstNeeded: sum([...need.values()].map(n => ({ n })), 'n'),
    };
  }

  const sellableTotal = sum(GT, 'sellable');
  const occupiedTonight = isToday && useLive
    ? rooms.filter(r => r.occupancyStatus === 'OCC').length - (live.stillDeparting || []).length + (live.remainingArrivals || []).length
    : stayoversAll + arrivalsAll;
  const totals = {
    sellable: sellableTotal, unsellableTotal: sum(GT, 'unsellable'),
    arrivals: arrivalsAll, departures: departuresAll, stayovers: stayoversAll,
    occupiedTonight, occupancyPct: sellableTotal ? Math.round((occupiedTonight / sellableTotal) * 100) : null,
    roomsToService: isToday ? null : sum(GT, 'toService'),
    // today
    inspected: sum(GT, 'inspected'), awaiting: sum(GT, 'awaiting'), ready: sum(GT, 'ready'), dirty: sum(GT, 'dirty'), freeing: sum(GT, 'freeing'),
    remainingArrivals: isToday ? sum(GT, 'arrivals') : null,
    leftToSell: isToday ? GT.reduce((n, t) => n + Math.max(0, t.leftNow), 0) : null,
    soldOutGroups: isToday ? GT.filter(t => t.status === 'full' || t.status === 'short').length : null,
    tightGroups: isToday ? GT.filter(t => t.status === 'tight').length : null,
    oversold: isToday ? GT.reduce((n, t) => n + (t.leftPotential < 0 ? -t.leftPotential : 0), 0) : null,
    cleanFirst: actions ? actions.cleanFirstNeeded : 0,
  };

  const outsideWindow = offset > windowDays;
  // Only today carries a status colour (a real sell/close decision). Future days are workload-only.
  const status = outsideWindow ? 'nodata'
    : isToday ? (groups.some(g => g.totals.status === 'short') ? 'short' : groups.some(g => g.totals.status === 'full') ? 'full' : groups.some(g => g.totals.status === 'tight') ? 'tight' : 'open')
    : 'workload';
  return { date: D, offset, isToday, isLive: useLive, outsideWindow, windowDays, status, groups, totals, actions, rooms: rooms.length };
}

/** One summary per day for the outlook strip. Future days: workload only, no verdict. */
export function buildOutlook(payload, days = 14, live) {
  const today = (live && live.forecastDate) || (payload && payload.forecastDate);
  if (!today) return [];
  return Array.from({ length: days }, (_, i) => {
    const m = buildDayModel(payload, addDays(today, i), i === 0 ? live : undefined);
    return {
      date: m.date, offset: i, status: m.status, outsideWindow: m.outsideWindow, isLive: m.isLive,
      arrivals: m.totals.arrivals, departures: m.totals.departures, occupancyPct: m.totals.occupancyPct,
      occupiedRooms: m.totals.occupiedTonight, roomsToService: m.totals.roomsToService,
      leftToSell: m.totals.leftToSell,
    };
  });
}

/** Plain-language notes for the selected day (most important first). */
export function deriveNotes(model) {
  const notes = [];
  if (model.outsideWindow) {
    notes.push({ kind: 'neutral', text: `No reliable data this far out — reservations are only complete ${model.windowDays} days ahead.` });
    return notes;
  }
  const label = (g) => g.baseLabel || g.baseCode || 'Other';
  if (model.isToday) {
    for (const g of model.groups) {
      const t = g.totals;
      if (t.status === 'short') notes.push({ kind: 'urgent', text: `${label(g)}: oversold by ${-t.leftPotential} — ${t.arrivals} still arriving but only ${t.ready + t.dirty + t.freeing} rooms can be ready.` });
      else if (t.status === 'full') notes.push({ kind: 'urgent', text: `${label(g)}: nothing left to sell today — consider closing it on SiteMinder (OTA + website).` });
    }
    for (const g of model.groups) {
      const t = g.totals;
      if (t.status === 'tight') notes.push({ kind: 'urgent', text: `${label(g)}: ${t.ready} clean room${t.ready === 1 ? '' : 's'} for ${t.arrivals} arriving — only sellable after cleaning (${t.dirty} dirty, ${t.freeing} still to depart).` });
    }
    for (const g of model.groups) {
      if (g.totals.status === 'short' || g.totals.status === 'full') continue;
      for (const x of g.variants) {
        if (x.status === 'short' || x.status === 'full') notes.push({ kind: 'urgent', text: `${x.typeCode} (${x.subLabel}) has none left — guests who booked that specific type can’t be moved to another type.` });
      }
    }
    if (model.totals.awaiting > 0) notes.push({ kind: 'info', text: `${model.totals.awaiting} cleaned room${model.totals.awaiting === 1 ? ' is' : 's are'} waiting for front-desk inspection (PU) — inspect to confirm them for sale.` });
    const open = model.groups.filter(g => g.totals.status === 'open');
    if (open.length) notes.push({ kind: 'info', text: open.map(g => `${g.baseCode || '?'}: ${g.totals.leftNow} left to sell`).join(' · ') });
    if (!model.isLive) notes.push({ kind: 'neutral', text: 'Live room data is unavailable — showing room conditions from the last scrape.' });
  } else {
    notes.push({ kind: 'info', text: `${model.totals.arrivals} arriving, ${model.totals.departures} departing, ${model.totals.stayovers} staying over → ${model.totals.roomsToService} room${model.totals.roomsToService === 1 ? '' : 's'} to service.` });
    notes.push({ kind: 'neutral', text: 'Whether rooms are sellable that day depends on that day’s cleaning and inspection, so it is shown on the day itself.' });
  }
  if (model.totals.unsellableTotal) notes.push({ kind: 'neutral', text: `${model.totals.unsellableTotal} room(s) are out of order / blocked and excluded.` });
  if (!notes.length) notes.push({ kind: 'info', text: 'Every room type has rooms to sell.' });
  return notes;
}
