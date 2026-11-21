// Sprint 29.4 — Dev → Platform: which cards the FRONT DESK sees on its Forecast page. Dev ticks the cards; the page draws only those (a card that is unticked is not deleted — it is only hidden,
// and ticking it brings it back). Stored as the dev-only setting `forecast_fd_cards`. Takes effect the next time the front desk opens or refreshes the page.
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../auth';
import Icon from '../../components/shared/Icon';
import { FD_CARDS, FD_CARDS_DEFAULT, parseFdCards } from '../../components/FrontDesk/fdCards';

const sameList = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
const inOrder = (set) => FD_CARDS.map(c => c.key).filter(k => set.has(k));

const FrontDeskCardsCard = () => {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState([...FD_CARDS_DEFAULT]);   // what is stored now (page order)
  const [picked, setPicked] = useState(() => new Set(FD_CARDS_DEFAULT));
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { ok, data } = await apiFetch('/admin/settings');
    if (ok && data && data.success) { const list = parseFdCards(data.settings && data.settings.forecast_fd_cards); setSaved(list); setPicked(new Set(list)); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (key) => { setMsg(null); setPicked(p => { const n = new Set(p); if (n.has(key)) { if (n.size > 1) n.delete(key); } else n.add(key); return n; }); };
  const list = inOrder(picked), dirty = !sameList(list, saved);
  const save = async () => {
    setBusy(true); setMsg(null);
    const { ok, data } = await apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ forecast_fd_cards: JSON.stringify(list) }) });
    setBusy(false);
    if (ok && data && data.success) { setSaved(list); setMsg({ ok: true, text: 'Saved — the front desk sees this the next time they open or refresh the Forecast page.' }); }
    else setMsg({ ok: false, text: (data && data.message) || 'Could not save.' });
  };

  if (loading) return <section className="dv-card" aria-label="Front desk forecast cards"><h2>Front desk — Forecast cards</h2><p className="dv-muted">Loading…</p></section>;
  return (
    <section className="dv-card" aria-label="Front desk forecast cards">
      <h2>Front desk — Forecast cards</h2>
      <p className="dv-muted">Choose which cards the front desk sees on its Forecast page. A card you untick is only hidden — you can bring it back here at any time. Managers' own Forecast page is not affected.</p>
      <ul className="dvf-list">
        {FD_CARDS.map(c => {
          const on = picked.has(c.key), last = on && picked.size === 1;
          return (
            <li key={c.key}>
              <label className={`dvf-row${on ? ' on' : ''}`} title={last ? 'At least one card has to stay on' : undefined}>
                <input type="checkbox" checked={on} onChange={() => toggle(c.key)} disabled={last} aria-label={c.label} />
                <span className="dvf-tick" aria-hidden><Icon name={on ? 'check' : 'plus'} size={14} /></span>
                <span className="dvf-text"><strong>{c.label}</strong><small>{c.note}</small></span>
                <span className="dvf-kind">{c.kind === 'tile' ? 'Top card' : c.kind === 'table' ? 'Table' : 'Card'}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="dvf-actions">
        <button type="button" className="dv-btn dv-btn-primary" onClick={save} disabled={busy || !dirty}>Save cards</button>
        <button type="button" className="dv-btn" onClick={() => { setPicked(new Set(FD_CARDS_DEFAULT)); setMsg(null); }} disabled={busy || sameList(list, FD_CARDS_DEFAULT)}>Reset to the standard set</button>
        {msg && <small role="status" className={msg.ok ? 'dv-ok' : 'dv-error'}>{msg.text}</small>}
      </div>
    </section>
  );
};

export default FrontDeskCardsCard;
