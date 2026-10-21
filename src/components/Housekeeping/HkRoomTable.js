// Sprint 23.3 — DEV ONLY: every room like the Forecast "Room status sheet", plus who is cleaning it. One section per floor; filter All / Needs work /
// Not assigned; Download CSV. Status/stay come from the live room board (so for tomorrow they show the state NOW — said in the note).
import React, { useMemo, useState } from 'react';
import { TONE_LABEL } from '../Forecast/roomSheet';

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const FILTERS = [['all', 'All rooms'], ['work', 'Needs work'], ['open', 'Not assigned']];

const HkRoomTable = ({ sheet, items, assign, hks, pinned, guestOf, offset, date }) => {
  const [filter, setFilter] = useState('all');
  const name = useMemo(() => new Map(hks.map(h => [h.userId, h.name])), [hks]);
  const byRoom = useMemo(() => new Map(items.map(i => [i.roomNumber, i])), [items]);
  const sections = useMemo(() => {
    const rowOf = (r, floorLabel) => {
      const it = byRoom.get(r.roomNumber), owner = it ? assign[it.roomNumber] : null;
      return {
        room: r.roomNumber, floor: floorLabel, type: r.typeCode, tone: r.tone, status: r.toneLabel, stay: r.checkout || '', guest: guestOf(r.roomNumber) || '',
        task: it ? (it.kind === 'clean' ? 'Clean' : 'Service') : '', why: it ? it.why : '', who: owner ? name.get(owner) || '' : '', work: !!it,
        open: !!it && !owner, star: !!(it && it.priority), lock: !!(it && it.locked), hand: !!it && Object.prototype.hasOwnProperty.call(pinned, it.roomNumber),
      };
    };
    const secs = ((sheet && sheet.floors) || []).map(f => ({ key: f.floorId, label: f.label, rows: f.rooms.map(r => rowOf(r, f.label)) }));
    const tbd = items.filter(i => i.tbd).map(it => ({ room: 'TBD', floor: 'To be assigned', type: it.typeCode, tone: 'dirty', status: 'Room not assigned yet', stay: '', guest: '', task: it.kind === 'clean' ? 'Clean' : 'Service', why: it.why, who: assign[it.roomNumber] ? name.get(assign[it.roomNumber]) || '' : '', work: true, open: !assign[it.roomNumber], star: it.priority, lock: false, hand: Object.prototype.hasOwnProperty.call(pinned, it.roomNumber) }));
    if (tbd.length) secs.push({ key: 'tbd', label: 'Reservations without a room yet', rows: tbd });
    return secs;
  }, [sheet, items, assign, name, pinned, guestOf, byRoom]);
  const keep = (r) => filter === 'all' || (filter === 'work' ? r.work : r.open);
  const shown = sections.map(s => ({ ...s, rows: s.rows.filter(keep) })).filter(s => s.rows.length);
  const all = sections.flatMap(s => s.rows);
  const download = () => {
    const lines = [['Floor', 'Room', 'Type', 'Status now', 'Stay (check-in → check-out)', 'Guest', 'Task', 'Why', 'Assigned to', 'Clean first', 'Do not move', 'Placed by hand'].join(',')];
    all.forEach(r => lines.push([r.floor, r.room, r.type, r.status, r.stay, r.guest, r.task, r.why, r.who, r.star ? 'yes' : '', r.lock ? 'yes' : '', r.hand ? 'yes' : ''].map(csvCell).join(',')));
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `housekeeping-rooms-${date}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="hk-panel hk-roomtable" aria-label="Room table (dev)">
      <div className="hk-panel-head">
        <h2>Rooms and who is cleaning them</h2><span className="hk-tag-dev">DEV</span>
        <span className="hk-rt-count">{all.length} rooms · {all.filter(r => r.work).length} need work · {all.filter(r => r.open).length} not assigned</span>
        <div className="hk-rt-tools">
          <span className="hk-seg" role="group" aria-label="Filter">{FILTERS.map(([k, l]) => <button key={k} type="button" className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</span>
          <button type="button" className="hk-btn hk-btn-sm" onClick={download}>Download CSV</button>
        </div>
      </div>
      {offset > 0 && <p className="hk-help">Status and stay are the room board as it is now; the task and the housekeeper are for {date}.</p>}
      <div className="hk-rt-wrap">
        {shown.length === 0 && <p className="hk-muted">Nothing matches this filter.</p>}
        {shown.map(sec => (
          <div className="hk-rt-floor" key={sec.key}>
            <h3>{sec.label}</h3>
            <table className="hk-rt">
              <thead><tr><th>Room</th><th>Type</th><th>Now</th><th>Stay (in → out)</th><th>Guest</th><th>Task</th><th>Cleaned by</th></tr></thead>
              <tbody>
                {sec.rows.map((r, i) => (
                  <tr key={r.room + i} className={`${r.work ? 'work' : ''}${r.open ? ' open' : ''}`}>
                    <td className="hk-rt-room">{r.room}{r.star && <i className="hk-rt-star" title="Clean first">★</i>}{r.lock && <i className="hk-rt-lock" title="Guest asked not to be moved">⚑</i>}</td>
                    <td>{r.type}</td>
                    <td><span className={`rs-dot rs-dot-${r.tone}`} />{r.status}</td>
                    <td>{r.stay}</td>
                    <td className="hk-rt-guest">{r.guest}</td>
                    <td>{r.task ? <><b>{r.task}</b><small>{r.why}</small></> : <span className="hk-muted">—</span>}</td>
                    <td>{r.who ? <>{r.who}{r.hand && <i className="hk-rt-hand" title="Placed by hand">●</i>}</> : r.work ? <span className="hk-rt-open">not assigned</span> : <span className="hk-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
};

export { TONE_LABEL };
export default HkRoomTable;
