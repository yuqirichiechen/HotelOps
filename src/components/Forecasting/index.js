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
import ResnItem, { useResnSummaries } from './ResnItem';
import { RESN_TABS, DEFAULT_RESN_TAB, tabPredicate, computeTabCounts, sortForTab, EMPTY_COPY } from './resnTabs';


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
const KpiCard = ({ label, primary, secondary, sublabel, accent, icon, onClick, active }) => {
  const done = primary === 0;
  // Sprint 20.3 — like rGuest's top tiles, a KPI card can act as a tab button.
  const clickable = typeof onClick === 'function';
  return (
    <div
      className={`fc-kpi-card fc-kpi-${accent || 'default'}${done ? ' fc-kpi-done' : ''}${clickable ? ' fc-kpi-clickable' : ''}${active ? ' fc-kpi-active' : ''}`}
      {...(clickable ? {
        role: 'button', tabIndex: 0, 'aria-pressed': !!active,
        onClick,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } },
      } : {})}
    >
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
// Sprint 20.3: tab definitions live in ./resnTabs.js (RESN_TABS).


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
// Sprint 20.3: predicates come from tabPredicate() in ./resnTabs.js.


// Sprint 18.6 — page-size options + pagination control.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const Pagination = ({ page, totalPages, onPage, pageSize, onPageSize }) => {
  if (totalPages <= 1) {
    return (
      <div className="fc-pager">
        <label className="fc-pager-size">
          <span>Per page</span>
          <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    );
  }
  // Build a windowed page-number list: always show 1, current ± 1,
  // and totalPages, with ellipses bridging gaps.
  const set = new Set([1, totalPages, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach(n => set.add(n));
  if (page >= totalPages - 2) [totalPages - 1, totalPages - 2, totalPages - 3].forEach(n => set.add(n));
  const pages = [...set].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const withGaps = [];
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1] > 1) withGaps.push('…');
    withGaps.push(n);
  });
  return (
    <div className="fc-pager">
      <div className="fc-pager-nav">
        <button
          type="button" className="fc-pager-btn"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >‹</button>
        {withGaps.map((n, i) => n === '…' ? (
          <span key={`gap-${i}`} className="fc-pager-gap">…</span>
        ) : (
          <button
            key={n}
            type="button"
            className={`fc-pager-btn${n === page ? ' active' : ''}`}
            onClick={() => onPage(n)}
            aria-current={n === page ? 'page' : undefined}
          >{n}</button>
        ))}
        <button
          type="button" className="fc-pager-btn"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
        >›</button>
      </div>
      <label className="fc-pager-size">
        <span>Per page</span>
        <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
};

