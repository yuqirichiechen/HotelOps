// Sprint 20.5 — search, "needs attention" logic, sorting, CSV export for the
// Reservations list. PURE (no React / I/O) → unit-tested (see part5.md §20.5).
// Inputs: list-level reservations `r` (payload.reservations[i]) and the stored
// guest `summary` (server/forecast/summarize.js), which may be missing while the
// background job is still filling in.

import { fmtMoney, plural } from './resnFormat';

// ── search ──────────────────────────────────────────────────────────────────

const fold = (v) => String(v == null ? '' : v).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const digitsOf = (v) => String(v || '').replace(/\D/g, '');

/**
 * Instant client-side match on the fields every row already has. Every
 * whitespace-separated token must match somewhere (AND), so "smith 214" finds
 * Smith in room 214 and "lee double" narrows by room type. Accent/case-insensitive.
 * Phone/email/notes are matched server-side (see `matchesSummary` for the
 * fields already loaded).
 */
export function matchesList(r, query) {
  const q = fold(query).trim();
  if (!q) return true;
  const hay = fold([r.guestName, r.confirmationId, r.roomNumber, r.baseLabel, r.subLabel, r.source, r.statusLabel, r.vipLabel].filter(Boolean).join(' '));
  return q.split(/\s+/).every(tok => hay.includes(tok));
}

/** Match against an already-loaded summary (phone digits, email, notes…). */
export function matchesSummary(s, query) {
  const q = fold(query).trim();
  if (!q || !s) return false;
  const g = s.guest || {};
  const digits = digitsOf(query);
  if (digits.length >= 4 && digitsOf(g.phone).includes(digits)) return true;
  const hay = fold([g.name, g.email, g.address, (s.booking || {}).confirmationCode, (s.group || {}).name,
    ...(s.comments || []), ...(s.preferences || [])].filter(Boolean).join(' '));
  return q.split(/\s+/).every(tok => hay.includes(tok));
}

// ── needs attention ─────────────────────────────────────────────────────────
// Each reason: key, label, tone, weight (higher = sooner). Context-aware: a
// "future" booking without a card isn't urgent; an in-house guest owing money is.

export const ATTENTION_DEFS = [
  { key: 'noRoom',   label: 'No room',        tone: 'danger', weight: 10 },
  { key: 'depositOverdue', label: 'Deposit overdue', tone: 'danger', weight: 9 },
  { key: 'balance',  label: 'Balance owing',  tone: 'danger', weight: 8 },
  { key: 'noCard',   label: 'No card',        tone: 'warn',   weight: 6 },
  { key: 'depositDue', label: 'Deposit due',  tone: 'warn',   weight: 5 },
  { key: 'noShow',   label: 'Prior no-show',  tone: 'warn',   weight: 4 },
  { key: 'timing',   label: 'Early / late',   tone: 'info',   weight: 3 },
  { key: 'vip',      label: 'VIP',            tone: 'info',   weight: 3 },
  { key: 'notes',    label: 'Has notes',      tone: 'info',   weight: 2 },
  { key: 'service',  label: 'Service request', tone: 'info',  weight: 2 },
  { key: 'stale',    label: 'Details stale',  tone: 'muted',  weight: 1 },
];
const DEF = Object.fromEntries(ATTENTION_DEFS.map(d => [d.key, d]));

/**
 * @param {Object} r listing row   @param {Object|null} entry stored summary entry ({summary, fetchedAt, remoteState})
 * @param {string} todayYmd property date (YYYY-MM-DD) — for "deposit overdue"
 * @returns {{score:number, reasons:Array<{key,label,tone,weight}>}}
 */
export function attentionOf(r, entry, todayYmd, nowMs = Date.now()) {
  const keys = [];
  const s = entry && entry.summary && Object.keys(entry.summary).length ? entry.summary : null;
  const active = r.kind === 'arrival' || r.kind === 'inhouse' || r.kind === 'stayover' || r.kind === 'departure';
  const pending = r.kind === 'arrival' && r.status === 'RES';

  if (pending && !r.isPreAssigned) keys.push('noRoom');
  if (r.vipLabel) keys.push('vip');
  if (pending && (r.isEarlyArrival || r.isRedEye)) keys.push('timing');

  if (s) {
    const m = s.money || {}, h = s.history || {};
    if ((m.balanceDue || 0) > 0 && active) keys.push('balance');
    if ((m.depositDue || 0) > 0) {
      if (m.depositNextDue && todayYmd && m.depositNextDue < todayYmd) keys.push('depositOverdue');
      else if (r.kind !== 'future') keys.push('depositDue');
    }
    if ((s.cards || []).length === 0 && (pending || r.status === 'INH')) keys.push('noCard');
    if ((h.noShows || 0) > 0 && (pending || r.kind === 'future')) keys.push('noShow');
    if ((s.comments || []).length) keys.push('notes');
    if (s.service && s.service.total > 0 && r.status === 'INH') keys.push('service');
  }
  if (entry && entry.fetchedAt && r.status !== 'DPT' && active) {
    const age = nowMs - new Date(entry.fetchedAt).getTime();
    if (age > 6 * 3600 * 1000) keys.push('stale');
  }
  const reasons = [...new Set(keys)].map(k => DEF[k]).sort((a, b) => b.weight - a.weight);
  return { score: reasons.reduce((n, d) => n + d.weight, 0), reasons };
}

