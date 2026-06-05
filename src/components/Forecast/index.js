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

// Build `needByRoomType` rows from the snapshot payload.
//   vacantClean = perRoomSheet rooms where occ=VAC AND hk=VI of
//                 that base type
//   arrivals    = byRoomType.arrivals
//   netBalance  = vacantClean − arrivals
//   roomsNeeded = max(0, −netBalance)
//   status      = 'surplus' | 'short' | 'even'
function computeNeedRows(payload) {
  if (!payload) return [];
  const vacantByBase = new Map();
  for (const r of payload.perRoomSheet || []) {
    if (r.occupancyStatus === 'VAC' && r.hkStatus === 'VI') {
      const key = r.baseCode || '__OTHER__';
      vacantByBase.set(key, (vacantByBase.get(key) || 0) + 1);
    }
  }
  return (payload.byRoomType || []).map(rt => {
    const vacantClean = vacantByBase.get(rt.baseCode || '__OTHER__') || 0;
    const arrivals    = rt.arrivals || 0;
    const netBalance  = vacantClean - arrivals;
    const status      = netBalance > 0 ? 'surplus' : netBalance < 0 ? 'short' : 'even';
    return {
      baseCode:   rt.baseCode,
      baseLabel:  rt.baseLabel || '—',
      vacantClean,
      arrivals,
      netBalance,
      roomsNeeded: Math.max(0, -netBalance),
      status,
    };
  });
}

// Auto-generate operational notes from the compute output. Keeps
// the panel data-driven so it stays accurate run-over-run.
function deriveOperationalNotes(needRows) {
  const notes = [];
  const shorts  = needRows.filter(r => r.status === 'short').sort((a, b) => b.roomsNeeded - a.roomsNeeded);
  const surplus = needRows.filter(r => r.status === 'surplus');
  if (shorts.length) {
    const codes = shorts.map(r => r.baseCode || '?').join(', ');
    notes.push({
      kind: 'urgent',
      text: `Prioritize clean turns for ${codes}.`,
    });
  }
  for (const r of surplus) {
    notes.push({
      kind: 'info',
      text: `${r.baseCode || '?'} currently has ${r.netBalance} surplus vacant-clean room${r.netBalance === 1 ? '' : 's'}.`,
    });
  }
  notes.push({
    kind: 'neutral',
    text: 'Use the arrivals list below to confirm late check-ins.',
  });
  return notes;
}

// Build the housekeeping handoff message from the same data.
function buildHkMessage(needRows) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const shorts  = needRows.filter(r => r.status === 'short');
  const surplus = needRows.filter(r => r.status === 'surplus');
  const intro = `Good ${part} housekeeping team — today's room forecast`;
  if (!shorts.length && !surplus.length) {
    return `${intro} shows balanced inventory across all room types. No prioritization needed.`;
  }
  const shortsList = shorts.length
    ? `shortages in ${shorts.map(r => `${r.baseCode} (${r.roomsNeeded})`).join(', ')}.`
    : '';
  const surplusList = surplus.length
    ? ` ${surplus.map(r => `${r.baseCode} currently has ${r.netBalance} surplus vacant-clean room${r.netBalance === 1 ? '' : 's'}`).join('. ')}.`
    : '';
  const action = shorts.length
    ? ' Please prioritize room turns for these room types.'
    : '';
  return `${intro} shows ${shortsList}${action}${surplusList}`.trim();
}


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
  const labels = { short: 'Short', surplus: 'Surplus', even: 'Even' };
  return <span className={`fb-pill fb-pill-${status}`}>{labels[status]}</span>;
};

