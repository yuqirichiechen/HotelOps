// Sprint 23 / 23.4 — printable housekeeping sheets: one page per housekeeper (their rooms, priority first, tick-boxes), or all of them.
// Top of each page: a small summary (rooms to clean · rooms to service). Rows are coloured by group (dirty / check-out / priority — colours set
// in Dev, defaults green / yellow / pink); in-house (stay-over) rooms have no colour and show check-in → check-out.
// Sprint 24.9/24.11 — `slips` (a Dev option in Rules): after each housekeeper's sheet comes a RETURN-SLIPS page: two half-page slips the housekeeper hands
// back (one during, one at the end of the shift), each with three columns — Cleaned (vacant dirty / check-outs), Serviced (stay-overs), DND (guest has Do Not
// Disturb on the door). Their own rooms are pre-listed with a tick box so they only tick; DND is a few blank lines to write in.
// Sprint 24.10 — `master`: the ONE-PAGE sheet of every room ("Print all sheets"): 3 × [Room | Status] side by side, room cell coloured green = dirty vacant ·
// yellow = a guest checks out that day · pink = priority (pre-assigned to an arrival, still needs work); status = what the room is now, the stay span
// for a staying guest, "Check-out 12 PM" for a departure. Same colours (and Dev colour settings) as the housekeepers' sheets.
// Portaled to <body>; hidden on screen, the only thing on paper while printing (see Housekeeping.css + usePrintSheet).
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import usePrintSheet from '../shared/usePrintSheet';
import { weightOf, KIND_LABEL, CATS, CAT_LABEL, PRINT_COLOR_DEFAULTS, catOf } from './hkWork';

const fmt = (n) => (Math.round(n * 10) / 10).toString();

const DND_LINES = 8;
const Slips = ({ sh, dateLabel }) => {
  const cleaned = sh.rooms.filter(r => r.kind === 'clean' && !r.tbd), serviced = sh.rooms.filter(r => r.kind !== 'clean' && !r.tbd);
  const rows = Math.max(cleaned.length, serviced.length, DND_LINES);
  const col = (title, hint, list, blank) => (
    <div className="hk-slip-col" data-col={title.toLowerCase()}>
      <h3>{title}<small>{hint}</small></h3>
      <ul>{Array.from({ length: rows }, (_, i) => (list[i] ? <li key={i}><span className="hk-box" />{list[i].roomNumber}</li> : <li key={i} className={blank ? 'is-line' : 'is-empty'}>{blank ? <span className="hk-line" /> : null}</li>))}</ul>
    </div>
  );
  return (
    <section className="hk-page hk-slips" data-slips>
      {[1, 2].map(n => (
        <div className="hk-slip" key={n} data-slip={n} style={{ '--hk-slip-rows': rows }}>
          <header><strong>{sh.name}</strong><span>Return slip {n} · {dateLabel}</span><span className="hk-slip-time">Time ______</span></header>
          <div className="hk-slip-cols">
            {col('Cleaned', 'vacant dirty / check-outs', cleaned, false)}
            {col('Serviced', 'stay-overs', serviced, false)}
            {col('DND', 'Do Not Disturb', [], true)}
          </div>
        </div>
      ))}
    </section>
  );
};

