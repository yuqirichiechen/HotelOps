// Sprint 23 — validation for a saved housekeeping plan (pure; the route in server.js does the SQL).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROOM_RE = /^[A-Za-z0-9-]{1,8}$/;
const DEFAULTS = { min: 10, max: 15, cleanWeight: 1, serviceWeight: 0.5 };

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };

function sanitizeSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  return { min: num(s.min, 1, 100, DEFAULTS.min), max: num(s.max, 1, 200, DEFAULTS.max), cleanWeight: num(s.cleanWeight, 0.1, 5, DEFAULTS.cleanWeight), serviceWeight: num(s.serviceWeight, 0, 5, DEFAULTS.serviceWeight) };
}

/** @returns {{error: string}|{date, settings, assignments}} */
function sanitizePlan(body, today = new Date()) {
  if (!body || typeof body !== 'object') return { error: 'Missing plan' };
  if (!DATE_RE.test(String(body.date || ''))) return { error: 'date must be YYYY-MM-DD' };
  const d = Date.parse(body.date + 'T12:00:00Z');
  if (!Number.isFinite(d) || Math.abs(d - today.getTime()) > 40 * 86400000) return { error: 'date is out of range' };
  if (!Array.isArray(body.assignments) || body.assignments.length > 60) return { error: 'assignments must be a list of at most 60 housekeepers' };
  const seenUsers = new Set(), seenRooms = new Set(), assignments = [];
  for (const a of body.assignments) {
    if (!a || typeof a !== 'object') return { error: 'bad housekeeper entry' };
    const userId = String(a.userId || ''), name = String(a.name || '').trim();
    if (!userId || userId.length > 64 || !name || name.length > 200) return { error: 'each housekeeper needs a userId and a name' };
    if (seenUsers.has(userId)) return { error: 'a housekeeper is listed twice' };
    seenUsers.add(userId);
    if (!Array.isArray(a.rooms) || a.rooms.length > 300) return { error: 'rooms must be a list' };
    const rooms = [];
    for (const r of a.rooms) {
      const roomNumber = String(r && r.roomNumber || '');
      if (!ROOM_RE.test(roomNumber)) return { error: `bad room number "${roomNumber.slice(0, 12)}"` };
      if (!r || (r.kind !== 'clean' && r.kind !== 'service')) return { error: 'room kind must be clean or service' };
      if (seenRooms.has(roomNumber)) return { error: `room ${roomNumber} is assigned twice` };
      seenRooms.add(roomNumber);
      const out = { roomNumber, kind: r.kind };
      if (r.priority) out.priority = true;
      if (r.pinned) out.pinned = true;                                   // placed by hand — automatic balancing leaves it alone
      if (typeof r.typeCode === 'string' && /^[A-Za-z0-9]{1,12}$/.test(r.typeCode)) out.typeCode = r.typeCode;
      if (typeof r.why === 'string' && r.why.trim()) out.why = r.why.trim().slice(0, 90);
      rooms.push(out);
    }
    assignments.push({ userId, name, rooms });
  }
  return { date: body.date, settings: sanitizeSettings(body.settings), assignments };
}

module.exports = { sanitizePlan, sanitizeSettings, DEFAULTS };
