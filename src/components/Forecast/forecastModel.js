// Sprint 21 — date-aware room forecast model. PURE (no React / I/O) → unit-tested against fixtures and
// checked against live rGuest data (see part6.md §21).
//
// Question answered for a target date D: "for each room type, will we have enough rooms for the guests
// arriving on D?"  (The old page only ever answered it for *today*, as Vacant-Clean − Remaining-Arrivals,
// which at 8 PM is trivial and says nothing about tomorrow.)
//
// TODAY (offset 0) — supply/demand right now:
//   ready     vacant & sellable & clean (VI Vacant-Inspected or PU Pickup — PU counts as clean, 17.15)
//   dirty     vacant & sellable & not clean yet (D / IP …) → will be cleaned
//   freeing   rooms of in-house guests still due to depart today (by the room's ACTUAL type)
//   demand    remaining arrivals = RES arriving today (by booked type)
//   netReady     = ready − demand                       ("do we have it clean right now?")
//   netProjected = ready + dirty + freeing − demand     ("will we have it once HK catches up?")
// FUTURE day D (offset ≥ 1):
//   occupied  stays that continue through D's night (arrival < D < departure), by room type
//   available = sellable rooms − occupied               (guests departing ON D free their rooms)
//   demand    RES arriving on D (by booked type)
//   net = available − demand
// Substitutability (17.12): a booking of the generic base type (e.g. NKRR) can take any subtype room
// (NKRRA accessible, NKRRP pets…); a subtype booking needs that subtype → per-variant rows AND per-group
// totals, where the group total is the operational truth.

export const UNSELLABLE_INVENTORY = ['OOO', 'OTM', 'HOLD'];
const CLEAN = ['VI', 'PU'];
const KNOWN_ORDER = ['NKRR', 'NKJZ', 'NQRR', 'NQJZ'];

export const isSellable = (room) =>
  !!room && !room.blocked && !UNSELLABLE_INVENTORY.includes(room.inventoryStatus) && room.occupancyStatus !== 'NA';

export const addDays = (ymd, n) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(String(b).slice(0, 10)) - Date.parse(String(a).slice(0, 10))) / 86400000);

const baseOf = (code) => (code && code.length >= 4 ? code.slice(0, 4) : '__OTHER__');

/** @returns {{status:'ok'|'tight'|'short'|'even', net:number, needed:number}} */
function classify(netReady, netProjected) {
  if (netProjected < 0) return { status: 'short', net: netProjected, needed: -netProjected };
  if (netReady < 0)     return { status: 'tight', net: netProjected, needed: -netReady };  // clean these first
  return { status: netProjected === 0 ? 'even' : 'ok', net: netProjected, needed: 0 };
}

/**
 * @param {Object} payload  forecast_snapshot.payload
 * @param {string} dateYmd  target date (YYYY-MM-DD); defaults to payload.forecastDate
 */
