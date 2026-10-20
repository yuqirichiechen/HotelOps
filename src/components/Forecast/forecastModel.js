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
// 2) DAYS 2–14 — "which room types should housekeeping turn first?"  Whether rooms will be sellable that day
//    depends on that day's cleaning/inspection, which nobody can know in advance — so no sell/close verdict is
//    made for future days. Instead a cleaning PRIORITY per room-type group (Sprint 21.4):
//        expected arrivals = booked arrivals + a late-booking allowance (calibrated from 8 weeks of history,
//                            see LATE_BY_HORIZON / LATE_BY_WEEKDAY; editable scale + minimum in settings)
//        already empty     = sellable − staying over − departing   (vacant the night before, no turn needed)
//        must come from turns = max(0, expected − already empty)    (departing rooms that must be cleaned in time)
//    priority: normal (no turns needed) · early (some departures must be turned) · first (little room to spare) ·
//    short (even turning every departure would not cover the expected arrivals). The suggestion lists the known
//    departing rooms by floor, fullest floors first, so the first N rooms to turn are physically close.
//    Assumption: rooms vacant tonight are (or will be) clean by that day — we cannot know a future day's HK status.
//
// Rooms excluded everywhere: out of order / off the market / on hold / blocked / unavailable, and deactivated
// room records (server filters those; see compute.isActiveRoom).

export const UNSELLABLE_INVENTORY = ['OOO', 'OTM', 'HOLD'];

// ── Late-booking allowance (Sprint 21.4) ──
// Calibrated 2026-10-12 from 1,111 sampled arrivals (2026-08-16..10-10, tests/forecast-calibrate-pickup.js):
// share of final arrivals still to be booked N days before arrival, expressed as +% of what is on the books.
// Index = days ahead (1 = tomorrow). One season only — the scale in Forecast settings is meant for tuning.
export const LATE_BY_HORIZON = [0, 0.25, 0.38, 0.44, 0.49, 0.57, 0.63, 0.69, 0.74, 0.79, 0.84, 0.89, 0.94, 1.0, 1.05];
// Weekday of the ARRIVAL day relative to the hotel average (Sun..Sat): Tuesdays book late, Fridays are already full.
export const LATE_BY_WEEKDAY = [0.68, 1.24, 1.88, 1.16, 0.88, 0.36, 1.04];
export const DEFAULT_ALLOWANCE = { enabled: true, scalePct: 100, minExtra: 2 };

/** Extra arrivals expected on top of what is booked, as a fraction (0.25 = +25%). */
export function lateAllowanceRatio(offset, weekday, settings) {
  const s = { ...DEFAULT_ALLOWANCE, ...(settings || {}) };
  if (!s.enabled || offset < 1) return 0;
  const h = LATE_BY_HORIZON[Math.min(offset, LATE_BY_HORIZON.length - 1)];
  const w = LATE_BY_WEEKDAY[((weekday % 7) + 7) % 7];
  return Math.min(1.5, h * w) * (Number(s.scalePct) / 100);
}

export const PRIORITY_RANK = { short: 0, first: 1, early: 2, normal: 3 };
export const PRIORITY_LABEL = { short: 'May run short', first: 'Turn first', early: 'Turn early', normal: 'Normal' };

// 'G' stays 'G'; '01'/'1' → '1'. Falls back to the room number's first character.
export function normFloor(floorId, roomNumber) {
  const f = floorId != null && floorId !== '' ? String(floorId).trim().toUpperCase() : null;
  if (f) return f === 'G' ? 'G' : String(parseInt(f, 10)) === 'NaN' ? f : String(parseInt(f, 10));
  const c = roomNumber != null ? String(roomNumber).trim().toUpperCase()[0] : null;
  return c && /[G0-9]/.test(c) ? c : 'unknown';
}
export const floorLabel = (f) => (f === 'G' ? 'Ground' : f === 'unknown' ? 'Floor unknown' : `Floor ${f}`);
const floorSort = (a, b) => (a === 'G' ? -1 : b === 'G' ? 1 : (parseInt(a, 10) || 99) - (parseInt(b, 10) || 99));
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
 * @param {Object} [allowance] { enabled, scalePct, minExtra } — late-booking allowance settings (see DEFAULT_ALLOWANCE)
 */
