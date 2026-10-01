// Sprint 20.2 — compact, card-ready summary of one reservation's stored
// rGuest detail. PURE (no I/O) so it's unit-testable and can be re-run over
// stored raw detail whenever we improve it (the raw JSONB is the source of
// truth; `summary` is derived).
//
// Field names come from the 2026-09-30 live probe (see part5.md §20.2).
// Anything whose real-world shape we have NOT seen yet (comments, guest
// preferences, loyalty — all empty in the 45 reservations probed) is read
// defensively: we collect any human-readable strings we can find rather than
// assuming a schema, so nothing is silently dropped.

'use strict';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

// Pull readable text out of an unknown comment/preference structure.
// Walks objects/arrays, keeping strings under keys that look like text and
// skipping ids/uuids/flags.
const TEXT_KEYS = /^(text|comment|commentText|comments|note|notes|description|message|value|name|label|title)$/i;
const ID_LIKE = /^[0-9a-f]{24}$|^[0-9a-f]{8}-[0-9a-f]{4}-/i;
function collectText(node, out = [], depth = 0) {
  if (node == null || depth > 5 || out.length >= 30) return out;
  if (typeof node === 'string') {
    const t = node.trim();
    if (t && !ID_LIKE.test(t)) out.push(t);
    return out;
  }
  if (Array.isArray(node)) { node.forEach(n => collectText(n, out, depth + 1)); return out; }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string') { if (TEXT_KEYS.test(k)) collectText(v, out, depth + 1); }
      else collectText(v, out, depth + 1);
    }
  }
  return out;
}

function pickDefault(list) {
  const a = arr(list);
  return a.find(x => x && x.isDefault) || a[0] || null;
}

// Best-effort one-line address from whatever keys the profile address has.
const ADDR_KEYS = ['addressLine1', 'addressLine2', 'street', 'streetAddress', 'line1', 'line2', 'cityName', 'city',
  'stateName', 'stateCode', 'state', 'stateProvince', 'postalCode', 'zipCode', 'zip', 'countryCode', 'countryName', 'country'];
function formatAddress(a) {
  if (!a || typeof a !== 'object' || a.isPrivateAddress) return null;
  const parts = ADDR_KEYS.map(k => str(a[k])).filter(Boolean);
  // addressLines might be an array
  if (Array.isArray(a.addressLines)) parts.unshift(...a.addressLines.map(str).filter(Boolean));
  return parts.length ? [...new Set(parts)].join(', ') : null;
}

/**
 * @param {Object} detail   stored raw sections (see client.deepFetchReservation)
 * @param {Object} [listItem] the list-level reservation (payload.reservations[i]) — optional context
 * @returns {Object} compact summary
 */