export function buildDayModel(payload, dateYmd) {
  const today = (payload && payload.forecastDate) || dateYmd;
  const D = dateYmd || today;
  const offset = daysBetween(today, D);
  const isToday = offset === 0;
  const windowDays = Number((payload && payload.futureWindowDays)) || 30;
  const rooms = (payload && payload.perRoomSheet) || [];
  const resns = (payload && payload.reservations) || [];

  // ── label metadata per typeCode (from rooms first, then reservations) ──
  const labels = new Map();
  const note = (o) => {
    const code = o.typeCode; if (!code || labels.has(code)) return;
    labels.set(code, {
      baseCode: o.baseCode || baseOf(code), baseLabel: o.baseLabel || code,
      subLabel: o.subLabel || 'Standard', subSuffix: code.length > 4 ? code.slice(4) : '',
    });
  };
  rooms.forEach(note); resns.forEach(note);

  const roomByNumber = new Map(rooms.filter(r => r.roomNumber).map(r => [String(r.roomNumber), r]));
  const typeOfRoomNumber = (n, fallback) => { const r = n != null ? roomByNumber.get(String(n)) : null; return (r && r.typeCode) || fallback || null; };

  const V = new Map(); // typeCode → variant accumulator
  const v = (code) => {
    if (!V.has(code)) V.set(code, { typeCode: code, totalRooms: 0, unsellable: 0, ready: 0, dirty: 0, freeing: 0, occupied: 0, arrivals: 0, departures: 0, preAssigned: 0 });
    return V.get(code);
  };

  // ── supply: inventory ──
  for (const r of rooms) {
    if (!r.typeCode) continue;
    const x = v(r.typeCode); x.totalRooms += 1;
    if (!isSellable(r)) { x.unsellable += 1; continue; }
    if (isToday && r.occupancyStatus === 'VAC') {
      if (CLEAN.includes(r.hkStatus)) x.ready += 1; else x.dirty += 1;
    }
  }

  // ── reservations (deduped by id) ──
  const seen = new Set();
  let arrivalsAll = 0, departuresAll = 0, stayoversAll = 0;
  for (const r of resns) {
    if (r.id) { if (seen.has(r.id)) continue; seen.add(r.id); }
    // Guests who already left today still count toward "departures today" (rGuest's 63 = departed + remaining);
    // they hold no room tonight and their rooms are already in the dirty/ready buckets.
    if (r.status === 'DPT' && isToday && r.departureDate === D) { departuresAll += 1; continue; }
    if (r.status !== 'RES' && r.status !== 'INH') continue;
    const arr = r.arrivalDate, dep = r.departureDate;
    if (!arr || !dep || dep <= arr) continue;                 // day-use / bad rows don't hold a night
    const roomType = typeOfRoomNumber(r.roomNumber, r.typeCode); // where the guest actually sleeps / is assigned
    const bookedType = r.typeCode || roomType;

    if (arr === D && (r.status === 'RES' || !isToday)) {      // demand: still-to-arrive guests only (today: RES)
      if (bookedType) { const x = v(bookedType); x.arrivals += 1; if (r.isPreAssigned) x.preAssigned += 1; }
      arrivalsAll += 1;
    } else if (arr === D && isToday && r.status === 'INH') {
      arrivalsAll += 1;                                         // already checked in today (counts toward "arrivals today")
    }
    if (dep === D) {
      departuresAll += 1;
      if (isToday && r.status === 'INH' && roomType) v(roomType).freeing += 1;   // rooms still to be freed today
      if (roomType) v(roomType).departures += 1;
    }
    if (arr < D && dep > D) {                                   // continues through D's night
      stayoversAll += 1;
      if (roomType) v(roomType).occupied += 1;
    }
  }

  // ── variants ──
  const variants = [];
  for (const [code, x] of V) {
    const meta = labels.get(code) || { baseCode: baseOf(code), baseLabel: code, subLabel: 'Standard', subSuffix: code.length > 4 ? code.slice(4) : '' };
    const sellable = x.totalRooms - x.unsellable;
    const row = { ...meta, typeCode: code, ...x, sellable };
    if (isToday) {
      row.netReady = x.ready - x.arrivals;
      row.netProjected = x.ready + x.dirty + x.freeing - x.arrivals;
      Object.assign(row, classify(row.netReady, row.netProjected));
    } else {
      row.available = sellable - x.occupied;
      row.netReady = row.netProjected = row.available - x.arrivals;
      Object.assign(row, classify(row.netReady, row.netProjected));
    }
    variants.push(row);
  }

  // ── groups (substitutability) ──
  const gm = new Map();
  for (const row of variants) {
    const key = row.baseCode || '__OTHER__';
    if (!gm.has(key)) gm.set(key, { baseCode: row.baseCode, baseLabel: row.baseLabel, variants: [] });
    gm.get(key).variants.push(row);
  }
  const sum = (vs, k) => vs.reduce((s, r) => s + (r[k] || 0), 0);
  for (const g of gm.values()) {
    const vs = g.variants;
    const t = {
      totalRooms: sum(vs, 'totalRooms'), unsellable: sum(vs, 'unsellable'), sellable: sum(vs, 'sellable'),
      ready: sum(vs, 'ready'), dirty: sum(vs, 'dirty'), freeing: sum(vs, 'freeing'), occupied: sum(vs, 'occupied'),
      arrivals: sum(vs, 'arrivals'), departures: sum(vs, 'departures'),
    };
    if (isToday) { t.netReady = t.ready - t.arrivals; t.netProjected = t.ready + t.dirty + t.freeing - t.arrivals; }
    else { t.available = t.sellable - t.occupied; t.netReady = t.netProjected = t.available - t.arrivals; }
    g.totals = { ...t, ...classify(t.netReady, t.netProjected) };
    g.variants.sort((a, b) => (!a.subSuffix && b.subSuffix ? -1 : a.subSuffix && !b.subSuffix ? 1 : a.typeCode.localeCompare(b.typeCode)));
  }
  const groups = [...gm.values()].sort((a, b) => {
    const ai = KNOWN_ORDER.indexOf(a.baseCode), bi = KNOWN_ORDER.indexOf(b.baseCode);
    if (ai >= 0 && bi >= 0) return ai - bi; if (ai >= 0) return -1; if (bi >= 0) return 1;
    return String(a.baseLabel).localeCompare(String(b.baseLabel));
  });

  // ── page totals ──
  const sellableTotal = sum(groups.map(g => g.totals), 'sellable');
  const occupiedTonight = stayoversAll + arrivalsAll;
  const short = groups.filter(g => g.totals.status === 'short');
  const tight = groups.filter(g => g.totals.status === 'tight');
  const totals = {
    sellable: sellableTotal, unsellableTotal: sum(groups.map(g => g.totals), 'unsellable'), arrivals: arrivalsAll, departures: departuresAll, stayovers: stayoversAll,
    occupiedTonight, occupancyPct: sellableTotal ? Math.round((occupiedTonight / sellableTotal) * 100) : null,
    // today: rooms HK must turn BEFORE arrivals (arrivals the clean-ready rooms can't cover), per group
    cleanFirst: isToday ? groups.reduce((n, g) => n + Math.max(0, g.totals.arrivals - g.totals.ready), 0) : 0,
    roomsShort: sum(short.map(g => g.totals), 'needed'),            // short EVEN after cleaning/freeing
    roomsToPrioritize: sum(tight.map(g => g.totals), 'needed'),     // today: clean these first
    ready: sum(groups.map(g => g.totals), 'ready'), dirty: sum(groups.map(g => g.totals), 'dirty'),
    freeing: sum(groups.map(g => g.totals), 'freeing'), remainingArrivals: sum(groups.map(g => g.totals), 'arrivals'),
    shortGroups: short.length, tightGroups: tight.length,
    surplusGroups: groups.filter(g => g.totals.status === 'ok').length,
  };

  const outsideWindow = offset > windowDays;
  const dayStatus = outsideWindow ? 'nodata' : short.length ? 'short' : tight.length ? 'tight' : 'ok';
  return { date: D, offset, isToday, outsideWindow, windowDays, status: dayStatus, groups, totals, rooms: rooms.length };
}

