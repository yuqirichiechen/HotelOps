// Sprint 22.6 — tomorrow's (second night's) work list for ONE room-type group: what to clean first, the check-outs, and the stay-overs to service.
// Shared by the manager's dropdown (SimpleRoomTable) and the dev Housekeeping-plan card. Data: group.totals.dayTwo (forecastModel.buildDayModel).
import React from 'react';
import { floorLabel, normFloor } from './forecastModel';

const SOURCE_LABEL = { dirty: 'dirty now', tonight: 'checks out today', tomorrow: 'checks out tomorrow' };
const rank = (f) => (f === 'G' ? -1 : parseInt(f, 10) || 99);

const ByFloor = ({ rooms, tone }) => {
  const m = new Map();
  rooms.forEach(r => { const f = normFloor(r.floorId, r.roomNumber); if (!m.has(f)) m.set(f, []); m.get(f).push(r); });
  return (
    <div className="d2-floors">
      {[...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([f, list]) => (
        <div className="d2-floor" key={f}>
          <span className="d2-floor-name">{floorLabel(f)}</span>
          <span className="d2-chips">
            {list.map(r => (
              <span key={r.roomNumber} className={`fb-room-chip fb-room-${tone}`} title={r.source ? SOURCE_LABEL[r.source] : undefined}>
                <strong>{r.roomNumber}</strong>{r.source ? <span className="fb-room-stat">{SOURCE_LABEL[r.source]}</span> : null}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
};

const Section = ({ title, count, children }) => (
  <div className="d2-section"><div className="d2-title">{title} <span className="d2-count">{count}</span></div>{children}</div>
);

const DayTwoDetail = ({ group }) => {
  const t = group.totals, d = t.dayTwo;
  if (!d) return null;
  const nothing = d.priority.length + d.unplacedPriority + d.restDeparts.length + d.depUnassigned + d.restDirty.length + d.stays.length + d.stayUnassigned === 0;
  return (
    <div className="d2">
      <p className="d2-line">
        <strong>{t.arrivals}</strong> arriving tomorrow · <strong>{d.carry}</strong> clean room{d.carry === 1 ? '' : 's'} left after tonight
        {d.shortfall > 0 ? <> · <strong>{d.shortfall}</strong> more must be cleaned first</> : <> · nothing extra to clean first</>}
      </p>
      {d.unresolved > 0 && <p className="d2-warn">Not enough rooms: {d.unresolved} arrival{d.unresolved === 1 ? '' : 's'} can’t be covered even if every room is cleaned.</p>}
      {(d.priority.length > 0 || d.unplacedPriority > 0) && (
        <Section title="Clean first — for tomorrow’s arrivals" count={d.priority.length + d.unplacedPriority}>
          <ByFloor rooms={d.priority} tone="first" />
          {d.unplacedPriority > 0 && <p className="fb-muted d2-note">+{d.unplacedPriority} more from check-outs without a room number yet.</p>}
        </Section>
      )}
      {(d.restDeparts.length > 0 || d.depUnassigned > 0) && (
        <Section title="Check-outs to clean" count={d.restDeparts.length + d.depUnassigned}>
          <ByFloor rooms={d.restDeparts} tone="busy" />
          {d.depUnassigned > 0 && <p className="fb-muted d2-note">+{d.depUnassigned} check-out{d.depUnassigned === 1 ? '' : 's'} without a room number yet.</p>}
        </Section>
      )}
      {d.restDirty.length > 0 && (
        <Section title="Also still to clean" count={d.restDirty.length}><ByFloor rooms={d.restDirty} tone="awaiting" /></Section>
      )}
      {(d.stays.length > 0 || d.stayUnassigned > 0) && (
        <Section title="Staying over — service" count={d.stays.length + d.stayUnassigned}>
          <ByFloor rooms={d.stays} tone="clean" />
          {d.stayUnassigned > 0 && <p className="fb-muted d2-note">+{d.stayUnassigned} staying over without a room number yet.</p>}
        </Section>
      )}
      {nothing && <p className="fb-muted">Nothing to clean or service for this room type tomorrow.</p>}
      {!nothing && <p className="d2-total">Rooms to clean: <strong>{d.clean}</strong> · to service: <strong>{d.service}</strong></p>}
    </div>
  );
};

export default DayTwoDetail;
