// Sprint 23 — printable housekeeping sheets: one page per housekeeper (their rooms, priority first, tick-boxes), or all of them.
// Portaled to <body>; hidden on screen, the only thing on paper while printing (see Housekeeping.css + usePrintSheet).
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import usePrintSheet from '../shared/usePrintSheet';
import { weightOf, KIND_LABEL } from './hkWork';

const fmt = (n) => (Math.round(n * 10) / 10).toString();

const HkSheets = ({ dateLabel, sheets, settings, onDone }) => {
  usePrintSheet();
  useEffect(() => {
    const id = setTimeout(() => window.print(), 80);
    const done = () => onDone && onDone();
    window.addEventListener('afterprint', done, { once: true });
    return () => { clearTimeout(id); window.removeEventListener('afterprint', done); };
  }, [onDone]);
  const printed = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return createPortal(
    <div className="hk-printroot fc-print-root" aria-hidden="true">
      {sheets.map(sh => {
        const clean = sh.rooms.filter(r => r.kind === 'clean').length, service = sh.rooms.length - clean;
        const units = sh.rooms.reduce((n, r) => n + weightOf(r, settings), 0);
        return (
          <section className="hk-page" key={sh.userId}>
            <header className="hk-page-head">
              <div><h1>{sh.name}</h1><p>Housekeeping assignment · {dateLabel}</p></div>
              <div className="hk-page-tot"><strong>{sh.rooms.length}</strong> rooms · {clean} clean · {service} service · workload {fmt(units)}</div>
            </header>
            {sh.rooms.length === 0 ? <p className="hk-page-empty">No rooms assigned.</p> : (
              <table className="hk-page-table">
                <thead><tr><th style={{ width: 26 }}>✓</th><th>Room</th><th>Floor</th><th>Type</th><th>Task</th><th>Notes</th></tr></thead>
                <tbody>
                  {sh.rooms.map(r => (
                    <tr key={r.roomNumber} className={r.priority ? 'hk-first' : ''}>
                      <td><span className="hk-box" /></td>
                      <td className="hk-num">{r.tbd ? 'TBD' : r.roomNumber}</td>
                      <td>{r.floorLabel || ''}</td>
                      <td>{r.typeCode}</td>
                      <td>{KIND_LABEL[r.kind]}{r.kind === 'clean' ? '' : ' (stay-over)'}{r.priority ? <b className="hk-firsttag"> · CLEAN FIRST</b> : null}{r.why && r.kind === 'clean' ? <span className="hk-why"> {r.why}</span> : null}</td>
                      <td className="hk-notes" />
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <footer className="hk-page-foot">Start ______ &nbsp; Finish ______ &nbsp; Supervisor sign-off ____________ · printed {printed}</footer>
          </section>
        );
      })}
    </div>,
    document.body
  );
};

export default HkSheets;
