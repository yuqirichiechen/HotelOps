// Sprint 23 — validation for a saved housekeeping plan (pure; the route in server.js does the SQL).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROOM_RE = /^[A-Za-z0-9-]{1,8}$/;
const DEFAULTS = { min: 10, max: 15, cleanWeight: 1, serviceWeight: 0.5 };
const CATS = ['dirty', 'departure', 'priority', 'progress', 'inhouse'];

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };

function sanitizeSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  const out = { min: num(s.min, 1, 100, DEFAULTS.min), max: num(s.max, 1, 200, DEFAULTS.max), cleanWeight: num(s.cleanWeight, 0.1, 5, DEFAULTS.cleanWeight), serviceWeight: num(s.serviceWeight, 0, 5, DEFAULTS.serviceWeight) };
  if (s.anonymous === true) out.anonymous = true;                      // planned by NUMBER of housekeepers ("Housekeeper 1…N"), no names
  if (s.blankNames === true) out.blankNames = true;                    // Sprint 24.9: No-name sheets print an empty name line (front desk writes it by hand) instead of "Housekeeper N"
  return out;
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
      if (CATS.includes(r.cat)) out.cat = r.cat;                            // sheet colour group
      if (typeof r.stay === 'string' && /^[A-Za-z0-9 ,→>-]{3,40}$/.test(r.stay.trim())) out.stay = r.stay.trim();
      rooms.push(out);
    }
    assignments.push({ userId, name, rooms });
  }
  return { date: body.date, settings: sanitizeSettings(body.settings), assignments };
}

/** Sprint 25 — property-wide housekeeping preferences: each housekeeper's preferred floors + the room types that are always priority (pink, cleaned first).
 *  @returns {{error: string}|{prefs: {floors: {[userId]: string[]}, priorityTypes: string[]}}} */
function sanitizePrefs(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Missing preferences' };
  const f = raw.floors == null ? {} : raw.floors;
  if (!f || typeof f !== 'object' || Array.isArray(f)) return { error: 'floors must be an object' };
  const ids = Object.keys(f); if (ids.length > 200) return { error: 'too many housekeepers' };
  const floors = {};
  for (const id of ids) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || id.startsWith('anon-')) return { error: 'bad housekeeper id' };
    if (!Array.isArray(f[id]) || f[id].length > 12) return { error: 'a housekeeper\'s floors must be a short list' };
    const list = [];
    for (const fl of f[id]) { if (typeof fl !== 'string' || !/^[A-Za-z0-9]{1,3}$/.test(fl)) return { error: 'bad floor' }; if (!list.includes(fl)) list.push(fl); }
    if (list.length) floors[id] = list;
  }
  const t = raw.priorityTypes == null ? [] : raw.priorityTypes;
  if (!Array.isArray(t) || t.length > 40) return { error: 'priorityTypes must be a short list' };
  const priorityTypes = [];
  for (const c of t) { if (typeof c !== 'string' || !/^[A-Za-z0-9]{1,12}$/.test(c)) return { error: 'bad room type' }; if (!priorityTypes.includes(c)) priorityTypes.push(c); }
  return { prefs: { floors, priorityTypes } };
}
const EMPTY_PREFS = () => ({ floors: {}, priorityTypes: [] });
/** Stored JSON text → clean prefs (anything unreadable → empty). */
function parsePrefs(text) { try { const r = sanitizePrefs(JSON.parse(String(text))); return r.error ? EMPTY_PREFS() : r.prefs; } catch { return EMPTY_PREFS(); } }

module.exports = { sanitizePlan, sanitizeSettings, sanitizePrefs, parsePrefs, DEFAULTS };
