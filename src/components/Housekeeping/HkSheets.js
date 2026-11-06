// Sprint 23 / 23.4 — printable housekeeping sheets: one page per housekeeper (their rooms, priority first, tick-boxes), or all of them.
// Top of each page: a small summary (rooms to clean · rooms to service). Rows are coloured by group (dirty / check-out / priority — colours set
// in Dev, defaults green / yellow / pink); in-house (stay-over) rooms have no colour and show check-in → check-out.
// Sprint 24.9 — `twoSheets` (a Dev option in Rules): every housekeeper gets TWO pages, AM then PM — housekeepers report in the morning and again in the
// afternoon. The PM page is the same list, but the rooms that are already clean on the room board when it was printed (`room.done`) come pre-ticked,
// greyed and marked "done", with a "cleaned so far" count in the header. `room.done` is only filled for today.
// Sprint 24.10 — `master`: the ONE-PAGE sheet of every room ("Print all sheets"): 3 × [Room | Status] side by side, room cell coloured green = dirty vacant ·
// yellow = a guest checks out that day · pink = priority (pre-assigned to an arrival, still needs work); status = what the room is now, the stay span
// for a staying guest, "Check-out 12 PM" for a departure. Same colours (and Dev colour settings) as the housekeepers' sheets.
// Portaled to <body>; hidden on screen, the only thing on paper while printing (see Housekeeping.css + usePrintSheet).
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import usePrintSheet from '../shared/usePrintSheet';
import { weightOf, KIND_LABEL, CATS, CAT_LABEL, PRINT_COLOR_DEFAULTS, catOf } from './hkWork';

const fmt = (n) => (Math.round(n * 10) / 10).toString();

const HkSheets = ({ dateLabel, master = null, sheets, settings, colors = PRINT_COLOR_DEFAULTS, twoSheets = false, onDone }) => {
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
            <div><h1>All rooms</h1><p>Room status · {dateLabel}</p></div>
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
      {sheets.flatMap(sh => (twoSheets ? ['AM', 'PM'] : [null]).map(half => {
        const clean = sh.rooms.filter(r => r.kind === 'clean').length, service = sh.rooms.length - clean;
        const units = sh.rooms.reduce((n, r) => n + weightOf(r, settings), 0);
        const present = CATS.filter(c => colors[c] && sh.rooms.some(r => (r.cat || catOf(r)) === c));
        const pm = half === 'PM', doneN = pm ? sh.rooms.filter(r => r.done).length : 0;
        return (
          <section className={`hk-page${half ? ` hk-half-${half.toLowerCase()}` : ''}`} key={`${sh.userId}${half || ''}`} data-half={half || undefined}>
            <header className="hk-page-head">
              <div><h1>{sh.name}</h1><p>Housekeeping assignment · {dateLabel}{half && <b className="hk-half-tag">{half} sheet</b>}</p></div>
              <div className="hk-page-cards" aria-label="Summary">
                <div className="hk-page-card"><strong>{clean}</strong><span>Rooms to clean</span></div>
                <div className="hk-page-card"><strong>{service}</strong><span>Rooms to service</span></div>
                <div className="hk-page-card"><strong>{fmt(units)}</strong><span>Workload</span></div>
                {pm && <div className="hk-page-card"><strong>{doneN} / {sh.rooms.length}</strong><span>Cleaned so far</span></div>}
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
                    const cat = r.cat || catOf(r), bg = colors[cat] || '', done = pm && !!r.done;
                    return (
                      <tr key={r.roomNumber} className={`hk-cat-${cat}${r.priority ? ' hk-first' : ''}${done ? ' hk-done' : ''}`} style={bg ? { backgroundColor: bg } : undefined}>
                        <td><span className={`hk-box${done ? ' is-done' : ''}`}>{done ? '✓' : ''}</span></td>
                        <td className="hk-num">{r.tbd ? 'TBD' : r.roomNumber}</td>
                        <td>{r.floorLabel || ''}</td>
                        <td>{r.typeCode}</td>
                        <td>
                          {KIND_LABEL[r.kind]}{r.kind === 'clean' ? '' : ' (stay-over)'}
                          {r.priority ? <b className="hk-firsttag"> · CLEAN FIRST</b> : null}
                          {r.kind === 'clean' && r.why ? <span className="hk-why"> {r.why}</span> : null}
                          {r.stay ? <span className="hk-stay"> {r.stay}</span> : null}
                        </td>
                        <td className="hk-notes">{done ? <em className="hk-donetag">done in the AM</em> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <footer className="hk-page-foot">Start ______ &nbsp; Finish ______ &nbsp; Supervisor sign-off ____________ · printed {printed}</footer>
          </section>
        );
      }))}
    </div>,
    document.body
  );
};

export default HkSheets;
