// Sprint 26 / 26.1 — the Log Book: validation of a note (pure), who may do what, and the row → API mapping. The routes in server.js do the SQL.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const PRIORITIES = ['high', 'medium', 'general'];
const MAX_TITLE = 120, MAX_BODY = 4000, MAX_LINES = 400, MAX_RUNS = 120, MAX_RECIPIENTS = 20;

/** a real calendar day (no Feb 30), and within about three years of today */
function realDate(s, today) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number), t = Date.UTC(y, m - 1, d);
  const back = new Date(t); if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return false;
  return Math.abs(t - today.getTime()) <= 3 * 366 * 86400000;
}

/**
 * The formatted description. It is DATA, not HTML: { v: 1, lines: [ { k: 'p' | 'ul' | 'ol', runs: [ { t, b?, i?, u?, s?, c?, h? } ] } ] }
 * (t = text without line breaks; b / i / u / s = bold / italic / underline / strike; c / h = text / highlight colour as #rrggbb). Anything else is refused or dropped,
 * so a stored document can only ever draw text in a handful of styles. `plain` is the readable version (bullets as "• ", numbers as "1. ").
 * @returns {{error: string}|{doc: object, plain: string}}
 */
function sanitizeRich(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1 || !Array.isArray(raw.lines)) return { error: 'The formatted description is not valid' };
  if (raw.lines.length > MAX_LINES) return { error: 'The description has too many lines' };
  const lines = []; let n = 0, total = 0;
  for (const l of raw.lines) {
    if (!l || typeof l !== 'object' || !['p', 'ul', 'ol'].includes(l.k) || !Array.isArray(l.runs)) return { error: 'The formatted description is not valid' };
    if (l.runs.length > MAX_RUNS) return { error: 'A line has too many differently formatted parts' };
    const runs = [];
    for (const r of l.runs) {
      if (!r || typeof r !== 'object' || typeof r.t !== 'string') return { error: 'The formatted description is not valid' };
      if (/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(r.t)) return { error: 'The description contains characters that are not allowed' };
      if (r.c !== undefined && !(typeof r.c === 'string' && COLOR_RE.test(r.c))) return { error: 'A text colour is not valid' };
      if (r.h !== undefined && !(typeof r.h === 'string' && COLOR_RE.test(r.h))) return { error: 'A highlight colour is not valid' };
      if (!r.t) continue;
      total += r.t.length; const run = { t: r.t };
      if (r.b === true) run.b = true; if (r.i === true) run.i = true; if (r.u === true) run.u = true; if (r.s === true) run.s = true;
      if (r.c) run.c = r.c.toLowerCase(); if (r.h) run.h = r.h.toLowerCase();
      const prev = runs[runs.length - 1];
      if (prev && ['b', 'i', 'u', 's', 'c', 'h'].every(k => prev[k] === run[k])) prev.t += run.t; else runs.push(run);   // neighbours with the same look are one run
    }
    lines.push({ k: l.k, runs });
  }
  while (lines.length && !lines[lines.length - 1].runs.length) lines.pop();            // no empty lines at the end
  if (total > MAX_BODY) return { error: `The description can be at most ${MAX_BODY} characters` };
  const counter = { ol: 0 }; let last = null;
  const plain = lines.map(l => {
    counter.ol = l.k === 'ol' ? (last === 'ol' ? counter.ol + 1 : 1) : 0; last = l.k;
    const text = l.runs.map(r => r.t).join('');
    return (l.k === 'ul' ? '• ' : l.k === 'ol' ? `${counter.ol}. ` : '') + text;
  }).join('\n');
  return { doc: { v: 1, lines }, plain };
}

/**
 * @param {object} raw   { title, body | bodyRich, priority, startDate, startTime, endDate, endTime, allDay, audience:{all,departments,staff}, recipients:[uuid], showOnCalendar, requireAck, pinned, status }
 * status 'draft' only needs a title + the dates; 'published' (the default) also needs a description and someone to tell.
 * @returns {{error: string}|{note: object}}
 */