export function buildDayModel(payload, dateYmd, live, allowance) {
  const today = (live && live.forecastDate) || (payload && payload.forecastDate) || dateYmd;
  const D = dateYmd || today;
  const offset = daysBetween(today, D);
  const isToday = offset === 0;
  const dow = new Date(Date.parse(String(D).slice(0, 10) + 'T12:00:00Z')).getUTCDay();
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
    else {
      t.toService = t.departures + t.occupied;
      // Cleaning priority (Sprint 21.4) — see the header comment.
      const ratio = lateAllowanceRatio(offset, dow, allowance);
      const cfg = { ...DEFAULT_ALLOWANCE, ...(allowance || {}) };
      let extra = Math.round(t.arrivals * ratio);
      if (cfg.enabled && t.arrivals >= 4) extra = Math.max(extra, Number(cfg.minExtra) || 0);
      const capacity = Math.max(0, t.sellable - t.occupied);          // most rooms that can possibly be free that day
      t.expected = Math.max(t.arrivals, Math.min(t.arrivals + extra, capacity));
      t.extra = t.expected - t.arrivals;
      t.alreadyEmpty = Math.max(0, t.sellable - t.occupied - t.departures);
      t.needFromTurns = Math.max(0, t.expected - t.alreadyEmpty);
      t.spare = t.departures - t.needFromTurns;
      t.turnFirst = Math.min(t.needFromTurns, t.departures);
      t.priority = t.needFromTurns === 0 ? 'normal'
        : t.needFromTurns > t.departures ? 'short'
        : t.spare < Math.max(1, Math.ceil(t.departures * 0.25)) ? 'first' : 'early';
      // Sprint 22.6: rooms that COULD be ready that night (everything not occupied by a stayover, if all were cleaned) and what is left to sell of them.
      t.potential = Math.max(0, t.sellable - t.occupied);
      t.leftToSell = Math.max(0, t.potential - t.expected);
    }
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

  // ── floors: where the work is (known room numbers only — arrivals are mostly unassigned until check-in) ──
  const floorOfNum = (n, fid) => normFloor(fid != null ? fid : (roomByNumber.get(String(n)) || {}).floorId, n);
  const baseOfType = (code) => (labels.get(code) || {}).baseCode || baseOf(code);
  const dep = [], stay = [];
  let depUnassigned = 0, stayUnassigned = 0;
  const depUnBy = new Map(), stayUnBy = new Map(), bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  if (isToday && useLive) {
    for (const d of live.stillDeparting || []) {
      if (d.roomNumber) dep.push({ roomNumber: String(d.roomNumber), typeCode: typeOfRoomNumber(d.roomNumber, d.typeCode) }); else depUnassigned += 1;
    }
  }
  {
    const seen = new Set();
    for (const r of resns) {
      if (r.id) { if (seen.has(r.id)) continue; seen.add(r.id); }
      if (r.status !== 'RES' && r.status !== 'INH') continue;
      if (!r.arrivalDate || !r.departureDate || r.departureDate <= r.arrivalDate) continue;
      const num = r.roomNumber ? String(r.roomNumber) : null;
      const item = { roomNumber: num, typeCode: typeOfRoomNumber(num, r.typeCode), floorId: r.floorId };
      if (r.departureDate === D && !(isToday && useLive) && (!isToday || r.status === 'INH')) { if (num) dep.push(item); else { depUnassigned += 1; bump(depUnBy, baseOfType(r.typeCode)); } }
      if (r.arrivalDate < D && r.departureDate > D) { if (num) stay.push(item); else { stayUnassigned += 1; bump(stayUnBy, baseOfType(r.typeCode)); } }
    }
  }
  const floorMap = new Map();
  const fl = (f) => { if (!floorMap.has(f)) floorMap.set(f, { floorId: f, label: floorLabel(f), departing: [], stayover: [], dirty: [], inspect: [] }); return floorMap.get(f); };
  const asChip = (o) => ({ roomNumber: o.roomNumber, typeCode: o.typeCode, baseCode: o.typeCode ? baseOfType(o.typeCode) : null });
  dep.forEach(o => fl(floorOfNum(o.roomNumber, o.floorId)).departing.push(asChip(o)));
  stay.forEach(o => fl(floorOfNum(o.roomNumber, o.floorId)).stayover.push(asChip(o)));
  if (isToday) {
    dirtyRooms.forEach(r => fl(floorOfNum(r.roomNumber, r.floorId)).dirty.push({ ...asChip({ roomNumber: String(r.roomNumber), typeCode: r.typeCode }), hkStatus: r.hkStatus }));
    awaitingRooms.forEach(r => fl(floorOfNum(r.roomNumber, r.floorId)).inspect.push(asChip({ roomNumber: String(r.roomNumber), typeCode: r.typeCode })));
  }
  const byNumber = (a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true });
  const floors = [...floorMap.values()].sort((a, b) => floorSort(a.floorId, b.floorId));
  floors.forEach(f => { ['departing', 'stayover', 'dirty', 'inspect'].forEach(k => f[k].sort(byNumber)); });

  // ── Sprint 22.6: the SECOND NIGHT (tomorrow) is planned from tonight's REAL room state ──
  // Arrivals (the BOOKED ones — no late-booking allowance) are checked against the rooms that are vacant AND clean right now (minus tonight's
  // remaining arrivals). A shortfall is what must be cleaned first, taken from: dirty vacant rooms (in-progress first) → rooms checking out today
  // → rooms checking out tomorrow. After that: every remaining check-out gets a full clean and every room staying over gets serviced.
  let dayTwo = null;
  if (offset === 1) {
    const stateRooms = (live && Array.isArray(live.rooms) ? live.rooms : snapRooms).filter(r => isActiveRoom(r, today) && !inactive.has(String(r.roomNumber)));
    const push = (m, k, x) => { if (!m.has(k)) m.set(k, []); m.get(k).push(x); };
    const cleanVac = new Map(), dirtyVac = new Map();
    for (const r of stateRooms) {
      if (!r.typeCode || !isSellable(r) || r.occupancyStatus !== 'VAC') continue;
      push(r.hkStatus === 'VI' || r.hkStatus === 'PU' ? cleanVac : dirtyVac, baseOfType(r.typeCode), r);
    }
    const tonightArr = live && Array.isArray(live.remainingArrivals)
      ? live.remainingArrivals.map(a => ({ typeCode: a.typeCode, roomNumber: a.roomNumber ? String(a.roomNumber) : null }))
      : resns.filter(r => r.status === 'RES' && r.arrivalDate === today).map(r => ({ typeCode: r.typeCode, roomNumber: r.roomNumber ? String(r.roomNumber) : null }));
    const tonightDep = live && Array.isArray(live.stillDeparting)
      ? live.stillDeparting.filter(d => d.roomNumber).map(d => ({ roomNumber: String(d.roomNumber), typeCode: typeOfRoomNumber(d.roomNumber, d.typeCode) }))
      : resns.filter(r => r.status === 'INH' && r.departureDate === today && r.roomNumber).map(r => ({ roomNumber: String(r.roomNumber), typeCode: typeOfRoomNumber(r.roomNumber, r.typeCode) }));
    const reserved = new Set(), unassignedTonight = new Map();
    for (const a of tonightArr) { const k = baseOfType(a.typeCode); if (a.roomNumber) reserved.add(a.roomNumber); else bump(unassignedTonight, k); }
    const byNum = (a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true });
    const mk = (o, source) => ({ roomNumber: String(o.roomNumber), typeCode: o.typeCode, floorId: floorOfNum(o.roomNumber, o.floorId), source });
    let sumClean = 0, sumService = 0;
    for (const g of groups) {
      const t = g.totals, key = g.baseCode;
      const carry = Math.max(0, (cleanVac.get(key) || []).filter(r => !reserved.has(String(r.roomNumber))).length - (unassignedTonight.get(key) || 0));
      const dirty = (dirtyVac.get(key) || []).slice().sort((a, b) => (a.hkStatus === 'IP' ? 0 : 1) - (b.hkStatus === 'IP' ? 0 : 1) || byNum(a, b));
      const free = tonightDep.filter(d => baseOfType(d.typeCode) === key).sort(byNum);
      const deps = dep.filter(o => o.typeCode && baseOfType(o.typeCode) === key).sort(byNum), depUn = depUnBy.get(key) || 0;
      const stays = stay.filter(o => o.typeCode && baseOfType(o.typeCode) === key).sort(byNum), stayUn = stayUnBy.get(key) || 0;
      const shortfall = Math.max(0, t.arrivals - carry);
      const k1 = Math.min(shortfall, dirty.length), k2 = Math.min(shortfall - k1, free.length), k3 = Math.min(shortfall - k1 - k2, deps.length), k4 = Math.min(shortfall - k1 - k2 - k3, depUn);
      const unresolved = shortfall - k1 - k2 - k3 - k4, sources = dirty.length + free.length + deps.length + depUn;
      const priority = [...dirty.slice(0, k1).map(r => mk(r, 'dirty')), ...free.slice(0, k2).map(r => mk(r, 'tonight')), ...deps.slice(0, k3).map(r => mk(r, 'tomorrow'))];
      const restDeparts = deps.slice(k3).map(o => mk(o, 'tomorrow'));
      const restDirty = [...dirty.slice(k1).map(r => mk(r, 'dirty')), ...free.slice(k2).map(r => mk(r, 'tonight'))];
      Object.assign(t, { expected: t.arrivals, extra: 0, alreadyEmpty: carry, needFromTurns: shortfall, turnFirst: k1 + k2 + k3 + k4, spare: sources - shortfall });
      t.priority = shortfall === 0 ? 'normal' : unresolved > 0 ? 'short' : t.spare < Math.max(1, Math.ceil(sources * 0.25)) ? 'first' : 'early';
      t.potential = Math.max(0, t.sellable - t.occupied); t.leftToSell = Math.max(0, t.potential - t.arrivals);
      const clean = priority.length + k4 + restDeparts.length + (depUn - k4) + restDirty.length, service = stays.length + stayUn;
      t.dayTwo = { carry, shortfall, unresolved, priority, unplacedPriority: k4, restDeparts, restDirty, stays, depUnassigned: depUn - k4, stayUnassigned: stayUn, clean, service, sources: { dirty: dirty.length, tonight: free.length, tomorrow: deps.length + depUn } };
      sumClean += clean; sumService += service;
    }
    dayTwo = { clean: sumClean, service: sumService, total: sumClean + sumService };
  }

  // Per-group turn suggestion (future days): the first N departing rooms to turn, fullest floors first.
  let plan = null;
  if (!isToday && dayTwo) {
    plan = groups.map(g => {
      const t = g.totals, d = t.dayTwo, perFloor = new Map();
      [...d.priority.map(r => ({ ...r, first: true })), ...d.restDeparts.map(r => ({ ...r, first: false }))].forEach(r => { if (!perFloor.has(r.floorId)) perFloor.set(r.floorId, []); perFloor.get(r.floorId).push(r); });
      const order = [...perFloor.entries()].sort((a, b) => b[1].length - a[1].length || floorSort(a[0], b[0]));
      return {
        baseCode: g.baseCode, label: g.baseLabel, priority: t.priority, booked: t.arrivals, expected: t.expected, extra: 0, alreadyEmpty: t.alreadyEmpty, needFromTurns: t.needFromTurns,
        departing: t.departures, turnFirst: t.turnFirst, unplacedFirst: d.unplacedPriority,
        floors: order.map(([f, list]) => ({ floorId: f, label: floorLabel(f), rooms: list.sort((a, b) => (b.first - a.first) || byNumber(a, b)).map(r => ({ roomNumber: r.roomNumber, typeCode: r.typeCode, first: r.first, source: r.source })) })),
      };
    }).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.needFromTurns - a.needFromTurns);
  } else if (!isToday) {
    plan = groups.map(g => {
      const t = g.totals;
      const rooms = dep.filter(o => o.typeCode && baseOfType(o.typeCode) === g.baseCode);
      const perFloor = new Map();
      rooms.forEach(o => { const f = floorOfNum(o.roomNumber, o.floorId); if (!perFloor.has(f)) perFloor.set(f, []); perFloor.get(f).push(o); });
      const order = [...perFloor.entries()].sort((a, b) => b[1].length - a[1].length || floorSort(a[0], b[0]));
      let left = t.turnFirst;
      const floorsOut = order.map(([f, list]) => {
        list.sort(byNumber);
        return { floorId: f, label: floorLabel(f), rooms: list.map(o => { const first = left > 0; if (first) left -= 1; return { roomNumber: o.roomNumber, typeCode: o.typeCode, first }; }) };
      });
      return {
        baseCode: g.baseCode, label: g.baseLabel, priority: t.priority, booked: t.arrivals, expected: t.expected, extra: t.extra,
        alreadyEmpty: t.alreadyEmpty, needFromTurns: t.needFromTurns, departing: t.departures, turnFirst: t.turnFirst,
        floors: floorsOut, unplacedFirst: Math.max(0, left),   // rooms to turn first whose room number isn't known yet
      };
    }).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.needFromTurns - a.needFromTurns);
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
    expectedArrivals: isToday ? null : sum(GT, 'expected'),
    lateExtra: isToday ? null : sum(GT, 'extra'),
    priorityGroups: isToday ? null : GT.filter(t => t.priority === 'first' || t.priority === 'short').length,
    turnFirst: isToday ? null : sum(GT, 'turnFirst'),
    // Sprint 22.6 (future days): rooms that could be ready vs what's left to sell of them
    potentialRooms: isToday ? null : sum(GT, 'potential'),
    leftToSellFuture: isToday ? null : sum(GT, 'leftToSell'),
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
  return { date: D, offset, isToday, isLive: useLive, outsideWindow, windowDays, status, groups, totals, actions, plan, dayTwo, floors, unassigned: { departing: depUnassigned, stayover: stayUnassigned }, rooms: rooms.length };
}

