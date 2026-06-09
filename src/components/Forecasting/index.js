// Sprint 17.3 — Admin Forecast page.
//
// Replaces the ComingSoon stub. Renders the latest forecast_snapshot
// (or an empty state if none exists yet). Run Scraper button hits
// POST /api/admin/forecast/scrape; the response is the fresh
// snapshot. Generate Forecast is wired in 17.4.
//
// One file with inline sub-components on purpose — keeps the data
// flow readable, matches AdminHome's pattern, avoids over-fragmenting
// what's essentially one page.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../auth';
import { useView } from '../../shells/ViewContext';
// ForecastSheet import removed in 17.12 — modal lives on Forecast page now.
import ForecastSettings from './ForecastSettings';
import ForecastHistory from './ForecastHistory';
import './Forecasting.css';


// ── Sprint 17.9 inline SVG icons ───────────────────────────
// Stroke uses currentColor so each icon matches its button's text.

const IconRefresh = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-3.2-6.9" />
    <polyline points="21 4 21 10 15 10" />
  </svg>
);

const IconSend = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22 11 13 2 9z" />
  </svg>
);

const IconClock = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 14" />
  </svg>
);

const IconGear = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

const IconDocument = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="15" y2="17" />
  </svg>
);

// Sprint 17.10 — KPI card icons + back chevron.

const IconBack = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const IconBroom = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 4 9 10" />
    <path d="m19 8-3-3" />
    <path d="M9 10 4 21l11-5z" />
    <path d="M7 17h5" />
  </svg>
);

const IconBriefcase = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconExit = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

const IconBed = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 17v-5a2 2 0 0 1 2-2h11a4 4 0 0 1 4 4v3" />
    <path d="M2 17h20" />
    <path d="M2 20v-3" />
    <path d="M22 20v-3" />
    <circle cx="7.5" cy="12.5" r="1.5" />
  </svg>
);

const IconSparkle = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v4" />
    <path d="M12 17v4" />
    <path d="M3 12h4" />
    <path d="M17 12h4" />
    <path d="m5.6 5.6 2.8 2.8" />
    <path d="m15.6 15.6 2.8 2.8" />
    <path d="m5.6 18.4 2.8-2.8" />
    <path d="m15.6 8.4 2.8-2.8" />
  </svg>
);

const IconUsers = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
    <path d="M16 3.1a4 4 0 0 1 0 7.8" />
  </svg>
);

// Sprint 18.1 — moon for "Staying Tonight" KPI; alert triangle for
// "No Room Assigned" KPI (needs admin review).
const IconMoon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const IconAlertTriangle = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9"  x2="12"   y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// SVG progress ring. `pct` 0–100; while indeterminate (no real
// signal from the server), the parent fakes it from elapsed time.
// Sprint 17.10 — default size 16 so it swaps cleanly with the
// 16px IconRefresh (the button width doesn't jump when scraping
// starts/stops).
const ProgressRing = ({ pct = 0, size = 16, stroke = 2.2 }) => {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const offset = C * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke="currentColor" strokeWidth={stroke}
        strokeDasharray={C} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.25s linear' }}
      />
    </svg>
  );
};


// ── Formatters ─────────────────────────────────────────────

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const fmtDate = (val) => {
  if (!val) return '—';
  // Accepts either 'YYYY-MM-DD' (e.g. payload.forecastDate) or an ISO
  // timestamp (e.g. forecast_snapshot.forecast_date, which pg
  // serialises as '2026-06-04T00:00:00.000Z'). Slice to the date
  // portion first, then build a Date with explicit local midnight so
  // toLocaleDateString doesn't shift it by timezone.
  const s = String(val).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
};

const ACTION_LABEL = {
  checkoutClean:   'Check-out clean',
  stayoverService: 'Stayover service',
  none:            '—',
};


// ── Sub-components ─────────────────────────────────────────

// Sprint 17.10 KpiCard. Layout per the user's reference mockup:
//
//   [ICON]  Label
//           PRIMARY  secondary
//           sublabel
//
// `primary` is the big foreground number (e.g. "16 not-yet-arrived");
// `secondary` is the muted "of N" companion (e.g. "of 38"). When
// primary === 0 (work finished) the card outlines green. Icon
// renders inside a colored circle — accent picks the bg color.
const KpiCard = ({ label, primary, secondary, sublabel, accent, icon }) => {
  const done = primary === 0;
  return (
    <div className={`fc-kpi-card fc-kpi-${accent || 'default'}${done ? ' fc-kpi-done' : ''}`}>
      <div className="fc-kpi-icon" aria-hidden="true">{icon}</div>
      <div className="fc-kpi-body">
        <div className="fc-kpi-label">{label}</div>
        <div className="fc-kpi-numbers">
          <span className="fc-kpi-primary">{primary ?? '—'}</span>
          {secondary != null && secondary !== '' && (
            <span className="fc-kpi-secondary">{secondary}</span>
          )}
        </div>
        {sublabel && <div className="fc-kpi-sublabel">{sublabel}</div>}
      </div>
    </div>
  );
};

