// Sprint 17.11 — Admin Forecast page (room-type availability).
//
// This is the actual *forecast*: for each base room type (NKRR /
// NKJZ / NQRR / NQJZ), compare today's arrivals against the
// number of vacant-clean rooms of that type, and surface
// shortages so the FD/HK can prioritise turns.
//
// Distinct from `Reservations` (formerly the "Forecast" page,
// renamed in 17.11): that page lists who's arriving / departing /
// in-house. This page asks "do we have enough clean rooms by type
// to fulfil tonight's bookings?".
//
// Reads from the same `forecast_snapshot.payload` — specifically
// `byRoomType` (arrivals/type) + `perRoomSheet` (per-room
// occ+hk status). Reuses the shared scrape modals from
// `../Forecasting/`.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../auth';
import { useView } from '../../shells/ViewContext';
import ForecastSettings from '../Forecasting/ForecastSettings';
import ForecastHistory from '../Forecasting/ForecastHistory';
import ForecastSheet   from '../Forecasting/ForecastSheet';
import { buildDayModel, buildOutlook, deriveNotes, addDays } from './forecastModel';
import './Forecast.css';


// ── Inline SVG icons (subset of Forecasting's icons, redefined
//    here so the file's self-contained). ────────────────────────

const Icon = ({ d, size = 16, strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    {d}
  </svg>
);

const IconSend       = (p) => <Icon {...p} d={<><path d="M22 2 11 13" /><path d="M22 2 15 22 11 13 2 9z" /></>} />;
const IconChart      = (p) => <Icon {...p} d={<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>} />;
const IconClock      = (p) => <Icon {...p} size={14} d={<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>} />;
const IconGear       = (p) => <Icon {...p} size={14} d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>} />;
const IconChevron    = (p) => <Icon {...p} size={12} d={<polyline points="9 18 15 12 9 6" />} />;
const IconBed        = (p) => <Icon {...p} d={<><path d="M2 17v-5a2 2 0 0 1 2-2h11a4 4 0 0 1 4 4v3" /><path d="M2 17h20" /></>} />;
const IconCheck      = (p) => <Icon {...p} d={<polyline points="20 6 9 17 4 12" />} />;
const IconBriefcase  = (p) => <Icon {...p} d={<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>} />;
const IconWarn       = (p) => <Icon {...p} d={<><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9"  x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></>} />;
const IconTrend      = (p) => <Icon {...p} d={<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>} />;
const IconInfo       = (p) => <Icon {...p} size={14} d={<><circle cx="12" cy="12" r="9" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8"  x2="12.01" y2="8" /></>} />;
const IconDot        = (p) => <Icon {...p} size={10} d={<circle cx="12" cy="12" r="6" />} />;


// ── Formatters ──────────────────────────────────────────────



// ── Compute helpers ─────────────────────────────────────────
// Sprint 21: the supply/demand model moved to ./forecastModel.js (pure + tested): date-aware
// (today vs any of the next 14 days), excludes unsellable rooms, counts rooms freed by departures.

// Sprint 17.12 — buildHkMessage removed with the HK Message
// Preview card. If we resurrect it later, the implementation
// (in git history at this commit) can come back as-is.


const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymdParts = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
const fmtLong = (ymd) => { const p = ymdParts(ymd); return `${WEEKDAYS[p.dow]}, ${MONTHS[p.m - 1]} ${p.d}`; };

// Sprint 21 — 14-day outlook. TODAY carries the sell/close verdict from the live board; days 2–14 show only
// housekeeping workload (arrivals ↓, departures ↑, rooms to service) and occupancy — no verdict.
const TODAY_FLAG = { open: null, tight: 'clean first', full: 'sold out', short: 'oversold' };
const OutlookStrip = ({ days, selected, onSelect }) => (
  <section className="fb-outlook" aria-label="14-day outlook">
    <div className="fb-outlook-head">
      <h2>14-day outlook</h2>
      <span className="fb-outlook-legend">Today = live room board · later days = housekeeping workload</span>
    </div>
    <div className="fb-outlook-row" role="tablist">
      {days.map(d => {
        const p = ymdParts(d.date);
        const label = d.offset === 0 ? 'Today' : d.offset === 1 ? 'Tomorrow' : WEEKDAYS[p.dow];
        const flag = d.offset === 0 ? TODAY_FLAG[d.status] : d.status === 'nodata' ? 'no data' : null;
        return (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={selected === d.offset}
            disabled={d.outsideWindow}
            className={`fb-day fb-day-${d.offset === 0 ? d.status : (d.status === 'nodata' ? 'nodata' : 'workload')}${selected === d.offset ? ' active' : ''}`}
            onClick={() => onSelect(d.offset)}
            title={d.outsideWindow ? 'Reservations are only complete a limited number of days ahead' : `${fmtLong(d.date)} — ${d.arrivals} arriving, ${d.departures} departing, ${d.occupancyPct}% occupied tonight`}
          >
            <span className="fb-day-name">{label}</span>
            <span className="fb-day-date">{MONTHS[p.m - 1]} {p.d}</span>
            <span className="fb-day-occ"><span className="fb-day-occ-bar" style={{ width: `${Math.min(100, d.occupancyPct || 0)}%` }} /></span>
            <span className="fb-day-pct">{d.occupancyPct != null ? `${d.occupancyPct}%` : '—'}</span>
            <span className="fb-day-flow">↓{d.arrivals} ↑{d.departures}</span>
            {d.offset === 0
              ? <span className="fb-day-svc">{d.leftToSell} to sell</span>
              : d.roomsToService != null && <span className="fb-day-svc">{d.roomsToService} to service</span>}
            {flag && <span className={`fb-day-flag fb-day-flag-${d.status}`}>{flag}</span>}
          </button>
        );
      })}
    </div>
  </section>
);

// ── Sub-components ──────────────────────────────────────────

const StatBar = ({ label, value, accent, icon }) => (
  <div className={`fb-stat fb-stat-${accent || 'default'}`}>
    <div className="fb-stat-icon">{icon}</div>
    <div className="fb-stat-body">
      <div className="fb-stat-label">{label}</div>
      <div className="fb-stat-value">{value ?? '—'}</div>
    </div>
  </div>
);

const StatusPill = ({ status }) => {
  const labels = { open: 'Open', tight: 'Clean first', full: 'Sold out', short: 'Oversold', nodata: 'No data', workload: '' };
  return <span className={`fb-pill fb-pill-${status}`}>{labels[status] || status}</span>;
};

// Sprint 17.12 — grouped tree render. Each group has a header row
// showing the substitutability-aware totals; below it, one row
// per specific subtype (NKRRA / NKRRP / etc.) with its own
// independent balance.
// Sprint 17.16 — variant rows are click-to-expand. Clicking opens
// a detail row listing every physical room of that typeCode with
// its current occupancy + HK status. Lets the FD verify questions
// like "where is that 1 vacant NKRRP coming from?" without leaving
// the page.
// Columns per mode.
// TODAY answers "do we still have rooms to SELL?" from LIVE room conditions: VI = cleaned + inspected,
// PU = cleaned but awaiting front-desk inspection, everything else vacant = not ready yet.
// FUTURE days (2–14) are housekeeping WORKLOAD only — whether rooms are sellable that day depends on that
// day's cleaning/inspection, which can't be known in advance, so no short/surplus is claimed.
const COLS_TODAY = [
  { key: 'total',   label: 'Rooms',            title: 'Active rooms of this type (deactivated and out-of-order rooms excluded)', get: r => r.totalRooms },
  { key: 'vi',      label: 'Inspected (VI)',   title: 'Vacant Inspected — cleaned AND inspected, ready to sell',               get: r => r.inspected },
  { key: 'pu',      label: 'Awaiting inspection (PU)', title: 'Pickup — cleaned but not yet inspected by the front desk (sellable once inspected)', get: r => r.awaiting },
  { key: 'dirty',   label: 'Dirty / in progress', title: 'Vacant but not cleaned yet',                                       get: r => r.dirty },
  { key: 'freeing', label: 'Still departing',  title: 'In-house guests due to check out today — their rooms free up',         get: r => r.freeing },
  { key: 'arr',     label: 'Still arriving',   title: 'Guests booked for today who have not checked in yet',                  get: r => r.arrivals },
  { key: 'left',    label: 'Left to sell now', title: '(Inspected + Awaiting) − Still arriving. 0 = no clean room left to sell right now', get: r => Math.max(0, r.leftNow), strong: true },
];
const COLS_FUTURE = [
  { key: 'total',  label: 'Rooms',         title: 'Active rooms of this type',                                              get: r => r.totalRooms },
  { key: 'arr',    label: 'Arriving',      title: 'Reservations arriving that day — each needs a cleaned, ready room',      get: r => r.arrivals },
  { key: 'dep',    label: 'Departing',     title: 'Check-outs that day — each needs a full clean',                          get: r => r.departures },
  { key: 'stay',   label: 'Staying over',  title: 'Guests whose stay continues through that night — stayover service',       get: r => r.occupied },
  { key: 'svc',    label: 'Rooms to service', title: 'Departing (full clean) + staying over (service)',                      get: r => r.toService, strong: true },
];

const NeedTable = ({ model, roomsByType }) => {
  const [openType, setOpenType] = React.useState(null);
  const cols = model.isToday ? COLS_TODAY : COLS_FUTURE;
  const toggle = (typeCode) => setOpenType(prev => prev === typeCode ? null : typeCode);

  const renderDetailRow = (typeCode) => {
    const rooms = (roomsByType.get(typeCode) || []).slice()
      .sort((a, b) => (a.roomNumber || '').localeCompare(b.roomNumber || '', undefined, { numeric: true }));
    return (
      <tr className="fb-detail-row">
        <td colSpan={cols.length + 3}>
          <div className="fb-detail-grid">
            {rooms.length === 0 && <span className="fb-detail-empty">No rooms of this type in the snapshot.</span>}
            {rooms.map(r => {
              const cls = r.occupancyStatus === 'VAC' && r.hkStatus === 'VI' ? 'clean' : r.occupancyStatus === 'VAC' && r.hkStatus === 'PU' ? 'awaiting' : 'busy';
              return (
                <span key={r.roomNumber || r.reservationId} className={`fb-room-chip fb-room-${cls}`}>
                  <strong>{r.roomNumber || '?'}</strong>
                  <span className="fb-room-stat">{r.occupancyStatus || '—'}</span>
                  <span className="fb-room-stat">{r.hkStatusLabel || r.hkStatus || '—'}</span>
                </span>
              );
            })}
          </div>
        </td>
      </tr>
    );
  };

  const cell = (c, row, key) => (
    <td key={key} className={c.strong ? 'fb-cell-strong' : ''}>{c.get(row)}</td>
  );

  return (
    <div className="fb-card">
      <div className="fb-card-head">
        <h2>{model.isToday ? 'Rooms to sell today' : `Housekeeping workload · ${fmtLong(model.date)}`}</h2>
        <div className="fb-formula">
          <IconInfo />
          <div>
            {model.isToday ? (
              <><div><strong>Left to sell now</strong> = (Inspected + Awaiting inspection) − still arriving</div>
              <div className="fb-formula-sub">Live from rGuest. When a type reaches 0 and nothing more can be made ready, close it on SiteMinder (OTA + website). PU rooms count once the front desk inspects them.</div></>
            ) : (
              <><div><strong>{fmtLong(model.date)}:</strong> rooms housekeeping will need to turn</div>
              <div className="fb-formula-sub">Whether rooms are sellable that day depends on that day’s cleaning and inspection, so availability is only shown for today.</div></>
            )}
          </div>
        </div>
      </div>
      <div className="fb-table-wrap">
        <table className="fb-table fb-need-table">
          <thead>
            <tr>
              <th>Room Type Code</th>
              <th>Room Type</th>
              {cols.map(c => <th key={c.key} title={c.title}>{c.label}</th>)}
              {model.isToday && <th>Status</th>}
            </tr>
          </thead>
          <tbody>
            {model.groups.length === 0 && (
              <tr><td colSpan={cols.length + 3} className="fb-table-empty">No room types in the snapshot yet.</td></tr>
            )}
            {model.groups.map(g => (
              <React.Fragment key={g.baseCode || g.baseLabel}>
                <tr className="fb-group-row">
                  <td><code className="fb-group-code">{g.baseCode || '—'}</code></td>
                  <td><strong>{g.baseLabel}</strong> <span className="fb-group-sub">· all subtypes</span></td>
                  {cols.map(c => cell(c, g.totals, c.key))}
                  {model.isToday && <td><StatusPill status={g.totals.status} /></td>}
                </tr>
                {g.variants.map(v => {
                  const isOpen = openType === v.typeCode;
                  return (
                    <React.Fragment key={v.typeCode}>
                      <tr
                        className={`fb-variant-row fb-clickable${isOpen ? ' open' : ''}`}
                        onClick={() => toggle(v.typeCode)}
                        title="Click to inspect specific rooms"
                      >
                        <td>
                          <span className="fb-variant-tree" aria-hidden>{isOpen ? '▾' : '└'}</span>
                          <code>{v.typeCode}</code>
                        </td>
                        <td className="fb-variant-label">{v.subLabel || 'Standard'}</td>
                        {cols.map(c => cell(c, v, c.key))}
                        {model.isToday && <td><StatusPill status={v.status} /></td>}
                      </tr>
                      {isOpen && renderDetailRow(v.typeCode)}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ArrivalDetailTable = ({ rows, date, isToday }) => {
  // Guests arriving on the selected day (today: both still-to-come and already checked in), by name.
  const arrivals = rows
    .filter(r => r.arrivalDate === date && (r.status === 'RES' || (isToday && r.status === 'INH')))
    .slice()
    .sort((a, b) => (a.guestName || '').localeCompare(b.guestName || ''));
  return (
    <div className="fb-card">
      <div className="fb-card-head">
        <h2>Arrivals · {isToday ? 'today' : fmtLong(date)}</h2>
        <span className="fb-card-sub">{arrivals.length} arriving</span>
      </div>
      <div className="fb-table-wrap">
        <table className="fb-table fb-detail-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Room Type</th>
              <th>Room</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {arrivals.length === 0 && (
              <tr><td colSpan={5} className="fb-table-empty">No arrivals on this day.</td></tr>
            )}
            {arrivals.slice(0, 30).map(r => (
              <tr key={r.id}>
                <td className="fb-cell-name">{r.guestName || '(no name)'}</td>
                <td><code>{r.typeCode || r.baseCode || '—'}</code></td>
                <td>{r.roomNumber || <span className="fb-muted">not assigned</span>}</td>
                <td>{r.source || '—'}</td>
                <td><span className={`fb-pill fb-pill-status-${(r.statusLabel || '').toLowerCase().replace(/[^a-z]/g, '')}`}>{r.statusLabel || '—'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {arrivals.length > 30 && (
          <p className="fb-table-footnote">Showing first 30 of {arrivals.length}. Full list lives on the Reservations page.</p>
        )}
      </div>
    </div>
  );
};

// Right-rail summary card. Sprint 17.12 — takes the grouped tree
// directly. Per-group totals on the left; SVG bar chart on the
// right comparing each group's Vacant Clean vs Arrivals.
const ForecastSummaryCard = ({ model }) => {
  const groups = model.groups;
  const A = (t) => (model.isToday ? t.ready : t.arrivals);         // series A: today = sellable now · future = arriving
  const B = (t) => (model.isToday ? t.arrivals : t.departures);    // series B: today = still arriving · future = departing
  const maxVal = Math.max(1, ...groups.flatMap(g => [A(g.totals), B(g.totals)]));
  return (
    <div className="fb-card">
      <h2>{model.isToday ? 'Sellable vs arriving' : 'Arrivals vs departures'}</h2>
      <div className="fb-summary-grid">
        <ul className="fb-summary-list">
          {groups.map(g => (
            <li key={g.baseCode || g.baseLabel}>
              <span>{g.baseCode || '—'} {model.isToday ? 'left to sell' : 'to service'}</span>
              <strong className={model.isToday && g.totals.leftNow <= 0 ? 'fb-emph-warn' : 'fb-emph-ok'}>
                {model.isToday ? Math.max(0, g.totals.leftNow) : g.totals.toService}
              </strong>
            </li>
          ))}
          <li className="fb-summary-total">
            <span>{model.isToday ? 'Total left to sell' : 'Total to service'}</span>
            <strong>{model.isToday ? model.totals.leftToSell : model.totals.roomsToService} rooms</strong>
          </li>
        </ul>

        <div className="fb-chart">
          <div className="fb-chart-legend">
            <span className="fb-chart-key fb-chart-key-vc">{model.isToday ? 'Clean rooms (VI + PU)' : 'Arriving'}</span>
            <span className="fb-chart-key fb-chart-key-ar">{model.isToday ? 'Still arriving' : 'Departing'}</span>
          </div>
          {groups.map(g => (
            <div className="fb-bar-group" key={`bar-${g.baseCode || g.baseLabel}`}>
              <div className="fb-bar-label">{g.baseCode || '—'}</div>
              <div className="fb-bars">
                <div className="fb-bar-row"><div className="fb-bar fb-bar-vc" style={{ width: `${(A(g.totals) / maxVal) * 100}%` }} /><span className="fb-bar-val">{A(g.totals)}</span></div>
                <div className="fb-bar-row"><div className="fb-bar fb-bar-ar" style={{ width: `${(B(g.totals) / maxVal) * 100}%` }} /><span className="fb-bar-val">{B(g.totals)}</span></div>
              </div>
            </div>
          ))}
          <div className="fb-chart-axis">
            <span>0</span><span>{Math.round(maxVal / 4)}</span><span>{Math.round(maxVal / 2)}</span><span>{Math.round(3 * maxVal / 4)}</span><span>{maxVal}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Sprint 21.3 — action lists for the front desk / housekeeping (today only, from the live room board).
const ActionLists = ({ model }) => {
  if (!model.isToday || !model.actions) return null;
  const { inspect, cleanFirst } = model.actions;
  const Chips = ({ rows }) => (
    <div className="fb-action-chips">
      {rows.map(r => (
        <span key={r.roomNumber} className={`fb-room-chip fb-room-${r.hkStatus === 'IP' ? 'awaiting' : 'busy'}`} title={`${r.typeCode}${r.hkStatus === 'IP' ? ' — in progress' : ''}`}>
          <strong>{r.roomNumber}</strong><span className="fb-room-stat">{r.typeCode}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="fb-card">
      <h2>Action list</h2>
      <div className="fb-action">
        <h3>Front desk — inspect now <span className="fb-action-count">{inspect.length}</span></h3>
        {inspect.length === 0
          ? <p className="fb-muted">No rooms are waiting for inspection.</p>
          : <><p className="fb-muted">Cleaned (PU) but not inspected — marking them Vacant Inspected confirms them for sale.</p><Chips rows={inspect} /></>}
      </div>
      <div className="fb-action">
        <h3>Housekeeping — turn these first <span className="fb-action-count">{cleanFirst.length}</span></h3>
        {cleanFirst.length === 0
          ? <p className="fb-muted">Clean rooms already cover everyone still arriving.</p>
          : <><p className="fb-muted">Dirty rooms to prioritise so the rest of today’s arrivals have a ready room (in-progress first).</p><Chips rows={cleanFirst} /></>}
      </div>
    </div>
  );
};

const OperationalNotes = ({ notes }) => (
  <div className="fb-card">
    <h2>Operational Notes</h2>
    <ul className="fb-notes">
      {notes.map((n, i) => (
        <li key={i} className={`fb-note fb-note-${n.kind}`}>
          <span className="fb-note-dot" aria-hidden="true"><IconDot /></span>
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  </div>
);

// Sprint 17.12 — HK Message Preview + Send to housekeeping
// removed from the Forecast page per user direction. Those belong
// to the Reservations / handoff workflow, not the room-availability
// projection. Component definition removed entirely.


// ── Page ────────────────────────────────────────────────────

// Live room board: refresh every 2 min while the tab is visible AND someone is around; pause after 30 min of no
// interaction (a Forecast page left open on a monitor overnight must not hammer rGuest). The live route is DB-free.
const LIVE_EVERY_MS = 120 * 1000;
const IDLE_PAUSE_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

const Forecast = () => {
  const { goTo } = useView();
  const [snapshot, setSnapshot] = useState(null);   // reservations as of the last scrape (labels, future days)
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [historyOpen, setHistoryOpen]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetOpen, setSheetOpen]       = useState(false); // 17.12 — Generate Forecast modal

  // Sprint 21.3 — no manual "Sync": the page loads the latest snapshot on open / when you come back to the tab,
  // and today's board is a separate LIVE pull. (Sprint 22 makes the snapshot itself sync automatically.)
  const loadLatest = useCallback(async () => {
    const { ok, data } = await apiFetch('/admin/forecast/snapshots/latest');
    if (!ok || !data?.success) { setError(data?.message || 'Could not load latest forecast.'); setLoading(false); return; }
    setError(null);
    setSnapshot(data.snapshot || null);
    setLoading(false);
  }, []);
  useEffect(() => {
    loadLatest();
    const onFocus = () => loadLatest();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadLatest]);

  // ── live room board ──
  const [live, setLive]           = useState(null);
  const [liveError, setLiveError] = useState(false);
  const [paused, setPaused]       = useState(false);
  const lastActivity = useRef(Date.now());
  const pausedRef    = useRef(false);
  const fetchLive = useCallback(async () => {
    const { ok, data } = await apiFetch('/admin/forecast/live');
    if (ok && data?.success) { setLive(data.live); setLiveError(false); } else setLiveError(true);
  }, []);
  useEffect(() => {
    fetchLive();
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivity.current > IDLE_PAUSE_MS) { pausedRef.current = true; setPaused(true); return; }
      fetchLive();
    }, LIVE_EVERY_MS);
    const onActivity = () => {
      lastActivity.current = Date.now();
      if (pausedRef.current) { pausedRef.current = false; setPaused(false); fetchLive(); }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') onActivity(); };
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(tick);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchLive]);

  // Selected day (0 = today … 13), remembered for the browser session.
  const [dayOffset, setDayOffset] = useState(() => {
    try { const n = parseInt(sessionStorage.getItem('hotelops-fc-day'), 10); if (Number.isInteger(n) && n >= 0 && n < 14) return n; } catch { /* ignore */ }
    return 0;
  });
  useEffect(() => { try { sessionStorage.setItem('hotelops-fc-day', String(dayOffset)); } catch { /* ignore */ } }, [dayOffset]);

  const payload = snapshot?.payload;
  const today   = live?.forecastDate || payload?.forecastDate;
  const outlook = useMemo(() => buildOutlook(payload, 14, live), [payload, live]);
  const model   = useMemo(
    () => (payload && today ? buildDayModel(payload, addDays(today, dayOffset), live) : null),
    [payload, today, dayOffset, live]);
  const notes   = useMemo(() => (model ? deriveNotes(model) : []), [model]);
  // Click-to-expand rows list the physical rooms of each typeCode with their LIVE status (today) or last-scrape status.
  const roomsByType = useMemo(() => {
    const m = new Map();
    const src = live && model?.isToday
      ? live.rooms.filter(r => !((payload?.inactiveRooms || []).includes(String(r.roomNumber))) && r.status !== false && !(r.endDate && String(r.endDate).slice(0, 10) < live.forecastDate))
      : (payload?.perRoomSheet || []);
    for (const r of src) {
      if (!r.typeCode) continue;
      if (!m.has(r.typeCode)) m.set(r.typeCode, []);
      m.get(r.typeCode).push({ ...r, hkStatusLabel: r.hkStatusLabel || ({ VI: 'Inspected', PU: 'Pickup', D: 'Dirty', IP: 'In progress', OC: 'Occupied clean' }[r.hkStatus]) || r.hkStatus });
    }
    return m;
  }, [payload, live, model]);

  const fmtT = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—');
  const ageHours = snapshot?.scraped_at ? (Date.now() - new Date(snapshot.scraped_at).getTime()) / 3600000 : 0;
  const dateMismatch = !!(live && payload && live.forecastDate && payload.forecastDate && live.forecastDate !== payload.forecastDate);
  const showStale = ageHours > 3 && (dayOffset > 0 || !live);

  return (
    <div className="fb-page">
      <header className="fb-header">
        <div className="fb-header-left">
          <div className="fb-breadcrumb">
            <button onClick={() => goTo('home')}>Home</button>
            <IconChevron />
            <span>Forecast</span>
          </div>
          <h1>Room Forecast</h1>
          <p className="fb-subtitle">
            Today: do we still have rooms to sell? (live from rGuest) · Next days: how many rooms housekeeping will turn.
          </p>
          <div className="fb-meta-actions">
            <button className="fb-meta-link" onClick={() => setHistoryOpen(true)}>
              <IconClock /> <span>Snapshot history</span>
            </button>
            <button className="fb-meta-link" onClick={() => setSettingsOpen(true)}>
              <IconGear /> <span>Forecast settings</span>
            </button>
            <button className="fb-meta-link" onClick={() => goTo('reservations')}>
              <IconBriefcase /> <span>Reservations detail</span>
            </button>
          </div>
        </div>

        <div className="fb-header-actions">
          <button
            className="fb-btn fb-btn-primary"
            onClick={() => setSheetOpen(true)}
            disabled={!snapshot}
            title={!snapshot ? 'Nothing to print yet' : 'Open a printable forecast sheet'}
          >
            <IconChart /> <span>Generate forecast</span>
          </button>
          <div className={`fb-sync-badge${liveError || paused || !live ? ' is-off' : ''}`} title={paused ? 'Live updates paused after 30 minutes without activity — move the mouse to resume' : liveError ? 'Could not reach rGuest — showing the last scrape' : 'Room conditions refresh from rGuest every 2 minutes'}>
            <span className="fb-sync-dot" />
            <span>{paused ? 'Live paused' : liveError ? 'Live unavailable' : 'Rooms live'}</span>
            <strong>{live ? fmtT(live.fetchedAt) : '—'}</strong>
          </div>
        </div>
      </header>

      {loading && <div className="fb-loading">Loading latest forecast…</div>}
      {error && (
        <div className="fb-error" role="alert"><strong>Something went wrong.</strong> {error}</div>
      )}
      {!loading && !snapshot && !error && (
        <div className="fb-empty">
          <h2>No forecast yet</h2>
          <p>
            Run the scraper on the <button className="fb-empty-link" onClick={() => goTo('reservations')}>Reservations</button> page first.
            This page picks up the latest data automatically.
          </p>
        </div>
      )}

      {snapshot && model && (
        <>
          {(liveError && !paused) && (
            <div className="fb-stale" role="status">Live room data is unavailable right now — today’s numbers use room conditions from the last scrape ({fmtT(snapshot.scraped_at)}).</div>
          )}
          {paused && (
            <div className="fb-stale" role="status">Live updates are paused (no activity for 30 minutes). Move the mouse or tap to resume.</div>
          )}
          {showStale && (
            <div className="fb-stale" role="status">
              Reservations are from the last scrape, {Math.floor(ageHours)} hours ago ({fmtT(snapshot.scraped_at)}).
              {live ? ' Today’s room board is live; later days use this scrape.' : ''} Run the scraper on the <button className="fb-empty-link" onClick={() => goTo('reservations')}>Reservations</button> page to refresh.
            </div>
          )}
          {dateMismatch && (
            <div className="fb-stale" role="status">The last scrape is from {fmtLong(payload.forecastDate)}; rGuest’s business date is now {fmtLong(live.forecastDate)}. Run the scraper for current arrivals.</div>
          )}

          <OutlookStrip days={outlook} selected={dayOffset} onSelect={setDayOffset} />

          <section className="fb-stats" aria-label="Top stats">
            {model.isToday ? (
              <>
                <StatBar label="Left to sell now"        value={model.totals.leftToSell}        accent="success" icon={<IconCheck />} />
                <StatBar label="Awaiting inspection (PU)" value={model.totals.awaiting}         accent="info"    icon={<IconBed />} />
                <StatBar label="Dirty / in progress"     value={model.totals.dirty}             accent="warn"    icon={<IconBed />} />
                <StatBar label="Still arriving"          value={model.totals.remainingArrivals} accent="info"    icon={<IconBriefcase />} />
                <StatBar label="Sold-out room types"     value={model.totals.soldOutGroups}     accent="warn"    icon={<IconWarn />} />
              </>
            ) : (
              <>
                <StatBar label="Arriving"        value={model.totals.arrivals}        accent="info"    icon={<IconBriefcase />} />
                <StatBar label="Departing"       value={model.totals.departures}      accent="default" icon={<IconBed />} />
                <StatBar label="Staying over"    value={model.totals.stayovers}       accent="default" icon={<IconBed />} />
                <StatBar label="Rooms to service" value={model.totals.roomsToService} accent="warn"    icon={<IconTrend />} />
                <StatBar label="Occupied that night" value={model.totals.occupancyPct != null ? `${model.totals.occupancyPct}%` : '—'} accent="success" icon={<IconCheck />} />
              </>
            )}
          </section>

          <div className="fb-body">
            <main className="fb-main">
              <NeedTable model={model} roomsByType={roomsByType} />
              <ArrivalDetailTable rows={payload.reservations || []} date={model.date} isToday={model.isToday} />
            </main>
            <aside className="fb-rail">
              <ActionLists model={model} />
              <ForecastSummaryCard model={model} />
              <OperationalNotes notes={notes} />
            </aside>
          </div>

        </>
      )}

      {historyOpen  && <ForecastHistory  onClose={() => setHistoryOpen(false)} />}
      {settingsOpen && <ForecastSettings onClose={() => setSettingsOpen(false)} />}
      {sheetOpen    && <ForecastSheet    onClose={() => setSheetOpen(false)} snapshot={snapshot} />}
    </div>
  );
};

export default Forecast;
