// Sprint 22.5 — the manager's Forecast table: ONE row per room type, few columns, tap a row for the rooms behind the numbers.
// Today:       Room type · Clean · Arriving · Left to sell · Status      (dropdown: each subtype's rooms with their housekeeping state,
//                                                                          plus "inspect now" / "clean first" room numbers)
// Future days: Room type · Arriving · Left to sell · Priority            (dropdown: tomorrow = clean first / check-outs / stay-overs to service;
//                                                                          later days = booked, expected, and the departing rooms to clean)
// The full table (subtype rows, every housekeeping column) stays in the Dev view.
import React, { useState } from 'react';
import { PRIORITY_LABEL, normFloor, floorLabel } from './forecastModel';
import { roomTone, TONE_LABEL } from './roomSheet';
import DayTwoDetail from './DayTwoDetail';

const STATUS_LABEL = { open: 'Open', tight: 'Clean first', full: 'Sold out', short: 'Oversold' };
const roomLabel = (r) => TONE_LABEL[roomTone(r)];
const floorRank = (f) => (f === 'G' ? -1 : parseInt(f, 10) || 99);
const byNumber = (a, b) => String(a.roomNumber || '').localeCompare(String(b.roomNumber || ''), undefined, { numeric: true });
const list = (rows) => rows.map(r => r.roomNumber).join(', ');

const Caret = ({ open }) => <span className="sr-caret" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>;

const TodayDetail = ({ g, model, roomsByType }) => {
  const inspect = ((model.actions && model.actions.inspect) || []).filter(r => r.baseCode === g.baseCode);
  const clean = ((model.actions && model.actions.cleanFirst) || []).filter(r => r.baseCode === g.baseCode);
  const floorMap = new Map();
  g.variants.forEach(v => (roomsByType.get(v.typeCode) || []).forEach(r => {
    const fid = normFloor(r.floorId, String(r.roomNumber || ''));
    if (!floorMap.has(fid)) floorMap.set(fid, { floorId: fid, label: floorLabel(fid), rooms: [] });
    floorMap.get(fid).rooms.push(r);
  }));
  const floors = [...floorMap.values()].sort((a, b) => floorRank(a.floorId) - floorRank(b.floorId));
  floors.forEach(f => f.rooms.sort(byNumber));
  return (
    <div className="sr-detail-body">
      {(inspect.length > 0 || clean.length > 0) && (
        <ul className="sr-todo">
          {inspect.length > 0 && <li><strong>Inspect now:</strong> {list(inspect)}</li>}
          {clean.length > 0 && <li><strong>Clean first:</strong> {list(clean)}</li>}
        </ul>
      )}
      <p className="sr-sub-meta sr-sub-line">
        {g.variants.map(v => `${v.typeCode} ${v.subLabel || 'Standard'}: ${v.ready} clean · ${v.dirty} dirty · ${v.arrivals} arriving`).join('   |   ')}
      </p>
      {floors.length === 0 && <span className="fb-muted">No rooms of this type.</span>}
      {floors.map(f => (
        <div className="sr-sub" key={f.floorId}>
          <div className="sr-sub-head"><span>{f.label}</span><span className="sr-sub-meta">{f.rooms.length} room{f.rooms.length === 1 ? '' : 's'}</span></div>
          <div className="sr-chips">
            {f.rooms.map(r => (
              <span key={r.roomNumber || r.reservationId} className={`fb-room-chip fb-room-${roomTone(r)}`}>
                <strong>{r.roomNumber || '?'}</strong>
                {g.variants.length > 1 && <small className="sr-chip-code">{r.typeCode}</small>}
                <span className="fb-room-stat">{roomLabel(r)}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const FutureDetail = ({ g, model }) => {
  if (g.totals.dayTwo) return <DayTwoDetail group={g} />;
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
  const [open, setOpen] = useState(() => new Set());      // Sprint 22.10: any number of room types can be open
  const [seen, setSeen] = useState(() => new Set());      // rows that have been opened once stay mounted so closing can animate
  const today = model.isToday;
  const toggle = (code) => {
    setSeen(prev => (prev.has(code) ? prev : new Set(prev).add(code)));
    setOpen(prev => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  };
  const cols = today ? 5 : 4;
  return (
    <div className="fb-card sr">
      <div className="fb-card-head">
        <h2>{today ? 'Rooms to sell today' : `Rooms to sell · ${dayLabel}`}</h2>
        <span className="fb-card-sub">Tap a room type to see its rooms — open as many as you like</span>
      </div>
      <div className="fb-table-wrap">
        <table className="sr-table">
          <thead>
            <tr>
              <th>Room type</th>
              {today ? <><th>Clean</th><th>Arriving</th><th>Left to sell</th><th>Status</th></> : <><th>{model.offset === 1 ? 'Arriving' : 'Expected arrivals'}</th><th>Left to sell</th><th>Priority</th></>}
            </tr>
          </thead>
          <tbody>
            {model.groups.length === 0 && <tr><td colSpan={cols} className="fb-table-empty">No room types yet.</td></tr>}
            {model.groups.map(g => {
              const t = g.totals, isOpen = open.has(g.baseCode);
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
                        <td>{t.expected}</td><td className="fb-cell-strong">{t.leftToSell}</td>
                        <td><span className={`fb-pill fb-pill-prio-${t.priority}`}>{PRIORITY_LABEL[t.priority] || t.priority}</span></td>
                      </>
                    )}
                  </tr>
                  {(isOpen || seen.has(g.baseCode)) && (
                    <tr className={`sr-detail${isOpen ? ' open' : ''}`} aria-hidden={!isOpen}>
                      <td colSpan={cols}>
                        <div className="sr-collapse"><div className="sr-collapse-in">{today ? <TodayDetail g={g} model={model} roomsByType={roomsByType} /> : <FutureDetail g={g} model={model} />}</div></div>
                      </td>
                    </tr>
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
