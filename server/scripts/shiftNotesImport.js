// Sprint 29.5 — the logic of the ONE-TIME import of the hotel's Excel "Shift notes for 2026" into the Log Book. Pure (no database, no files) except `commitPlan` / `undoBatch`,
// which take a pg client. The command-line tool is server/scripts/import-shift-notes.js.
//
// The workbook: one sheet per month (Nov 2025 … Oct 2026). Each day is a block that starts with the day name in column A and the date number in B. Inside a block:
//   D = a note, Q = from, R = to          S = a PRIORITY note, AF = from, AG = to
// Four other sheets (a room-repair list, housekeeper tips, two empty templates) are not shift notes and are ignored.
//
// What an imported note looks like in the Log Book: published, visible to EVERYONE, a plain title + text, the author as a name (no staff account is linked), the date (all day),
// "needs resolving" OFF, nobody notified (no recipients), priority notes = High priority, normal notes = General.
const SHEETS = [
  ['November', 2025, 11], ['December', 2025, 12], ['Jan 2026', 2026, 1], ['Feburary', 2026, 2], ['March', 2026, 3], ['April', 2026, 4],
  ['May', 2026, 5], ['Jun', 2026, 6], ['July', 2026, 7], ['August', 2026, 8], ['September', 2026, 9], ['October', 2026, 10],
];
const DAY_RE = /^(mon|tue|wed|thu|fri|sat|sun)/i;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_BATCH = 'shiftnotes-2026-xlsx';
const UNKNOWN_AUTHOR = 'Unknown (Excel)';
const TITLE_MAX = 110;   // the Log Book title column holds 120

/** tidy a cell: Windows line breaks → \n, runs of spaces → one, trim */
const clean = (s) => String(s === undefined || s === null ? '' : s).replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
/** for comparing two notes: one line, lower case */
const norm = (s) => clean(s).replace(/\s+/g, ' ').toLowerCase();
const pad = (n) => String(n).padStart(2, '0');
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const utc = (y, m, d) => Date.UTC(y, m - 1, d);
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pretty = (isoDate) => `${MONTH_NAMES[+isoDate.slice(5, 7) - 1]} ${+isoDate.slice(8, 10)}, ${isoDate.slice(0, 4)}`;

/** the first line, cut at a word boundary to fit the title column */
const makeTitle = (text) => {
  const first = clean(text).split('\n')[0].trim();
  if (first.length <= TITLE_MAX) return first;
  const cut = first.slice(0, TITLE_MAX); const sp = cut.lastIndexOf(' ');
  return (sp > 60 ? cut.slice(0, sp) : cut).trimEnd() + '…';
};

/** @param {object} note  {text, to, overflowDay, sheet, repeat:{first,last,days}|null} */
const makeBody = (note, title) => {
  const parts = [];
  const text = clean(note.text);
  if (text !== title) parts.push(text);   // a one-line note is just its title
  if (note.overflowDay) parts.push(`[Excel: this was written under day ${note.overflowDay} of the ${note.sheet} sheet, which has fewer days — placed on the last day of the month]`);
  if (note.repeat) parts.push(`(Written again every day in the Excel sheet: ${pretty(note.repeat.first)} – ${pretty(note.repeat.last)})`);
  const to = clean(note.to); if (to) parts.push(`To: ${to}`);
  return parts.join('\n\n');
};

/**
 * Reads the workbook into dated notes.
 * @param {object} XLSX  the `xlsx` module   @param {object} wb  XLSX.readFile(...)
 * @param {{dateShift?: Record<string, number>}} [opts]  dateShift: days to move every note of a sheet (e.g. { April: -1 }) if a sheet turns out to be off by a day
 */
