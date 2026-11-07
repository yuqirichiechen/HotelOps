// Sprint 23 — Housekeeping: WHAT has to be done (work list) and WHO does it (assignment). All PURE.
//
// Work list (one item per room):
//   today     vacant Dirty / In-progress rooms → clean · rooms still occupied by a guest checking out today → clean · every other occupied room → stay-over SERVICE.
//             Rooms the forecast says must be ready first (dirty rooms a booked arrival needs) are flagged priority; so is a room a guest
//             LOCKED / requested (reservation.roomLocked — see isRoomLocked).
//   tomorrow  from the second-night plan (forecastModel dayTwo): "clean first" rooms (priority), the remaining check-outs, leftover dirty rooms → clean;
//             rooms staying over → service. Reservations without a room number yet still count BY ROOM TYPE: each becomes a placeholder card
//             ("TBD · NQRR") that can be handed out like a room and gets its number later.
// Workload: a check-out clean counts `cleanWeight` (1), a stay-over service counts `serviceWeight` (0.5); every housekeeper should get at least
// `min` (10) and at most `max` (15) workload — all adjustable. `balance` hands the rooms out automatically (re-run after every change): same floor →
// same housekeeper wherever possible; cards a person placed by hand are PINNED and never moved by it.
import { buildDayModel, addDays, normFloor, floorLabel } from '../Forecast/forecastModel';
import { buildRoomSheet, shortDate } from '../Forecast/roomSheet';

export const DEFAULT_SETTINGS = { min: 10, max: 15, cleanWeight: 1, serviceWeight: 0.5 };
export const KIND_LABEL = { clean: 'Clean', service: 'Service' };