function summarizeDetail(detail, listItem = {}) {
  const d = detail || {};
  const R = d.reservation || {};
  const P = d.profile || {};

  // ── guest ────────────────────────────────────────────────
  const pgi = R.primaryGuestInfo || {};
  const phone = pickDefault(P.phoneDetails && P.phoneDetails.phones);
  const email = pickDefault(P.emailDetails && P.emailDetails.emailAddresses);
  const addr  = pickDefault(P.addressDetails && P.addressDetails.addresses);
  const first = str(P.personalDetails && P.personalDetails.firstName);
  const last  = str(P.personalDetails && P.personalDetails.lastName);
  const guest = {
    name:    str(pgi.name) || [first, last].filter(Boolean).join(' ') || listItem.guestName || null,
    email:   str(pgi.primaryEmail) || str(email && email.emailAddress),
    phone:   str(pgi.primaryPhoneNumber) || str(phone && phone.number),
    address: formatAddress(addr),
    additionalGuests: arr(d.additionalGuests).map(g => str(g && g.name)).filter(Boolean),
    profileId: str(pgi.profileId),
  };

  // ── stay / booking ───────────────────────────────────────
  const occ = R.occupancy || {};
  const rates = arr(R.rateSnapshots).map(r => num(r && r.baseRoomRate)).filter(x => x != null);
  const src = R.sourceInfo || {};
  const stay = {
    arrival:   str(R.arrivalDate)   || listItem.arrivalDate   || null,
    departure: str(R.departureDate) || listItem.departureDate || null,
    nights:    num(R.nights) != null ? R.nights : (listItem.nights ?? null),
    adults:    num(occ.numberOfAdults),
    children:  num(occ.numberOfChildren),
    totalGuests: num(occ.totalGuests),
    doNotDisturb: !!R.doNotDisturb,
    doNotMoveRoom: !!R.doNotMoveRoom,
    earlyArrival: !!R.earlyArrival,
  };
  const booking = {
    confirmationCode: str(R.confirmationCode) || listItem.confirmationId || null,
    status:       str(R.status),
    bookedBy:     str(src.bookedBy),
    walkIn:       !!src.walkIn,
    bookingSources: arr(src.bookingSources).map(x => (typeof x === 'string' ? x : str(x && (x.name || x.sourceName)))).filter(Boolean),
    createdAt:    str(R.reservationCreateTime) || str(R.createTime),
    updatedAt:    str(R.updateTime),
    cancelledOn:  str(R.cancellationDate),
    depositStatus: str(R.depositStatus),
    avgNightlyRate: rates.length ? round2(rates.reduce((a, b) => a + b, 0) / rates.length) : null,
    rateCount: rates.length,
  };

  // ── money ────────────────────────────────────────────────
  const est = (arr(d.estimatedCharges)[0] || {}).summary || {};
  const balAll = d.balances && d.balances.accountStatementMap ? Object.values(d.balances.accountStatementMap)[0] : null;
  const bal = (balAll && balAll.balance) || {};
  const auth = d.authDetails && d.authDetails.authDetailsByPaymentSetting
    ? Object.values(d.authDetails.authDetailsByPaymentSetting)[0] : null;
  const authSummary = (auth && auth.authSummary) || {};
  const deposits = arr(d.scheduledDeposit);
  const depositDue = deposits.reduce((sum, x) => sum + (x && x.active !== false && !x.dueCollected ? (num(x.totalDueAmount) || 0) : 0), 0);
  const depositPaid = deposits.reduce((sum, x) => sum + (x && x.dueCollected ? (num(x.totalDueAmount) || 0) : 0), 0);
  const nextDue = deposits.filter(x => x && !x.dueCollected && x.dueDate).map(x => x.dueDate).sort()[0] || null;
  const money = {
    estimatedTotal: round2(num(est.estimatedTotal)),
    postedTotal:    round2(num(est.postedTotal)),
    roomCharges:    round2(num(est.estimatedRoomCharges)),
    taxes:          round2(num(est.estimatedTaxes)),
    paid:           round2(num(bal.paid)),
    balanceDue:     round2(num(bal.total)),     // same meaning the Sprint 18.7 UI used
    badDebt:        round2(num(bal.badDebt)),
    depositDue:     round2(depositDue),
    depositPaid:    round2(depositPaid),
    depositNextDue: nextDue,
    authorized:     round2(num(authSummary.currentAuthAmount)),
    authRequired:   round2(num(authSummary.additionalAuthRequired)),
    foliosOpen:     arr(d.folios).filter(f => f && !f.closed).length,
    foliosTotal:    arr(d.folios).length,
  };

  // ── cards (masked metadata only; that's all rGuest returns) ──
  const cards = arr(d.paymentInstruments).map(c => ({
    issuer: str(c && c.cardIssuer),            // UUID — frontend maps to a brand (Sprint 18.8)
    type:   str(c && c.cardType),
    last4:  str(c && c.accountNumberLast4),
    exp:    str(c && c.expirationYearMonth),
    holder: str(c && c.cardHolderName),
    authAmount: round2(num(c && c.authAmount)),
    pending: !!(c && c.cardPending),
  }));

  // ── comments / preferences / loyalty (shapes unseen → defensive) ──
  const comments = collectText(d.comments);
  const preferences = [...collectText(R.guestPreferences), ...collectText(R.profilePreferences), ...collectText(P.guestPreferenceDetails)];
  const loyalty = [...collectText(d.loyaltyInfo), ...collectText(R.loyaltyProgramsInfo)];

  // ── history ──────────────────────────────────────────────
  const sh = d.stayHistory || {};
  const history = {
    priorStays: num(sh.pastCount) ?? num(sh.totalNoPrevStays),
    currentStays: num(sh.currentCount),
    futureStays: num(sh.futureCount),
    noShows:    num(sh.totalNoShows),
    cancelled:  num(sh.totalCancelled),
    totalSpent: round2(num(sh.totalSpent)),
    avgRate:    round2(num(sh.avgRoomRate)),
  };

  // ── service requests ─────────────────────────────────────
  const svc = arr(d.serviceRequests).filter(s => s && !s.deleted);
  const byKind = {};
  svc.forEach(s => { byKind[s._kind || 'other'] = (byKind[s._kind || 'other'] || 0) + 1; });
  const service = { total: svc.length, byKind };

  // ── communications ───────────────────────────────────────
  const ep = d.emailPrintHistory || {};
  const communications = {
    lastEmailAt:     str(ep.recentEmail && ep.recentEmail.emailSentAt),
    lastEmailType:   str(ep.recentEmail && (ep.recentEmail.emailType || ep.recentEmail.mailType)),
    lastEmailStatus: str(ep.recentEmail && ep.recentEmail.emailStatus),
    lastRegCardAt:   str(ep.recentRegistrationCard && ep.recentRegistrationCard.emailSentAt),
    unreadMessages:  arr(d.messagesSummary).length,
  };

  // ── group / room ─────────────────────────────────────────
  const G = d.group || null;
  const group = G ? {
    id: str(G.id),
    name: str(G.name) || str(G.groupName) || str(G.description) || null,
    status: str(G.bookingStatus),
  } : null;
  const alloc = d.allocation || {};
  const dates = Object.keys(alloc.roomDetailsByDate || {}).sort();
  const lastDay = dates.length ? alloc.roomDetailsByDate[dates[dates.length - 1]] : null;
  const room = {
    number: str(lastDay && lastDay.roomNumber) || listItem.roomNumber || null,
    roomTypeId: str(lastDay && lastDay.roomTypeId) || str(alloc.bookedRoomTypeId),
    nightsAllocated: dates.length,
  };

  const flags = {
    hasComments:   comments.length > 0,
    hasPreferences: preferences.length > 0,
    hasLoyalty:    loyalty.length > 0,
    noCardOnFile:  cards.length === 0,
    balanceOwing:  (money.balanceDue || 0) > 0,
    depositOutstanding: money.depositDue > 0,
    returningGuest: (history.priorStays || 0) > 0,
    openServiceRequests: service.total > 0,
    isGroup: !!group,
  };

  return {
    v: 1,
    guest, stay, booking, money, cards, comments, preferences, loyalty,
    history, service, communications, group, room, flags,
  };
}

module.exports = { summarizeDetail, collectText, formatAddress };