const ReservationDetailsTable = ({
  rows, filter, onFilter, sources = [], roomTypes = [],
  sourceFilter, onSourceFilter, typeFilter, onTypeFilter,
  // Sprint 20.4 — job progress (refetch stored summaries as the guest-detail job fills them in).
  jobTick, jobRunning,
}) => {
  // Sprint 20.3 — counts always reflect ALL rows (like rGuest's tiles);
  // the room-type / source dropdowns only narrow the list below.
  const counts = React.useMemo(() => computeTabCounts(rows), [rows]);
  const filtered = React.useMemo(() => {
    const pred = tabPredicate(filter);
    return sortForTab(filter, rows.filter(r => {
      if (!pred(r)) return false;
      if (sourceFilter && r.source !== sourceFilter) return false;
      if (typeFilter   && r.baseLabel !== typeFilter) return false;
      return true;
    }));
  }, [rows, filter, sourceFilter, typeFilter]);
  const narrowed = !!(sourceFilter || typeFilter);
  const emptyCopy = EMPTY_COPY[filter] || EMPTY_COPY.all;
  const emptyEl = (
    <div className="fc-resn-emptybox">
      <div>{narrowed && counts[filter] > 0 ? 'No reservations match the current filters.' : emptyCopy.text}</div>
      {narrowed && counts[filter] > 0 ? (
        <button type="button" className="fc-chip" onClick={() => { onSourceFilter(null); onTypeFilter(null); }}>Clear filters</button>
      ) : emptyCopy.goto ? (
        <button type="button" className="fc-chip" onClick={() => onFilter(emptyCopy.goto)}>{emptyCopy.gotoLabel}</button>
      ) : null}
    </div>
  );

  // Sprint 18.6 — pagination. State local to the component so the
  // page resets cleanly when filters change (via the effect below).
  const [page, setPage]         = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25); // Sprint 20.3: 10 → 25 (fewer taps to reach a guest)
  React.useEffect(() => { setPage(1); }, [filter, sourceFilter, typeFilter]);
  // Sprint 20.4 — in-place expand (several at once) + stored guest summaries for the rows on screen.
  const [openIds, setOpenIds] = React.useState({});
  const toggleOpen = (id) => setOpenIds(m => ({ ...m, [id]: !m[id] }));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const pageStart = (effectivePage - 1) * pageSize;
  const pageEnd   = Math.min(pageStart + pageSize, filtered.length);
  const paged     = filtered.slice(pageStart, pageEnd);
  const pagedIds  = paged.map(r => r.id);
  const { get: getSummary, refresh: refreshOne, refreshing } = useResnSummaries(pagedIds, jobTick);
  const allOpen   = paged.length > 0 && paged.every(r => openIds[r.id]);
  const setAllOpen = (open) => setOpenIds(m => { const n = { ...m }; paged.forEach(r => { n[r.id] = open; }); return n; });

  return (
    <div className="fc-detail-wrap">
      <div className="fc-detail-controls">
        {/* Sprint 20.3 — status tabs with live counts (rGuest-style). One row;
            scrolls sideways on a phone instead of wrapping into 3 rows. */}
        <div className="fc-tabs" role="tablist" aria-label="Reservation status">
          {RESN_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              className={`fc-tab${filter === t.key ? ' active' : ''}${counts[t.key] === 0 ? ' is-zero' : ''}`}
              onClick={() => onFilter(t.key)}
            >
              <span className="fc-tab-label">{t.label}</span>
              <span className="fc-tab-count">{counts[t.key]}</span>
            </button>
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

      {/* Sprint 20.4 — one dense list for phone AND desktop (CSS lays each item
          out as stacked blocks on a phone, a 4-column row on a wide screen).
          Everything useful is visible without a click; "More details"
          expands in place. Reads stored summaries only. */}
      {filtered.length > 0 && (
        <div className="rl-toolbar">
          <span>{filtered.length} reservation{filtered.length === 1 ? '' : 's'}</span>
          <button type="button" onClick={() => setAllOpen(!allOpen)}>{allOpen ? 'Collapse all' : 'Expand all on this page'}</button>
        </div>
      )}
      <div className="rl-head" aria-hidden="true">
        <span>Guest</span><span>Stay</span><span>Status &amp; room</span><span>Charges &amp; notes</span>
      </div>
      <ul className="rl-list">
        {filtered.length === 0 && <li className="fc-resn-empty">{emptyEl}</li>}
        {paged.map(r => (
          <ResnItem
            key={r.id}
            r={r}
            entry={getSummary(r.id)}
            flags={buildResnFlags(r)}
            statusCls={STATUS_PILL_CLASS[r.statusLabel] || 'inhouse'}
            open={!!openIds[r.id]}
            onToggle={() => toggleOpen(r.id)}
            onRefresh={() => refreshOne(r.id)}
            refreshing={!!refreshing[r.id]}
            jobRunning={!!jobRunning}
            rguestUrl={RGUEST_RESERVATION_URL(r.id)}
          />
        ))}
      </ul>
      <div className="fc-detail-footer">
        <div className="fc-detail-footer-text">
          {filtered.length === 0
            ? 'No reservations match the current filters.'
            : <>Showing <strong>{pageStart + 1}–{pageEnd}</strong> of <strong>{filtered.length}</strong>{filtered.length !== rows.length && <> (filtered from {rows.length})</>}</>
          }
        </div>
        <Pagination
          page={effectivePage}
          totalPages={totalPages}
          onPage={setPage}
          pageSize={pageSize}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
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
  const [resnFilter, setResnFilter]     = useState(DEFAULT_RESN_TAB);   // Sprint 20.3: opens on Remaining arrivals
  const [resnSourceFilter, setResnSourceFilter] = useState(null);
  const [resnTypeFilter, setResnTypeFilter]     = useState(null);
  // sheetOpen state removed in 17.12 (Generate Forecast moved off this page).
  const [settingsOpen, setSettingsOpen] = useState(false); // Sprint 17.5
  const [historyOpen, setHistoryOpen]   = useState(false); // Sprint 17.5
  const [rawOpen, setRawOpen]           = useState(false); // Sprint 17.9
  const [scrapePct, setScrapePct]       = useState(0);     // 17.9 progress ring
  // Sprint 20.3 — background guest-detail job (Sprint 20.2): progress shown under the title.
  const [detailJob, setDetailJob]       = useState(null);

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

  // Sprint 20.3 — job progress. Fetch once on mount (so a job started in
  // another tab/earlier shows), then poll every 2.5 s ONLY while it is
  // running and the tab is visible. Idle page = zero polling (compute-cost
  // rule from Sprint 19.1).
  const jobRunning = detailJob?.status === 'running';
  const fetchJob = useCallback(async () => {
    const { ok, data } = await apiFetch('/admin/forecast/jobs/latest');
    if (ok && data?.success) setDetailJob(data.job || null);
  }, []);
  useEffect(() => { fetchJob(); }, [fetchJob]);
  useEffect(() => {
    if (!jobRunning) return undefined;
    const id = setInterval(() => { if (document.visibilityState === 'visible') fetchJob(); }, 2500);
    return () => clearInterval(id);
  }, [jobRunning, fetchJob]);

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
    if (data.detailJob?.job) setDetailJob(data.detailJob.job);
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
          jobTick={`${detailJob?.status || ''}:${detailJob?.done || 0}:${detailJob?.failed || 0}`}
          jobRunning={detailJob?.status === 'running'}
        />
      );
    }
    if (view === 'cleaning') return <ByCleaningTable rows={snapshot.payload.byCleaningType || []} />;
    if (view === 'room')     return <ByRoomTypeTable rows={snapshot.payload.byRoomType    || []} />;
    if (view === 'floor')    return <ByFloorTable    rows={snapshot.payload.byFloor       || []} />;
    return null;
  }, [snapshot, view, resnFilter, resnSourceFilter, resnTypeFilter, detailSources, detailRoomTypes, detailJob?.status, detailJob?.done, detailJob?.failed]);

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
          {/* Sprint 20.1 — title, last-sync badge and the icon-only refresh
              share ONE row at every width (phone included). The old
              "Run scraper" text button (154 px min-width) forced the
              actions onto their own line below the title. */}
          <div className="fc-title-row">
            <h1>Reservations</h1>
            <div className="fc-header-actions">
              <div className={`fc-sync-badge fc-sync-${snapshot?.status || 'idle'}`}>
                <span className="fc-sync-dot" aria-hidden="true" />
                <span className="fc-sync-label">Last sync</span>
                <strong>{lastSync}</strong>
              </div>
              <button
                type="button"
                className="fc-btn fc-btn-primary fc-btn-icon"
                onClick={handleScrape}
                disabled={scraping}
                title={scraping ? `Running… ${scrapePct}%` : 'Refresh — run the rGuest scraper'}
                aria-label={scraping ? `Scraper running, ${scrapePct} percent` : 'Refresh: run the rGuest scraper'}
              >
                {scraping ? <ProgressRing pct={scrapePct} /> : <IconRefresh />}
              </button>
            </div>
          </div>
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
      </header>

      {/* Sprint 20.3 — guest-detail job (Sprint 20.2) progress; only while running or when it needs attention. */}
      {detailJob && (detailJob.status === 'running' || detailJob.status === 'failed' || detailJob.status === 'partial' || detailJob.status === 'interrupted') && (
        <div className={`fc-jobbar fc-jobbar-${detailJob.status}`} role="status" aria-live="polite">
          {detailJob.status === 'running' ? (
            <>
              <span>Loading guest details <strong>{detailJob.done + detailJob.failed} / {detailJob.total}</strong></span>
              <span className="fc-jobbar-track" aria-hidden="true">
                <span className="fc-jobbar-fill" style={{ width: `${detailJob.total ? Math.min(100, Math.round(((detailJob.done + detailJob.failed) / detailJob.total) * 100)) : 0}%` }} />
              </span>
            </>
          ) : detailJob.status === 'partial' ? (
            <span>Guest details loaded, but {detailJob.failed} reservation{detailJob.failed === 1 ? '' : 's'} couldn't be refreshed — the last known data is shown.</span>
          ) : (
            <span>Guest details couldn't finish loading{detailJob.error ? `: ${detailJob.error}` : '.'} Refresh to retry.</span>
          )}
        </div>
      )}

      {snapshot?.payload && snapshot.payload.reservationsComplete === false && (
        <div className="fc-jobbar fc-jobbar-partial" role="alert">
          The reservation list may be incomplete (rGuest didn't return every record). Refresh to try again.
        </div>
      )}

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
          <p>Tap the <strong>refresh</strong> button above to pull today's data from rGuest Stay and generate the first forecast.</p>
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
              // Sprint 20.3: same definition as the "Needs a room" tab.
              const noRoomCount    = reservations.filter(tabPredicate('needsRoom')).length;
              const goTab = (key) => { setResnFilter(key); };
              return (
                <>
                  <KpiCard
                    accent="arrivals"
                    icon={<IconBriefcase />}
                    label="Arrivals Today"
                    primary={kpis.arrivals ?? 0}
                    sublabel={`${kpis.remainingArrivals ?? 0} not arrived`}
                    onClick={() => goTab('remainingArrivals')}
                    active={resnFilter === 'remainingArrivals' || resnFilter === 'arrived'}
                  />
                  <KpiCard
                    accent="inhouse"
                    icon={<IconBed />}
                    label="In-house"
                    primary={kpis.inHouse ?? 0}
                    sublabel="guests currently staying"
                    onClick={() => goTab('inhouse')}
                    active={resnFilter === 'inhouse'}
                  />
                  <KpiCard
                    accent="departures"
                    icon={<IconExit />}
                    label="Departures Today"
                    primary={kpis.departures ?? 0}
                    sublabel={`${kpis.remainingDepartures ?? 0} not checked out`}
                    onClick={() => goTab('remainingDepartures')}
                    active={resnFilter === 'remainingDepartures' || resnFilter === 'departed'}
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
                    onClick={() => goTab('needsRoom')}
                    active={resnFilter === 'needsRoom'}
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

            {/* Sprint 20.4: the right rail (Today at a glance + Selected reservation) is gone — the KPI tiles above
                are the glance, and details expand in place on each card. */}
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
