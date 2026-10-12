// Sprint 21.4 — printable sheet for the SELECTED day (replaces the snapshot-only "today" sheet).
// Today: from the live room board (front desk inspects, housekeeping turns, by floor).
// Future days: cleaning priority per room type + the departing rooms to turn, by floor.
// Reuses the fc-sheet-* classes (and their print rules) from the Forecasting sheet.
import React, { useEffect } from 'react';
import '../Forecasting/ForecastSheet.css';
import './ForecastDaySheet.css';
import { PRIORITY_LABEL } from './forecastModel';

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (ymd) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return `${WEEKDAYS_LONG[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MONTHS_LONG[m - 1]} ${d}, ${y}`;
};

const Rooms = ({ rows, mark }) => (
  <span className="fcd-rooms">
    {rows.map(r => (
      <span key={r.roomNumber} className={`fcd-room${mark && mark(r) ? ' fcd-room-first' : ''}`}>
        <strong>{r.roomNumber}</strong> <small>{r.typeCode}</small>
      </span>
    ))}
  </span>
);

const ForecastDaySheet = ({ model, propertyName = 'Snoqualmie Inn', onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!model) return null;

  const t = model.totals;
  const kpis = model.isToday
    ? [['Left to sell', t.leftToSell], ['Inspect (PU)', t.awaiting], ['Dirty', t.dirty], ['Still arriving', t.remainingArrivals], ['Departing', t.departures]]
    : [['Booked', t.arrivals], ['Expected', t.expectedArrivals], ['Departing', t.departures], ['Staying over', t.stayovers], ['Turn first', t.turnFirst]];
  const cleanFirst = new Set(((model.actions && model.actions.cleanFirst) || []).map(r => String(r.roomNumber)));
  const firstRooms = new Set((model.plan || []).flatMap(p => p.floors.flatMap(f => f.rooms.filter(r => r.first).map(r => String(r.roomNumber)))));
  const floors = (model.floors || []).filter(f => f.departing.length || f.stayover.length || f.dirty.length || f.inspect.length);

  return (
    <div className="fc-sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Printable forecast">
      <div className="fc-sheet-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="fc-sheet-controls">
          <div className="fc-sheet-controls-left">
            <span className="fc-sheet-controls-title">Printable sheet · {fmtDate(model.date)}</span>
            <span className="fc-sheet-controls-hint">Press Esc or click outside to close</span>
          </div>
          <div className="fc-sheet-controls-right">
            <button className="fc-sheet-btn fc-sheet-btn-primary" onClick={() => window.print()}>▤ Print</button>
            <button className="fc-sheet-btn fc-sheet-btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>

        <article className="fc-sheet">
          <header className="fc-sheet-header">
            <div className="fc-sheet-title-block">
              <h1>{model.isToday ? 'Housekeeping & front desk — today' : 'Housekeeping plan'}</h1>
              <p className="fc-sheet-subtitle">{propertyName} · {fmtDate(model.date)}</p>
            </div>
            <div className="fc-sheet-summary">
              {kpis.map(([label, v]) => <div key={label}><strong>{v ?? 0}</strong><span>{label}</span></div>)}
            </div>
          </header>

          {model.outsideWindow && <p className="fc-sheet-empty">No reliable data this far ahead.</p>}

          {!model.outsideWindow && !model.isToday && (model.plan || []).length > 0 && (
            <section className="fc-sheet-floor">
              <h2><span className="fc-sheet-floor-name">Clean first, by room type</span></h2>
              <table className="fc-sheet-table">
                <thead><tr><th>Room type</th><th>Priority</th><th>Booked</th><th>Expected</th><th>Already empty</th><th>Departing</th><th>Turn first</th></tr></thead>
                <tbody>
                  {model.plan.map(p => (
                    <tr key={p.baseCode || p.label} className={`fcd-prio-${p.priority}`}>
                      <td><strong>{p.baseCode}</strong> {p.label}</td>
                      <td className="fc-sheet-action">{PRIORITY_LABEL[p.priority]}</td>
                      <td>{p.booked}</td><td>~{p.expected}</td><td>{p.alreadyEmpty}</td><td>{p.departing}</td>
                      <td className="fc-sheet-room-num">{p.turnFirst}{p.unplacedFirst > 0 ? ` (+${p.unplacedFirst} not assigned)` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {!model.outsideWindow && model.isToday && model.actions && (
            <section className="fc-sheet-floor">
              <h2><span className="fc-sheet-floor-name">Today’s priorities</span></h2>
              <table className="fc-sheet-table">
                <thead><tr><th>Room type</th><th>Status</th><th>Inspected</th><th>Awaiting insp.</th><th>Dirty</th><th>Still departing</th><th>Still arriving</th><th>Left to sell</th></tr></thead>
                <tbody>
                  {model.groups.map(g => (
                    <tr key={g.baseCode || g.baseLabel}>
                      <td><strong>{g.baseCode}</strong> {g.baseLabel}</td>
                      <td className="fc-sheet-action">{{ open: 'Open', tight: 'Clean first', full: 'Sold out', short: 'Oversold' }[g.totals.status]}</td>
                      <td>{g.totals.inspected}</td><td>{g.totals.awaiting}</td><td>{g.totals.dirty}</td><td>{g.totals.freeing}</td><td>{g.totals.arrivals}</td>
                      <td className="fc-sheet-room-num">{Math.max(0, g.totals.leftNow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {!model.outsideWindow && floors.map(f => (
            <section className="fc-sheet-floor" key={f.floorId}>
              <h2>
                <span className="fc-sheet-floor-name">{f.label}</span>
                <span className="fc-sheet-floor-meta">
                  {f.dirty.length > 0 && `${f.dirty.length} dirty · `}{f.inspect.length > 0 && `${f.inspect.length} to inspect · `}{f.departing.length} departing · {f.stayover.length} staying over
                </span>
              </h2>
              <table className="fc-sheet-table fcd-floor-table">
                <tbody>
                  {f.dirty.length > 0 && <tr><th>Dirty / in progress</th><td><Rooms rows={f.dirty} mark={(r) => cleanFirst.has(String(r.roomNumber))} /></td></tr>}
                  {f.inspect.length > 0 && <tr><th>Inspect (PU)</th><td><Rooms rows={f.inspect} /></td></tr>}
                  {f.departing.length > 0 && <tr><th>{model.isToday ? 'Still departing' : 'Departing — full clean'}</th><td><Rooms rows={f.departing} mark={(r) => firstRooms.has(String(r.roomNumber))} /></td></tr>}
                  {f.stayover.length > 0 && <tr><th>Staying over — service</th><td><Rooms rows={f.stayover} /></td></tr>}
                </tbody>
              </table>
            </section>
          ))}

          {!model.outsideWindow && (model.unassigned.departing > 0 || model.unassigned.stayover > 0) && (
            <p className="fcd-note">Not assigned to a room yet: {model.unassigned.departing} departing · {model.unassigned.stayover} staying over.</p>
          )}

          <footer className="fc-sheet-footer">
            <div>
              {model.isToday ? 'Room conditions live from rGuest.' : 'Expected arrivals are an estimate (bookings + usual late bookings). Bold rooms: turn first.'}
            </div>
            <div>Generated by HotelOps · {new Date().toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
          </footer>
        </article>
      </div>
    </div>
  );
};

export default ForecastDaySheet;
