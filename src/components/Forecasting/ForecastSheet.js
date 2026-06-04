// Sprint 17.4 — Printable Housekeeping Forecast sheet.
//
// Opens as a full-screen modal over the Forecast page when the
// admin clicks "Generate forecast". Shows every room grouped by
// floor with HK status + the computed action. The Print button
// triggers window.print(); a print stylesheet hides everything
// outside the sheet so only this content lands on paper.

import React, { useEffect } from 'react';
import './ForecastSheet.css';

const ACTION_LABEL = {
  checkoutClean:   'Check-out clean',
  stayoverService: 'Stayover service',
  none:            '—',
};

// Sprint 17.6: tolerate both 'YYYY-MM-DD' and ISO timestamps (pg DATE
// columns serialise as ISO over JSON).
const _parseYmd = (val) => {
  if (!val) return null;
  const s = String(val).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

const fmtDate = (val) => {
  const d = _parseYmd(val);
  return d ? d.toLocaleDateString([], {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }) : '—';
};

const fmtDateShort = (val) => {
  const d = _parseYmd(val);
  return d ? d.toLocaleDateString([], {
    month: 'short', day: 'numeric',
  }) : '—';
};

const ForecastSheet = ({ snapshot, propertyName = 'Snoqualmie Inn', onClose }) => {
  // Close on Escape — keeps parity with ConfirmModal.
  useEffect(() => {
    if (!snapshot) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snapshot, onClose]);

  if (!snapshot?.payload) return null;

  const { byFloor = [], kpis = {}, forecastDate } = snapshot.payload;
  const totalRooms      = byFloor.reduce((s, f) => s + f.totalRooms,    0);
  const totalToClean    = byFloor.reduce((s, f) => s + f.roomsToClean,  0);

  return (
    <div className="fc-sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Printable forecast">
      <div className="fc-sheet-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="fc-sheet-controls">
          <div className="fc-sheet-controls-left">
            <span className="fc-sheet-controls-title">Printable forecast</span>
            <span className="fc-sheet-controls-hint">Press Esc or click outside to close</span>
          </div>
          <div className="fc-sheet-controls-right">
            <button
              className="fc-sheet-btn fc-sheet-btn-primary"
              onClick={() => window.print()}
            >
              ▤ Print
            </button>
            <button
              className="fc-sheet-btn fc-sheet-btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <article className="fc-sheet">
          <header className="fc-sheet-header">
            <div className="fc-sheet-title-block">
              <h1>Housekeeping Forecast</h1>
              <p className="fc-sheet-subtitle">
                {propertyName} · {fmtDate(forecastDate)}
              </p>
            </div>
            <div className="fc-sheet-summary">
              <div><strong>{kpis.arrivals ?? 0}</strong><span>Arrivals</span></div>
              <div><strong>{kpis.departures ?? 0}</strong><span>Departures</span></div>
              <div><strong>{kpis.stayovers ?? 0}</strong><span>Stayovers</span></div>
              <div><strong>{kpis.roomsToCleanToday ?? 0}</strong><span>To clean</span></div>
              <div><strong>{kpis.housekeepersNeeded ?? 0}</strong><span>Attendants</span></div>
            </div>
          </header>

          {byFloor.length === 0 && (
            <p className="fc-sheet-empty">No rooms in this snapshot.</p>
          )}

          {byFloor.map((floor) => (
            <section className="fc-sheet-floor" key={floor.floorId || 'unknown'}>
              <h2>
                <span className="fc-sheet-floor-name">{floor.floorLabel}</span>
                <span className="fc-sheet-floor-meta">
                  {floor.totalRooms} rooms · {floor.roomsToClean} to clean
                  {floor.checkoutCleans > 0 && ` (${floor.checkoutCleans} check-out)`}
                  {floor.stayoverService > 0 && ` (${floor.stayoverService} stayover)`}
                </span>
              </h2>
              <table className="fc-sheet-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Type</th>
                    <th>OCC / VAC</th>
                    <th>HK Status</th>
                    <th>Action today</th>
                    <th>Checkout</th>
                    <th>Guest</th>
                  </tr>
                </thead>
                <tbody>
                  {floor.rooms.map((r) => (
                    <tr key={r.roomNumber} className={`fc-sheet-row fc-sheet-row-${r.action}`}>
                      <td className="fc-sheet-room-num">{r.roomNumber}</td>
                      <td>
                        {r.baseLabel || r.typeCode || '?'}
                        {r.subLabel && r.subLabel !== 'Standard' && (
                          <span className="fc-sheet-sub"> · {r.subLabel}</span>
                        )}
                      </td>
                      <td>
                        <span className={`fc-sheet-occ fc-sheet-occ-${r.occupancyStatus || 'unknown'}`}>
                          {r.occupancyStatus || '—'}
                        </span>
                      </td>
                      <td>{r.hkStatusLabel || '—'}</td>
                      <td className="fc-sheet-action">{ACTION_LABEL[r.action] || '—'}</td>
                      <td>{fmtDateShort(r.checkoutDate)}</td>
                      <td>{r.guestName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          <footer className="fc-sheet-footer">
            <div>
              Total rooms: <strong>{totalRooms}</strong> ·
              {' '}Rooms to clean: <strong>{totalToClean}</strong> ·
              {' '}Housekeepers needed: <strong>{kpis.housekeepersNeeded ?? 0}</strong>
            </div>
            <div>
              Generated by HotelOps · {new Date().toLocaleString([], {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
};

export default ForecastSheet;
