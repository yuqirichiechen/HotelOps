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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const IconRefresh    = (p) => <Icon {...p} d={<><path d="M21 12a9 9 0 1 1-3.2-6.9" /><polyline points="21 4 21 10 15 10" /></>} />;
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

const fmtTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};


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

// Sprint 21 — 14-day outlook: pick a day; its table below follows. Colour = worst room-type status that day.
const OutlookStrip = ({ days, selected, onSelect }) => (
  <section className="fb-outlook" aria-label="14-day outlook">
    <div className="fb-outlook-head">
      <h2>14-day outlook</h2>
      <span className="fb-outlook-legend">
        <span className="fb-dot fb-dot-ok" /> enough rooms <span className="fb-dot fb-dot-tight" /> clean first <span className="fb-dot fb-dot-short" /> short
      </span>
    </div>
    <div className="fb-outlook-row" role="tablist">
      {days.map(d => {
        const p = ymdParts(d.date);
        const label = d.offset === 0 ? 'Today' : d.offset === 1 ? 'Tomorrow' : WEEKDAYS[p.dow];
        const flag = d.status === 'short' ? `${d.roomsShort} short` : d.status === 'tight' ? `clean ${d.roomsToPrioritize}` : d.status === 'nodata' ? 'no data' : null;
        return (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={selected === d.offset}
            disabled={d.outsideWindow}
            className={`fb-day fb-day-${d.status}${selected === d.offset ? ' active' : ''}`}
            onClick={() => onSelect(d.offset)}
            title={d.outsideWindow ? 'Reservations are only complete a limited number of days ahead' : `${fmtLong(d.date)} — ${d.arrivals} arriving, ${d.departures} departing, ${d.occupancyPct}% occupied tonight`}
          >
            <span className="fb-day-name">{label}</span>
            <span className="fb-day-date">{MONTHS[p.m - 1]} {p.d}</span>
            <span className="fb-day-occ"><span className="fb-day-occ-bar" style={{ width: `${Math.min(100, d.occupancyPct || 0)}%` }} /></span>
            <span className="fb-day-pct">{d.occupancyPct != null ? `${d.occupancyPct}%` : '—'}</span>
            <span className="fb-day-flow">↓{d.arrivals} ↑{d.departures}</span>
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
  const labels = { short: 'Short', tight: 'Clean first', ok: 'OK', even: 'Even', surplus: 'OK', nodata: 'No data' };
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
const fmtNet = (n) => (n > 0 ? `+${n}` : String(n));

// Columns per mode. TODAY answers "is it clean & ready, and if not, what must HK turn first?";
// a FUTURE day answers "will a room of this type be free that night?" (HK status is irrelevant then).
const COLS_TODAY = [
  { key: 'total',   label: 'Total',          title: 'Rooms of this type in inventory',                                 get: r => r.totalRooms },
  { key: 'ready',   label: 'Ready now',      title: 'Vacant and clean (Vacant-Inspected or Pickup) — sellable right now', get: r => r.ready },
  { key: 'dirty',   label: 'Dirty vacant',   title: 'Vacant but still being cleaned',                                  get: r => r.dirty },
  { key: 'freeing', label: 'Still departing', title: 'In-house guests due to check out today — their rooms free up',    get: r => r.freeing },
  { key: 'arr',     label: 'Arriving',       title: 'Guests still to arrive today (not yet checked in)',               get: r => r.arrivals },
  { key: 'clean',   label: 'Clean first',    title: 'Arrivals the ready rooms can’t cover — housekeeping should turn this many rooms first', get: r => Math.max(0, r.arrivals - r.ready), warn: true },
  { key: 'short',   label: 'Short',          title: 'Still short even after cleaning every dirty room and counting departures', get: r => Math.max(0, -r.netProjected), warn: true },
];
const COLS_FUTURE = [
  { key: 'total', label: 'Total',       title: 'Rooms of this type in inventory',                                  get: r => r.totalRooms },
  { key: 'unsell', label: 'Unavailable', title: 'Out of order / off the market / on hold / blocked',               get: r => r.unsellable },
  { key: 'occ',   label: 'Staying over', title: 'Guests whose stay continues through that night (guests leaving that day free their rooms)', get: r => r.occupied },
  { key: 'avail', label: 'Available',   title: 'Sellable rooms minus guests staying over',                         get: r => r.available },
  { key: 'arr',   label: 'Arriving',    title: 'Reservations arriving that day',                                   get: r => r.arrivals },
  { key: 'bal',   label: 'Balance',     title: 'Available − Arriving',                                             get: r => fmtNet(r.net), balance: true },
  { key: 'short', label: 'Short',       title: 'Arrivals that have no room of this type',                          get: r => Math.max(0, -r.net), warn: true },
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
              const cleanish = r.occupancyStatus === 'VAC' && (r.hkStatus === 'VI' || r.hkStatus === 'PU');
              return (
                <span key={r.roomNumber || r.reservationId} className={`fb-room-chip fb-room-${cleanish ? 'clean' : 'busy'}`}>
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
    <td key={key} className={`${c.balance ? `fb-balance fb-balance-${row.status}` : ''}${c.warn && c.get(row) > 0 ? ' fb-emph-warn' : ''}`}>{c.get(row)}</td>
  );

  return (
    <div className="fb-card">
      <div className="fb-card-head">
        <h2>Need by Room Type · {model.isToday ? 'today' : fmtLong(model.date)}</h2>
        <div className="fb-formula">
          <IconInfo />
          <div>
            {model.isToday ? (
              <><div><strong>Today:</strong> Ready now + Dirty + Still departing vs Arriving</div>
              <div className="fb-formula-sub">“Clean first” = arrivals the ready rooms can’t cover yet. “Short” = not enough rooms even after cleaning. Group totals pool subtypes — accessible/pet rooms can fulfil generic bookings.</div></>
            ) : (
              <><div><strong>{fmtLong(model.date)}:</strong> Available (rooms − staying over) vs Arriving</div>
              <div className="fb-formula-sub">Guests checking out that day free their rooms. Housekeeping status isn’t used for future days. Click a row to see the rooms.</div></>
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
              <th>Status</th>
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
                  <td><StatusPill status={g.totals.status} /></td>
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
                        <td><StatusPill status={v.status} /></td>
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
  const avail = (t) => (model.isToday ? t.ready + t.dirty + t.freeing : t.available);
  const maxVal = Math.max(1, ...groups.flatMap(g => [avail(g.totals), g.totals.arrivals]));
  const short  = groups.reduce((s, g) => s + Math.max(0, -g.totals.netProjected), 0);
  return (
    <div className="fb-card">
      <h2>Forecast Summary</h2>
      <div className="fb-summary-grid">
        <ul className="fb-summary-list">
          {groups.map(g => {
            const sh = Math.max(0, -g.totals.netProjected);
            return (
              <li key={g.baseCode || g.baseLabel}>
                <span>{g.baseCode || '—'} short</span>
                <strong className={sh > 0 ? 'fb-emph-warn' : 'fb-emph-ok'}>{sh}</strong>
              </li>
            );
          })}
          <li className="fb-summary-total">
            <span>Total short</span>
            <strong>{short} rooms</strong>
          </li>
        </ul>

        <div className="fb-chart">
          <div className="fb-chart-title">{model.isToday ? 'Rooms possible vs Arriving' : 'Available vs Arriving'}</div>
          <div className="fb-chart-legend">
            <span className="fb-chart-key fb-chart-key-vc">{model.isToday ? 'Ready + dirty + departing' : 'Available'}</span>
            <span className="fb-chart-key fb-chart-key-ar">Arriving</span>
          </div>
          {groups.map(g => {
            const vcW = (avail(g.totals) / maxVal) * 100;
            const arW = (g.totals.arrivals / maxVal) * 100;
            return (
              <div className="fb-bar-group" key={`bar-${g.baseCode || g.baseLabel}`}>
                <div className="fb-bar-label">{g.baseCode || '—'}</div>
                <div className="fb-bars">
                  <div className="fb-bar-row">
                    <div className="fb-bar fb-bar-vc" style={{ width: `${vcW}%` }} />
                    <span className="fb-bar-val">{avail(g.totals)}</span>
                  </div>
                  <div className="fb-bar-row">
                    <div className="fb-bar fb-bar-ar" style={{ width: `${arW}%` }} />
                    <span className="fb-bar-val">{g.totals.arrivals}</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="fb-chart-axis">
            <span>0</span><span>{Math.round(maxVal / 4)}</span><span>{Math.round(maxVal / 2)}</span><span>{Math.round(3 * maxVal / 4)}</span><span>{maxVal}</span>
          </div>
        </div>
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

const Forecast = () => {
  const { goTo } = useView();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading]   = useState(true);
  // Sprint 17.12: "syncing" replaces "scraping" — this page no
  // longer triggers a fresh scrape, it just re-reads the latest
  // snapshot from the DB. The Reservations page is where new
  // scrapes are kicked off; once that lands, sync here pulls the
  // updated payload.
  const [syncing, setSyncing]   = useState(false);
  const [error, setError]       = useState(null);
  const [historyOpen, setHistoryOpen]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetOpen, setSheetOpen]       = useState(false); // 17.12 — Generate Forecast modal

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

  // Sprint 17.12 — "Sync arrivals" on this page just re-reads the
  // latest snapshot. The actual rGuest scrape lives on the
  // Reservations page so the two pages always show the same
  // underlying data. (No POST /scrape from here.)
  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    const { ok, data } = await apiFetch('/admin/forecast/snapshots/latest');
    setSyncing(false);
    if (!ok || !data?.success) {
      setError(data?.message || 'Could not refresh from the latest snapshot.');
      return;
    }
    setSnapshot(data.snapshot || null);
  };

  // Sprint 21 — selected day (0 = today … 13), remembered for the browser session.
  const [dayOffset, setDayOffset] = useState(() => {
    try { const n = parseInt(sessionStorage.getItem('hotelops-fc-day'), 10); if (Number.isInteger(n) && n >= 0 && n < 14) return n; } catch { /* ignore */ }
    return 0;
  });
  useEffect(() => { try { sessionStorage.setItem('hotelops-fc-day', String(dayOffset)); } catch { /* ignore */ } }, [dayOffset]);

  const payload = snapshot?.payload;
  const outlook = useMemo(() => buildOutlook(payload, 14), [payload]);
  const model   = useMemo(
    () => (payload && payload.forecastDate ? buildDayModel(payload, addDays(payload.forecastDate, dayOffset)) : null),
    [payload, dayOffset]);
  const notes   = useMemo(() => (model ? deriveNotes(model) : []), [model]);
  // Click-to-expand rows list the physical rooms of each typeCode with their current status.
  const roomsByType = useMemo(() => {
    const m = new Map();
    for (const r of payload?.perRoomSheet || []) {
      if (!r.typeCode) continue;
      if (!m.has(r.typeCode)) m.set(r.typeCode, []);
      m.get(r.typeCode).push(r);
    }
    return m;
  }, [payload]);

  // Today's headline numbers prefer rGuest's own metric for "remaining arrivals" (same source as Reservations).
  const metricRemaining = payload?.metricsSnapshot?.remainingArrivals?.remaining;

  const lastSync = snapshot ? fmtTime(snapshot.scraped_at) : '—';
  // Room conditions change by the minute; a stale snapshot makes "today" misleading.
  const ageHours = snapshot?.scraped_at ? (Date.now() - new Date(snapshot.scraped_at).getTime()) / 3600000 : 0;
  const snapshotStale = ageHours > 3;

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
            Will each room type have enough rooms? Pick a day — today shows what’s clean and ready; later days look ahead.
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
            className="fb-btn fb-btn-secondary"
            onClick={handleSync}
            disabled={syncing}
            title="Re-read the latest snapshot — does NOT trigger a new rGuest scrape (use Reservations for that)"
          >
            <IconRefresh /> <span>{syncing ? 'Syncing…' : 'Sync arrivals'}</span>
          </button>
          <button
            className="fb-btn fb-btn-primary"
            onClick={() => setSheetOpen(true)}
            disabled={!snapshot}
            title={!snapshot ? 'Sync first' : 'Open a printable forecast sheet'}
          >
            <IconChart /> <span>Generate forecast</span>
          </button>
          <div className="fb-sync-badge">
            <span className="fb-sync-dot" />
            <span>Last sync</span>
            <strong>{lastSync}</strong>
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
            Once a snapshot exists, click <strong>Sync arrivals</strong> here to pull it in.
          </p>
        </div>
      )}

      {snapshot && model && (
        <>
          {snapshotStale && (
            <div className="fb-stale" role="status">
              This snapshot is {Math.floor(ageHours)} hours old — room conditions and arrivals may have changed.
              Run the scraper on the <button className="fb-empty-link" onClick={() => goTo('reservations')}>Reservations</button> page, then tap <strong>Sync arrivals</strong>.
            </div>
          )}

          <OutlookStrip days={outlook} selected={dayOffset} onSelect={setDayOffset} />

          <section className="fb-stats" aria-label="Top stats">
            {model.isToday ? (
              <>
                <StatBar label="Arrivals still to come" value={Number.isFinite(metricRemaining) ? metricRemaining : model.totals.remainingArrivals} accent="info" icon={<IconBriefcase />} />
                <StatBar label="Clean rooms ready"      value={model.totals.ready}        accent="success" icon={<IconCheck />} />
                <StatBar label="Clean these first"      value={model.totals.cleanFirst}   accent="warn"    icon={<IconBed />} />
                <StatBar label="Short even after cleaning" value={model.totals.roomsShort} accent="warn"   icon={<IconWarn />} />
                <StatBar label="Occupied tonight"       value={model.totals.occupancyPct != null ? `${model.totals.occupancyPct}%` : '—'} accent="info" icon={<IconTrend />} />
              </>
            ) : (
              <>
                <StatBar label="Arrivals"          value={model.totals.arrivals}   accent="info"    icon={<IconBriefcase />} />
                <StatBar label="Departures"        value={model.totals.departures} accent="default" icon={<IconBed />} />
                <StatBar label="Occupied that night" value={model.totals.occupancyPct != null ? `${model.totals.occupancyPct}%` : '—'} accent="success" icon={<IconTrend />} />
                <StatBar label="Rooms short"       value={model.totals.roomsShort} accent="warn"    icon={<IconWarn />} />
                <StatBar label="Room types short"  value={model.totals.shortGroups} accent="warn"   icon={<IconCheck />} />
              </>
            )}
          </section>

          <div className="fb-body">
            <main className="fb-main">
              <NeedTable model={model} roomsByType={roomsByType} />
              <ArrivalDetailTable rows={payload.reservations || []} date={model.date} isToday={model.isToday} />
            </main>
            <aside className="fb-rail">
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
