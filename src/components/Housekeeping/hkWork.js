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
import { buildRoomSheet } from '../Forecast/roomSheet';

export const DEFAULT_SETTINGS = { min: 10, max: 15, cleanWeight: 1, serviceWeight: 0.5 };
export const KIND_LABEL = { clean: 'Clean', service: 'Service' };

const floorRank = (f) => (f === 'G' ? -1 : parseInt(f, 10) || 99);
const byRoom = (a, b) => floorRank(a.floorId) - floorRank(b.floorId) || String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true });
const WHY_TOMORROW = { dirty: 'Dirty now — needed for a booked arrival', tonight: 'Checks out today — needed for a booked arrival', tomorrow: 'Checks out tomorrow — needed for a booked arrival' };

const mkItem = (roomNumber, typeCode, floorId, kind, why, priority, tbd = false) => ({ roomNumber: String(roomNumber), typeCode: typeCode || '', floorId, floorLabel: floorLabel(floorId), kind, why, priority: !!priority, tbd });

/** A guest asked NOT to be moved out of the room they were given (rGuest "Do not move", stored as summary.stay.doNotMoveRoom). The server lists those rooms
 *  (`/admin/housekeeping/locked-rooms`); a payload flag is also honoured. */
export const isRoomLocked = (r) => !!(r && (r.doNotMoveRoom || r.roomLocked || r.roomAssignmentLocked || r.lockedRoom));

/** @returns {{date, offset, items, unplaced:{clean:number, service:number}}} */
export function buildWorkList({ payload, live, allowance, offset = 0, lockedRooms }) {
  const today = (live && live.forecastDate) || (payload && payload.forecastDate) || '';
  const date = today ? addDays(today, offset) : '';   // before the room data has loaded there is no date yet
  const items = [], unplaced = { clean: 0, service: 0 };
  if (!payload || !today) return { date, offset, items, unplaced };
  if (offset === 0) {
    const sheet = buildRoomSheet(payload, live);
    const model = buildDayModel(payload, today, live, allowance);
    const first = new Set(((model.actions && model.actions.cleanFirst) || []).map(r => String(r.roomNumber)));
    for (const f of sheet.floors) for (const r of f.rooms) {
      if (r.tone === 'dirty' || r.tone === 'progress') items.push(mkItem(r.roomNumber, r.typeCode, f.floorId, 'clean', r.tone === 'progress' ? 'In progress' : 'Dirty', first.has(r.roomNumber)));
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
 * Hand the work out. Cards in `pinned` ({ room: userId | null }) were placed by a person and stay where they are (null = deliberately left in the
 * pool). Everything else is spread so each housekeeper ends up with about the same workload (pinned cards count), and — wherever it costs little —
 * a whole floor goes to ONE housekeeper: the cuts between people are moved to the nearest floor boundary when that is within 20% of a share and nobody goes over the maximum because of it.
 * @returns {{ [roomNumber]: userId }}  (only rooms that have an owner; pool cards are absent)
 */
export function balance(items, hks, pinned = {}, s = DEFAULT_SETTINGS) {
  const assign = {};
  if (!hks.length || !items.length) return assign;
  const idx = new Map(hks.map((h, i) => [h.userId, i]));
  const pre = hks.map(() => 0), free = [];
  for (const it of items) {
    const has = Object.prototype.hasOwnProperty.call(pinned, it.roomNumber), u = has ? pinned[it.roomNumber] : undefined;
    if (has && u === null) continue;                                              // held in the pool on purpose
    if (has && u && idx.has(u)) { assign[it.roomNumber] = u; pre[idx.get(u)] += weightOf(it, s); } else free.push(it);
  }
  if (!free.length) return assign;
  free.sort(byRoom);
  const F = free.reduce((n, i) => n + weightOf(i, s), 0), n = hks.length, T = F + pre.reduce((a, b) => a + b, 0), target = T / n;
  let quota = pre.map(p => Math.max(0, target - p)); const S = quota.reduce((a, b) => a + b, 0);
  quota = S > 0 ? quota.map(q => (q * F) / S) : quota.map(() => F / n);
  const cuts = []; let acc = 0; quota.forEach((q, j) => { acc += q; if (j < n - 1) cuts.push(acc); });
  // floor boundaries (cumulative workload at the end of each floor except the last)
  const bounds = []; let cum = 0;
  free.forEach((it, i) => { cum += weightOf(it, s); if (i < free.length - 1 && free[i + 1].floorId !== it.floorId) bounds.push(cum); });
  const tol = 0.2 * (F / n);
  const snapped = cuts.map(c => { let best = c, d = Infinity; bounds.forEach(bd => { const x = Math.abs(bd - c); if (x < d && x <= tol) { d = x; best = bd; } }); return best; });
  for (let i = 1; i < snapped.length; i += 1) if (snapped[i] < snapped[i - 1]) snapped[i] = snapped[i - 1];
  const run = (cutList) => {
    const out = {}, load = pre.slice(); let before = 0;
    for (const it of free) {
      const w = weightOf(it, s), mid = before + w / 2; let j = 0;
      while (j < cutList.length && mid >= cutList[j]) j += 1;
      out[it.roomNumber] = hks[j].userId; load[j] += w; before += w;
    }
    return { out, peak: Math.max(...load) };
  };
  // keep a floor together only if nobody ends up over the maximum because of it (or it is no worse than the plain split)
  const plain = run(cuts), tidy = run(snapped);
  Object.assign(assign, tidy.peak <= Math.max(s.max, plain.peak) + 1e-9 ? tidy.out : plain.out);
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

/** Saved plan → housekeepers + pins for the current work list (rooms that are no longer needed drop out; new rooms are left to the balancer). */
export function reconcile(saved, items) {
  const need = new Set(items.map(i => i.roomNumber));
  const hks = [], pinned = {};
  for (const a of (saved && saved.assignments) || []) {
    hks.push({ userId: a.userId, name: a.name });
    for (const r of a.rooms || []) if (need.has(String(r.roomNumber)) && r.pinned) pinned[String(r.roomNumber)] = a.userId;
  }
  return { hks, pinned };
}

/** What gets saved / printed: per housekeeper, priority rooms first, then by floor and room number. */
export function toAssignments(items, assign, hks, pinned = {}) {
  return hks.map(h => ({
    userId: h.userId, name: h.name,
    rooms: items.filter(i => assign[i.roomNumber] === h.userId)
      .sort((a, b) => (b.priority - a.priority) || byRoom(a, b))
      .map(i => {
        const o = { roomNumber: i.roomNumber, kind: i.kind };
        if (i.priority) o.priority = true;
        if (pinned[i.roomNumber] === h.userId) o.pinned = true;
        if (i.typeCode) o.typeCode = i.typeCode;
        if (i.why) o.why = i.why;
        return o;
      }),
  }));
}

export { normFloor };