function parseWorkbook(XLSX, wb, opts = {}) {
  const shift = opts.dateShift || {}; const notes = []; const warnings = []; const stats = { sheets: 0, blocks: 0, junkSkipped: 0, orphanAuthors: 0 };
  const colIdx = (c) => XLSX.utils.decode_col(c);
  SHEETS.forEach(([sheet, year, month], sheetOrder) => {
    const ws = wb.Sheets[sheet]; if (!ws || !ws['!ref']) { warnings.push(`sheet "${sheet}" not found`); return; }
    stats.sheets += 1; const ref = XLSX.utils.decode_range(ws['!ref']);
    const get = (r, c) => { const x = ws[XLSX.utils.encode_cell({ r: r - 1, c: colIdx(c) })]; return x && x.v !== undefined ? String(x.v) : ''; };
    const blocks = []; for (let r = 8; r <= ref.e.r + 1; r += 1) { const a = clean(get(r, 'A')); if (DAY_RE.test(a)) blocks.push({ r, label: a.slice(0, 3).toLowerCase(), typed: clean(get(r, 'B')) }); }
    stats.blocks += blocks.length; const monthLen = new Date(Date.UTC(year, month, 0)).getUTCDate();
    blocks.forEach((b, i) => {
      const end = (blocks[i + 1] ? blocks[i + 1].r : ref.e.r + 2) - 1;
      const typed = parseInt(b.typed, 10); const day = Number.isInteger(typed) && typed >= 1 && typed <= 31 ? typed : i + 1;   // the typed date, else the block's place in the month
      let d = day, overflowDay = null; if (d > monthLen) { overflowDay = d; d = monthLen; }
      const baseMs = utc(year, month, d); const dateMs = baseMs + (shift[sheet] || 0) * 86400000; const flags = [];
      if (overflowDay) flags.push(`day ${overflowDay} on a ${monthLen}-day sheet`);
      else if (WEEKDAYS[new Date(baseMs).getUTCDay()] !== b.label) flags.push(`weekday label "${b.label}" but ${iso(baseMs)} is ${WEEKDAYS[new Date(baseMs).getUTCDay()]}`);
      for (let r = b.r; r <= end; r += 1) {
        for (const [kind, tc, fc, oc] of [['note', 'D', 'Q', 'R'], ['priority', 'S', 'AF', 'AG']]) {
          const text = clean(get(r, tc)); const from = clean(get(r, fc)); const to = clean(get(r, oc));
          if (!text) { if (kind === 'note' && from) stats.orphanAuthors += 1; continue; }
          if (text.length < 2) { stats.junkSkipped += 1; continue; }
          notes.push({ sheet, sheetOrder, row: r, kind, text, from, to, date: iso(dateMs), overflowDay, flags: [...flags, ...(from ? [] : ['no author'])], key: `${sheet}!R${r}:${kind}` });
        }
      }
    });
  });
  return { notes, warnings, stats };
}

/** folds identical consecutive-day repeats (same kind, text and author on the next day, or the same day) into one multi-day note */
function mergeRepeats(notes) {
  const sorted = [...notes].sort((a, b) => a.date.localeCompare(b.date) || a.sheetOrder - b.sheetOrder || a.row - b.row);
  const open = new Map(); const out = [];
  for (const n of sorted) {
    const k = `${n.kind}|${norm(n.text)}|${norm(n.from)}`; const cur = open.get(k);
    if (cur && (Date.parse(n.date) - Date.parse(cur.last)) <= 86400000) { cur.last = n.date > cur.last ? n.date : cur.last; cur.members.push(n); }
    else { const g = { first: n.date, last: n.date, members: [n] }; open.set(k, g); out.push(g); }
  }
  return out;
}

