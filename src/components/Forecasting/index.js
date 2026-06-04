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
import ForecastSheet from './ForecastSheet';
import ForecastSettings from './ForecastSettings';
import ForecastHistory from './ForecastHistory';
import './Forecasting.css';


// ── Formatters ─────────────────────────────────────────────

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const fmtDate = (ymd) => {
  if (!ymd) return '—';
  // ymd is YYYY-MM-DD; build a Date with explicit local midnight so
  // toLocaleDateString doesn't shift it by tz.
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
};

const ACTION_LABEL = {
  checkoutClean:   'Check-out clean',
  stayoverService: 'Stayover service',
  none:            '—',
};


// ── Sub-components ─────────────────────────────────────────

const KpiCard = ({ label, value, sublabel, accent }) => (
  <div className={`fc-kpi-card${accent ? ` fc-kpi-${accent}` : ''}`}>
    <div className="fc-kpi-icon" aria-hidden="true" />
    <div className="fc-kpi-body">
      <div className="fc-kpi-label">{label}</div>
      <div className="fc-kpi-value">{value ?? '—'}</div>
      {sublabel && <div className="fc-kpi-sublabel">{sublabel}</div>}
    </div>
  </div>
);

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
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [scraping, setScraping] = useState(false);
  const [error, setError]       = useState(null);
  const [view, setView]         = useState('cleaning'); // 'cleaning' | 'room' | 'floor'
  const [sheetOpen, setSheetOpen] = useState(false);    // Sprint 17.4: printable sheet
  const [settingsOpen, setSettingsOpen] = useState(false); // Sprint 17.5
  const [historyOpen, setHistoryOpen]   = useState(false); // Sprint 17.5

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
      method: 'POST',
      body:   JSON.stringify({}),
    });
    setScraping(false);
    if (!ok || !data?.success) {
      setError(data?.message || 'Scrape failed. Check Agilysys credentials + the snapshot logs.');
      return;
    }
    setSnapshot(data.snapshot);
  };

  // Sprint 17.4: open the printable forecast sheet over the page.
  // We keep it as an in-page modal (rather than a new tab) so the
  // print stylesheet can guarantee what reaches paper.
  const handleGenerate = () => setSheetOpen(true);
  const generateDisabled = !snapshot;

  const lastSync = snapshot ? fmtTime(snapshot.scraped_at) : '—';
  const kpis = snapshot?.payload?.kpis || {};

  const tableEl = useMemo(() => {
    if (!snapshot?.payload) return null;
    if (view === 'cleaning') return <ByCleaningTable rows={snapshot.payload.byCleaningType || []} />;
    if (view === 'room')     return <ByRoomTypeTable rows={snapshot.payload.byRoomType    || []} />;
    if (view === 'floor')    return <ByFloorTable    rows={snapshot.payload.byFloor       || []} />;
    return null;
  }, [snapshot, view]);

  return (
    <div className="fc-page">
      <header className="fc-header">
        <div className="fc-header-text">
          <h1>Room Forecast</h1>
          <p className="fc-subtitle">
            Scraped from Agilysys rGuest Stay and compared with housekeeping conditions.
          </p>
          <div className="fc-header-meta-actions">
            <button
              type="button"
              className="fc-meta-link"
              onClick={() => setHistoryOpen(true)}
            >
              Snapshot history
            </button>
            <span className="fc-meta-sep" aria-hidden>·</span>
            <button
              type="button"
              className="fc-meta-link"
              onClick={() => setSettingsOpen(true)}
            >
              Forecast settings
            </button>
          </div>
        </div>
        <div className="fc-header-actions">
          <button
            className="fc-btn fc-btn-primary"
            onClick={handleScrape}
            disabled={scraping}
          >
            {scraping ? '⟳ Running…' : '⟳ Run scraper'}
          </button>
          <button
            className="fc-btn fc-btn-secondary"
            onClick={handleGenerate}
            disabled={generateDisabled}
            title={generateDisabled ? 'Run the scraper first' : 'Open a printable forecast sheet'}
          >
            ▸ Generate forecast
          </button>
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
          <section className="fc-kpis" aria-label="Daily KPIs">
            <KpiCard label="Arrivals"             value={kpis.arrivals}           sublabel="rooms" accent="arrivals"   />
            <KpiCard label="Departures"           value={kpis.departures}         sublabel="rooms" accent="departures" />
            <KpiCard label="Stayovers"            value={kpis.stayovers}          sublabel="rooms" accent="stayovers"  />
            <KpiCard label="Rooms to clean today" value={kpis.roomsToCleanToday}  sublabel="rooms" accent="clean"      />
            <KpiCard label="Housekeepers needed"  value={kpis.housekeepersNeeded} sublabel="attendants" accent="staff" />
          </section>

          <div className="fc-body">
            <main className="fc-main">
              <div className="fc-table-header">
                <h2>Forecast {view === 'cleaning' ? 'by Cleaning Type' : view === 'room' ? 'by Room Type' : 'by Floor'}</h2>
                <div className="fc-toggle" role="tablist">
                  <button role="tab" aria-selected={view === 'cleaning'} className={view === 'cleaning' ? 'active' : ''} onClick={() => setView('cleaning')}>By cleaning type</button>
                  <button role="tab" aria-selected={view === 'room'}     className={view === 'room'     ? 'active' : ''} onClick={() => setView('room')}    >By room type</button>
                  <button role="tab" aria-selected={view === 'floor'}    className={view === 'floor'    ? 'active' : ''} onClick={() => setView('floor')}   >By floor</button>
                </div>
              </div>
              {tableEl}
              <p className="fc-table-footnote">
                Rooms to clean today includes full cleans (check-outs) and stayover touch-ups.
              </p>
            </main>

            <aside className="fc-rail">
              <ScraperOutputCard snapshot={snapshot} />
              <DispatchSummaryCard data={snapshot.payload.dispatchSummary} />
              <SendoutCard onClick={handleGenerate} disabled={generateDisabled} snapshot={snapshot} />
            </aside>
          </div>

          <div className="fc-bottom">
            <DonutLegend
              rows={snapshot.payload.byCleaningType || []}
              total={kpis.roomsToCleanToday || 0}
            />
          </div>
        </>
      )}

      {sheetOpen && (
        <ForecastSheet
          snapshot={snapshot}
          onClose={() => setSheetOpen(false)}
        />
      )}

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
    </div>
  );
};

export default Forecasting;
