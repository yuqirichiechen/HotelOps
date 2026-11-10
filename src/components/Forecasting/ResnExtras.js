// Sprint 26.2 — DEV only: what rGuest keeps beside a reservation that the summary does not carry. Loaded when a card's details are opened (one request to
// /admin/reservations/:id/extras, which reads the stored deep fetch — it never calls rGuest):
//   · Audit log — the history popup behind the "enlarge" icon (who changed what, when);
//   · Authorization & payment history — the folio's More → Authorization & Payment History table;
//   · Comments — what the front desk left on the reservation, plus the guest profile's comments; archived ones can be shown.
// A reservation saved before this sprint shows "not saved yet" until the next refresh fills it in.
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../auth';
import { fmtMoney } from './resnFormat';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const stampOf = (iso) => {
  const d = new Date(iso); if (!iso || Number.isNaN(d.getTime())) return '';
  const h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
  return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};
const SHOWN = 5;

const Audit = ({ audit }) => {
  const [all, setAll] = useState(false);
  const list = all ? audit.entries : audit.entries.slice(0, SHOWN);
  if (!audit.entries.length) return <p className="rl-sec-empty">No history recorded for this reservation.</p>;
  return (
    <>
      <ol className="rx-audit">
        {list.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <div className="rx-audit-head"><b>{stampOf(e.at)}</b><span>by {e.user}</span></div>
            <ul>{e.lines.map((l, j) => <li key={j}>{l}</li>)}{e.more > 0 && <li className="rx-muted">…and {e.more} more change{e.more === 1 ? '' : 's'}</li>}</ul>
          </li>
        ))}
      </ol>
      {audit.entries.length > SHOWN && <button type="button" className="rl-btn rx-more" onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${audit.entries.length}`}</button>}
      {audit.truncated && <p className="rx-muted">Showing the newest {audit.entries.length} of {audit.total} entries.</p>}
    </>
  );
};

const Payments = ({ payments }) => {
  const { rows, totals } = payments;
  if (!rows.length) return <p className="rl-sec-empty">No authorizations or payments recorded.</p>;
  return (
    <>
      <div className="rx-totals" aria-label="Totals">
        {[['Payments', totals.payment], ['Authorized', totals.authorized], ['Released', totals.released], ['Refunds', totals.refund]].map(([l, v]) => <span key={l}>{l} <b>{fmtMoney(v)}</b></span>)}
      </div>
      <div className="rx-tablewrap">
        <table className="rx-table">
          <thead><tr><th>Date</th><th>Time</th><th>User</th><th>Auth code</th><th>Card</th><th>Type</th><th>Amount</th><th>Issuer</th><th>Status</th><th>Reason</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.status === 'Failed' ? 'is-bad' : undefined}>
                <td>{r.date}</td><td>{r.time}</td><td>{r.user}</td><td>{r.authCode || '—'}</td><td>{r.card || '—'}</td><td>{r.type}</td><td className="rx-num">{fmtMoney(r.amount)}</td><td>{r.issuer || '—'}</td><td>{r.status}</td><td>{r.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

const Comments = ({ comments }) => {
  const [which, setWhich] = useState('reservation'), [archived, setArchived] = useState(false);
  const list = (comments[which] || []).filter(c => archived || !c.archived);
  const nArch = (comments.reservation || []).concat(comments.profile || []).filter(c => c.archived).length;
  return (
    <>
      <div className="rx-commentbar">
        <div className="rx-seg" role="tablist" aria-label="Which comments">
          {[['reservation', 'Reservation'], ['profile', 'Guest profile']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={which === k} className={which === k ? 'on' : ''} onClick={() => setWhich(k)}>{l} ({(comments[k] || []).filter(c => !c.archived).length})</button>)}
        </div>
        {nArch > 0 && <label className="rx-check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Include archived ({nArch})</label>}
      </div>
      {list.length === 0 ? <p className="rl-sec-empty">{which === 'reservation' ? 'No comments on this reservation.' : 'No comments on the guest profile.'}</p> : (
        <ul className="rx-comments">
          {list.map(c => (
            <li key={c.id} className={`rx-c-${c.importance || 'medium'}${c.archived ? ' is-archived' : ''}`}>
              <div className="rx-c-head">
                {c.type && <span className="rx-tag">{c.type}</span>}
                {c.importance && c.importance !== 'medium' && <span className={`rx-tag rx-imp-${c.importance}`}>{c.importance}</span>}
                {c.alert && <span className="rx-tag">Alert</span>}
                {c.archived && <span className="rx-tag">Archived</span>}
                <span className="rx-c-by">{c.author || 'someone'} · {stampOf(c.at)}</span>
              </div>
              <p>{c.text}</p>
              {c.modifiedAt && <small className="rx-muted">Edited by {c.modifiedBy || 'someone'} · {stampOf(c.modifiedAt)}</small>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

const ResnExtras = ({ id, version }) => {
  const [state, setState] = useState({ loading: true, extras: null, error: null });
  useEffect(() => {
    let alive = true; setState(s => ({ ...s, loading: true }));
    (async () => {
      const { ok, data } = await apiFetch(`/admin/reservations/${id}/extras`);
      if (!alive) return;
      if (ok && data?.success) setState({ loading: false, extras: data.extras, error: null });
      else setState({ loading: false, extras: null, error: data?.message || 'Could not load this reservation’s history.' });
    })();
    return () => { alive = false; };
  }, [id, version]);
  const { loading, extras, error } = state;
  return (
    <section className="rl-sec rl-sec-stack rx" aria-label="rGuest history (dev)">
      <h4>rGuest history <span className="rx-dev">DEV</span></h4>
      {loading && !extras && <p className="rl-sec-empty">Loading…</p>}
      {error && <p className="rl-sec-empty" role="alert">{error}</p>}
      {extras && !extras.loaded && <p className="rl-sec-empty">Not saved yet — press <b>Refresh</b> (or run the next refresh) and the history, payments and comments are filled in.</p>}
      {extras && extras.loaded && (
        <div className="rx-blocks">
          <div className="rx-block">
            <h5>Audit log <small>{extras.audit.total} entr{extras.audit.total === 1 ? 'y' : 'ies'}</small></h5>
            {extras.sections.auditLog && extras.sections.auditLog.ok === false && <p className="rx-warn">Couldn’t refresh: {extras.sections.auditLog.error}</p>}
            <Audit audit={extras.audit} />
          </div>
          <div className="rx-block">
            <h5>Authorization &amp; payment history <small>{extras.payments.rows.length} row{extras.payments.rows.length === 1 ? '' : 's'}</small></h5>
            {extras.sections.authHistory && extras.sections.authHistory.ok === false && <p className="rx-warn">Couldn’t refresh: {extras.sections.authHistory.error}</p>}
            <Payments payments={extras.payments} />
          </div>
          <div className="rx-block">
            <h5>Comments</h5>
            {['reservationComments', 'profileComments'].map(k => extras.sections[k] && extras.sections[k].ok === false && <p key={k} className="rx-warn">Couldn’t refresh {k === 'profileComments' ? 'the guest profile comments' : 'the reservation comments'}: {extras.sections[k].error}</p>)}
            <Comments comments={extras.comments} />
          </div>
        </div>
      )}
    </section>
  );
};

export default ResnExtras;