/** @returns {{rows: object[], summary: object}}  rows are ready for `commitPlan` */
function buildPlan(parsed, { merge = true, batch = DEFAULT_BATCH } = {}) {
  const groups = merge ? mergeRepeats(parsed.notes) : [...parsed.notes].sort((a, b) => a.date.localeCompare(b.date) || a.sheetOrder - b.sheetOrder || a.row - b.row).map(n => ({ first: n.date, last: n.date, members: [n] }));
  const rows = groups.map((g) => {
    const m = g.members[0]; const days = new Set(g.members.map(x => x.date)).size;
    const repeat = days > 1 ? { first: g.first, last: g.last, days } : null; const title = makeTitle(m.text);
    const flags = [...new Set(g.members.flatMap(x => x.flags))];
    return {
      import_key: m.key, import_batch: batch, title, body: makeBody({ ...m, repeat }, title), priority: m.kind === 'priority' ? 'high' : 'general',
      start_date: g.first, end_date: g.last, author_label: m.from || UNKNOWN_AUTHOR, source: g.members.length > 1 ? `${m.key} (+${g.members.length - 1} more)` : m.key, merged: g.members.length, flags,
    };
  });
  const perMonth = {}; rows.forEach(r => { const k = r.start_date.slice(0, 7); perMonth[k] = (perMonth[k] || 0) + 1; });
  return { rows, summary: {
    read: parsed.notes.length, notes: rows.length, folded: parsed.notes.length - rows.length, mergedGroups: rows.filter(r => r.merged > 1).length, high: rows.filter(r => r.priority === 'high').length, general: rows.filter(r => r.priority === 'general').length,
    noAuthor: rows.filter(r => r.author_label === UNKNOWN_AUTHOR).length, flagged: rows.filter(r => r.flags.length).length, junkSkipped: parsed.stats.junkSkipped, perMonth,
  } };
}

const INSERT_SQL = `INSERT INTO logbook_notes
  (property_id, title, body, priority, start_date, start_time, end_date, end_time, audience_all, audience_departments, audience_staff, show_on_calendar, require_ack, pinned, status,
   author_user_id, author_label, created_at, updated_at, published_at, import_key, import_batch)
  VALUES ($1, $2, $3, $4, $5::date, NULL, $6::date, NULL, TRUE, '{}', '{}', TRUE, FALSE, FALSE, 'published', NULL, $7,
   ($5::date + time '12:00') AT TIME ZONE 'America/Los_Angeles', ($5::date + time '12:00') AT TIME ZONE 'America/Los_Angeles', ($5::date + time '12:00') AT TIME ZONE 'America/Los_Angeles', $8, $9)
  ON CONFLICT (property_id, import_key) WHERE import_key IS NOT NULL DO NOTHING`;

/** inserts the plan in ONE transaction; a note that was already imported (same key) is skipped, so running it twice adds nothing. Nobody is notified: no recipients, no "needs resolving". */
async function commitPlan(client, rows, { property = 'default' } = {}) {
  let inserted = 0, skipped = 0;
  await client.query('BEGIN');
  try {
    for (const r of rows) {
      const res = await client.query(INSERT_SQL, [property, r.title, r.body, r.priority, r.start_date, r.end_date, r.author_label, r.import_key, r.import_batch]);
      if (res.rowCount) inserted += 1; else skipped += 1;
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  return { inserted, skipped };
}

/** removes every note of one import run (and nothing else) */
async function undoBatch(client, { property = 'default', batch = DEFAULT_BATCH } = {}) {
  const res = await client.query('DELETE FROM logbook_notes WHERE property_id = $1 AND import_batch = $2', [property, batch]);
  return { removed: res.rowCount };
}

const csvCell = (v) => { const s = String(v === undefined || v === null ? '' : v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** the review file: one line per note-to-be, in date order */
const toCsv = (rows) => ['start_date,end_date,days_merged,priority,author,title,body,source,flags', ...rows.map(r => [r.start_date, r.end_date, r.merged, r.priority, r.author_label, r.title, r.body, r.source, r.flags.join(' | ')].map(csvCell).join(','))].join('\n') + '\n';

module.exports = { SHEETS, DEFAULT_BATCH, UNKNOWN_AUTHOR, TITLE_MAX, clean, norm, makeTitle, makeBody, parseWorkbook, mergeRepeats, buildPlan, commitPlan, undoBatch, toCsv };