// Colour groups of the PRINTED sheets (the one-page "all rooms" sheet and each housekeeper's). Defaults (Dev can change them):
//   green  = dirty VACANT room (dirty / in progress) · yellow = a guest is checking out that day · pink = PRIORITY = the room is pre-assigned to an arriving
//   reservation (Sprint 24.10; an arrival that has no room yet can take ANY room of its type, so it makes nothing priority) · in-house stay-overs no colour.
//   Sprint 25: pink also marks every room of a PRIORITY ROOM TYPE (set in Rules); a room rGuest shows as In Progress (someone is already on it) is its own grey group.
export const CATS = ['dirty', 'departure', 'priority', 'progress', 'inhouse'];
export const CAT_LABEL = { dirty: 'Dirty (vacant)', departure: 'Checking out that day', priority: 'Priority — pre-assigned or a priority room type', progress: 'In progress (being cleaned)', inhouse: 'In-house (stay-over)' };
export const PRINT_COLOR_DEFAULTS = { dirty: '#c6f6d5', departure: '#fefcbf', priority: '#fed7e2', progress: '#e2e8f0', inhouse: '' };
/** Stored setting (JSON string) → a full colour map; anything missing/invalid falls back to the default. '' = no colour. */
export function parseColors(raw) {
  let o = {}; try { o = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch { o = {}; }
  const out = {}; CATS.forEach(k => { out[k] = (o && Object.prototype.hasOwnProperty.call(o, k) && (o[k] === '' || /^#[0-9A-Fa-f]{6}$/.test(o[k]))) ? o[k] : PRINT_COLOR_DEFAULTS[k]; });
  return out;
}
/** Which colour group a work item belongs to. */
/** rooms that a reservation arriving on `date` already holds (pre-assigned); the live board's remaining arrivals count for today */
export function preAssignedRooms(payload, date, live) {
  const pre = new Set();
  ((payload && payload.reservations) || []).forEach(r => { if (r.status === 'RES' && r.roomNumber && String(r.arrivalDate).slice(0, 10) === date) pre.add(String(r.roomNumber)); });
  if (live && Array.isArray(live.remainingArrivals)) live.remainingArrivals.forEach(a => { if (a && a.roomNumber) pre.add(String(a.roomNumber)); });
  return pre;
}
export const catOf = (it) => (it.ip ? 'progress' : (it.pre || it.ptype) && it.kind === 'clean' ? 'priority' : it.kind === 'service' ? 'inhouse' : /^(Dirty|Checks out today)/.test(it.why || '') ? 'dirty' : 'departure');

const floorRank = (f) => (f === 'G' ? -1 : parseInt(f, 10) || 99);
const byRoom = (a, b) => floorRank(a.floorId) - floorRank(b.floorId) || String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true });
const WHY_TOMORROW = { dirty: 'Dirty now — needed for a booked arrival', tonight: 'Checks out today — needed for a booked arrival', tomorrow: 'Checks out tomorrow — needed for a booked arrival' };

// floors are always normalised ('02' and '2' are the same floor — the stay-over rooms of the plan carry the reservation's raw floor id)
const mkItem = (roomNumber, typeCode, floorId, kind, why, priority, tbd = false) => {
  const f = tbd ? 'unknown' : normFloor(floorId, roomNumber);
  return { roomNumber: String(roomNumber), typeCode: typeCode || '', floorId: f, floorLabel: floorLabel(f), kind, why, priority: !!priority, tbd };
};

/** A guest asked NOT to be moved out of the room they were given (rGuest "Do not move", stored as summary.stay.doNotMoveRoom). The server lists those rooms
 *  (`/admin/housekeeping/locked-rooms`); a payload flag is also honoured. */
export const isRoomLocked = (r) => !!(r && (r.doNotMoveRoom || r.roomLocked || r.roomAssignmentLocked || r.lockedRoom));

/** @returns {{date, offset, items, unplaced:{clean:number, service:number}}} */
export function buildWorkList({ payload, live, allowance, offset = 0, lockedRooms, priorityTypes }) {
  const today = (live && live.forecastDate) || (payload && payload.forecastDate) || '';
  const date = today ? addDays(today, offset) : '';   // before the room data has loaded there is no date yet
  const items = [], unplaced = { clean: 0, service: 0 };
  if (!payload || !today) return { date, offset, items, unplaced };
  if (offset === 0) {
    const sheet = buildRoomSheet(payload, live);
    const model = buildDayModel(payload, today, live, allowance);
    const first = new Set(((model.actions && model.actions.cleanFirst) || []).map(r => String(r.roomNumber)));
    for (const f of sheet.floors) for (const r of f.rooms) {
      if (r.tone === 'dirty') items.push(mkItem(r.roomNumber, r.typeCode, f.floorId, 'clean', 'Dirty', first.has(r.roomNumber)));
      else if (r.tone === 'progress') items.push({ ...mkItem(r.roomNumber, r.typeCode, f.floorId, 'clean', 'In progress', false), ip: true });   // Sprint 25: someone is already on it — never handed out automatically
      else if (r.tone === 'occupied') {
        if (r.checkoutDate === today) items.push(mkItem(r.roomNumber, r.typeCode, f.floorId, 'clean', 'Check-out today', false));
        else items.push(mkItem(r.roomNumber, r.typeCode, f.floorId, 'service', r.checkoutDate ? 'Stay-over' : 'Stay-over (check-out date unknown)', false));
      }
    }
  } else {
    const model = buildDayModel(payload, date, live, allowance);
    model.groups.forEach((g, gi) => {
      const d = g.totals.dayTwo; if (!d) return;
      d.priority.forEach(r => items.push(mkItem(r.roomNumber, r.typeCode, r.floorId, 'clean', WHY_TOMORROW[r.source] || 'Clean first', true)));
      d.restDeparts.forEach(r => items.push(mkItem(r.roomNumber, r.typeCode, r.floorId, 'clean', 'Check-out', false)));
      d.restDirty.forEach(r => items.push(mkItem(r.roomNumber, r.typeCode, r.floorId, 'clean', r.source === 'tonight' ? 'Checks out today' : 'Dirty now', false)));
      d.stays.forEach(r => items.push(mkItem(r.roomNumber, r.typeCode, r.floorId, 'service', 'Stay-over', false)));
      // reservations with no room number yet: counted by ROOM TYPE, handed out as placeholder cards ("TBD")
      const base = g.baseCode || '';
      for (let i = 0; i < (d.unplacedPriority || 0); i += 1) items.push(mkItem(`T${gi}P${i + 1}`, base, 'unknown', 'clean', 'Room not assigned yet — needed for a booked arrival', true, true));
      for (let i = 0; i < (d.depUnassigned || 0); i += 1) items.push(mkItem(`T${gi}C${i + 1}`, base, 'unknown', 'clean', 'Check-out, room not assigned yet', false, true));
      for (let i = 0; i < (d.stayUnassigned || 0); i += 1) items.push(mkItem(`T${gi}S${i + 1}`, base, 'unknown', 'service', 'Stay-over, room not assigned yet', false, true));
      unplaced.clean += (d.unplacedPriority || 0) + (d.depUnassigned || 0); unplaced.service += d.stayUnassigned || 0;
    });
  }
  // rooms a guest has locked: clean those first
  const locked = new Set([...(lockedRooms || [])].map(String));
  ((payload && payload.reservations) || []).forEach(r => { if (r.status === 'RES' && r.roomNumber && isRoomLocked(r) && String(r.arrivalDate).slice(0, 10) <= date) locked.add(String(r.roomNumber)); });
  // every locked room that has work gets the lock mark; clean ones also go first
  items.forEach(i => { if (!i.tbd && locked.has(i.roomNumber)) { i.locked = true; if (i.kind === 'clean') { i.priority = true; i.why = `${i.why} — guest asked not to be moved (do not move)`; } } });
  // pre-assigned arrivals: a reservation (arriving that day) that already has THIS room. Those rooms are the priority (pink) when they still need cleaning.
  const pre = preAssignedRooms(payload, date, offset === 0 ? live : null);
  const ptypes = new Set((priorityTypes || []).map(String));
  items.forEach(i => {
    i.pre = !i.tbd && !i.ip && pre.has(i.roomNumber); i.ptype = !i.tbd && !i.ip && i.kind === 'clean' && ptypes.has(i.typeCode);
    if ((i.pre || i.ptype) && i.kind === 'clean') i.priority = true;                // pre-assigned arrival / priority room type: cleaned first, pink
  });
  // colour group + the stay (check-in → check-out) of whoever is in the room
  const stayBy = new Map();
  ((payload && payload.reservations) || []).filter(r => r.status === 'INH' && r.roomNumber).forEach(r => { const k = String(r.roomNumber), prev = stayBy.get(k); if (!prev || String(r.departureDate) > prev.dep) stayBy.set(k, { dep: String(r.departureDate), text: `${shortDate(r.arrivalDate)} → ${shortDate(r.departureDate)}` }); });
  items.forEach(i => { i.cat = catOf(i); if (!i.tbd && stayBy.has(i.roomNumber)) i.stay = stayBy.get(i.roomNumber).text; });
  const seen = new Set();
  const uniq = items.filter(i => (seen.has(i.roomNumber) ? false : (seen.add(i.roomNumber), true)));   // a room never appears twice (clean wins: it came first)
  uniq.sort(byRoom);
  return { date, offset, items: uniq, unplaced };
}

export const weightOf = (item, s = DEFAULT_SETTINGS) => (item.kind === 'clean' ? s.cleanWeight : s.serviceWeight);

/** Per housekeeper totals for an assignment map. assign: { roomNumber: userId|null } */
export function summarize(items, assign, hks, s = DEFAULT_SETTINGS) {
  const out = new Map(hks.map(h => [h.userId, { userId: h.userId, name: h.name, clean: 0, service: 0, units: 0, rooms: 0 }]));
  let un = { clean: 0, service: 0, units: 0, rooms: 0 };
  for (const it of items) {
    const o = assign[it.roomNumber] && out.get(assign[it.roomNumber]) ? out.get(assign[it.roomNumber]) : un;
    o[it.kind] += 1; o.rooms += 1; o.units += weightOf(it, s);
  }
  const rows = [...out.values()].map(o => ({ ...o, units: Math.round(o.units * 100) / 100, belowMin: o.rooms > 0 && o.units < s.min }));
  return { hks: rows, unassigned: { ...un, units: Math.round(un.units * 100) / 100 } };
}

/**
 * Even the loads out after the floor-by-floor split. The split keeps floors together, but a housekeeper whose floors are all quick (or who is the
 * first/last in line) can end up well below the others — or below the minimum. So, repeatedly: take the LIGHTEST housekeeper and the HEAVIEST one who
 * has something movable, and move a small group of rooms from heavy to light until the gap is within `tolerance` (and nobody is left under the minimum
 * while the donor stays above it). Rules for WHAT moves (the point of Sprint 23.5):
 *   · stay-over services go first (cheap, 0.5), cleans only if the donor has no services left to give;
 *   · rooms move in groups from ONE floor — the floor the light person already works on if there is one, otherwise the donor's smallest leftover floor
 *     (so the donor's main floors stay whole and the light person gets a compact little block, e.g. two rooms on one floor);
 *   · hand-placed (pinned) cards never move; nobody is pushed over the maximum.
 * Mutates and returns `assign` ({ room: userId }).
 */
export function evenOut(items, assign, hks, pinned = {}, s = DEFAULT_SETTINGS, tolerance = 1) {
  if (hks.length < 2) return assign;
  const byRoomNo = new Map(items.map(i => [i.roomNumber, i]));
  const load = new Map(hks.map(h => [h.userId, 0]));
  Object.keys(assign).forEach(r => { const it = byRoomNo.get(r); if (it && load.has(assign[r])) load.set(assign[r], load.get(assign[r]) + weightOf(it, s)); });
  const movable = (r) => !Object.prototype.hasOwnProperty.call(pinned, r);
  const avg = [...load.values()].reduce((a, b) => a + b, 0) / hks.length;
  for (let guard = 0; guard < 400; guard += 1) {
    const order = hks.map(h => h.userId).sort((a, b) => load.get(a) - load.get(b));
    const light = order[0];
    // heaviest housekeeper that still has something to give
    const donorIds = order.slice().reverse().filter(id => id !== light && Object.keys(assign).some(r => assign[r] === id && movable(r)));
    if (!donorIds.length) break;
    const donor = donorIds[0], gap = load.get(donor) - load.get(light);
    const mine = Object.keys(assign).filter(r => assign[r] === donor && movable(r)).map(r => byRoomNo.get(r)).filter(Boolean);
    const services = mine.filter(i => i.kind === 'service'), pool = services.length ? services : mine;
    const w = weightOf(pool[0], s);
    // cleans are heavy and keep a floor whole when possible: only even them out for a clearly bigger gap (40% of an average load)
    const tol = services.length ? tolerance : Math.max(tolerance, 0.4 * avg);
    const wantsMore = gap > tol + 1e-9 || (load.get(light) < s.min - 1e-9 && load.get(donor) - w >= s.min - 1e-9);
    if (!wantsMore || load.get(light) + w > s.max + 1e-9) break;
    // one floor: the light person's own floors first, else the donor's smallest floor
    const lightFloors = new Set(Object.keys(assign).filter(r => assign[r] === light).map(r => (byRoomNo.get(r) || {}).floorId));
    const groups = new Map(); pool.forEach(i => { if (!groups.has(i.floorId)) groups.set(i.floorId, []); groups.get(i.floorId).push(i); });
    const ranked = [...groups.entries()].sort((a, b) => ((lightFloors.has(b[0]) ? 1 : 0) - (lightFloors.has(a[0]) ? 1 : 0)) || (a[1].length - b[1].length) || (floorRank(a[0]) - floorRank(b[0])));
    const group = ranked[0][1].sort(byRoom);
    let moved = 0;
    for (const it of group) {
      const wi = weightOf(it, s), g = load.get(donor) - load.get(light);
      const need = g > tol + 1e-9 || (load.get(light) < s.min - 1e-9 && load.get(donor) - wi >= s.min - 1e-9);
      if (!need || load.get(light) + wi > s.max + 1e-9) break;
      assign[it.roomNumber] = light; load.set(donor, load.get(donor) - wi); load.set(light, load.get(light) + wi); moved += 1;
    }
    if (!moved) break;
  }
  return assign;
}

// Sprint 25 — Auto-assign, rewritten after the front desk's first real use ("gives housekeepers 3 floors and unnecessarily splits floors that can be
// completed by one housekeeper"). The rooms are laid out in floor / room order and cut into one CONTIGUOUS run per housekeeper — so a person gets
// neighbouring floors (usually one, at most two) and a floor is cut in two only when keeping it whole would leave somebody clearly over / under.
// The cut positions are found exactly (dynamic programming) by minimising a cost: workload far from the fair share, floors touched beyond one, a floor
// cut in the middle, going over the maximum / under the minimum, and — when a housekeeper has preferred floors — work on floors they did not ask for.
const W = { dev: 100, floors: 8, cut: 12, over: 300, under: 60, pref: 80 };
const permutations = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])));

