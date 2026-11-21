// Sprint 29.4 — the cards on the front desk's FORECAST page (portal tab; it was called Reservations until 29.4) and which of them dev has switched on.
// Dev picks them in Dev → Platform (setting `forecast_fd_cards`, a JSON list of keys; dev-write-only because of its `forecast_` prefix). Nothing is deleted from the code: a card that is
// switched off is simply not drawn, and dev can switch it back on at any time. The same list of keys lives on the server (server/frontdesk.js — a test keeps the two in step).
export const FD_CARDS = [
  { key: 'arrivals',    kind: 'tile',  label: 'Arrivals left',        note: 'top card · arrivals still to come today' },
  { key: 'inhouse',     kind: 'tile',  label: 'In-house',             note: 'top card · guests staying right now' },
  { key: 'departures',  kind: 'tile',  label: 'Check-outs left',      note: 'top card · departures still to leave today' },
  { key: 'leftToSell',  kind: 'tile',  label: 'Left to sell',         note: 'top card · rooms ready to sell (inspected + pickup)' },
  { key: 'dirty',       kind: 'tile',  label: 'Dirty rooms',          note: 'top card · rooms that need cleaning' },
  { key: 'roomsToSell', kind: 'table', label: 'Rooms to sell today',  note: 'the room-type table: what is left to sell by type' },
  { key: 'sellable',    kind: 'card',  label: 'Sellable vs arriving', note: 'sellable rooms against arrivals, by room type (off by default since 29.4 — it repeats the numbers above)' },
];
export const FD_CARD_KEYS = FD_CARDS.map(c => c.key);
/** what the front desk sees until dev changes it: everything except "Sellable vs arriving" */
export const FD_CARDS_DEFAULT = FD_CARD_KEYS.filter(k => k !== 'sellable');
/** the stored setting (JSON text) → the list of keys to draw; anything unusable (unset, broken, empty) falls back to the default so the page is never blank */
export const parseFdCards = (raw) => {
  let list = null;
  try { list = JSON.parse(raw); } catch { list = null; }
  if (!Array.isArray(list)) return [...FD_CARDS_DEFAULT];
  const keep = FD_CARD_KEYS.filter(k => list.includes(k));   // known keys only, once each, in page order
  return keep.length ? keep : [...FD_CARDS_DEFAULT];
};
