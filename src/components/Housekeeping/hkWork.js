// Sprint 23 — Housekeeping: WHAT has to be done (work list) and WHO does it (assignment). All PURE.
//
// Work list (one item per room):
//   today     vacant Dirty / In-progress rooms → clean · rooms still occupied by a guest checking out today → clean · every other occupied room → stay-over SERVICE.
//             Rooms the forecast says must be ready first (dirty rooms a booked arrival needs) are flagged priority.
//   tomorrow  from the second-night plan (forecastModel dayTwo): "clean first" rooms (priority), the remaining check-outs, leftover dirty rooms → clean;
//             rooms staying over → service. Reservations without a room number yet are only counted (`unplaced`), they can't be handed out.
// Workload: a check-out clean counts `cleanWeight` (1), a stay-over service counts `serviceWeight` (0.5); every housekeeper should get at least
// `min` (10) workload — all adjustable. Auto-suggest splits the rooms floor by floor, in order, so each housekeeper gets a compact run of rooms.
import { buildDayModel, addDays, normFloor, floorLabel } from '../Forecast/forecastModel';
import { buildRoomSheet } from '../Forecast/roomSheet';

export const DEFAULT_SETTINGS = { min: 10, cleanWeight: 1, serviceWeight: 0.5 };
export const KIND_LABEL = { clean: 'Clean', service: 'Service' };

const floorRank = (f) => (f === 'G' ? -1 : parseInt(f, 10) || 99);
const byRoom = (a, b) => floorRank(a.floorId) - floorRank(b.floorId) || String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true });
const WHY_TOMORROW = { dirty: 'Dirty now — needed for a booked arrival', tonight: 'Checks out today — needed for a booked arrival', tomorrow: 'Checks out tomorrow — needed for a booked arrival' };

const mkItem = (roomNumber, typeCode, floorId, kind, why, priority) => ({ roomNumber: String(roomNumber), typeCode: typeCode || '', floorId, floorLabel: floorLabel(floorId), kind, why, priority: !!priority });

/** @returns {{date, offset, items, unplaced:{clean:number, service:number}}} */
export function buildWorkList({ payload, live, allowance, offset = 0 }) {
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
    for (const g of model.groups) {
      const d = g.totals.dayTwo; if (!d) continue;
      d.priority.forEach(r => items.push(mkItem(r.roomNumber, r.typeCode, r.floorId, 'clean', WHY_TOMORROW[r.source] || 'Clean first', true)));
      d.restDeparts.forEach(r => items.push(mkItem(r.roomNumber, r.typeCode, r.floorId, 'clean', 'Check-out', false)));
      d.restDirty.forEach(r => items.push(mkItem(r.roomNumber, r.typeCode, r.floorId, 'clean', r.source === 'tonight' ? 'Checks out today' : 'Dirty now', false)));
      d.stays.forEach(r => items.push(mkItem(r.roomNumber, r.typeCode, r.floorId, 'service', 'Stay-over', false)));
      unplaced.clean += (d.unplacedPriority || 0) + (d.depUnassigned || 0); unplaced.service += d.stayUnassigned || 0;
    }
  }
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
 * Split the work across `hks` (order = who gets the first floors). Uses only as many housekeepers as the minimum allows
 * (total workload / min, at least one) so nobody is handed a token load; the rest stay empty and can be given rooms by hand.
 * @returns {{ [roomNumber]: userId }}
 */
export function suggest(items, hks, s = DEFAULT_SETTINGS) {
  const assign = {};
  if (!hks.length || !items.length) return assign;
  const total = items.reduce((n, i) => n + weightOf(i, s), 0);
  const k = Math.max(1, Math.min(hks.length, Math.floor(total / Math.max(1, s.min))));
  const share = total / k;
  let before = 0;
  for (const it of items.slice().sort(byRoom)) {
    const w = weightOf(it, s);
    const idx = Math.min(k - 1, Math.floor((before + w / 2) / share));
    assign[it.roomNumber] = hks[idx].userId; before += w;
  }
  return assign;
}

/** Saved plan → assignment map for TODAY's work list (rooms that are no longer needed drop out; new rooms are unassigned). */
export function reconcile(saved, items) {
  const need = new Set(items.map(i => i.roomNumber));
  const hks = [], assign = {};
  for (const a of (saved && saved.assignments) || []) {
    hks.push({ userId: a.userId, name: a.name });
    for (const r of a.rooms || []) if (need.has(String(r.roomNumber))) assign[String(r.roomNumber)] = a.userId;
  }
  return { hks, assign };
}

/** What gets saved / printed: per housekeeper, priority rooms first, then by floor and room number. */
export function toAssignments(items, assign, hks) {
  return hks.map(h => ({
    userId: h.userId, name: h.name,
    rooms: items.filter(i => assign[i.roomNumber] === h.userId)
      .sort((a, b) => (b.priority - a.priority) || byRoom(a, b))
      .map(i => (i.priority ? { roomNumber: i.roomNumber, kind: i.kind, priority: true } : { roomNumber: i.roomNumber, kind: i.kind })),
  }));
}

export { normFloor };
