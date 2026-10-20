// Sprint 22.3 — "How accurate has it been?" for the late-booking allowance (Forecast settings → Late bookings).
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../auth';
import { summarizeAccuracy, MIN_DAYS } from '../Forecast/accuracy';
import './AccuracyCard.css';

const pct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
const num1 = (v) => (v == null ? '—' : v.toFixed(1));

const AccuracyCard = ({ allowance, onApplyScale }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const { ok, data } = await apiFetch('/admin/forecast/accuracy?days=90');
      if (!live) return;
      if (!ok || !data?.success) setError(data?.message || 'Could not load accuracy data.'); else setRows(data.rows || []);
    })();
    return () => { live = false; };
  }, []);
  if (error) return <p className="acc-note acc-error" role="alert">{error}</p>;
  if (!rows) return <p className="acc-note">Loading accuracy…</p>;
  const s = summarizeAccuracy(rows, allowance);
  const current = Number(allowance && allowance.scalePct) || 100;
  return (
    <section className="acc" aria-label="Forecast accuracy">
      <h3>How accurate has it been?</h3>
      {!s.ready ? (
        <p className="acc-note">Collecting data — {s.days} day{s.days === 1 ? '' : 's'} of results so far (needs {MIN_DAYS}). Each morning the sync records what is booked for the next two weeks; the next day it records who actually arrived.</p>
      ) : (
        <>
          <p className="acc-note">Based on the last {s.days} days. “Booked” is what was on the books that many days ahead; “Arrived” is who actually checked in.</p>
          <div className="acc-table-wrap">
            <table className="acc-table">
              <thead><tr><th>Days ahead</th><th>Days</th><th>Booked</th><th>Arrived</th><th>Measured extra</th><th>Model assumes</th><th title="Average miss per room-type group per day">Miss with allowance</th><th title="Average miss if nothing is added to what is booked">Miss without</th></tr></thead>
              <tbody>
                {s.perHorizon.map(h => (
                  <tr key={h.horizon}>
                    <td>{h.horizon === 1 ? 'Tomorrow' : h.horizon}</td><td>{h.days}</td><td>{h.booked}</td><td>{h.actual}</td>
                    <td>{pct(h.measuredPct)}</td><td>{pct(h.modelPct)}</td><td>{num1(h.maeModel)}</td><td>{num1(h.maeNone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.suggestedScale != null && (
            <p className="acc-suggest">
              {Math.abs(s.suggestedScale - current) < 5
                ? <>The current scale (<strong>{current}%</strong>) matches what your hotel actually does.</>
                : <>Based on 1–3 days ahead, a scale of <strong>{s.suggestedScale}%</strong> would have fit best (you use {current}%).{' '}
                    {onApplyScale && <button type="button" className="acc-apply" onClick={() => onApplyScale(s.suggestedScale)}>Use {s.suggestedScale}%</button>}</>}
            </p>
          )}
        </>
      )}
    </section>
  );
};

export default AccuracyCard;
