// Sprint 26 — the Log Book's pure helpers: month grid, which notes touch which day, counts, sorting, labels, and the note form <-> API mapping.
// Dates are the hotel's local calendar days as 'YYYY-MM-DD' strings; times are 'HH:MM' (24 h). Nothing here touches the clock except `todayYmd`.

export const PRIORITIES = ['high', 'medium', 'general'];
export const PRIORITY = {
  high:    { label: 'High',    rank: 0 },
  medium:  { label: 'Medium',  rank: 1 },
  general: { label: 'General', rank: 2 },
};
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = MONTHS.map(m => m.slice(0, 3)), WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MAX_TITLE = 120, MAX_BODY = 4000;

const pad = (n) => String(n).padStart(2, '0');
const parse = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return { y, m, d }; };
const utc = (ymd) => { const { y, m, d } = parse(ymd); return Date.UTC(y, m - 1, d); };
export const toYmd = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const todayYmd = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export const addDays = (ymd, n) => toYmd(utc(ymd) + n * 86400000);
export const addMonths = (ymd, n) => { const { y, m } = parse(ymd); const t = new Date(Date.UTC(y, m - 1 + n, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`; };
export const monthStart = (ymd) => `${ymd.slice(0, 7)}-01`;
export const monthEnd = (ymd) => addDays(addMonths(ymd, 1), -1);
export const weekday = (ymd) => new Date(utc(ymd)).getUTCDay();

/** 'Thu, Nov 20, 2025' / 'Nov 20' / 'Thu, Nov 20' / 'November 2025' */
export const longDay = (ymd) => { const { y, m, d } = parse(ymd); return `${WD3[weekday(ymd)]}, ${MON3[m - 1]} ${d}, ${y}`; };
export const midDay = (ymd) => { const { m, d } = parse(ymd); return `${WD3[weekday(ymd)]}, ${MON3[m - 1]} ${d}`; };
export const shortDay = (ymd) => { const { m, d } = parse(ymd); return `${MON3[m - 1]} ${d}`; };
export const monthTitle = (ymd) => { const { y, m } = parse(ymd); return `${MONTHS[m - 1]} ${y}`; };
export const fmtTime = (hhmm) => { if (!hhmm) return ''; const [h, mi] = hhmm.split(':').map(Number); return `${h % 12 || 12}:${pad(mi)} ${h < 12 ? 'AM' : 'PM'}`; };
/** every 15 minutes, for the time pickers */
export const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

/** 6 weeks × 7 days (Sunday first) around the month of `ymd`, so the grid never changes height */
export function monthGrid(ymd) {
  const first = monthStart(ymd), start = addDays(first, -weekday(first)), month = first.slice(0, 7);
  const days = Array.from({ length: 42 }, (_, i) => { const d = addDays(start, i); return { ymd: d, day: parse(d).d, inMonth: d.startsWith(month) }; });
  return { title: monthTitle(first), first, start, end: days[41].ymd, weeks: Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7)) };
}

/** a note covers every day from startDate to endDate */
export const touches = (n, ymd) => n.startDate <= ymd && n.endDate >= ymd;
export const touchesRange = (n, a, b) => n.startDate <= b && n.endDate >= a;
export const notesOnDay = (notes, ymd) => notes.filter(n => touches(n, ymd));
export const countsOf = (list) => ({ high: list.filter(n => n.priority === 'high').length, medium: list.filter(n => n.priority === 'medium').length, general: list.filter(n => n.priority === 'general').length, total: list.length });
/** the month grid only shows notes marked "show on calendar" */
export const calendarNotes = (notes) => notes.filter(n => n.showOnCalendar !== false);
export const monthCounts = (notes, first) => countsOf(calendarNotes(notes).filter(n => touchesRange(n, first, monthEnd(first))));

/** audience filter: 'all' = no filter · 'everyone' = notes for all staff · 'dept:<id>' = notes for that department (plus the all-staff ones) */
export function audienceFilter(notes, f) {
  if (!f || f === 'all') return notes;
  if (f === 'everyone') return notes.filter(n => n.audience.all);
  if (f.startsWith('dept:')) { const id = Number(f.slice(5)); return notes.filter(n => n.audience.all || n.audience.departments.includes(id)); }
  return notes;
}

/** where a note starts on a given day, in minutes (all-day / earlier-day notes count as 00:00) */
const minutesOn = (n, ymd) => { if (n.startDate < ymd || !n.startTime) return 0; const [h, m] = n.startTime.split(':').map(Number); return h * 60 + m; };
export const SORTS = [
  { value: 'time-asc', label: 'Time (earliest)' }, { value: 'time-desc', label: 'Time (latest)' },
  { value: 'priority', label: 'Priority' }, { value: 'newest', label: 'Newest first' },
];
/** pinned notes always come first; then the chosen order (ties: priority, then title) */
export function sortNotes(list, sort, ymd) {
  const by = {
    'time-asc': (a, b) => minutesOn(a, ymd) - minutesOn(b, ymd),
    'time-desc': (a, b) => minutesOn(b, ymd) - minutesOn(a, ymd),
    priority: (a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank,
    newest: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
  }[sort] || (() => 0);
  return list.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || by(a, b) || PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || a.title.localeCompare(b.title));
}

/** 'All day' · '8:00 AM – 11:00 AM' · 'Nov 18 – Nov 22' · 'Nov 18, 2:00 PM → Nov 22, 11:00 AM' */
export function whenLabel(n) {
  if (n.startDate === n.endDate) return n.allDay ? 'All day' : `${fmtTime(n.startTime)} – ${fmtTime(n.endTime)}`;
  if (n.allDay) return `${shortDay(n.startDate)} – ${shortDay(n.endDate)}`;
  return `${shortDay(n.startDate)}, ${fmtTime(n.startTime)} → ${shortDay(n.endDate)}, ${fmtTime(n.endTime)}`;
}
/** 'All staff' · 'Maintenance, Front Desk' · 'Bryan, Berta' · 'Housekeeping, Bryan' */
export function audienceLabel(n, departments = [], staff = []) {
  if (n.audience.all) return 'All staff';
  const dn = new Map(departments.map(d => [d.department_id, d.name])), sn = new Map(staff.map(s => [s.user_id, s.name]));
  const names = [...n.audience.departments.map(id => dn.get(id) || 'Department'), ...n.audience.staff.map(id => sn.get(id) || 'Staff member')];
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ') || 'No one';
}

// ── the note form ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const emptyForm = (ymd) => ({ title: '', body: '', priority: 'general', startDate: ymd, startTime: '09:00', endDate: ymd, endTime: '10:00', allDay: false, audienceMode: 'all', departments: [], staff: [], showOnCalendar: true, requireAck: false, pinned: false, status: 'draft' });
export const formFromNote = (n) => ({
  title: n.title, body: n.body, priority: n.priority, startDate: n.startDate, startTime: n.startTime || '09:00', endDate: n.endDate, endTime: n.endTime || '10:00', allDay: !!n.allDay,
  audienceMode: n.audience.all ? 'all' : (n.audience.departments.length && !n.audience.staff.length ? 'departments' : 'staff'), departments: n.audience.departments.slice(), staff: n.audience.staff.slice(),
  showOnCalendar: n.showOnCalendar !== false, requireAck: !!n.requireAck, pinned: !!n.pinned, status: n.status,
});
/** the request body; 'Selected staff' may also carry departments picked earlier, so both lists are sent unless the audience is everyone */
export const formToBody = (f, status) => ({
  title: f.title.trim(), body: f.body.trim(), priority: f.priority, startDate: f.startDate, endDate: f.endDate, allDay: !!f.allDay,
  startTime: f.allDay ? null : f.startTime, endTime: f.allDay ? null : f.endTime,
  audience: f.audienceMode === 'all' ? { all: true, departments: [], staff: [] } : { all: false, departments: f.audienceMode === 'departments' ? f.departments : [], staff: f.audienceMode === 'staff' ? f.staff : [] },
  showOnCalendar: f.showOnCalendar, requireAck: f.requireAck, pinned: f.pinned, status,
});
/** the same checks the server makes, so the person sees them before anything is sent. Returns a message or ''. */
export function formError(f, status) {
  if (!f.title.trim()) return 'Give the note a title';
  if (f.title.length > MAX_TITLE) return `The title can be at most ${MAX_TITLE} characters`;
  if (f.body.length > MAX_BODY) return `The description can be at most ${MAX_BODY} characters`;
  if (!f.startDate || !f.endDate) return 'Choose the start and end dates';
  if (f.endDate < f.startDate) return 'The end cannot be before the start';
  if (!f.allDay && f.startDate === f.endDate && f.endTime <= f.startTime) return 'The end time must be after the start time';
  if (status === 'published') {
    if (!f.body.trim()) return 'Add a description before publishing';
    if (f.audienceMode === 'departments' && !f.departments.length) return 'Choose at least one department';
    if (f.audienceMode === 'staff' && !f.staff.length) return 'Choose at least one person';
  }
  return '';
}