/**
 * Hand the work out. Cards in `pinned` ({ room: userId | null }) were placed by a person and stay where they are (null = deliberately left in the
 * pool); rooms rGuest shows as In Progress (`ip`) are never handed out automatically. Everything else is spread so each housekeeper ends up with about the
 * same workload (pinned cards count), floor-contiguously. `prefs` = { userId: [floorId…] } — a housekeeper's preferred floors.
 * @returns {{ [roomNumber]: userId }}  (only rooms that have an owner; pool cards are absent)
 */
export function balance(items, hks, pinned = {}, s = DEFAULT_SETTINGS, prefs = {}) {
  const assign = {};
  if (!hks.length || !items.length) return assign;
  const idx = new Map(hks.map((h, i) => [h.userId, i]));
  const pre = hks.map(() => 0), free = [];
  for (const it of items) {
    const has = Object.prototype.hasOwnProperty.call(pinned, it.roomNumber), u = has ? pinned[it.roomNumber] : undefined;
    if (has && u === null) continue;                                              // held in the pool on purpose
    if (has && u && idx.has(u)) { assign[it.roomNumber] = u; pre[idx.get(u)] += weightOf(it, s); } else if (!it.ip) free.push(it);   // In Progress rooms stay in the pool
  }
  if (!free.length) return assign;
  free.sort(byRoom);
  const N = free.length, n = hks.length, wts = free.map(i => weightOf(i, s));
  const P = [0]; wts.forEach((w, i) => P.push(P[i] + w));
  const F = P[N], T = F + pre.reduce((a, b) => a + b, 0), avg = Math.max(T / n, 1e-6), target = T / n;
  let quota = pre.map(p => Math.max(0, target - p)); const S = quota.reduce((a, b) => a + b, 0);
  quota = S > 0 ? quota.map(q => (q * F) / S) : quota.map(() => F / n);
  const minEff = Math.min(s.min, 0.9 * target);                                   // a day too small to give everyone the minimum must not leave people empty-handed
  const fl = free.map(i => i.floorId);
  const starts = [0]; for (let i = 0; i < N; i += 1) starts.push(starts[i] + (i === 0 || fl[i] !== fl[i - 1] ? 1 : 0));   // starts[k] = floors that begin before index k
  const touched = (i, j) => (j <= i ? 0 : starts[j] - starts[i] + (i > 0 && fl[i] === fl[i - 1] ? 1 : 0));
  const prefSets = hks.map(h => new Set((prefs && prefs[h.userId]) || []));
  const outside = hks.map((h, hi) => { const o = [0]; for (let i = 0; i < N; i += 1) o.push(o[i] + (prefSets[hi].size && !prefSets[hi].has(fl[i]) ? wts[i] : 0)); return o; });
  const run = (order) => {                                                         // order[k] = index into hks of the k-th run
    const INF = 1e18, dp = Array.from({ length: n + 1 }, () => new Float64Array(N + 1).fill(INF)), back = Array.from({ length: n + 1 }, () => new Int32Array(N + 1));
    dp[0][0] = 0;
    for (let k = 0; k < n; k += 1) {
      const h = order[k], q = quota[h];
      for (let j = 0; j <= N; j += 1) {
        const base = dp[k][j]; if (base >= INF) continue;
        for (let e = j; e <= N; e += 1) {
          const w = P[e] - P[j], d = (w - q) / avg, tot = pre[h] + w;
          let c = base + W.dev * d * d;
          const t = touched(j, e); if (t > 1) c += W.floors * (t - 1) * (t - 1);
          if (e > j && e < N && fl[e - 1] === fl[e]) c += W.cut;
          if (tot > s.max + 1e-9) c += 25 * (tot - s.max) + W.over * ((tot - s.max) / avg) ** 2;
          if (w > 0 && tot < minEff - 1e-9) c += W.under * ((minEff - tot) / avg) ** 2;
          if (prefSets[h].size && w > 0) { const o = outside[h][e] - outside[h][j]; c += W.pref * (o / avg) ** 2; }
          if (c < dp[k + 1][e]) { dp[k + 1][e] = c; back[k + 1][e] = j; }
        }
      }
    }
    const cuts = []; let e = N; for (let k = n; k >= 1; k -= 1) { cuts[k - 1] = [back[k][e], e]; e = back[k][e]; }
    return { cost: dp[n][N], cuts, order };
  };
  const anyPref = prefSets.some(p => p.size), ids = hks.map((_, i) => i);
  let orders = [ids];
  if (anyPref) {
    const rank = (hi) => { const f = [...prefSets[hi]].map(floorRank); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null; };
    const known = ids.filter(hi => rank(hi) !== null), mid = known.length ? known.reduce((a, hi) => a + rank(hi), 0) / known.length : 0;
    orders = n <= 5 ? permutations(ids) : [ids.slice().sort((a, b) => ((rank(a) === null ? mid : rank(a)) - (rank(b) === null ? mid : rank(b))))];
  }
  let best = null; for (const o of orders) { const r = run(o); if (!best || r.cost < best.cost - 1e-9) best = r; }
  best.cuts.forEach(([a, b], k) => { for (let i = a; i < b; i += 1) assign[free[i].roomNumber] = hks[best.order[k]].userId; });
  return assign;
}