/** One summary per day for the outlook strip. Future days: workload only, no verdict. */
export function buildOutlook(payload, days = 14, live, allowance) {
  const today = (live && live.forecastDate) || (payload && payload.forecastDate);
  if (!today) return [];
  return Array.from({ length: days }, (_, i) => {
    const m = buildDayModel(payload, addDays(today, i), i <= 1 ? live : undefined, allowance);
    return {
      date: m.date, offset: i, status: m.status, outsideWindow: m.outsideWindow, isLive: m.isLive,
      arrivals: m.totals.arrivals, departures: m.totals.departures, occupancyPct: m.totals.occupancyPct,
      occupiedRooms: m.totals.occupiedTonight, roomsToService: m.totals.roomsToService,
      leftToSell: m.totals.leftToSell, expectedArrivals: m.totals.expectedArrivals, priorityGroups: m.totals.priorityGroups,
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
    for (const p of model.plan || []) {
      if (p.priority === 'short') notes.push({ kind: 'urgent', text: `${p.label}: about ${p.expected} arrivals expected but only ${p.alreadyEmpty + p.departing} rooms can be ready even if every departure is turned.` });
      else if (p.priority === 'first') notes.push({ kind: 'urgent', text: `${p.label}: turn ${p.turnFirst} of ${p.departing} departing room${p.departing === 1 ? '' : 's'} first — about ${p.expected} arrivals expected, ${p.alreadyEmpty} already empty.` });
    }
    for (const p of model.plan || []) {
      if (p.priority === 'early') notes.push({ kind: 'info', text: `${p.label}: turn ${p.turnFirst} of ${p.departing} departing room${p.departing === 1 ? '' : 's'} early (${p.expected} arrivals expected, ${p.alreadyEmpty} already empty).` });
    }
    if (model.dayTwo) notes.push({ kind: 'info', text: `Tomorrow: ${model.dayTwo.clean} room${model.dayTwo.clean === 1 ? '' : 's'} to clean and ${model.dayTwo.service} staying over to service (${model.dayTwo.total} in all).` });
    notes.push({ kind: 'info', text: `${model.totals.arrivals} booked (about ${model.totals.expectedArrivals} expected), ${model.totals.departures} departing, ${model.totals.stayovers} staying over → ${model.totals.roomsToService} room${model.totals.roomsToService === 1 ? '' : 's'} to service.` });
  }
  if (model.totals.unsellableTotal) notes.push({ kind: 'neutral', text: `${model.totals.unsellableTotal} room(s) are out of order / blocked and excluded.` });
  if (!notes.length) notes.push({ kind: 'info', text: 'Every room type has rooms to sell.' });
  return notes;
}