/** One summary per day for the outlook strip (today + days−1). */
export function buildOutlook(payload, days = 14) {
  const today = payload && payload.forecastDate;
  if (!today) return [];
  return Array.from({ length: days }, (_, i) => {
    const m = buildDayModel(payload, addDays(today, i));
    return {
      date: m.date, offset: i, status: m.status, outsideWindow: m.outsideWindow,
      arrivals: m.totals.arrivals, departures: m.totals.departures, occupancyPct: m.totals.occupancyPct,
      roomsShort: m.totals.roomsShort, roomsToPrioritize: m.totals.roomsToPrioritize,
    };
  });
}

/** Plain-language notes for the selected day (urgent first). */
export function deriveNotes(model) {
  const notes = [];
  if (model.outsideWindow) {
    notes.push({ kind: 'neutral', text: `No reliable data this far out — reservations are only complete ${model.windowDays} days ahead.` });
    return notes;
  }
  const label = (g) => g.baseLabel || g.baseCode || 'Other';
  for (const g of model.groups) {
    const t = g.totals;
    if (t.status === 'short') {
      notes.push({ kind: 'urgent', text: model.isToday
        ? `${label(g)}: short ${t.needed} even after cleaning every dirty room and counting today's departures (${t.arrivals} arriving, ${t.ready + t.dirty + t.freeing} rooms possible).`
        : `${label(g)}: short ${t.needed} — ${t.arrivals} arriving but only ${t.available} room${t.available === 1 ? '' : 's'} free that night.` });
    }
  }
  for (const g of model.groups) {
    const t = g.totals;
    if (t.status === 'tight') notes.push({ kind: 'urgent', text: `${label(g)}: only ${t.ready} clean room${t.ready === 1 ? '' : 's'} ready for ${t.arrivals} arriving — clean ${t.needed} more first (${t.dirty} dirty, ${t.freeing} still to depart).` });
  }
  for (const g of model.groups) {
    if (g.totals.status === 'short') continue;
    for (const x of g.variants) {
      if (x.status === 'short') notes.push({ kind: 'urgent', text: `${x.typeCode} (${x.subLabel}) is short ${x.needed} — those guests booked that specific type, so another type can't cover it.` });
    }
  }
  const spare = model.groups.filter(g => g.totals.status === 'ok');
  if (spare.length) notes.push({ kind: 'info', text: spare.map(g => `${g.baseCode || '?'} +${g.totals.net}`).join(', ') + ' spare.' });
  if (!notes.length) notes.push({ kind: 'info', text: 'Every room type has enough rooms for the arrivals.' });
  if (model.totals.unsellableTotal) notes.push({ kind: 'neutral', text: `${model.totals.unsellableTotal} room(s) are out of order / blocked and excluded.` });
  return notes;
}