const NeedTable = ({ rows }) => (
  <div className="fb-card">
    <div className="fb-card-head">
      <h2>Need by Room Type</h2>
      <div className="fb-formula" title="Vacant Clean − Arrivals = Net Balance. Negative means rooms are needed.">
        <IconInfo />
        <div>
          <div><strong>Forecast formula:</strong> Vacant Clean − Arrivals = Net Balance</div>
          <div className="fb-formula-sub">Negative balance means rooms are needed.</div>
        </div>
      </div>
    </div>
    <div className="fb-table-wrap">
      <table className="fb-table">
        <thead>
          <tr>
            <th>Room Type Code</th>
            <th>Room Type</th>
            <th>Vacant Clean</th>
            <th>Arrivals</th>
            <th>Net Balance</th>
            <th>Rooms Needed</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={7} className="fb-table-empty">No room types in the snapshot yet.</td></tr>
          )}
          {rows.map(r => (
            <tr key={r.baseCode || r.baseLabel}>
              <td><code>{r.baseCode || '—'}</code></td>
              <td>{r.baseLabel}</td>
              <td>{r.vacantClean}</td>
              <td>{r.arrivals}</td>
              <td className={`fb-balance fb-balance-${r.status}`}>
                {r.netBalance > 0 ? `+${r.netBalance}` : r.netBalance}
              </td>
              <td className={r.roomsNeeded > 0 ? 'fb-emph-warn' : ''}>{r.roomsNeeded}</td>
              <td><StatusPill status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const ArrivalDetailTable = ({ rows }) => {
  // Limit to today's arrivals only (the page's purpose), sort by
  // guest name for readability.
  const arrivals = rows
    .filter(r => r.kind === 'arrival')
    .slice()
    .sort((a, b) => (a.guestName || '').localeCompare(b.guestName || ''));
  return (
    <div className="fb-card">
      <div className="fb-card-head">
        <h2>Arrival Detail Reference</h2>
        <span className="fb-card-sub">{arrivals.length} arriving today</span>
      </div>
      <div className="fb-table-wrap">
        <table className="fb-table fb-detail-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Room Type</th>
              <th>Arrival Date</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {arrivals.length === 0 && (
              <tr><td colSpan={5} className="fb-table-empty">No arrivals in this snapshot.</td></tr>
            )}
            {arrivals.slice(0, 30).map(r => (
              <tr key={r.id}>
                <td className="fb-cell-name">{r.guestName || '(no name)'}</td>
                <td><code>{r.baseCode || '—'}</code></td>
                <td>{r.arrivalDate || '—'}</td>
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

// Right-rail summary card with both per-type need counts AND a
// little SVG bar chart comparing Vacant Clean vs Arrivals.
const ForecastSummaryCard = ({ rows }) => {
  const maxVal = Math.max(1, ...rows.flatMap(r => [r.vacantClean, r.arrivals]));
  const total  = rows.reduce((s, r) => s + r.roomsNeeded, 0);
  return (
    <div className="fb-card">
      <h2>Forecast Summary</h2>
      <div className="fb-summary-grid">
        <ul className="fb-summary-list">
          {rows.map(r => (
            <li key={r.baseCode || r.baseLabel}>
              <span>{r.baseCode || '—'} needed</span>
              <strong className={r.roomsNeeded > 0 ? 'fb-emph-warn' : 'fb-emph-ok'}>{r.roomsNeeded}</strong>
            </li>
          ))}
          <li className="fb-summary-total">
            <span>Total needed</span>
            <strong>{total} rooms</strong>
          </li>
        </ul>

        <div className="fb-chart">
          <div className="fb-chart-title">Vacant Clean vs Arrivals</div>
          <div className="fb-chart-legend">
            <span className="fb-chart-key fb-chart-key-vc">Vacant Clean</span>
            <span className="fb-chart-key fb-chart-key-ar">Arrivals</span>
          </div>
          {rows.map(r => {
            const vcW = (r.vacantClean / maxVal) * 100;
            const arW = (r.arrivals    / maxVal) * 100;
            return (
              <div className="fb-bar-group" key={`bar-${r.baseCode || r.baseLabel}`}>
                <div className="fb-bar-label">{r.baseCode || '—'}</div>
                <div className="fb-bars">
                  <div className="fb-bar-row">
                    <div className="fb-bar fb-bar-vc" style={{ width: `${vcW}%` }} />
                    <span className="fb-bar-val">{r.vacantClean}</span>
                  </div>
                  <div className="fb-bar-row">
                    <div className="fb-bar fb-bar-ar" style={{ width: `${arW}%` }} />
                    <span className="fb-bar-val">{r.arrivals}</span>
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

const HkMessageCard = ({ text, onSend }) => (
  <div className="fb-card fb-msg-card">
    <div className="fb-msg-head">
      <h2>Housekeeping Message Preview</h2>
    </div>
    <p className="fb-msg-body">{text}</p>
    <div className="fb-msg-actions">
      <button
        type="button"
        className="fb-btn fb-btn-secondary"
        onClick={() => { try { navigator.clipboard.writeText(text); } catch { /* noop */ } }}
      >
        Edit message
      </button>
      <button
        type="button"
        className="fb-btn fb-btn-primary"
        onClick={onSend}
      >
        <IconSend /> <span>Send to housekeeping</span>
      </button>
    </div>
  </div>
);


// ── Page ────────────────────────────────────────────────────

const Forecast = () => {
  const { goTo } = useView();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [scraping, setScraping] = useState(false);
  const [error, setError]       = useState(null);
  const [historyOpen, setHistoryOpen]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    const { ok, data } = await apiFetch('/admin/forecast/scrape', {
      method: 'POST', body: JSON.stringify({}),
    });
    setScraping(false);
    if (!ok || !data?.success) {
      setError(data?.message || 'Scrape failed. Check Settings → Snapshot history for details.');
      return;
    }
    setSnapshot(data.snapshot);
  };

  const needRows = useMemo(() => computeNeedRows(snapshot?.payload), [snapshot]);
  const notes    = useMemo(() => deriveOperationalNotes(needRows), [needRows]);
  const hkText   = useMemo(() => buildHkMessage(needRows), [needRows]);

  const totals = useMemo(() => {
    const totalRoomsNeeded = needRows.reduce((s, r) => s + r.roomsNeeded, 0);
    const totalVacantClean = needRows.reduce((s, r) => s + r.vacantClean, 0);
    const totalArrivals    = needRows.reduce((s, r) => s + r.arrivals,    0);
    const deficitTypes     = needRows.filter(r => r.status === 'short').length;
    const surplusTypes     = needRows.filter(r => r.status === 'surplus').length;
    return { totalRoomsNeeded, totalVacantClean, totalArrivals, deficitTypes, surplusTypes };
  }, [needRows]);

  const lastSync = snapshot ? fmtTime(snapshot.scraped_at) : '—';

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
            Room-type availability forecast from Agilysys rGuest Stay and housekeeping room conditions.
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
            onClick={handleScrape}
            disabled={scraping}
          >
            <IconRefresh /> <span>{scraping ? 'Syncing…' : 'Sync arrivals'}</span>
          </button>
          <button className="fb-btn fb-btn-primary" disabled={!snapshot}>
            <IconChart /> <span>Generate forecast</span>
          </button>
          <button className="fb-btn fb-btn-secondary" disabled={!snapshot}>
            <IconSend /> <span>Send to housekeeping</span>
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
          <p>Click <strong>Sync arrivals</strong> above to pull today's data from rGuest Stay and generate the first forecast.</p>
        </div>
      )}

      {snapshot && (
        <>
          <section className="fb-stats" aria-label="Top stats">
            <StatBar label="Total rooms needed today" value={totals.totalRoomsNeeded} accent="warn"    icon={<IconBed />} />
            <StatBar label="Total vacant clean"       value={totals.totalVacantClean} accent="success" icon={<IconCheck />} />
            <StatBar label="Total arrivals"           value={totals.totalArrivals}    accent="info"    icon={<IconBriefcase />} />
            <StatBar label="Deficit room types"       value={totals.deficitTypes}     accent="warn"    icon={<IconWarn />} />
            <StatBar label="Surplus room types"       value={totals.surplusTypes}     accent="success" icon={<IconTrend />} />
          </section>

          <div className="fb-body">
            <main className="fb-main">
              <NeedTable rows={needRows} />
              <ArrivalDetailTable rows={snapshot.payload.reservations || []} />
            </main>
            <aside className="fb-rail">
              <ForecastSummaryCard rows={needRows} />
              <OperationalNotes notes={notes} />
            </aside>
          </div>

          <HkMessageCard text={hkText} onSend={() => { /* 17.12 */ }} />
        </>
      )}

      {historyOpen  && <ForecastHistory  onClose={() => setHistoryOpen(false)} />}
      {settingsOpen && <ForecastSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

export default Forecast;
