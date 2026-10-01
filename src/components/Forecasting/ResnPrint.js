// Sprint 20.5 — print-friendly desk list + CSV download helper.
//
// PrintSheet is portaled to <body> and only visible under @media print (see
// ResnList.css); while it's mounted, body gets `is-printing-resn`, which hides
// the app (#root) in print so ONLY the sheet reaches paper. The parent bumps a
// counter and remounts via `key`, so each click prints again even where
// `afterprint` doesn't fire (Safari iOS) — on screen the sheet is never visible.

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { printRow } from './resnSearch';
import { fmtMD } from './resnFormat';

export const PrintSheet = ({ title, dateLabel, rows, entryOf, truncated }) => {
  useEffect(() => {
    document.body.classList.add('is-printing-resn');
    const id = setTimeout(() => window.print(), 80);
    const done = () => document.body.classList.remove('is-printing-resn');
    window.addEventListener('afterprint', done, { once: true });
    return () => { clearTimeout(id); window.removeEventListener('afterprint', done); done(); };
  }, []);

  const printed = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const data = rows.map(r => printRow(r, entryOf(r.id)));

  return createPortal(
    <div className="rl-printroot">
      <div className="rl-printsheet">
        <h1>{title}</h1>
        <div className="rl-print-meta">{dateLabel} · {data.length} reservation{data.length === 1 ? '' : 's'} · printed {printed}</div>
        <table>
          <thead>
            <tr><th style={{ width: 20 }}>✓</th><th>Guest</th><th>Room &amp; type</th><th>Stay</th><th>Phone</th><th>Charges</th><th>Flags &amp; notes</th></tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={rows[i].id}>
                <td><span className="rl-print-box" /></td>
                <td><strong>{d.guest}</strong>{d.conf && <div>{d.conf}</div>}</td>
                <td><strong>{d.room}</strong>{d.type && <div>{d.type}</div>}</td>
                <td>{fmtMD(d.arrival) || '—'} → {fmtMD(d.departure) || '—'}<div>{d.nights ? `${d.nights} night${d.nights === 1 ? '' : 's'}` : ''}{d.guests ? ` · ${d.guests}` : ''}</div></td>
                <td>{d.phone || '—'}</td>
                <td className="rl-print-money">{d.money || '—'}</td>
                <td>
                  {d.flags.map(f => <span key={f} className="rl-print-flag">{f}</span>)}
                  {d.notes.length > 0 && <ul className="rl-print-note">{d.notes.map((n, k) => <li key={k}>{n}</li>)}</ul>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {truncated && <div className="rl-print-foot">List truncated to the first {data.length} reservations.</div>}
        <div className="rl-print-foot">Confidential — guest contact and billing information. Shred after use.</div>
      </div>
    </div>,
    document.body,
  );
};

/** Download text as a file (UTF-8 with BOM so Excel reads accents correctly). */
export function downloadCsv(text, filename) {
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