/** Plain-language warnings: one overall line + a flag per housekeeper ('over' | 'under'). */
export function warnings(sum, totalUnits, s = DEFAULT_SETTINGS) {
  const n = sum.hks.length, perHk = {};
  let overall = null;
  if (totalUnits > 0 && n === 0) overall = `Add a housekeeper — ${Math.round(totalUnits * 10) / 10} workload to cover (about ${Math.ceil(totalUnits / s.max)} needed at a maximum of ${s.max} each).`;
  else if (n > 0 && totalUnits / n > s.max + 1e-9) overall = `Too many rooms for ${n} housekeeper${n === 1 ? '' : 's'}: about ${Math.round((totalUnits / n) * 10) / 10} each (maximum ${s.max}). Add ${Math.ceil(totalUnits / s.max) - n} more.`;
  sum.hks.forEach(h => { perHk[h.userId] = h.units > s.max + 1e-9 ? 'over' : h.rooms > 0 && h.units < s.min ? 'under' : null; });
  return { overall, perHk };
}

/** Saved plan → housekeepers + assignments for the current work list. `pinned` = placed by hand, `auto` = handed out by Auto-assign. Rooms that no
 *  longer need work drop out; rooms the plan never had stay in the "Not assigned" pool. */
export function reconcile(saved, items) {
  const need = new Set(items.map(i => i.roomNumber));
  const hks = [], pinned = {}, auto = {};
  for (const a of (saved && saved.assignments) || []) {
    hks.push({ userId: a.userId, name: a.name });
    for (const r of a.rooms || []) { const k = String(r.roomNumber); if (!need.has(k)) continue; if (r.pinned) pinned[k] = a.userId; else auto[k] = a.userId; }
  }
  return { hks, pinned, auto };
}

