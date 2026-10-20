// Sprint 22.6 — the printable / downloadable ROOM STATUS SHEET ("Generate forecast" became this): every room, by floor — available,
// unavailable (dirty / being cleaned / out of service) or occupied (with its check-out day). PURE. Guest names are deliberately not on it:
// it is printed and handed around.
// rGuest exposes a check-out DATE only (estimatedTimeDetails is always empty), so the time shown is the property's standard check-out time.
import { normFloor, floorLabel, isActiveRoom } from './forecastModel';

export const STANDARD_CHECKOUT = '12:00 PM';
const OFF = ['OOO', 'OTM', 'HOLD', 'NA'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const utc = (ymd) => { const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };

/** "Today" / "Tomorrow" / "Wed, Oct 21" */
export function dayLabel(ymd, today) {
  if (!ymd) return '';
  const diff = Math.round((utc(ymd) - utc(today)) / 86400000);
  if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday (late)';
  const d = new Date(utc(ymd)); return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

const HK = { VI: 'Inspected', PU: 'Awaiting inspection', D: 'Dirty', IP: 'Being cleaned', OC: 'Occupied' };
export function roomState(r) {
  if (r.blocked || OFF.includes(r.inventoryStatus)) return { state: 'unavailable', detail: r.inventoryStatus === 'OOO' ? 'Out of order' : 'Out of service' };
  if (r.occupancyStatus === 'OCC') return { state: 'occupied', detail: '' };
  if (r.hkStatus === 'VI') return { state: 'available', detail: 'Inspected' };
  if (r.hkStatus === 'PU') return { state: 'available', detail: 'Awaiting inspection' };
  return { state: 'unavailable', detail: HK[r.hkStatus] || r.hkStatusLabel || 'Not ready' };
}

/**
 * @param {Object} payload  forecast payload (perRoomSheet, reservations, inactiveRooms, forecastDate)
 * @param {Object} [live]   live room board (preferred: current housekeeping state)
 */
export function buildRoomSheet(payload, live) {
  const today = (live && live.forecastDate) || (payload && payload.forecastDate) || '';
  const inactive = new Set(((payload && payload.inactiveRooms) || []).map(String));
  const snap = (payload && payload.perRoomSheet) || [];
  const useLive = !!(live && Array.isArray(live.rooms));
  const rooms = (useLive ? live.rooms.filter(r => isActiveRoom(r, today)) : snap).filter(r => !inactive.has(String(r.roomNumber)));
  const labels = new Map();
  snap.concat((payload && payload.reservations) || []).forEach(o => { if (o && o.typeCode && !labels.has(o.typeCode)) labels.set(o.typeCode, { base: o.baseLabel || o.typeCode, sub: o.subLabel || '' }); });
  const inHouse = new Map(), arriving = new Map();
  for (const r of (payload && payload.reservations) || []) {
    if (!r.roomNumber) continue;
    if (r.status === 'INH') { const k = String(r.roomNumber), prev = inHouse.get(k); if (!prev || String(r.departureDate) > String(prev.departureDate)) inHouse.set(k, r); }
    else if (r.status === 'RES' && r.arrivalDate === today) arriving.set(String(r.roomNumber), r);
  }
  const floors = new Map();
  for (const r of rooms) {
    if (!r.roomNumber) continue;
    const num = String(r.roomNumber), fid = normFloor(r.floorId, num), st = roomState(r), lab = labels.get(r.typeCode) || { base: r.typeCode || '', sub: '' };
    const res = st.state === 'occupied' ? inHouse.get(num) : null;
    const row = {
      roomNumber: num, typeCode: r.typeCode || '', typeLabel: lab.base + (lab.sub && lab.sub !== 'Standard' ? ` · ${lab.sub}` : ''), state: st.state, detail: st.detail,
      checkoutDate: res ? String(res.departureDate).slice(0, 10) : null, checkout: res ? `${dayLabel(res.departureDate, today)} · ${STANDARD_CHECKOUT}` : '',
      arrivingToday: st.state !== 'occupied' && arriving.has(num),
    };
    if (st.state === 'occupied' && !res) row.checkout = 'Check-out date unknown';
    if (!floors.has(fid)) floors.set(fid, { floorId: fid, label: floorLabel(fid), rooms: [], counts: { available: 0, unavailable: 0, occupied: 0 } });
    const f = floors.get(fid); f.rooms.push(row); f.counts[row.state] += 1;
  }
  const rank = (f) => (f === 'G' ? -1 : parseInt(f, 10) || 99);
  const list = [...floors.values()].sort((a, b) => rank(a.floorId) - rank(b.floorId));
  list.forEach(f => f.rooms.sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true })));
  const totals = { available: 0, unavailable: 0, occupied: 0, rooms: 0 };
  list.forEach(f => { Object.keys(f.counts).forEach(k => { totals[k] += f.counts[k]; }); totals.rooms += f.rooms.length; });
  return { date: today, source: useLive ? 'live' : 'snapshot', asOf: useLive ? live.fetchedAt : null, floors: list, totals, standardCheckout: STANDARD_CHECKOUT };
}

const STATE_LABEL = { available: 'Available', unavailable: 'Unavailable', occupied: 'Occupied' };
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** CSV text for the whole sheet (one line per room). */
export function roomSheetCsv(sheet) {
  const lines = [['Floor', 'Room', 'Room type', 'Status', 'Details', 'Checking out', 'Arriving today'].join(',')];
  for (const f of sheet.floors) for (const r of f.rooms) lines.push([f.label, r.roomNumber, r.typeLabel, STATE_LABEL[r.state], r.detail, r.checkout, r.arrivingToday ? 'yes' : ''].map(csvCell).join(','));
  return lines.join('\n') + '\n';
}
export { STATE_LABEL };
