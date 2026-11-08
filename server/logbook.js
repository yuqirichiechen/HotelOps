// Sprint 26 — the Log Book: validation of a note (pure) + the row → API mapping. The routes in server.js do the SQL.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIORITIES = ['high', 'medium', 'general'];
const MAX_TITLE = 120, MAX_BODY = 4000;

/** a real calendar day (no Feb 30), and within about three years of today */
function realDate(s, today) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number), t = Date.UTC(y, m - 1, d);
  const back = new Date(t); if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return false;
  return Math.abs(t - today.getTime()) <= 3 * 366 * 86400000;
}

/**
 * @param {object} body   { title, body, priority, startDate, startTime, endDate, endTime, allDay, audience:{all,departments,staff}, showOnCalendar, requireAck, pinned, status }
 * status 'draft' only needs a title + the dates; 'published' (the default) also needs a description and someone to tell.
 * @returns {{error: string}|{note: object}}
 */
function sanitizeNote(raw, today = new Date()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Missing note' };
  const status = raw.status === 'draft' ? 'draft' : 'published', publish = status === 'published';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return { error: 'Give the note a title' };
  if (title.length > MAX_TITLE) return { error: `The title can be at most ${MAX_TITLE} characters` };
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (body.length > MAX_BODY) return { error: `The description can be at most ${MAX_BODY} characters` };
  if (publish && !body) return { error: 'Add a description before publishing' };
  const priority = raw.priority === undefined ? 'general' : raw.priority;
  if (!PRIORITIES.includes(priority)) return { error: 'priority must be high, medium or general' };
  if (!realDate(raw.startDate, today)) return { error: 'The start date is missing or not a real date' };
  if (!realDate(raw.endDate, today)) return { error: 'The end date is missing or not a real date' };
  if (raw.endDate < raw.startDate) return { error: 'The end cannot be before the start' };
  const allDay = raw.allDay === true || (raw.startTime == null && raw.endTime == null);
  let startTime = null, endTime = null;
  if (!allDay) {
    if (!TIME_RE.test(String(raw.startTime || '')) || !TIME_RE.test(String(raw.endTime || ''))) return { error: 'Give both a start time and an end time (or mark the note all day)' };
    startTime = raw.startTime; endTime = raw.endTime;
    if (raw.endDate === raw.startDate && endTime <= startTime) return { error: 'The end time must be after the start time' };
  }
  const a = raw.audience && typeof raw.audience === 'object' ? raw.audience : { all: true };
  const all = a.all === true;
  const departments = [], staff = [];
  if (!all) {
    if (a.departments !== undefined && (!Array.isArray(a.departments) || a.departments.length > 50)) return { error: 'departments must be a short list' };
    for (const d of a.departments || []) { if (!Number.isInteger(d) || d < 1 || d > 2147483647) return { error: 'bad department' }; if (!departments.includes(d)) departments.push(d); }
    if (a.staff !== undefined && (!Array.isArray(a.staff) || a.staff.length > 200)) return { error: 'staff must be a list' };
    for (const u of a.staff || []) { if (typeof u !== 'string' || !UUID_RE.test(u)) return { error: 'bad staff member' }; const k = u.toLowerCase(); if (!staff.includes(k)) staff.push(k); }
    if (publish && !departments.length && !staff.length) return { error: 'Choose who this note is for' };
  }
  const flag = (v, d) => (v === undefined ? d : v === true);
  return { note: { title, body, priority, startDate: raw.startDate, startTime, endDate: raw.endDate, endTime, audience: { all: all || (!departments.length && !staff.length), departments, staff }, showOnCalendar: flag(raw.showOnCalendar, true), requireAck: flag(raw.requireAck, false), pinned: flag(raw.pinned, false), status } };
}

/** DB row (dates as text, times as HH:MM) → what the pages get */
const toApi = (r) => ({
  id: r.note_id, title: r.title, body: r.body, priority: r.priority,
  startDate: r.start_date, startTime: r.start_time || null, endDate: r.end_date, endTime: r.end_time || null, allDay: !r.start_time && !r.end_time,
  audience: { all: !!r.audience_all, departments: r.audience_departments || [], staff: r.audience_staff || [] },
  showOnCalendar: !!r.show_on_calendar, requireAck: !!r.require_ack, pinned: !!r.pinned, status: r.status,
  author: r.author_label || '', createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at || null,
});

module.exports = { sanitizeNote, toApi, PRIORITIES, MAX_TITLE, MAX_BODY };
