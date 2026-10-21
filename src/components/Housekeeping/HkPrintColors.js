// Sprint 23.4 — DEV ONLY: the colours of the printed housekeeping sheets, one per room group. Defaults: dirty green · check-out (leaving that day)
// yellow · priority / pre-assigned pink · in-house no colour (it shows check-in → check-out). Saved as the dev-only setting `hk_print_colors`.
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../auth';
import { CATS, CAT_LABEL, PRINT_COLOR_DEFAULTS } from './hkWork';

const SAMPLE = {
  dirty: { room: '104', task: 'Clean', note: 'Dirty' },
  departure: { room: '107', task: 'Clean', note: 'Check-out today' },
  priority: { room: '122', task: 'Clean · CLEAN FIRST', note: 'Needed for a booked arrival' },
  inhouse: { room: '210', task: 'Service (stay-over)', note: 'Oct 17 → Oct 21' },
};

const HkPrintColors = ({ colors, onSaved }) => {
  const [draft, setDraft] = useState(colors);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(colors); }, [colors]);
  const changed = CATS.some(c => (draft[c] || '') !== (colors[c] || ''));
  const set = (c, v) => { setDraft(d => ({ ...d, [c]: v })); setMsg(null); };
  const save = async () => {
    setBusy(true);
    const { ok, data } = await apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ hk_print_colors: JSON.stringify(draft) }) });
    setBusy(false);
    if (ok && data?.success) { setMsg({ ok: true, text: 'Saved — new prints use these colours' }); onSaved(draft); } else setMsg({ ok: false, text: data?.message || 'Could not save' });
  };
  return (
    <section className="hk-panel hk-colors" aria-label="Print colours (dev)">
      <div className="hk-panel-head"><h2>Print sheet colours</h2><span className="hk-tag-dev">DEV</span></div>
      <p className="hk-help">Colour of each room group on the printed sheets. Leave "No colour" for rooms that should stay white.</p>
      <div className="hk-colors-grid">
        {CATS.map(c => (
          <div className="hk-color-row" key={c}>
            <span className="hk-color-label">{CAT_LABEL[c]}</span>
            <input type="color" aria-label={`Colour for ${CAT_LABEL[c]}`} value={draft[c] || '#ffffff'} onChange={(e) => set(c, e.target.value)} />
            <button type="button" className={`hk-btn hk-btn-sm${draft[c] === '' ? ' on' : ''}`} onClick={() => set(c, '')} aria-pressed={draft[c] === ''}>No colour</button>
            <button type="button" className="hk-btn hk-btn-sm" onClick={() => set(c, PRINT_COLOR_DEFAULTS[c])}>Default</button>
          </div>
        ))}
      </div>
      <table className="hk-colors-preview" aria-label="Preview">
        <tbody>
          {CATS.map(c => <tr key={c} style={draft[c] ? { backgroundColor: draft[c] } : undefined}><td><b>{SAMPLE[c].room}</b></td><td>{SAMPLE[c].task}</td><td>{SAMPLE[c].note}</td></tr>)}
        </tbody>
      </table>
      <div className="hk-colors-actions">
        <button type="button" className="hk-btn hk-btn-primary" onClick={save} disabled={!changed || busy}>Save colours</button>
        <button type="button" className="hk-btn" onClick={() => { setDraft({ ...PRINT_COLOR_DEFAULTS }); setMsg(null); }}>Reset all to defaults</button>
        {msg && <span className={`hk-colors-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.text}</span>}
      </div>
    </section>
  );
};

export default HkPrintColors;