function sanitizeNote(raw, today = new Date()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Missing note' };
  const status = raw.status === 'draft' ? 'draft' : 'published', publish = status === 'published';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return { error: 'Give the note a title' };
  if (title.length > MAX_TITLE) return { error: `The title can be at most ${MAX_TITLE} characters` };
  let body, bodyRich = null;
  if (raw.bodyRich !== undefined && raw.bodyRich !== null) {
    const r = sanitizeRich(raw.bodyRich); if (r.error) return { error: r.error };
    body = r.plain.trim(); bodyRich = r.doc;
  } else body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (body.length > (bodyRich ? MAX_BODY + MAX_LINES * 5 : MAX_BODY)) return { error: `The description can be at most ${MAX_BODY} characters` };   // (a formatted body's plain text also carries "• " / "1. " prefixes)
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
  const recipients = [];
  if (raw.recipients !== undefined && raw.recipients !== null) {
    if (!Array.isArray(raw.recipients) || raw.recipients.length > MAX_RECIPIENTS) return { error: `A note can be sent to at most ${MAX_RECIPIENTS} people` };
    for (const u of raw.recipients) { if (typeof u !== 'string' || !UUID_RE.test(u)) return { error: 'bad recipient' }; const k = u.toLowerCase(); if (!recipients.includes(k)) recipients.push(k); }
  }
  const flag = (v, d) => (v === undefined ? d : v === true);
  return { note: { title, body, bodyRich, priority, startDate: raw.startDate, startTime, endDate: raw.endDate, endTime, audience: { all: all || (!departments.length && !staff.length), departments, staff }, recipients, showOnCalendar: flag(raw.showOnCalendar, true), requireAck: flag(raw.requireAck, false), pinned: flag(raw.pinned, false), status } };
}

/** Who is asking: dev, a manager (admin), or front-desk staff. `id` is their user id when they are staff (managers sign in with a username, not a user row). */
const viewerOf = (auth) => ({ role: auth.role === 'dev' ? 'dev' : auth.role === 'admin' ? 'admin' : 'front_desk', id: auth.type === 'staff' && UUID_RE.test(String(auth.sub)) ? String(auth.sub).toLowerCase() : null, name: String(auth.name || auth.sub || '').slice(0, 120) });
const isOwn = (viewer, row) => !!(viewer.id && row.author_user_id && String(row.author_user_id).toLowerCase() === viewer.id);
/** edit / pin: dev and managers on any note, front desk only on their own · delete: dev on any, front desk on their own, managers never · archive / restore: dev only */
const permissions = (viewer, row) => ({
  edit: viewer.role === 'dev' || viewer.role === 'admin' || isOwn(viewer, row),
  delete: viewer.role === 'dev' || (viewer.role === 'front_desk' && isOwn(viewer, row)),
  archive: viewer.role === 'dev',
});

/** DB row (dates as text, times as HH:MM) → what the pages get. `readIds` = Set of note ids the viewer has already looked at. */
const toApi = (r, viewer = { role: 'dev', id: null }, readIds = new Set()) => {
  const toYou = !!(viewer.id && (r.recipients || []).map(x => String(x).toLowerCase()).includes(viewer.id));
  return {
    id: r.note_id, title: r.title, body: r.body, bodyRich: r.body_rich || null, priority: r.priority,
    startDate: r.start_date, startTime: r.start_time || null, endDate: r.end_date, endTime: r.end_time || null, allDay: !r.start_time && !r.end_time,
    audience: { all: !!r.audience_all, departments: r.audience_departments || [], staff: r.audience_staff || [] }, recipients: r.recipients || [],
    showOnCalendar: !!r.show_on_calendar, requireAck: !!r.require_ack, pinned: !!r.pinned, status: r.status,
    author: r.author_label || '', postedAt: r.published_at || r.created_at, createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at || null,
    modifiedAt: r.modified_at || null, modifiedBy: r.modified_by || '',
    toYou, unread: toYou && r.status === 'published' && !readIds.has(r.note_id), can: permissions(viewer, r),
  };
};

module.exports = { sanitizeNote, sanitizeRich, toApi, viewerOf, permissions, PRIORITIES, MAX_TITLE, MAX_BODY };
