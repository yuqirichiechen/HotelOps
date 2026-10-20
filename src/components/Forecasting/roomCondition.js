// Sprint 22.7 — "room condition" numbers and room lists for the Reservations tiles (left to sell · dirty · occupied clean), like rGuest's Room Condition
// panel. PURE. Source: payload.perRoomSheet (rooms read from rGuest when the page data was built) + payload.reservations (who is in each occupied room).
//   Left to sell   = vacant rooms that are Inspected (VI) or Pickup (PU) and sellable (not out of order / blocked)
//   Dirty          = every room marked Dirty (D) or In progress (IP)   (rGuest shows these as two numbers)
//   Occupied clean = occupied rooms marked clean (OC)
const OFF = ['OOO', 'OTM', 'HOLD', 'NA'];
const num = (a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true });

export function buildRoomCondition(payload) {
  const inactive = new Set(((payload && payload.inactiveRooms) || []).map(String));
  const rooms = ((payload && payload.perRoomSheet) || []).filter(r => r && r.roomNumber != null && !inactive.has(String(r.roomNumber)));
  const sellable = (r) => !r.blocked && !OFF.includes(r.inventoryStatus) && r.occupancyStatus !== 'NA';
  const base = (r) => ({ roomNumber: String(r.roomNumber), typeCode: r.typeCode || '', baseCode: r.baseCode || (r.typeCode || '').slice(0, 4), baseLabel: r.baseLabel || r.typeCode || '', subLabel: r.subLabel || '' });
  const leftToSell = [], dirty = [], occupiedClean = [];
  let vi = 0, pu = 0, d = 0, ip = 0;
  for (const r of rooms) {
    const occ = r.occupancyStatus === 'OCC';
    if (!occ && sellable(r) && r.hkStatus === 'VI') { vi++; leftToSell.push({ ...base(r), hk: 'VI' }); }
    else if (!occ && sellable(r) && r.hkStatus === 'PU') { pu++; leftToSell.push({ ...base(r), hk: 'PU' }); }
    if (r.hkStatus === 'D') { d++; dirty.push({ ...base(r), hk: 'D', occupied: occ }); }
    else if (r.hkStatus === 'IP') { ip++; dirty.push({ ...base(r), hk: 'IP', occupied: occ }); }
    if (occ && r.hkStatus === 'OC') occupiedClean.push(base(r));
  }
  const guestByRoom = new Map();
  for (const r of (payload && payload.reservations) || []) {
    if (r.status !== 'INH' || !r.roomNumber) continue;
    const k = String(r.roomNumber), prev = guestByRoom.get(k);
    if (!prev || String(r.departureDate) > String(prev.departureDate)) guestByRoom.set(k, r);
  }
  leftToSell.sort(num); dirty.sort(num); occupiedClean.sort(num);
  return {
    total: rooms.length, sellable: rooms.filter(sellable).length,
    counts: { vi, pu, leftToSell: vi + pu, dirty: d, inProgress: ip, dirtyTotal: d + ip, occupiedClean: occupiedClean.length },
    lists: { leftToSell, dirty, occupiedClean }, guestByRoom,
  };
}

/** 0..1 for a status ring (safe for 0 totals). */
export const fraction = (part, whole) => (whole > 0 ? Math.max(0, Math.min(1, part / whole)) : 0);