/** The assignment that is on screen: hand-placed cards win, then what Auto-assign handed out; everything else is in the pool. */
export function resolveAssign(items, hks, pinned = {}, auto = {}) {
  const ids = new Set(hks.map(h => h.userId)), out = {};
  for (const it of items) {
    const k = it.roomNumber;
    if (Object.prototype.hasOwnProperty.call(pinned, k)) { if (pinned[k] && ids.has(pinned[k])) out[k] = pinned[k]; continue; }
    if (auto[k] && ids.has(auto[k])) out[k] = auto[k];
  }
  return out;
}

/** What gets saved / printed: per housekeeper, priority rooms first, then by floor and room number. */
export function toAssignments(items, assign, hks, pinned = {}) {
  return hks.map(h => ({
    userId: h.userId, name: h.name,
    rooms: items.filter(i => assign[i.roomNumber] === h.userId)
      .sort((a, b) => (b.priority - a.priority) || ((b.pre ? 1 : 0) - (a.pre ? 1 : 0)) || byRoom(a, b))
      .map(i => {
        const o = { roomNumber: i.roomNumber, kind: i.kind };
        if (i.priority) o.priority = true;
        if (pinned[i.roomNumber] === h.userId) o.pinned = true;
        if (i.typeCode) o.typeCode = i.typeCode;
        if (i.cat) o.cat = i.cat;
        if (i.stay) o.stay = i.stay;
        if (i.why) o.why = i.why;
        return o;
      }),
  }));
}