// ── sorting ─────────────────────────────────────────────────────────────────

export const SORT_OPTIONS = [
  { key: 'default',   label: 'Default' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'name',      label: 'Name A–Z' },
  { key: 'balance',   label: 'Balance owing' },
  { key: 'arrival',   label: 'Arrival date' },
];

const byName = (a, b) => String(a.guestName || '').localeCompare(String(b.guestName || ''), undefined, { sensitivity: 'base' });

/** `defaultSorted` is the per-tab order from resnTabs.sortForTab; other modes re-sort it (stable). */
export function applySort(mode, defaultSorted, { entryOf, attentionOfRow }) {
  const rows = defaultSorted.slice();
  if (mode === 'name') return rows.sort(byName);
  if (mode === 'arrival') return rows.sort((a, b) => String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || '')) || byName(a, b));
  if (mode === 'balance') {
    const bal = (r) => { const e = entryOf(r.id); return (e && e.summary && e.summary.money && e.summary.money.balanceDue) || 0; };
    return rows.sort((a, b) => bal(b) - bal(a) || byName(a, b));
  }
  if (mode === 'attention') {
    const sc = new Map(rows.map(r => [r.id, attentionOfRow(r).score]));
    return rows.sort((a, b) => sc.get(b.id) - sc.get(a.id) || byName(a, b));
  }
  return rows;
}

/** Count of rows per attention key (for the filter chips). */
export function attentionCounts(rows, attentionOfRow) {
  const counts = {};
  rows.forEach(r => attentionOfRow(r).reasons.forEach(d => { counts[d.key] = (counts[d.key] || 0) + 1; }));
  return counts;
}

/** Rows that have ANY of the selected reasons (OR). Empty selection = no filtering. */
export function filterByAttention(rows, selected, attentionOfRow) {
  const keys = Object.keys(selected || {}).filter(k => selected[k]);
  if (!keys.length) return rows;
  return rows.filter(r => attentionOfRow(r).reasons.some(d => keys.includes(d.key)));
}

// ── CSV export ──────────────────────────────────────────────────────────────

// Spreadsheet formula injection guard: a cell starting with = + - @ (or tab/CR)
// is prefixed with an apostrophe so Excel/Sheets treat it as text.
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_COLUMNS = ['Status', 'Guest', 'Confirmation', 'Room', 'Room type', 'Arrival', 'Departure', 'Nights', 'Adults', 'Children',
  'Channel', 'Rate plan', 'Phone', 'Email', 'Balance due', 'Deposit due', 'Stay total', 'Card', 'Notes', 'Flags'];

export function toCsv(rows, entryOf) {
  const lines = [CSV_COLUMNS.map(csvCell).join(',')];
  rows.forEach(r => {
    const e = entryOf(r.id), s = e && e.summary && Object.keys(e.summary).length ? e.summary : {};
    const g = s.guest || {}, m = s.money || {}, st = s.stay || {}, b = s.booking || {}, card = (s.cards || [])[0];
    const flags = [r.vipLabel && 'VIP', r.isEarlyArrival && 'Early arrival', r.isRedEye && 'Late arrival', r.isPetFriendly && 'Pet', r.isGroupBooking && 'Group'].filter(Boolean).join('; ');
    lines.push([
      r.statusLabel, r.guestName || g.name, r.confirmationId, r.roomNumber || '', r.baseLabel, r.arrivalDate, r.departureDate, r.nights,
      st.adults ?? '', st.children ?? '', b.walkIn ? 'Walk-in' : (b.bookingSources || []).join(' / '), r.source,
      g.phone, g.email, m.balanceDue != null ? m.balanceDue : '', m.depositDue || '', m.estimatedTotal != null ? m.estimatedTotal : '',
      card ? `${card.issuer || card.type || 'Card'} ****${card.last4 || ''}` : '', (s.comments || []).join(' | '), flags,
    ].map(csvCell).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}

// ── print sheet rows (pure view-model) ──────────────────────────────────────
export function printRow(r, entry) {
  const s = entry && entry.summary && Object.keys(entry.summary).length ? entry.summary : {};
  const g = s.guest || {}, m = s.money || {}, st = s.stay || {}, card = (s.cards || [])[0];
  const money = [];
  if ((m.balanceDue || 0) > 0) money.push(`Bal ${fmtMoney(m.balanceDue)}`);
  if ((m.depositDue || 0) > 0) money.push(`Dep due ${fmtMoney(m.depositDue)}`);
  if (!card && entry) money.push('NO CARD');
  const guests = [st.adults > 0 && plural(st.adults, 'adult'), st.children > 0 && plural(st.children, 'child', 'children')].filter(Boolean).join(', ');
  const flags = [r.vipLabel && 'VIP', r.isEarlyArrival && 'Early', r.isRedEye && 'Late', r.isPetFriendly && 'Pet', r.isGroupBooking && 'Group', r.scheduledForRoomMove && 'Room move'].filter(Boolean);
  return {
    guest: r.guestName || g.name || '(no name)', conf: r.confirmationId || '',
    room: r.roomNumber || '—', type: [r.baseLabel, r.subLabel && r.subLabel !== 'Standard' ? r.subLabel : null].filter(Boolean).join(' · '),
    nights: r.nights, arrival: r.arrivalDate, departure: r.departureDate, guests, phone: g.phone || '',
    money: money.join(' · '), notes: (s.comments || []).concat(s.preferences || []), flags,
  };
}