const HkSheets = ({ dateLabel, master = null, sheets, settings, colors = PRINT_COLOR_DEFAULTS, slips = false, onDone }) => {
  usePrintSheet();
  useEffect(() => {
    const id = setTimeout(() => window.print(), 80);
    const done = () => onDone && onDone();
    window.addEventListener('afterprint', done, { once: true });
    return () => { clearTimeout(id); window.removeEventListener('afterprint', done); };
  }, [onDone]);
  const printed = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (master) {
    const present = CATS.filter(c => colors[c] && master.rooms.some(r => r.cat === c));
    const n = (c) => master.rooms.filter(r => r.cat === c).length;
    return createPortal(
      <div className="hk-printroot fc-print-root" aria-hidden="true">
        <section className="hk-page hk-master" data-master>
          <header className="hk-page-head">
            <div><h1>All rooms</h1><p>{master.offset > 0 ? 'Planned room status' : 'Room status'} · {dateLabel}</p></div>
            <div className="hk-page-cards" aria-label="Summary">
              <div className="hk-page-card"><strong>{n('dirty')}</strong><span>Dirty vacant</span></div>
              <div className="hk-page-card"><strong>{n('departure')}</strong><span>Check-outs</span></div>
              <div className="hk-page-card"><strong>{n('priority')}</strong><span>Priority</span></div>
              <div className="hk-page-card"><strong>{master.total}</strong><span>Rooms</span></div>
            </div>
          </header>
          {present.length > 0 && (
            <p className="hk-page-legend">{present.map(c => <span key={c}><i style={{ background: colors[c], backgroundColor: colors[c] }} />{CAT_LABEL[c]}</span>)}</p>
          )}
          <table className="hk-page-table hk-master-table">
            <thead><tr>{Array.from({ length: master.rows[0] ? master.rows[0].length : 0 }, (_, g) => <React.Fragment key={g}><th className="hk-m-room">Room</th><th className={`hk-m-status${g === 2 ? '' : ' hk-m-gap'}`}>Status</th></React.Fragment>)}</tr></thead>
            <tbody>
              {master.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((c, g) => c ? (
                    <React.Fragment key={g}>
                      <td className={`hk-num hk-m-room${c.cat ? ` hk-cat-${c.cat}` : ''}`} style={c.cat && colors[c.cat] ? { backgroundColor: colors[c.cat] } : undefined}>{c.room}</td>
                      <td className={`hk-m-status${g === row.length - 1 ? '' : ' hk-m-gap'}`}>{c.status}</td>
                    </React.Fragment>
                  ) : <React.Fragment key={g}><td className="hk-m-room" /><td className={`hk-m-status${g === row.length - 1 ? '' : ' hk-m-gap'}`} /></React.Fragment>)}
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="hk-page-foot">printed {printed}</footer>
        </section>
      </div>,
      document.body
    );
  }
  return createPortal(
    <div className="hk-printroot fc-print-root" aria-hidden="true">
      {sheets.map(sh => {
        const clean = sh.rooms.filter(r => r.kind === 'clean').length, service = sh.rooms.length - clean;
        const units = sh.rooms.reduce((n, r) => n + weightOf(r, settings), 0);
        const present = CATS.filter(c => colors[c] && sh.rooms.some(r => (r.cat || catOf(r)) === c));
        return (
          <React.Fragment key={sh.userId}>
          <section className="hk-page">
            <header className="hk-page-head">
              <div><h1>{sh.name}</h1><p>Housekeeping assignment · {dateLabel}</p></div>
              <div className="hk-page-cards" aria-label="Summary">
                <div className="hk-page-card"><strong>{clean}</strong><span>Rooms to clean</span></div>
                <div className="hk-page-card"><strong>{service}</strong><span>Rooms to service</span></div>
                <div className="hk-page-card"><strong>{fmt(units)}</strong><span>Workload</span></div>
              </div>
            </header>
            {present.length > 0 && (
              <p className="hk-page-legend">{present.map(c => <span key={c}><i style={{ background: colors[c], backgroundColor: colors[c] }} />{CAT_LABEL[c]}</span>)}</p>
            )}
            {sh.rooms.length === 0 ? <p className="hk-page-empty">No rooms assigned.</p> : (
              <table className="hk-page-table">
                <thead><tr><th style={{ width: 26 }}>✓</th><th>Room</th><th>Floor</th><th>Type</th><th>Task</th><th>Notes</th></tr></thead>
                <tbody>
                  {sh.rooms.map(r => {
                    const cat = r.cat || catOf(r), bg = colors[cat] || '';
                    return (
                      <tr key={r.roomNumber} className={`hk-cat-${cat}${r.priority ? ' hk-first' : ''}`} style={bg ? { backgroundColor: bg } : undefined}>
                        <td><span className="hk-box" /></td>
                        <td className="hk-num">{r.tbd ? 'TBD' : r.roomNumber}</td>
                        <td>{r.floorLabel || ''}</td>
                        <td>{r.typeCode}</td>
                        <td>
                          {KIND_LABEL[r.kind]}{r.kind === 'clean' ? '' : ' (stay-over)'}
                          {r.priority ? <b className="hk-firsttag"> · CLEAN FIRST</b> : null}
                          {r.kind === 'clean' && r.why ? <span className="hk-why"> {r.why}</span> : null}
                          {r.stay ? <span className="hk-stay"> {r.stay}</span> : null}
                        </td>
                        <td className="hk-notes" />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <footer className="hk-page-foot">Start ______ &nbsp; Finish ______ &nbsp; Supervisor sign-off ____________ · printed {printed}</footer>
          </section>
          {slips && <Slips sh={sh} dateLabel={dateLabel} />}
          </React.Fragment>
        );
      })}
    </div>,
    document.body
  );
};

export default HkSheets;
