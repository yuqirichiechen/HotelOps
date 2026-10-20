// Sprint 22.5 — the manager's Forecast table: ONE row per room type, few columns, tap a row for the rooms behind the numbers.
// Today:       Room type · Clean · Arriving · Left to sell · Status      (dropdown: each subtype's rooms with their housekeeping state,
//                                                                          plus "inspect now" / "clean first" room numbers)
// Future days: Room type · Expected · Turn first · Priority              (dropdown: booked / expected / already empty and the departing
//                                                                          rooms to clean, by floor)
// The full table (subtype rows, every housekeeping column) stays in the Dev view.
import React, { useState } from 'react';
import { PRIORITY_LABEL } from './forecastModel';

const STATUS_LABEL = { open: 'Open', tight: 'Clean first', full: 'Sold out', short: 'Oversold' };
const HK_LABEL = { VI: 'Inspected', PU: 'Awaiting inspection', D: 'Dirty', IP: 'In progress', OC: 'Occupied' };
const roomLabel = (r) => {
  if (r.blocked || ['OOO', 'OTM', 'HOLD'].includes(r.inventoryStatus)) return 'Out of service';
  if (r.occupancyStatus === 'OCC') return 'Occupied';
  return HK_LABEL[r.hkStatus] || r.hkStatusLabel || r.hkStatus || '—';
};
const roomTone = (r) => (r.blocked || ['OOO', 'OTM', 'HOLD'].includes(r.inventoryStatus) ? 'off' : r.occupancyStatus === 'VAC' && r.hkStatus === 'VI' ? 'clean' : r.occupancyStatus === 'VAC' && r.hkStatus === 'PU' ? 'awaiting' : 'busy');
const byNumber = (a, b) => String(a.roomNumber || '').localeCompare(String(b.roomNumber || ''), undefined, { numeric: true });
const list = (rows) => rows.map(r => r.roomNumber).join(', ');

const Caret = ({ open }) => <span className="sr-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>;

const TodayDetail = ({ g, model, roomsByType }) => {
  const inspect = ((model.actions && model.actions.inspect) || []).filter(r => r.baseCode === g.baseCode);
  const clean = ((model.actions && model.actions.cleanFirst) || []).filter(r => r.baseCode === g.baseCode);
  return (
    <div className="sr-detail-body">
      {(inspect.length > 0 || clean.length > 0) && (
        <ul className="sr-todo">
          {inspect.length > 0 && <li><strong>Inspect now:</strong> {list(inspect)}</li>}
          {clean.length > 0 && <li><strong>Clean first:</strong> {list(clean)}</li>}
        </ul>
      )}
      {g.variants.map(v => {
        const rooms = (roomsByType.get(v.typeCode) || []).slice().sort(byNumber);
        return (
          <div className="sr-sub" key={v.typeCode}>
            <div className="sr-sub-head">
              <code>{v.typeCode}</code> <span>{v.subLabel || 'Standard'}</span>
              <span className="sr-sub-meta">{v.ready} clean · {v.dirty} dirty · {v.arrivals} arriving</span>
            </div>
            <div className="sr-chips">
              {rooms.length === 0 && <span className="fb-muted">No rooms of this type.</span>}
              {rooms.map(r => (
                <span key={r.roomNumber || r.reservationId} className={`fb-room-chip fb-room-${roomTone(r)}`}>
                  <strong>{r.roomNumber || '?'}</strong><span className="fb-room-stat">{roomLabel(r)}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const FutureDetail = ({ g, model }) => {
  const p = (model.plan || []).find(x => x.baseCode === g.baseCode);
  if (!p) return <div className="sr-detail-body"><span className="fb-muted">No detail for this day yet.</span></div>;
  const allFirst = p.turnFirst > 0 && p.turnFirst >= p.departing;
  return (
    <div className="sr-detail-body">
      <p className="sr-line">
        {p.priority === 'short'
          ? `About ${p.expected} arrivals expected but only ${p.alreadyEmpty + p.departing} rooms can be ready — clean every departure early.`
          : allFirst ? `Clean all ${p.departing} departing room${p.departing === 1 ? '' : 's'} early.`
          : p.turnFirst > 0 ? `Turn ${p.turnFirst} of ${p.departing} departing room${p.departing === 1 ? '' : 's'} first.` : 'No priority turns needed.'}
        <span className="fb-muted"> {p.booked} booked · about {p.expected} expected · {p.alreadyEmpty} already empty</span>
      </p>
      {p.floors.map(f => (
        <div className="sr-sub" key={f.floorId}>
          <div className="sr-sub-head"><span>{f.label}</span></div>
          <div className="sr-chips">
            {f.rooms.map(r => (
              <span key={r.roomNumber} className={`fb-room-chip ${r.first && !allFirst ? 'fb-room-first' : 'fb-room-busy'}`}>
                <strong>{r.roomNumber}</strong><span className="fb-room-stat">{r.typeCode}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
      {p.unplacedFirst > 0 && <p className="fb-muted sr-note">+{p.unplacedFirst} more to turn first — those guests have no room number yet.</p>}
    </div>
  );
};

const SimpleRoomTable = ({ model, roomsByType, dayLabel }) => {
  const [open, setOpen] = useState(null);
  const today = model.isToday;
  const toggle = (code) => setOpen(prev => (prev === code ? null : code));
  const cols = today ? 5 : 4;
  return (
    <div className="fb-card sr">
      <div className="fb-card-head">
        <h2>{today ? 'Rooms to sell today' : `Rooms needed · ${dayLabel}`}</h2>
        <span className="fb-card-sub">Tap a room type to see its rooms</span>
      </div>
      <div className="fb-table-wrap">
        <table className="sr-table">
          <thead>
            <tr>
              <th>Room type</th>
              {today ? <><th>Clean</th><th>Arriving</th><th>Left to sell</th><th>Status</th></> : <><th>Expected</th><th>Turn first</th><th>Priority</th></>}
            </tr>
          </thead>
          <tbody>
            {model.groups.length === 0 && <tr><td colSpan={cols} className="fb-table-empty">No room types yet.</td></tr>}
            {model.groups.map(g => {
              const t = g.totals, isOpen = open === g.baseCode;
              return (
                <React.Fragment key={g.baseCode || g.baseLabel}>
                  <tr className={`sr-row${isOpen ? ' open' : ''}`} onClick={() => toggle(g.baseCode)}>
                    <td>
                      <button type="button" className="sr-toggle" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); toggle(g.baseCode); }}>
                        <Caret open={isOpen} /><code className="fb-group-code">{g.baseCode || '—'}</code><span className="sr-name">{g.baseLabel}</span>
                      </button>
                    </td>
                    {today ? (
                      <>
                        <td>{t.ready}</td><td>{t.arrivals}</td><td className="fb-cell-strong">{Math.max(0, t.leftNow)}</td>
                        <td><span className={`fb-pill fb-pill-${t.status}`}>{STATUS_LABEL[t.status] || t.status}</span></td>
                      </>
                    ) : (
                      <>
                        <td>{t.expected}</td><td className="fb-cell-strong">{t.turnFirst}</td>
                        <td><span className={`fb-pill fb-pill-prio-${t.priority}`}>{PRIORITY_LABEL[t.priority] || t.priority}</span></td>
                      </>
                    )}
                  </tr>
                  {isOpen && (
                    <tr className="sr-detail"><td colSpan={cols}>{today ? <TodayDetail g={g} model={model} roomsByType={roomsByType} /> : <FutureDetail g={g} model={model} />}</td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SimpleRoomTable;
