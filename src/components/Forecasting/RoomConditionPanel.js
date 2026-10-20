// Sprint 22.7 — the room lists that open under the Reservations tiles.
//   Left to sell            managers + dev: room numbers (with room type and Inspected / Pickup).
//   Dirty / Occupied clean  managers: ROOM NUMBERS ONLY.
//                           dev: occupied clean → the guest (name, stay, confirmation, room type);
//                                dirty → the LAST PREVIOUS STAY in that room (looked up from the stored reservations; dev-only endpoint),
//                                        or the current guest when the room is still occupied.
import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../auth';
import { fmtStayRange } from './resnFormat';

const ORDER = ['NKRR', 'NKJZ', 'NQRR', 'NQJZ'];
const HK_WORD = { VI: 'Inspected', PU: 'Pickup', D: 'Dirty', IP: 'In progress' };
const guestOf = (r) => (r ? (r.guestName || '(no name)') : null);
const stayOf = (r) => (r ? fmtStayRange(r.arrivalDate || r.arrival_date, r.departureDate || r.departure_date) : '');

const Chip = ({ room, tone, detail }) => (
  <span className={`rcp-chip ${tone}`}><strong>{room.roomNumber}</strong>{detail ? <small>{detail}</small> : null}</span>
);

const LeftToSell = ({ condition }) => {
  const groups = useMemo(() => {
    const m = new Map();
    condition.lists.leftToSell.forEach(r => { const k = r.baseCode || r.typeCode; if (!m.has(k)) m.set(k, { label: r.baseLabel, code: k, rooms: [] }); m.get(k).rooms.push(r); });
    return [...m.values()].sort((a, b) => { const ai = ORDER.indexOf(a.code), bi = ORDER.indexOf(b.code); return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.label.localeCompare(b.label); });
  }, [condition]);
  if (!groups.length) return <p className="rcp-muted">No rooms are left to sell right now.</p>;
  return groups.map(g => (
    <div className="rcp-group" key={g.code}>
      <div className="rcp-group-title">{g.label} <span className="rcp-count">{g.rooms.length}</span></div>
      <div className="rcp-chips">{g.rooms.map(r => <Chip key={r.roomNumber} room={r} tone={r.hk === 'VI' ? 'clean' : 'awaiting'} detail={`${r.typeCode} · ${HK_WORD[r.hk]}`} />)}</div>
    </div>
  ));
};

const DevDirty = ({ condition, lastStays }) => (
  <div className="rcp-table-wrap">
    <table className="rcp-table">
      <thead><tr><th>Room</th><th>Status</th><th>Last stay</th><th>Room type</th></tr></thead>
      <tbody>
        {condition.lists.dirty.map(r => {
          const cur = r.occupied ? condition.guestByRoom.get(r.roomNumber) : null, last = lastStays ? lastStays[r.roomNumber] : undefined;
          return (
            <tr key={r.roomNumber}>
              <td><strong>{r.roomNumber}</strong></td>
              <td>{HK_WORD[r.hk]}{r.occupied ? <span className="rcp-muted"> · guest still in room</span> : ''}</td>
              <td>
                {r.occupied ? (cur ? <>{guestOf(cur)} · {stayOf(cur)} · {cur.confirmationId || '—'} <span className="rcp-muted">(in house now)</span></> : <span className="rcp-muted">—</span>)
                  : last === undefined ? <span className="rcp-muted">Looking up…</span>
                  : last ? <>{last.guest_name || '(no name)'} · {stayOf(last)} · {last.confirmation_id || '—'}</> : <span className="rcp-muted">No previous stay on record</span>}
              </td>
              <td>{r.typeCode}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const DevOccupiedClean = ({ condition }) => (
  <div className="rcp-table-wrap">
    <table className="rcp-table">
      <thead><tr><th>Room</th><th>Guest</th><th>Stay</th><th>Confirmation</th><th>Room type</th></tr></thead>
      <tbody>
        {condition.lists.occupiedClean.map(r => {
          const g = condition.guestByRoom.get(r.roomNumber);
          return (
            <tr key={r.roomNumber}>
              <td><strong>{r.roomNumber}</strong></td><td>{g ? guestOf(g) : <span className="rcp-muted">—</span>}</td><td>{g ? stayOf(g) : ''}</td><td>{g && g.confirmationId ? g.confirmationId : ''}</td><td>{r.typeCode}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const RoomConditionPanel = ({ kind, condition, mode, onClose, embedded }) => {
  const isDev = mode === 'dev';
  const [lastStays, setLastStays] = useState(undefined);      // dev only: { room: stay|null }
  const vacantDirty = useMemo(() => condition.lists.dirty.filter(r => !r.occupied).map(r => r.roomNumber), [condition]);
  useEffect(() => {
    if (!isDev || kind !== 'dirty' || vacantDirty.length === 0) return undefined;
    let live = true;
    (async () => {
      const { ok, data } = await apiFetch(`/dev/rooms/last-stays?rooms=${encodeURIComponent(vacantDirty.join(','))}`);
      if (live) setLastStays(ok && data?.success ? data.stays : {});
    })();
    return () => { live = false; };
  }, [isDev, kind, vacantDirty]);

  const c = condition.counts;
  return (
    <section className={`rcp${embedded ? ' rcp-embedded' : ''}`} aria-label={kind === 'left' ? 'Rooms left to sell' : 'Dirty and occupied clean rooms'}>
      <div className="rcp-head">
        <h3>{kind === 'left' ? `Left to sell · ${c.leftToSell} room${c.leftToSell === 1 ? '' : 's'}` : 'Dirty rooms and occupied clean rooms'}</h3>
        <button type="button" className="rcp-close" onClick={onClose} aria-label="Close room list">×</button>
      </div>
      {kind === 'left' ? (
        <>
          <p className="rcp-sub">Vacant rooms that are inspected or waiting for inspection (pickup).</p>
          <LeftToSell condition={condition} />
        </>
      ) : (
        <div className={`rcp-two${isDev ? '' : ' rcp-two-chips'}`}>
          <div className="rcp-group">
            <div className="rcp-group-title">Dirty rooms <span className="rcp-count">{c.dirtyTotal}</span> <span className="rcp-muted">{c.dirty} dirty · {c.inProgress} in progress</span></div>
            {condition.lists.dirty.length === 0 ? <p className="rcp-muted">No dirty rooms.</p>
              : isDev ? <DevDirty condition={condition} lastStays={lastStays} />
              : <div className="rcp-chips">{condition.lists.dirty.map(r => <Chip key={r.roomNumber} room={r} tone="dirty" />)}</div>}
          </div>
          <div className="rcp-group">
            <div className="rcp-group-title">Occupied clean <span className="rcp-count">{c.occupiedClean}</span></div>
            {condition.lists.occupiedClean.length === 0 ? <p className="rcp-muted">No occupied clean rooms.</p>
              : isDev ? <DevOccupiedClean condition={condition} />
              : <div className="rcp-chips">{condition.lists.occupiedClean.map(r => <Chip key={r.roomNumber} room={r} tone="occ" />)}</div>}
          </div>
        </div>
      )}
    </section>
  );
};

export default RoomConditionPanel;
