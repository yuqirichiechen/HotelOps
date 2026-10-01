// Sprint 20.4 — pure view-model helpers for the dense reservation cards.
// Input is the stored `summary` (server/forecast/summarize.js) plus the
// list-level reservation `r` (payload.reservations[i]). No React, no I/O →
// unit-tested (see part5.md §20.4). Every function tolerates missing data:
// stored summaries are partial while the guest-detail job is still running.

export const STALE_AFTER_MS = 6 * 3600 * 1000; // "details are Nh old" warning threshold

export const fmtMoney = (n) =>
  (typeof n === 'number' && Number.isFinite(n))
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : null;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parseYmd = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};

/** "Sep 30" (adds the year when it isn't the reference year). */
export function fmtMD(v, refYear = new Date().getFullYear()) {
  const p = parseYmd(v);
  if (!p) return null;
  return `${MONTHS[p.m - 1]} ${p.d}${p.y !== refYear ? `, ${p.y}` : ''}`;
}

/** "Sep 30 → Oct 3" */
export function fmtStayRange(arr, dep, refYear) {
  const a = fmtMD(arr, refYear), d = fmtMD(dep, refYear);
  if (a && d) return `${a} → ${d}`;
  return a || d || null;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 adults · 1 child" (null when nothing known). */
export function guestsLabel(adults, children) {
  const parts = [];
  if (adults > 0)   parts.push(plural(adults, 'adult'));
  if (children > 0) parts.push(plural(children, 'child', 'children'));
  return parts.length ? parts.join(' · ') : null;
}

/**
 * When the stored detail was fetched, and whether that's old.
 * @returns {{label:string, stale:boolean, ageMs:number}|null}
 */
export function asOf(iso, nowMs = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const ageMs = Math.max(0, nowMs - t);
  const d = new Date(t), n = new Date(nowMs);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === n.toDateString();
  const label = sameDay ? time : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${time}`;
  return { label, stale: ageMs > STALE_AFTER_MS, ageMs };
}

export const ageText = (ageMs) => {
  const h = Math.floor(ageMs / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(ageMs / 60000))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

export const telHref = (phone) => {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits.length >= 7 ? `tel:${digits}` : null;
};
export const mailHref = (email) => (/^[^\s@]+@[^\s@]+$/.test(String(email || '')) ? `mailto:${email}` : null);

const cardLabel = (c) => `${c.issuer || c.type || 'Card'} ••${c.last4 || '••'}`;
// "2028-05" | "202805" → "05/28"
const fmtExp = (raw) => { const m = /^(\d{4})-?(\d{2})$/.exec(String(raw || '')); return m ? `${m[2]}/${m[1].slice(2)}` : null; };

/**
 * Chips for the collapsed card. tone: danger | warn | ok | info | muted.
 * Order = importance for the front desk (money problems first).
 */
export function buildChips(r, s) {
  const chips = [];
  if (!s) return chips;
  const m = s.money || {}, h = s.history || {}, f = s.flags || {};
  const cards = s.cards || [];

  if ((m.balanceDue || 0) > 0)
    chips.push({ key: 'balance', tone: 'danger', label: `Balance ${fmtMoney(m.balanceDue)}` });
  if ((m.depositDue || 0) > 0)
    chips.push({ key: 'deposit', tone: 'warn', label: `Deposit due ${fmtMoney(m.depositDue)}${m.depositNextDue ? ` · ${fmtMD(m.depositNextDue)}` : ''}` });
  else if ((m.depositPaid || 0) > 0)
    chips.push({ key: 'deposit', tone: 'ok', label: `Deposit paid ${fmtMoney(m.depositPaid)}` });
  if ((m.paid || 0) > 0 && !(m.balanceDue > 0))
    chips.push({ key: 'paid', tone: 'ok', label: `Paid ${fmtMoney(m.paid)}` });
  if (m.estimatedTotal != null && m.estimatedTotal > 0)
    chips.push({ key: 'est', tone: 'muted', label: `Stay ${fmtMoney(m.estimatedTotal)}` });

  if (cards.length) chips.push({ key: 'card', tone: 'muted', label: cardLabel(cards[0]) + (cards.length > 1 ? ` +${cards.length - 1}` : '') });
  else chips.push({ key: 'card', tone: 'warn', label: 'No card on file' });

  if ((h.noShows || 0) > 0) chips.push({ key: 'noshow', tone: 'warn', label: `${plural(h.noShows, 'prior no-show')}` });
  if (f.returningGuest)     chips.push({ key: 'returning', tone: 'info', label: `Returning · ${plural(h.priorStays, 'stay')}` });
  if (s.comments && s.comments.length)       chips.push({ key: 'notes', tone: 'info', label: plural(s.comments.length, 'note') });
  if (s.preferences && s.preferences.length) chips.push({ key: 'prefs', tone: 'info', label: plural(s.preferences.length, 'preference') });
  if (s.loyalty && s.loyalty.length)         chips.push({ key: 'loyalty', tone: 'info', label: 'Loyalty member' });
  if (s.service && s.service.total > 0)      chips.push({ key: 'svc', tone: 'info', label: plural(s.service.total, 'service request') });
  if (s.stay && s.stay.doNotDisturb)         chips.push({ key: 'dnd', tone: 'muted', label: 'Do not disturb' });
  if (s.stay && s.stay.doNotMoveRoom)        chips.push({ key: 'dnm', tone: 'muted', label: 'Do not move' });
  if (s.group && s.group.name)               chips.push({ key: 'group', tone: 'info', label: `Group · ${s.group.name}` });
  return chips;
}

const row = (label, value, extra = {}) => (value == null || value === '' || value === false ? null : { label, value, ...extra });

/**
 * Sections for the in-place "More details" panel. Rows with no value are
 * dropped, empty sections are dropped — so the panel never shows a wall of
 * "—". [{ title, rows:[{label,value,tone?,href?}], list?:[string] }]
 */
export function buildSections(r, s) {
  if (!s) return [];
  const g = s.guest || {}, st = s.stay || {}, b = s.booking || {}, m = s.money || {}, h = s.history || {},
    sv = s.service || {}, c = s.communications || {}, rm = s.room || {};
  const out = [];

  out.push({ title: 'Guest', rows: [
    row('Name', g.name),
    row('Phone', g.phone, { href: telHref(g.phone) }),
    row('Email', g.email, { href: mailHref(g.email) }),
    row('Address', g.address),
    row('Additional guests', (g.additionalGuests || []).join(', ')),
    row('Loyalty', (s.loyalty || []).join(', ')),
  ].filter(Boolean) });

  out.push({ title: 'Stay', rows: [
    row('Arrive', fmtMD(st.arrival)),
    row('Depart', fmtMD(st.departure)),
    row('Nights', st.nights != null ? String(st.nights) : null),
    row('Guests', guestsLabel(st.adults, st.children)),
    row('Room', rm.number),
    row('Group', s.group && s.group.name ? `${s.group.name}${s.group.status ? ` (${s.group.status})` : ''}` : null),
    row('Early arrival', st.earlyArrival ? 'Yes' : null),
    row('Booked by', b.bookedBy),
    row('Channel', b.walkIn ? 'Walk-in' : (b.bookingSources || []).join(' / ')),
    row('Avg nightly rate', fmtMoney(b.avgNightlyRate)),
    row('Created', b.createdAt ? fmtMD(String(b.createdAt).slice(0, 10)) : null),
    row('Cancelled on', b.cancelledOn ? fmtMD(String(b.cancelledOn).slice(0, 10)) : null, { tone: 'danger' }),
  ].filter(Boolean) });

  out.push({ title: 'Charges', rows: [
    row('Estimated total', fmtMoney(m.estimatedTotal)),
    row('Room charges', fmtMoney(m.roomCharges)),
    row('Taxes', fmtMoney(m.taxes)),
    row('Posted so far', (m.postedTotal || 0) > 0 ? fmtMoney(m.postedTotal) : null),
    row('Paid', (m.paid || 0) > 0 ? fmtMoney(m.paid) : null, { tone: 'ok' }),
    row('Balance due', m.balanceDue != null ? fmtMoney(m.balanceDue) : null, { tone: (m.balanceDue || 0) > 0 ? 'danger' : undefined }),
    row('Deposit due', (m.depositDue || 0) > 0 ? `${fmtMoney(m.depositDue)}${m.depositNextDue ? ` by ${fmtMD(m.depositNextDue)}` : ''}` : null, { tone: 'warn' }),
    row('Deposit paid', (m.depositPaid || 0) > 0 ? fmtMoney(m.depositPaid) : null, { tone: 'ok' }),
    row('Authorized', (m.authorized || 0) > 0 ? fmtMoney(m.authorized) : null),
    row('Extra auth needed', (m.authRequired || 0) > 0 ? fmtMoney(m.authRequired) : null, { tone: 'warn' }),
    row('Folios', m.foliosTotal ? `${m.foliosOpen} open of ${m.foliosTotal}` : null),
  ].filter(Boolean) });

  const cards = (s.cards || []).map(c => ({
    label: cardLabel(c),
    value: [fmtExp(c.exp) ? `exp ${fmtExp(c.exp)}` : null, c.holder, (c.authAmount || 0) > 0 ? `auth ${fmtMoney(c.authAmount)}` : null].filter(Boolean).join(' · '),
  }));
  out.push({ title: 'Payment cards', stack: true, rows: cards.length ? cards : [], emptyNote: 'No card on file', tone: cards.length ? undefined : 'warn' });

  out.push({ title: 'Notes', list: s.comments || [], rows: [] });
  out.push({ title: 'Preferences', list: s.preferences || [], rows: [] });

  out.push({ title: 'Guest history', rows: [
    row('Prior stays', h.priorStays != null && h.priorStays > 0 ? String(h.priorStays) : null),
    row('Upcoming stays', h.futureStays > 0 ? String(h.futureStays) : null),
    row('No-shows', h.noShows > 0 ? String(h.noShows) : null, { tone: 'warn' }),
    row('Cancellations', h.cancelled > 0 ? String(h.cancelled) : null),
    row('Total spent', (h.totalSpent || 0) > 0 ? fmtMoney(h.totalSpent) : null),
    row('Avg room rate', (h.avgRate || 0) > 0 ? fmtMoney(h.avgRate) : null),
  ].filter(Boolean) });

  out.push({ title: 'Service requests', rows: sv.total > 0 ? Object.entries(sv.byKind || {}).map(([k, n]) => ({ label: k[0].toUpperCase() + k.slice(1), value: String(n) })) : [] });

  out.push({ title: 'Communications', rows: [
    row('Last email', c.lastEmailAt ? `${c.lastEmailType || 'Email'}${c.lastEmailStatus ? ` · ${c.lastEmailStatus}` : ''}` : null),
    row('Sent', c.lastEmailAt ? (asOf(c.lastEmailAt) || {}).label : null),
    row('Registration card', c.lastRegCardAt ? (asOf(c.lastRegCardAt) || {}).label : null),
    row('Unread messages', c.unreadMessages > 0 ? String(c.unreadMessages) : null),
  ].filter(Boolean) });

  return out.filter(sec => (sec.rows && sec.rows.length) || (sec.list && sec.list.length) || sec.emptyNote);
}
