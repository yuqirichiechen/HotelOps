// Sprint 26.2 — turns what the deep fetch stored (raw rGuest JSON) into what the dev reservation card shows: the reservation's audit log ("history" popup), the
// folio's authorization & payment history, and the comments (reservation + guest profile, archived marked). Pure — no I/O.
'use strict';

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const money = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 100) / 100 : 0);

/** 'discloseRoomType' → 'Disclose Room Type' */
const words = (s) => str(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const pathLabel = (path) => arr(path).map(p => (p && p.type === 'FIELD' ? words(p.value) : str(p && p.value))).filter(Boolean).join('/');
const vals = (list) => arr(list).map(x => str(x && x.value)).filter(Boolean).join(', ');
const VERB = { ADD: 'Added', REMOVE: 'Removed', DELETE: 'Removed', MODIFY: 'Changed', REPLACE: 'Changed', CHANGE: 'Changed', UPDATE: 'Changed' };

/** one rGuest audit change → "Added Status RES" / "Removed Room Details/…/Room Hold HOTEL-320" / "Changed Departure Date from A to B" */
function changeLine(ch) {
  const verb = VERB[str(ch && ch.type).toUpperCase()] || words(ch && ch.type) || 'Changed', label = pathLabel(ch && ch.path);
  const from = vals(ch && ch.from), to = vals(ch && ch.to);
  if (verb === 'Changed') return `${verb} ${label} from ${from || '(empty)'} to ${to || '(empty)'}`.trim();
  return `${verb} ${label}${vals(verb === 'Removed' ? (ch.from || ch.to) : (ch.to || ch.from)) ? ' ' + vals(verb === 'Removed' ? (ch.from || ch.to) : (ch.to || ch.from)) : ''}`.trim();
}

/** rGuest names its own service accounts with long internal ids; show what the page itself shows */
function userLabel(u) {
  const x = str(u);
  if (!x || x === 'unknown') return 'System';
  if (/^stay-integration-serviceRuntimeUser/.test(x)) return 'Stay integration user';
  if (/serviceRuntimeUser/.test(x)) return 'System';
  return x;
}

const MAX_LINES_PER_ENTRY = 40;
/** @returns {{ at: string, user: string, lines: string[], more: number }} */
function formatAuditEntry(e) {
  const lines = [];
  arr(e && e.changes).forEach(ch => { const l = changeLine(ch); if (l) lines.push(l); });
  arr(e && e.events).forEach(ev => { const n = words(ev && ev.name); if (n) lines.push(`Event: ${n}`); });
  return { at: str(e && (e.timestamp || e.date)), user: userLabel(e && e.user), lines: lines.slice(0, MAX_LINES_PER_ENTRY).map(l => l.slice(0, 400)), more: Math.max(0, lines.length - MAX_LINES_PER_ENTRY) };
}

/** a folio authorization / payment row, as the rGuest table shows it */
function formatPayment(r) {
  const last4 = str(r && r.cardNumber).replace(/\D/g, '').slice(-4);
  return {
    date: str(r && r.transactionDate), time: str(r && r.transactionTime), user: userLabel(r && r.user), authCode: str(r && r.authCode),
    card: last4 ? `${'*'.repeat(12)}${last4}` : '', type: str(r && r.authorizationType), amount: money(r && r.amount), issuer: str(r && r.issuer),
    status: r && r.success === false ? 'Failed' : 'Success', reason: str(r && r.failureReason),
  };
}

function formatComment(c) {
  const meta = (c && c.metadata) || {};
  return {
    id: str(c && c.id), text: str(c && c.text), type: str(c && c.commentTypeName), importance: str(c && c.importance).toLowerCase(),
    author: str(c && (c.createdBy || meta.createdByUser)), at: str(c && c.createdAt),
    modifiedBy: str(c && c.lastModifiedBy) !== str(c && c.createdBy) || str(c && c.lastModifiedAt) !== str(c && c.createdAt) ? str(c && c.lastModifiedBy) : '', modifiedAt: str(c && c.lastModifiedAt) !== str(c && c.createdAt) ? str(c && c.lastModifiedAt) : '',
    archived: !!meta.deleted, alert: !!(c && c.displayAsAlert), visibleToGuest: !!meta.visibleToGuest, edits: arr(meta.history).length,
  };
}
const newestFirst = (a, b) => String(b.at).localeCompare(String(a.at));

/** @param {object} detail stored raw sections · @param {object} sections stored per-section status */
function buildExtras(detail, sections) {
  const d = detail || {}, S = sections || {};
  const audit = d.auditLog || {}, entries = arr(audit.entries).map(formatAuditEntry);
  const rows = arr(d.authHistory).map(formatPayment).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const total = (t) => money(rows.filter(r => r.type === t && r.status === 'Success').reduce((n, r) => n + r.amount, 0));
  const status = {}; ['auditLog', 'authHistory', 'reservationComments', 'profileComments'].forEach(k => { status[k] = S[k] ? { ok: S[k].ok !== false, at: S[k].at || null, error: S[k].error || null } : null; });
  return {
    audit: { total: Number.isFinite(audit.totalElements) ? audit.totalElements : entries.length, truncated: !!audit.truncated, entries },
    payments: { rows, totals: { payment: total('PAYMENT'), authorized: total('AUTHORIZED'), released: total('RELEASED'), refund: total('REFUND') } },
    comments: { reservation: arr(d.reservationComments).map(formatComment).sort(newestFirst), profile: arr(d.profileComments).map(formatComment).sort(newestFirst) },
    sections: status,
    loaded: !!(S.auditLog || S.authHistory || S.reservationComments || S.profileComments),
  };
}

module.exports = { buildExtras, formatAuditEntry, formatPayment, formatComment, changeLine, userLabel, words };