export { normFloor };

// ── The one-page "all rooms" sheet (Sprint 24.10, trimmed in 25) ───────────────────────────────────────────────────────────────────────────────
// Every room of the hotel in floor / room-number order (Ground first), 3 groups of [Room | Status] filled down each group like a newspaper column.
// Room cell colour: green = dirty vacant · yellow = a guest checks out that day · pink = priority (pre-assigned to an arrival or a priority room type,
// still needs work) · grey = in progress; anything else white. The STATUS column is deliberately almost empty (front desk: "unnecessary information"):
// only a staying guest's stay span, "In progress" and "Out of service" are written; departures stay blank so a late check-out can be pencilled in.
export const MASTER_GROUPS = 3;

/** @param {number} [offset] 0 = today (the room board), 1 = tomorrow (the planned day: today's board moved forward by the plan)
 *  @returns {{rooms: {room, floorId, status, cat, pre, work, kind}[], rows: (object|null)[][], counts, total}} */
export function buildMasterSheet({ payload, live, items, offset = 0 }) {
  const sheet = buildRoomSheet(payload, live);
  const date = sheet.date ? addDays(sheet.date, offset) : '';
  const preSet = preAssignedRooms(payload, date, offset === 0 ? live : null);
  const byRoomNo = new Map((items || []).filter(i => !i.tbd).map(i => [i.roomNumber, i]));
  const rooms = [];
  for (const f of sheet.floors) for (const r of f.rooms) {
    const it = byRoomNo.get(r.roomNumber), pre = !!((it && it.pre) || preSet.has(r.roomNumber));
    let status = '';
    if (r.tone === 'off') status = 'Out of service';
    else if (it && it.ip) status = 'In progress';
    else if (it && it.kind === 'service') status = it.stay || r.checkout || '';
    rooms.push({ room: r.roomNumber, floorId: f.floorId, status, cat: it ? (it.cat || catOf(it)) : null, pre, work: !!it, kind: it ? it.kind : null });
  }
  rooms.sort((a, b) => floorRank(a.floorId) - floorRank(b.floorId) || String(a.room).localeCompare(String(b.room), undefined, { numeric: true }));
  const per = Math.max(1, Math.ceil(rooms.length / MASTER_GROUPS)), rows = [];
  for (let i = 0; i < per; i += 1) rows.push(Array.from({ length: MASTER_GROUPS }, (_, g) => rooms[g * per + i] || null));
  const counts = { clean: rooms.filter(r => r.kind === 'clean').length, service: rooms.filter(r => r.kind === 'service').length, priority: rooms.filter(r => r.cat === 'priority').length };
  return { rooms, rows, counts, total: rooms.length, asOf: sheet.asOf, source: sheet.source, date, offset };
}