// Sprint 17.8 — flattened reservation list w/ filter chips. Reads
// from `payload.reservations` (added in 17.7). Rendered when the
// view toggle is on "details".
// Sprint 18.1 — filter chips match the new mockup: All / Arrivals
// Today / In-house / Departures Today / Future / No Room Assigned.
// "Stayovers" chip dropped (overlap with In-house — staying-tonight
// surfaces as its own KPI card instead). "Future" + "No Room
// Assigned" are new.
const RESN_FILTER_LABELS = [
  ['all',         'All'],
  ['arrival',     'Arrivals Today'],
  ['inhouse',     'In-house'],
  ['departure',   'Departures Today'],
  ['future',      'Future'],
  ['noRoom',      'No Room Assigned'],
];

// HK action implied by the reservation's kind. Mirrors what the
// per-room compute does — duplicated here so the table can show it
// per reservation row without needing to look up rooms.
const HK_ACTION_FOR_KIND = {
  arrival:   { label: 'None',       cls: 'none' },
  departure: { label: 'Full Clean', cls: 'full' },
  stayover:  { label: 'Touch-up',   cls: 'touch' },
  inhouse:   { label: 'None',       cls: 'none' },
  future:    { label: 'None',       cls: 'none' },
};

const STATUS_PILL_CLASS = {
  'Confirmed': 'confirmed',
  'Pending':   'pending',
  'In house':  'inhouse',
  'Departed':  'departed',
  'Cancelled': 'cancelled',
};

// Sprint 18.3 — derive the Notes/Flags pill row for a reservation.
// Order matters: VIP first (highest signal), then arrival timing,
// then logistics. Returns an array of `{label, cls}` ready to map
// into the existing `.fc-flag-*` pill classes.
function buildResnFlags(r) {
  const flags = [];
  if (r.vipLabel)              flags.push({ label: r.vipLabel,      cls: 'vip' });
  if (r.isEarlyArrival)        flags.push({ label: 'Early arrival', cls: 'early' });
  if (r.isRedEye)              flags.push({ label: 'Late arrival',  cls: 'late' });
  if (r.scheduledForRoomMove)  flags.push({ label: 'Room move',     cls: 'move' });
  if (r.isDayUse)              flags.push({ label: 'Day use',       cls: 'day' });
  if (r.isHighFloor)           flags.push({ label: 'High floor',    cls: 'high' });
  if (r.isPetFriendly)         flags.push({ label: 'Pet friendly',  cls: 'pet' });
  if (r.isGroupBooking)        flags.push({ label: 'Group',         cls: 'group' });
  return flags;
}

// Sprint 18.2 — deep-link URL pattern for an individual reservation
// in rGuest Stay. Confirmed via user-supplied URL on 2026-06-09;
// tenantId / propertyId are Snoqualmie's. If/when we add a second
// hotel these should move into a per-property config row.
const RGUEST_RESERVATION_URL = (id) =>
  `https://stay.rguest.com/v2/reservation/${encodeURIComponent(id)}?tenantId=1566&propertyId=481`;

// Sprint 18.1 — predicate per filter chip. Composes with the
// Room Type + Source dropdowns inside the table.
const FILTER_PREDICATES = {
  all:       () => true,
  arrival:   r => r.kind === 'arrival',
  inhouse:   r => r.kind === 'inhouse'  || r.kind === 'stayover',
  departure: r => r.kind === 'departure',
  future:    r => r.kind === 'future',
  noRoom:    r => r.kind === 'arrival' && !r.isPreAssigned,
};

