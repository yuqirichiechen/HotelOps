// Sprint 20.3 — status tabs for the Reservations list, modelled on
// rGuest's own tiles (Remaining arrivals / In-house / Remaining departures…)
// so the desk sees the same numbers in the same words, and can switch
// between them with one tap.
//
// Pure functions only (no React) — unit-tested against rGuest's own KPI
// numbers using a real scrape (see part5.md §20.3).
//
// Reservation fields come from server/forecast/compute.js `reservationsOut`:
//   status  — RES (booked, not arrived) | INH (in house) | DPT (departed)
//             (CXL / NS / NSG / MOV are excluded server-side)
//   kind    — 'departure' | 'arrival' | 'stayover' | 'inhouse' | 'future'
//             (departure wins over arrival for same-day day-use)

export const RESN_TABS = [
  // Default — the guests the front desk still has to check in.
  { key: 'remainingArrivals',   label: 'Remaining arrivals',   short: 'Arriving',
    pred: r => r.kind === 'arrival' && r.status === 'RES' },
  // Arrived today (checked in).
  { key: 'arrived',             label: 'Arrived',              short: 'Arrived',
    pred: r => r.kind === 'arrival' && r.status === 'INH' },
  // Everyone currently in a room (arrived today + stayovers + not-yet-out departures).
  { key: 'inhouse',             label: 'In-house',             short: 'In-house',
    pred: r => r.status === 'INH' },
  { key: 'remainingDepartures', label: 'Remaining departures', short: 'Departing',
    pred: r => r.kind === 'departure' && r.status === 'INH' },
  { key: 'departed',            label: 'Departed',             short: 'Departed',
    pred: r => r.status === 'DPT' },
  { key: 'future',              label: 'Future',               short: 'Future',
    pred: r => r.kind === 'future' },
  // Today's un-arrived guests who still have no room picked.
  { key: 'needsRoom',           label: 'Needs a room',         short: 'No room',
    pred: r => r.kind === 'arrival' && r.status === 'RES' && !r.isPreAssigned },
  { key: 'all',                 label: 'All',                  short: 'All',
    pred: () => true },
];

export const DEFAULT_RESN_TAB = 'remainingArrivals';

const TAB_BY_KEY = Object.fromEntries(RESN_TABS.map(t => [t.key, t]));

export const tabPredicate = (key) => (TAB_BY_KEY[key] || TAB_BY_KEY[DEFAULT_RESN_TAB]).pred;

/** { tabKey: count } over ALL rows (not narrowed by the room-type/source dropdowns). */
export function computeTabCounts(rows) {
  const counts = {};
  RESN_TABS.forEach(t => { counts[t.key] = 0; });
  (rows || []).forEach(r => { RESN_TABS.forEach(t => { if (t.pred(r)) counts[t.key] += 1; }); });
  return counts;
}

const byName = (a, b) =>
  String(a.guestName || '').localeCompare(String(b.guestName || ''), undefined, { sensitivity: 'base' });

/** Stable per-tab ordering. Arrival tabs list room-less guests first (they need action), then A→Z. */
export function sortForTab(key, rows) {
  const copy = (rows || []).slice();
  if (key === 'remainingArrivals' || key === 'needsRoom') {
    return copy.sort((a, b) => (Number(!!a.isPreAssigned) - Number(!!b.isPreAssigned)) || byName(a, b));
  }
  if (key === 'future') {
    return copy.sort((a, b) => String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || '')) || byName(a, b));
  }
  return copy.sort(byName);
}

/** Friendly empty-state copy + (optionally) a tab to jump to. */
export const EMPTY_COPY = {
  remainingArrivals:   { text: 'Everyone expected today has arrived.', goto: 'arrived',  gotoLabel: 'See who has arrived' },
  arrived:             { text: 'No one has checked in yet today.',     goto: 'remainingArrivals', gotoLabel: 'See remaining arrivals' },
  inhouse:             { text: 'No guests are in house right now.' },
  remainingDepartures: { text: 'Everyone leaving today has checked out.', goto: 'departed', gotoLabel: 'See who has departed' },
  departed:            { text: 'No one has checked out yet today.' },
  future:              { text: 'No upcoming reservations in the scraped window.' },
  needsRoom:           { text: 'Every remaining arrival has a room.' },
  all:                 { text: 'No reservations in this snapshot.' },
};