const ReservationDetailsTable = ({
  rows, filter, onFilter, sources = [], roomTypes = [],
  sourceFilter, onSourceFilter, typeFilter, onTypeFilter,
  // Sprint 18.2 — selection wiring for the right-rail detail panel.
  selectedId, onSelect,
}) => {
  const filtered = rows.filter(r => {
    const pred = FILTER_PREDICATES[filter] || FILTER_PREDICATES.all;
    if (!pred(r)) return false;
    if (sourceFilter && r.source !== sourceFilter) return false;
    if (typeFilter   && r.baseLabel !== typeFilter) return false;
    return true;
  });

  return (
    <div className="fc-detail-wrap">
      <div className="fc-detail-controls">
        <div className="fc-chip-row" role="tablist">
          {RESN_FILTER_LABELS.map(([key, lbl]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`fc-chip${filter === key ? ' active' : ''}`}
              onClick={() => onFilter(key)}
            >{lbl}</button>
          ))}
        </div>
        <div className="fc-detail-selects">
          <label>
            <span>Room type</span>
            <select value={typeFilter || ''} onChange={e => onTypeFilter(e.target.value || null)}>
              <option value="">All</option>
              {roomTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            <span>Source</span>
            <select value={sourceFilter || ''} onChange={e => onSourceFilter(e.target.value || null)}>
              <option value="">All</option>
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="fc-detail-tablewrap">
        {/* Sprint 18.1 — column layout per Reservations mockup:
            Guest / Room / Room Type / Arrival / Departure / Nights
            / Source / Status / Room Status / Notes-Flags. Notes-
            Flags column shows derived flags only for v1 (VIP, late
            arrival, etc. land in 18.3 after recon). */}
        <table className="fc-detail-table fc-detail-table-v18">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Room</th>
              <th>Room Type</th>
              <th>Arrival</th>
              <th>Departure</th>
              <th>Nights</th>
              <th>Source</th>
              <th>Status</th>
              <th>Room Status</th>
              <th>Notes / Flags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="fc-detail-empty">No reservations match the current filters.</td></tr>
            )}
            {filtered.map(r => {
              const statusCls = STATUS_PILL_CLASS[r.statusLabel] || 'inhouse';
              // Sprint 18.1 — Room Status pulls from per-room data
              // when the reservation is assigned; otherwise shows
              // "No Room Assigned" inline.
              const roomStatusLabel = r.roomNumber
                ? (r.hkStatusLabel || r.occupancyStatus || '—')
                : 'No Room Assigned';
              const flags = buildResnFlags(r);
              const isSelected = selectedId === r.id;
              return (
                <tr
                  key={r.id}
                  className={`fc-detail-row${isSelected ? ' selected' : ''}`}
                  onClick={() => onSelect && onSelect(isSelected ? null : r.id)}
                >
                  <td>
                    <div className="fc-detail-guest">{r.guestName || '(no name)'}</div>
                    {r.confirmationId && (
                      <div className="fc-detail-sub">Conf. {r.confirmationId}</div>
                    )}
                  </td>
                  <td className="fc-detail-room">{r.roomNumber || '—'}</td>
                  <td>
                    <div>{r.baseLabel || '—'}</div>
                    {r.subLabel && r.subLabel !== 'Standard' && (
                      <div className="fc-detail-sub">{r.subLabel}</div>
                    )}
                  </td>
                  <td>{fmtDate(r.arrivalDate)}</td>
                  <td>{fmtDate(r.departureDate)}</td>
                  <td className="fc-detail-nights">{r.nights}</td>
                  <td>{r.source || '—'}</td>
                  <td><span className={`fc-pill fc-pill-status-${statusCls}`}>{r.statusLabel}</span></td>
                  <td>
                    {r.roomNumber
                      ? <span className="fc-pill fc-pill-action-none">{roomStatusLabel}</span>
                      : <span className="fc-pill fc-pill-status-pending">No Room Assigned</span>}
                  </td>
                  <td>
                    {flags.length === 0 && <span className="fc-detail-sub-inline">—</span>}
                    {flags.map(f => (
                      <span key={f.label} className={`fc-pill fc-flag-${f.cls}`}>{f.label}</span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="fc-detail-footer">
        Showing <strong>{filtered.length}</strong> of <strong>{rows.length}</strong> reservations
      </div>
    </div>
  );
};

// Sprint 17.8 — progress per cleaning category. Departure progress
// uses the metrics endpoint (remainingDepartures.remaining gives
// us "still to leave"; total - remaining = "already departed and
// presumably needing clean"). Stayovers + rooms-reviewed can't be
// tracked yet without a separate signal — show as 0% until we add
// that.
const ServiceProgress = ({ kpis, metricsSnapshot }) => {
  const depTotal = metricsSnapshot?.remainingDepartures?.total ?? kpis.departures ?? 0;
  const depRem   = metricsSnapshot?.remainingDepartures?.remaining ?? null;
  const depDone  = depRem != null ? (depTotal - depRem) : 0;
  const depPct   = depTotal > 0 ? Math.round((depDone / depTotal) * 100) : 0;

  // Stayover progress isn't trackable from current rGuest signals.
  // Placeholder — 0 of N until we wire up a per-room status check.
  const stayTotal = kpis.stayovers ?? 0;
  const stayDone  = 0;
  const stayPct   = stayTotal > 0 ? Math.round((stayDone / stayTotal) * 100) : 0;

  const Row = ({ label, done, total, pct, accent }) => (
    <div className={`fc-progress-row fc-progress-${accent}`}>
      <div className="fc-progress-meta">
        <div className="fc-progress-label">{label}</div>
        <div className="fc-progress-pct">{pct}%</div>
      </div>
      <div className="fc-progress-bar" aria-hidden="true">
        <div className="fc-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="fc-progress-counts">
        <strong>{done}</strong> / {total}
      </div>
    </div>
  );

  return (
    <div className="fc-rail-card">
      <h3>Service Progress</h3>
      <Row label="Departure cleans"  done={depDone}  total={depTotal}  pct={depPct}  accent="dep"  />
      <Row label="Stayover touch-ups" done={stayDone} total={stayTotal} pct={stayPct} accent="stay" />
    </div>
  );
};

// Sprint 18.2 — compact "Today at a glance" rail card. Mirrors
// the 5 top KPI cards in a slimmer vertical list so the rail
// stays useful when a row hasn't been selected yet.
const TodayAtAGlance = ({ kpis, reservations, onSelectAll }) => {
  const remDep         = kpis.remainingDepartures ?? kpis.departures ?? 0;
  const inHouseTonight = Math.max(0, (kpis.inHouse ?? 0) - remDep);
  const noRoomCount    = (reservations || []).filter(r =>
    r.kind === 'arrival' && !r.isPreAssigned
  ).length;
  const rows = [
    { icon: <IconBriefcase    size={16} />, accent: 'arrivals',   label: 'Arrivals Today',   value: kpis.arrivals  ?? 0, sub: `${kpis.remainingArrivals ?? 0} not arrived` },
    { icon: <IconBed          size={16} />, accent: 'inhouse',    label: 'In-house',         value: kpis.inHouse   ?? 0, sub: 'Guests currently staying' },
    { icon: <IconExit         size={16} />, accent: 'departures', label: 'Departures Today', value: kpis.departures?? 0, sub: `${remDep} not checked out` },
    { icon: <IconMoon         size={16} />, accent: 'staying',    label: 'Staying Tonight',  value: inHouseTonight,        sub: 'In-house, not departing today' },
    { icon: <IconAlertTriangle size={16}/>, accent: 'noroom',     label: 'No Room Assigned', value: noRoomCount,           sub: 'Needs review' },
  ];
  return (
    <div className="fc-rail-card fc-glance-card">
      <h3>Today at a glance</h3>
      <ul className="fc-glance-list">
        {rows.map(r => (
          <li key={r.label} className={`fc-glance-row fc-kpi-${r.accent}`}>
            <span className="fc-glance-icon">{r.icon}</span>
            <span className="fc-glance-body">
              <span className="fc-glance-label">{r.label}</span>
              <span className="fc-glance-sub">{r.sub}</span>
            </span>
            <span className="fc-glance-value">{r.value}</span>
          </li>
        ))}
      </ul>
      {onSelectAll && (
        <button type="button" className="fc-meta-link fc-glance-cta" onClick={onSelectAll}>
          View all reservations <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
};

// Sprint 18.2 — detail panel for the currently-selected reservation.
// Shows a compact metadata grid plus three actions: View details
// (stub), Guest folio (stub — 18.3), and the rGuest deep link.
const SelectedReservation = ({ reservation, onClose }) => {
  if (!reservation) {
    return (
      <div className="fc-rail-card fc-selected-empty">
        <h3>Selected reservation</h3>
        <p>Click a row in the table to see full reservation details here.</p>
      </div>
    );
  }
  const r = reservation;
  const statusCls = STATUS_PILL_CLASS[r.statusLabel] || 'inhouse';
  const flags = buildResnFlags(r);
  const roomStatusLabel = r.roomNumber
    ? (r.hkStatusLabel || r.occupancyStatus || '—')
    : 'No Room Assigned';
  return (
    <div className="fc-rail-card fc-selected-card">
      <div className="fc-selected-head">
        <h3>Selected reservation</h3>
        <span className={`fc-pill fc-pill-status-${statusCls}`}>{r.statusLabel}</span>
      </div>
      <div className="fc-selected-guest">
        <strong>{r.guestName || '(no name)'}</strong>
        {r.confirmationId && <span className="fc-selected-conf">Conf. {r.confirmationId}</span>}
      </div>
      <dl className="fc-selected-grid">
        <div><dt>Room</dt><dd>{r.roomNumber || '—'}</dd></div>
        <div><dt>Room Type</dt><dd>{r.baseLabel || '—'}{r.subLabel && r.subLabel !== 'Standard' ? ` · ${r.subLabel}` : ''}</dd></div>
        <div><dt>Arrival</dt><dd>{fmtDate(r.arrivalDate)}</dd></div>
        <div><dt>Departure</dt><dd>{fmtDate(r.departureDate)}</dd></div>
        <div><dt>Nights</dt><dd>{r.nights}</dd></div>
        <div><dt>Source</dt><dd>{r.source || '—'}</dd></div>
        <div><dt>Reservation Status</dt><dd><span className={`fc-pill fc-pill-status-${statusCls}`}>{r.statusLabel}</span></dd></div>
        <div><dt>Room Status</dt><dd>
          {r.roomNumber
            ? <span className="fc-pill fc-pill-action-none">{roomStatusLabel}</span>
            : <span className="fc-pill fc-pill-status-pending">No Room Assigned</span>}
        </dd></div>
        <div className="fc-selected-flags"><dt>Notes / Flags</dt><dd>
          {flags.length === 0 && <span className="fc-detail-sub-inline">—</span>}
          {flags.map(f => (
            <span key={f.label} className={`fc-pill fc-flag-${f.cls}`}>{f.label}</span>
          ))}
        </dd></div>
      </dl>
      <div className="fc-selected-actions">
        <button type="button" className="fc-btn fc-btn-secondary" disabled title="Detail view ships in 18.3+">View details</button>
        <button type="button" className="fc-btn fc-btn-secondary" disabled title="Guest folio integration ships in 18.3+">Guest folio</button>
      </div>
      <a
        className="fc-btn fc-btn-primary fc-selected-deep"
        href={RGUEST_RESERVATION_URL(r.id)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open in rGuest Stay <span aria-hidden>↗</span>
      </a>
      {onClose && (
        <button type="button" className="fc-meta-link fc-selected-close" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  );
};

// Sprint 17.9 — raw payload viewer. Light modal that just pretty-
// prints `snapshot.payload` as JSON. Useful for FD/admin to verify
// what's coming from rGuest without diving into the History modal.
const RawOutputModal = ({ snapshot, onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!snapshot) return null;
  const json = JSON.stringify(snapshot.payload, null, 2);
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); } catch { /* noop */ }
  };
  return (
    <div className="fc-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="fc-modal fc-modal-wide" onClick={(e) => e.stopPropagation()}>
        <header className="fc-modal-header">
          <h2>Raw scraper output</h2>
          <div className="fc-modal-header-actions">
            <button className="fc-modal-btn fc-modal-btn-small" onClick={copy}>Copy JSON</button>
            <button className="fc-modal-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </header>
        <div className="fc-modal-body">
          <pre className="fc-raw-pre">{json}</pre>
        </div>
      </div>
    </div>
  );
};

// Sprint 17.8 — auto-generated handoff message the GM can edit
// before sending. For now editing is a stub (sends to clipboard).
const HousekeepingMessagePreview = ({ kpis }) => {
  const total   = kpis.roomsToCleanToday ?? 0;
  const dep     = kpis.departures ?? 0;
  const stay    = kpis.stayovers ?? 0;
  const hk      = kpis.housekeepersNeeded ?? 0;

  const hourPart = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 18) return 'afternoon';
    return 'evening';
  })();

  const text =
    `Good ${hourPart}, Housekeeping team — today's forecast shows ${total} rooms to service: ` +
    `${dep} full cleans (check-outs) and ${stay} stayover touch-ups. ` +
    `Based on a productivity target of ${kpis.housekeepersNeeded ? Math.ceil(total / hk) : 6} rooms per attendant, ` +
    `${hk} attendants are recommended. Please review the assigned rooms below.`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be denied; ignore silently */
    }
  };

  return (
    <div className="fc-msg-card">
      <div className="fc-msg-head">
        <h3>Housekeeping Message Preview</h3>
        <button type="button" className="fc-meta-link" onClick={copy}>Copy</button>
      </div>
      <p className="fc-msg-body">{text}</p>
    </div>
  );
};

const ByCleaningTable = ({ rows }) => (
  <div className="fc-table-wrap">
    <table className="fc-table">
      <thead>
        <tr>
          <th>Cleaning Type</th>
          <th>Rooms Needed</th>
          <th>Avg Min / Room</th>
          <th>Housekeepers Needed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key}>
            <td>{r.name}</td>
            <td>{r.roomsNeeded}</td>
            <td>{r.avgMinPerRoom}</td>
            <td className="fc-table-emph">{r.housekeepersNeeded}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>{rows.reduce((s, r) => s + r.roomsNeeded, 0)}</td>
          <td>—</td>
          <td className="fc-table-emph">
            {rows.reduce((s, r) => s + r.housekeepersNeeded, 0)}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
);

const ByRoomTypeTable = ({ rows }) => (
  <div className="fc-table-wrap">
    <table className="fc-table">
      <thead>
        <tr>
          <th>Room Type</th>
          <th>Arrivals<br /><span className="fc-th-sub">(Check-ins)</span></th>
          <th>Departures<br /><span className="fc-th-sub">(Check-outs)</span></th>
          <th>Check-out Cleans<br /><span className="fc-th-sub">(Full)</span></th>
          <th>Stayover<br /><span className="fc-th-sub">(Touch-ups)</span></th>
          <th>Rooms Needed</th>
          <th>Housekeepers Needed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.baseCode || r.baseLabel}>
            <td>{r.baseLabel}</td>
            <td>{r.arrivals}</td>
            <td>{r.departures}</td>
            <td>{r.checkoutCleans}</td>
            <td>{r.stayoverService}</td>
            <td>{r.roomsNeeded}</td>
            <td className="fc-table-emph">{r.housekeepersNeeded}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>{rows.reduce((s, r) => s + r.arrivals, 0)}</td>
          <td>{rows.reduce((s, r) => s + r.departures, 0)}</td>
          <td>{rows.reduce((s, r) => s + r.checkoutCleans, 0)}</td>
          <td>{rows.reduce((s, r) => s + r.stayoverService, 0)}</td>
          <td>{rows.reduce((s, r) => s + r.roomsNeeded, 0)}</td>
          <td className="fc-table-emph">
            {rows.reduce((s, r) => s + r.housekeepersNeeded, 0)}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
);

const ByFloorTable = ({ rows }) => {
  const [openFloor, setOpenFloor] = useState(null);
  return (
    <div className="fc-table-wrap">
      <table className="fc-table">
        <thead>
          <tr>
            <th>Floor</th>
            <th>Total Rooms</th>
            <th>Rooms to Clean</th>
            <th>Check-out Cleans</th>
            <th>Stayover</th>
            <th aria-label="expand"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const open = openFloor === r.floorId;
            return (
              <React.Fragment key={r.floorId || 'unknown'}>
                <tr
                  className={`fc-row-clickable${open ? ' open' : ''}`}
                  onClick={() => setOpenFloor(open ? null : r.floorId)}
                >
                  <td>{r.floorLabel}</td>
                  <td>{r.totalRooms}</td>
                  <td className="fc-table-emph">{r.roomsToClean}</td>
                  <td>{r.checkoutCleans}</td>
                  <td>{r.stayoverService}</td>
                  <td className="fc-row-caret">{open ? '▾' : '▸'}</td>
                </tr>
                {open && (
                  <tr className="fc-row-detail">
                    <td colSpan={6}>
                      <div className="fc-floor-detail">
                        <div className="fc-floor-detail-title">
                          Rooms on {r.floorLabel}
                        </div>
                        <ul className="fc-room-list">
                          {r.rooms.map(rm => (
                            <li key={rm.roomNumber}>
                              <span className="fc-room-num">{rm.roomNumber}</span>
                              <span className="fc-room-type">{rm.baseLabel || rm.typeCode || '?'}{rm.subLabel && rm.subLabel !== 'Standard' ? ` · ${rm.subLabel}` : ''}</span>
                              <span className={`fc-room-status fc-hk-${rm.hkStatus || 'unknown'}`}>
                                {rm.hkStatusLabel || '—'}
                              </span>
                              <span className={`fc-room-action fc-action-${rm.action}`}>
                                {ACTION_LABEL[rm.action] || rm.action}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td>{rows.reduce((s, r) => s + r.totalRooms, 0)}</td>
            <td className="fc-table-emph">{rows.reduce((s, r) => s + r.roomsToClean, 0)}</td>
            <td>{rows.reduce((s, r) => s + r.checkoutCleans, 0)}</td>
            <td>{rows.reduce((s, r) => s + r.stayoverService, 0)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

const ScraperOutputCard = ({ snapshot }) => {
  const so = snapshot.payload?.scraperOutput || {};
  const status = snapshot.status === 'success' ? 'Success' : (snapshot.error_message || 'Failed');
  return (
    <div className="fc-rail-card">
      <div className="fc-rail-head">
        <h3>Scraper Output</h3>
        <span className={`fc-pill fc-pill-${snapshot.status}`}>{status}</span>
      </div>
      <div className="fc-rail-grid">
        <div>
          <div className="fc-rail-label">Source</div>
          <div className="fc-rail-value">{so.source || 'Agilysys rGuest Stay'}</div>
        </div>
        <div>
          <div className="fc-rail-label">Scraped at</div>
          <div className="fc-rail-value">{fmtTime(snapshot.scraped_at)}</div>
        </div>
        <div>
          <div className="fc-rail-label">Data window</div>
          <div className="fc-rail-value">{fmtDate(snapshot.forecast_date)}</div>
        </div>
        <div>
          <div className="fc-rail-label">Records processed</div>
          <div className="fc-rail-value">{snapshot.records_processed ?? so.recordsProcessed ?? 0}</div>
        </div>
      </div>
    </div>
  );
};

const DispatchSummaryCard = ({ data }) => (
  <div className="fc-rail-card">
    <h3>Dispatch Summary</h3>
    <ul className="fc-rail-list">
      <li>
        <span>Total rooms to service</span>
        <strong>{data?.totalRoomsToService ?? 0} rooms</strong>
      </li>
      <li>
        <span>Productivity target</span>
        <strong>{data?.productivityTarget ?? 0} rooms / attendant</strong>
      </li>
      <li>
        <span>Housekeepers needed</span>
        <strong>{data?.housekeepersNeeded ?? 0} attendants</strong>
      </li>
    </ul>
  </div>
);

const SendoutCard = ({ onClick, disabled, snapshot }) => (
  <div className="fc-rail-card">
    <div className="fc-rail-head">
      <h3>Housekeeping Send-out</h3>
      <span className="fc-pill fc-pill-ready">Ready to send</span>
    </div>
    <div className="fc-rail-grid">
      <div>
        <div className="fc-rail-label">Forecast date</div>
        <div className="fc-rail-value">{fmtDate(snapshot.forecast_date)}</div>
      </div>
      <div>
        <div className="fc-rail-label">Generated</div>
        <div className="fc-rail-value">{fmtTime(snapshot.scraped_at)}</div>
      </div>
    </div>
    <button
      className="fc-btn fc-btn-primary fc-rail-cta"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Run the scraper first' : 'Open a printable forecast sheet'}
    >
      ▸ Generate forecast
    </button>
  </div>
);

const DonutLegend = ({ rows, total }) => (
  <div className="fc-donut-card">
    <h3>Rooms Needed by Cleaning Type</h3>
    <div className="fc-donut-body">
      <div className="fc-donut-total">
        <div className="fc-donut-number">{total}</div>
        <div className="fc-donut-sublabel">Total</div>
      </div>
      <ul className="fc-donut-legend">
        {rows.map(r => {
          const pct = total > 0 ? Math.round((r.roomsNeeded / total) * 100) : 0;
          return (
            <li key={r.key}>
              <span className={`fc-donut-dot fc-donut-${r.key}`} aria-hidden="true" />
              <span className="fc-donut-name">{r.name}</span>
              <span className="fc-donut-count">{r.roomsNeeded} ({pct}%)</span>
            </li>
          );
        })}
      </ul>
    </div>
  </div>
);


// ── Page ───────────────────────────────────────────────────

const Forecasting = () => {
  const { goTo } = useView(); // Sprint 17.10 — back-to-Home button
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [scraping, setScraping] = useState(false);
  const [error, setError]       = useState(null);
  const [view, setView]         = useState('details'); // 'cleaning' | 'room' | 'floor' | 'details' (17.8 default)
  const [resnFilter, setResnFilter]     = useState('all');   // 17.8: filter chips
  const [resnSourceFilter, setResnSourceFilter] = useState(null);
  const [resnTypeFilter, setResnTypeFilter]     = useState(null);
  // Sprint 18.2 — currently-selected reservation. Drives the
  // right-rail detail panel + row highlight.
  const [selectedResId, setSelectedResId] = useState(null);
  // sheetOpen state removed in 17.12 (Generate Forecast moved off this page).
  const [settingsOpen, setSettingsOpen] = useState(false); // Sprint 17.5
  const [historyOpen, setHistoryOpen]   = useState(false); // Sprint 17.5
  const [rawOpen, setRawOpen]           = useState(false); // Sprint 17.9
  const [scrapePct, setScrapePct]       = useState(0);     // 17.9 progress ring

  const loadLatest = useCallback(async () => {
    setError(null);
    const { ok, data } = await apiFetch('/admin/forecast/snapshots/latest');
    if (!ok || !data?.success) {
      setError(data?.message || 'Could not load latest forecast.');
      setLoading(false);
      return;
    }
    setSnapshot(data.snapshot || null);
    setLoading(false);
  }, []);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  const handleScrape = async () => {
    setScraping(true);
    setError(null);
    setScrapePct(2);
    const { ok, data } = await apiFetch('/admin/forecast/scrape', {
      method: 'POST',
      body:   JSON.stringify({}),
    });
    // Snap to 100% on completion regardless of where the fake
    // timer landed, then let the effect clear it.
    setScrapePct(100);
    setScraping(false);
    if (!ok || !data?.success) {
      setError(data?.message || 'Scrape failed. Check Agilysys credentials + the snapshot logs.');
      return;
    }
    setSnapshot(data.snapshot);
  };

  // Sprint 17.9 — faux progress timer. Backend doesn't stream
  // per-step progress, so we approximate. Live scrapes empirically
  // take 10–18 s (login + 4 parallel calls + DB upsert). Ease the
  // ring toward 95% over ~14 s; when the request completes,
  // handleScrape snaps it to 100% and this effect drops it back to
  // 0 after a short rest.
  useEffect(() => {
    if (!scraping) {
      if (scrapePct !== 0) {
        const t = setTimeout(() => setScrapePct(0), 700);
        return () => clearTimeout(t);
      }
      return undefined;
    }
    const TICK_MS  = 200;
    const TARGET   = 95;
    const DURATION = 14000; // ms — feels about right empirically
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio   = Math.min(1, elapsed / DURATION);
      // Ease-out so the ring slows visibly as it nears 95% (avoids
      // the "appears stalled at 100%" feel).
      const eased = 1 - Math.pow(1 - ratio, 1.8);
      setScrapePct(Math.min(TARGET, Math.round(eased * TARGET)));
    }, TICK_MS);
    return () => clearInterval(id);
    // scrapePct intentionally not in deps — that's the value we set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scraping]);

  // Sprint 17.4: open the printable forecast sheet over the page.
  // We keep it as an in-page modal (rather than a new tab) so the
  // print stylesheet can guarantee what reaches paper.
  // handleGenerate / generateDisabled removed in 17.12 — see Forecast/.

  const lastSync = snapshot ? fmtTime(snapshot.scraped_at) : '—';
  const kpis = snapshot?.payload?.kpis || {};

  // Memoized derived lists for the Reservation Details filter dropdowns.
  const detailSources = useMemo(() => {
    if (!snapshot?.payload?.reservations) return [];
    const set = new Set();
    for (const r of snapshot.payload.reservations) if (r.source) set.add(r.source);
    return [...set].sort();
  }, [snapshot]);
  const detailRoomTypes = useMemo(() => {
    if (!snapshot?.payload?.reservations) return [];
    const set = new Set();
    for (const r of snapshot.payload.reservations) if (r.baseLabel) set.add(r.baseLabel);
    return [...set].sort();
  }, [snapshot]);

  // Sprint 18.2 — resolve the currently-selected reservation
  // object (if any) for the right-rail detail panel.
  const selectedReservation = useMemo(() => {
    if (!selectedResId) return null;
    const list = snapshot?.payload?.reservations || [];
    return list.find(r => r.id === selectedResId) || null;
  }, [selectedResId, snapshot]);

  const tableEl = useMemo(() => {
    if (!snapshot?.payload) return null;
    if (view === 'details') {
      return (
        <ReservationDetailsTable
          rows={snapshot.payload.reservations || []}
          filter={resnFilter}
          onFilter={setResnFilter}
          sources={detailSources}
          roomTypes={detailRoomTypes}
          sourceFilter={resnSourceFilter}
          onSourceFilter={setResnSourceFilter}
          typeFilter={resnTypeFilter}
          onTypeFilter={setResnTypeFilter}
          selectedId={selectedResId}
          onSelect={setSelectedResId}
        />
      );
    }
    if (view === 'cleaning') return <ByCleaningTable rows={snapshot.payload.byCleaningType || []} />;
    if (view === 'room')     return <ByRoomTypeTable rows={snapshot.payload.byRoomType    || []} />;
    if (view === 'floor')    return <ByFloorTable    rows={snapshot.payload.byFloor       || []} />;
    return null;
  }, [snapshot, view, resnFilter, resnSourceFilter, resnTypeFilter, detailSources, detailRoomTypes, selectedResId]);

  return (
    <div className="fc-page">
      <header className="fc-header">
        <div className="fc-header-text">
          {/* Sprint 17.10 — quick back to admin Home. Redundant
              with the sidebar Home button on desktop but matches
              the mobile mockup pattern (top-left chevron). */}
          <button
            type="button"
            className="fc-back-btn"
            onClick={() => goTo('home')}
            aria-label="Back to Home"
          >
            <IconBack /> <span>Home</span>
          </button>
          <h1>Reservations</h1>
          {/* Sprint 17.9 — subtitle removed (was descriptive only);
              the three meta links carry the actionable affordances. */}
          <div className="fc-header-meta-actions">
            <button
              type="button"
              className="fc-meta-link"
              onClick={() => setHistoryOpen(true)}
            >
              <IconClock />
              <span>Snapshot history</span>
            </button>
            <button
              type="button"
              className="fc-meta-link"
              onClick={() => setSettingsOpen(true)}
            >
              <IconGear />
              <span>Forecast settings</span>
            </button>
            <button
              type="button"
              className="fc-meta-link"
              onClick={() => setRawOpen(true)}
              disabled={!snapshot}
              title={!snapshot ? 'Run the scraper first' : 'View raw payload as JSON'}
            >
              <IconDocument />
              <span>Raw scraper output</span>
            </button>
          </div>
        </div>
        <div className="fc-header-actions">
          <button
            className="fc-btn fc-btn-primary"
            onClick={handleScrape}
            disabled={scraping}
          >
            {scraping ? <ProgressRing pct={scrapePct} /> : <IconRefresh />}
            <span>{scraping ? `Running… ${scrapePct}%` : 'Run scraper'}</span>
          </button>
          {/* Sprint 17.12: Generate Forecast moved to the Forecast
              page (lives next to the room-availability projection
              it summarizes). */}
          <div className={`fc-sync-badge fc-sync-${snapshot?.status || 'idle'}`}>
            <span className="fc-sync-dot" aria-hidden="true" />
            <span>Last sync</span>
            <strong>{lastSync}</strong>
          </div>
        </div>
      </header>

      {loading && (
        <div className="fc-loading">Loading latest forecast…</div>
      )}

      {error && (
        <div className="fc-error" role="alert">
          <strong>Something went wrong.</strong> {error}
        </div>
      )}

      {!loading && !snapshot && !error && (
        <div className="fc-empty">
          <h2>No forecast yet</h2>
          <p>Click <strong>Run scraper</strong> above to pull today's data from rGuest Stay and generate the first forecast.</p>
        </div>
      )}

      {snapshot && (
        <>
          <section className="fc-kpis fc-kpis-5" aria-label="Reservations KPIs">
            {(() => {
              // Sprint 18.1 — 5 cards per the new Reservations
              // mockup. Drops "Rooms to service / Stayover service /
              // Housekeepers needed" (forecast concerns, moved to
              // the Forecast page) and adds "No Room Assigned".
              const remDep         = kpis.remainingDepartures ?? kpis.departures ?? 0;
              const inHouseTonight = Math.max(0, (kpis.inHouse ?? 0) - remDep);
              const reservations   = snapshot.payload.reservations || [];
              const noRoomCount    = reservations.filter(r =>
                r.kind === 'arrival' && !r.isPreAssigned
              ).length;
              return (
                <>
                  <KpiCard
                    accent="arrivals"
                    icon={<IconBriefcase />}
                    label="Arrivals Today"
                    primary={kpis.arrivals ?? 0}
                    sublabel={`${kpis.remainingArrivals ?? 0} not arrived`}
                  />
                  <KpiCard
                    accent="inhouse"
                    icon={<IconBed />}
                    label="In-house"
                    primary={kpis.inHouse ?? 0}
                    sublabel="guests currently staying"
                  />
                  <KpiCard
                    accent="departures"
                    icon={<IconExit />}
                    label="Departures Today"
                    primary={kpis.departures ?? 0}
                    sublabel={`${kpis.remainingDepartures ?? 0} not checked out`}
                  />
                  <KpiCard
                    accent="staying"
                    icon={<IconMoon />}
                    label="Staying Tonight"
                    primary={inHouseTonight}
                    sublabel="in-house, not departing today"
                  />
                  <KpiCard
                    accent="noroom"
                    icon={<IconAlertTriangle />}
                    label="No Room Assigned"
                    primary={noRoomCount}
                    sublabel="needs review"
                  />
                </>
              );
            })()}
          </section>

          <div className="fc-body">
            <main className="fc-main">
              {/* Sprint 18.3 — legacy view toggle removed. The
                  Cleaning Type / Room Type / Floor tabs were
                  forecast-y analytics views from when this page
                  was the Forecast; they don't belong on
                  Reservations. The page now always renders the
                  Reservation Details table (view stays 'details'
                  by default). */}
              <div className="fc-table-header">
                <h2>Guest Reservations</h2>
              </div>
              {tableEl}
            </main>

            <aside className="fc-rail">
              {/* Sprint 18.2 — rail now hosts "Today at a glance"
                  (compact KPI list mirroring the top cards) and
                  the "Selected reservation" detail panel. The old
                  forecast-y cards (ServiceProgress, Scraper
                  Output, Dispatch Summary) moved off this page —
                  they belong on the Forecast page. */}
              <TodayAtAGlance
                kpis={kpis}
                reservations={snapshot.payload.reservations}
                onSelectAll={() => { setResnFilter('all'); setSelectedResId(null); }}
              />
              <SelectedReservation
                reservation={selectedReservation}
                onClose={() => setSelectedResId(null)}
              />
            </aside>
          </div>

          <div className="fc-bottom">
            <HousekeepingMessagePreview kpis={kpis} />
          </div>
        </>
      )}

      {/* Sprint 17.12: ForecastSheet modal moved to the Forecast
          page. The page's SendoutCard is also gone. */}

      {settingsOpen && (
        <ForecastSettings
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {historyOpen && (
        <ForecastHistory
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {rawOpen && (
        <RawOutputModal
          snapshot={snapshot}
          onClose={() => setRawOpen(false)}
        />
      )}
    </div>
  );
};

export default Forecasting;
