// Sprint 22.2 — Auto-sync panel: health, run-now, schedule settings, recent runs.
// Lives in Forecast settings → "Auto-sync" (and on the /dev page). Admin-only API; every call goes through apiFetch.
// The status endpoint is DB-free once the engine is warm, so polling it does not wake the database.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../auth';
import { KIND_LABEL, KIND_HELP, ago, fmtClock, fmtDayClock, draftFromSettings, settingsFromDraft, draftChanged, healthOf } from './syncFormat';
import './SyncPanel.css';

const RUN_KINDS = ['frequent', 'hourly', 'reconcile', 'backfill'];
const POLL_RUNNING_MS = 4000, POLL_IDLE_MS = 30000;

const Field = ({ label, hint, children }) => (
  <label className="sp-field"><span className="sp-field-label">{label}</span><span className="sp-field-input">{children}</span>{hint && <span className="sp-hint">{hint}</span>}</label>
);

const SyncPanel = () => {
  const [status, setStatus] = useState(null);
  const [tickConfigured, setTickConfigured] = useState(true);
  const [stored, setStored] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [draft, setDraft] = useState(null);
  const [base, setBase] = useState(null);       // draft as last loaded from the server (to detect edits)
  const [saving, setSaving] = useState(false);
  const [confirmFull, setConfirmFull] = useState(false);
  const [busy, setBusy] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dirtyRef = useRef(false);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(null), 4000); };

  const load = useCallback(async () => {
    const { ok, data } = await apiFetch('/admin/sync/status');
    if (!ok || !data?.success) { setError(data?.message || 'Could not load sync status.'); return null; }
    setError(null); setStatus(data.status); setTickConfigured(data.tickConfigured !== false);
    if (!dirtyRef.current) { const d = draftFromSettings(data.status.settings); setDraft(d); setBase(d); }
    return data.status;
  }, []);
  const loadStored = useCallback(async () => {
    const { ok, data } = await apiFetch('/admin/sync/runs?limit=40');
    if (ok && data?.success) setStored(data.runs || []);
  }, []);
  useEffect(() => { load(); loadStored(); }, [load, loadStored]);

  // Poll while a run is in progress (fast) and slowly otherwise, only while the tab is visible.
  const running = !!(status && status.running);
  useEffect(() => {
    const tick = setInterval(() => { if (document.visibilityState === 'visible') load(); }, running ? POLL_RUNNING_MS : POLL_IDLE_MS);
    return () => clearInterval(tick);
  }, [running, load]);
  const wasRunning = useRef(false);
  useEffect(() => { if (wasRunning.current && !running) loadStored(); wasRunning.current = running; }, [running, loadStored]);

  const edit = (patch) => { dirtyRef.current = true; setDraft(d => ({ ...d, ...patch })); };
  const dirty = draft && base && draftChanged(draft, base);

  const save = async () => {
    setSaving(true); setError(null);
    const { ok, data } = await apiFetch('/admin/sync/settings', { method: 'PUT', body: JSON.stringify(settingsFromDraft(draft)) });
    setSaving(false);
    if (!ok || !data?.success) { setError(data?.message || 'Save failed'); return; }
    dirtyRef.current = false; flash('Sync settings saved.'); await load();
  };
  const discard = () => { dirtyRef.current = false; setDraft(base); setError(null); };

  const run = async (kind) => {
    setBusy(kind); setError(null);
    const { ok, data } = await apiFetch('/admin/sync/run', { method: 'POST', body: JSON.stringify({ kind }) });
    setBusy(null); setConfirmFull(false);
    if (!ok || !data?.success) { setError(data?.message || 'Could not start the run.'); return; }
    flash(data.started === false ? `Not started: ${data.reason || 'busy'}.` : `${KIND_LABEL[kind]} started.`);
    await load();
  };
  const setPaused = async (paused) => {
    setBusy('pause'); const { ok, data } = await apiFetch('/admin/sync/settings', { method: 'PUT', body: JSON.stringify({ paused }) }); setBusy(null);
    if (!ok || !data?.success) { setError(data?.message || 'Could not change the pause state.'); return; }
    flash(paused ? 'Sync paused.' : 'Sync resumed.'); await load();
  };

  if (!status || !draft) return <p className="sp-loading">{error || 'Loading sync status…'}</p>;
  const tz = status.settings.timezone;
  const h = healthOf(status, tickConfigured);
  const bf = status.state.backfill || {};
  const bfPct = bf.done ? 100 : (bf.from && bf.to && bf.cursor ? Math.max(0, Math.min(99, Math.round(((Date.parse(bf.cursor) - Date.parse(bf.from)) / Math.max(1, Date.parse(bf.to) - Date.parse(bf.from))) * 100))) : 0);
  const seen = new Set(), runs = [];
  [...(status.recentRuns || []), ...stored].forEach(r => { if (!seen.has(r.run_id)) { seen.add(r.run_id); runs.push(r); } });
  runs.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  const nd = status.nextDue || {};
  const num = (k, props = {}) => <input type="number" value={draft[k]} onChange={e => edit({ [k]: e.target.value })} {...props} />;
  // 24-hour HH:MM text inputs (type=time cannot express 24:00 = midnight); the server validates and the message is shown on save.
  const time = (k) => <input type="text" inputMode="numeric" className="sp-time" maxLength={5} placeholder="HH:MM" value={draft[k]} onChange={e => edit({ [k]: e.target.value })} />;

  return (
    <div className="sp">
      {error && <p className="sp-error" role="alert">{error}</p>}
      {notice && <p className="sp-notice" role="status">{notice}</p>}

      <section className="sp-card">
        <div className="sp-head">
          <h3>Sync health</h3>
          <span className={`sp-pill sp-pill-${h.state}`}>{h.label}</span>
          <button type="button" className="sp-link" onClick={() => { load(); loadStored(); }}>Refresh</button>
        </div>
        {h.problems.map((p, i) => <p key={i} className="sp-problem">{p}</p>)}
        <dl className="sp-grid">
          <div><dt>Last scheduler ping</dt><dd>{status.lastTickAt ? `${ago(status.lastTickAt)} (${fmtClock(status.lastTickAt, tz)})` : 'none yet'}</dd></div>
          <div><dt>Next quick scan</dt><dd>{nd.frequent ? `≈ ${fmtDayClock(nd.frequent, tz)}` : (status.settings.frequent.enabled ? '—' : 'off')}</dd></div>
          <div><dt>Next hourly check</dt><dd>{nd.hourly ? `≈ ${fmtDayClock(nd.hourly, tz)}` : '—'}</dd></div>
          <div><dt>Next daily reconcile</dt><dd>{nd.reconcile ? `≈ ${fmtDayClock(nd.reconcile, tz)}` : '—'}</dd></div>
          <div><dt>History load</dt><dd>{bf.done ? 'complete' : `${bfPct}%${bf.chunks ? ` (${bf.chunks} chunks)` : ''}`}</dd></div>
          <div><dt>Reservations tracked</dt><dd>{status.indexSize.toLocaleString()}</dd></div>
          <div><dt>Last database write</dt><dd>{status.lastFlushAt ? ago(status.lastFlushAt) : 'none since start'}</dd></div>
          <div><dt>Waiting to be written</dt><dd>{status.pending.upserts + status.pending.patches} changes, {status.pending.events} events</dd></div>
        </dl>
        {!bf.done && <div className="sp-bar" aria-label="history load progress"><span style={{ width: `${bfPct}%` }} /></div>}
      </section>

      <section className="sp-card">
        <div className="sp-head"><h3>Run now</h3></div>
        <div className="sp-actions">
          {RUN_KINDS.map(k => (
            <button key={k} type="button" className="sp-btn" disabled={running || busy === k} title={KIND_HELP[k]} onClick={() => run(k)}>{KIND_LABEL[k]}</button>
          ))}
          {!confirmFull
            ? <button type="button" className="sp-btn sp-btn-warn" disabled={running} title={KIND_HELP.full} onClick={() => setConfirmFull(true)}>Full re-sync…</button>
            : <span className="sp-confirm">Re-read everything (~4 min)? <button type="button" className="sp-btn sp-btn-warn" onClick={() => run('full')}>Yes, re-sync</button> <button type="button" className="sp-btn" onClick={() => setConfirmFull(false)}>Cancel</button></span>}
          <span className="sp-spacer" />
          {status.settings.paused
            ? <button type="button" className="sp-btn sp-btn-primary" disabled={busy === 'pause'} onClick={() => setPaused(false)}>Resume sync</button>
            : <button type="button" className="sp-btn" disabled={busy === 'pause'} onClick={() => setPaused(true)} title="Stops all scheduled runs until resumed">Pause sync</button>}
        </div>
        {running && <p className="sp-hint">Running {KIND_LABEL[status.running.kind] || status.running.kind} since {fmtClock(status.running.since, tz)}…</p>}
      </section>

      <section className="sp-card">
        <div className="sp-head"><h3>Schedule &amp; settings</h3></div>
        <Field label="Sync enabled"><input type="checkbox" checked={draft.enabled} onChange={e => edit({ enabled: e.target.checked })} /></Field>
        <h4>Quick scan (today + tomorrow)</h4>
        <Field label="Run during the window"><input type="checkbox" checked={draft.freqEnabled} onChange={e => edit({ freqEnabled: e.target.checked })} /></Field>
        <Field label="Window (24-hour)" hint="Default 12:00 to 24:00 = noon until midnight, Pacific time.">{time('freqFrom')} <span className="sp-to">to</span> {time('freqTo')}</Field>
        <Field label="Every">{num('freqEvery', { min: 1, max: 120 })} <span className="sp-unit">minutes</span></Field>
        <Field label="Days ahead">{num('freqDays', { min: 0, max: 7 })} <span className="sp-unit">(0 = today only)</span></Field>
        <h4>Outside the window</h4>
        <Field label="Hourly check every">{num('hourlyEvery', { min: 5, max: 1440 })} <span className="sp-unit">minutes</span></Field>
        <Field label="Exact re-read of the next" hint="Edits that keep a month’s booking count the same are only visible this way."> {num('hourlyNear', { min: 0, max: 60 })} <span className="sp-unit">days, every hour</span></Field>
        <Field label="Daily reconcile at">{time('reconcileAt')} <span className="sp-unit">(after rGuest’s day roll)</span></Field>
        <h4>Database cost</h4>
        <Field label="Write scan results at most every" hint="Higher = the database sleeps more (cheaper); scans still run on schedule and the pages you open always read what is saved.">{num('flushEvery', { min: 1, max: 240 })} <span className="sp-unit">minutes</span></Field>

        <button type="button" className="sp-link" onClick={() => setShowAdvanced(v => !v)}>{showAdvanced ? 'Hide' : 'Show'} advanced</button>
        {showAdvanced && (
          <div className="sp-adv">
            <Field label="Load history automatically"><input type="checkbox" checked={draft.bfAuto} onChange={e => edit({ bfAuto: e.target.checked })} /></Field>
            <Field label="Months of history">{num('bfMonths', { min: 0, max: 36 })}</Field>
            <Field label="History chunks per ping">{num('bfChunks', { min: 1, max: 12 })}</Field>
            <Field label="Look ahead (days)">{num('hourlyAhead', { min: 30, max: 800 })}</Field>
            <Field label="Keep raw rGuest data"><input type="checkbox" checked={draft.storeRaw} onChange={e => edit({ storeRaw: e.target.checked })} /></Field>
            <Field label="New-booking lookups per run" hint="Created time + who booked, from rGuest’s detail endpoint.">{num('detailNew', { min: 0, max: 200 })}</Field>
            <Field label="“Vanished” lookups per run">{num('detailChecks', { min: 0, max: 500 })}</Field>
            <Field label="Time zone"><input type="text" value={draft.timezone} onChange={e => edit({ timezone: e.target.value })} /></Field>
          </div>
        )}
        <div className="sp-savebar">
          <button type="button" className="sp-btn sp-btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button>
          {dirty && <button type="button" className="sp-btn" onClick={discard}>Discard</button>}
        </div>
      </section>

      <section className="sp-card">
        <div className="sp-head"><h3>Recent runs</h3></div>
        {runs.length === 0 ? <p className="sp-hint">No runs yet — they appear after the first scheduler ping.</p> : (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead><tr><th>When</th><th>Run</th><th>Result</th><th>Time</th><th>Calls</th><th>Read</th><th>New</th><th>Changed</th><th>Gone</th></tr></thead>
              <tbody>
                {runs.slice(0, 40).map(r => (
                  <tr key={r.run_id} className={r.status === 'failed' ? 'sp-row-failed' : ''} title={r.error || ''}>
                    <td>{fmtDayClock(r.started_at, tz)}</td>
                    <td>{KIND_LABEL[r.kind] || r.kind}{r.trigger === 'manual' ? ' (manual)' : ''}</td>
                    <td><span className={`sp-pill sp-pill-${r.status === 'success' ? 'ok' : r.status === 'partial' ? 'warn' : 'bad'}`}>{r.status}</span></td>
                    <td>{r.duration_ms != null ? (r.duration_ms < 1000 ? `${r.duration_ms} ms` : `${(r.duration_ms / 1000).toFixed(1)} s`) : '—'}</td>
                    <td>{r.calls}</td><td>{r.fetched}</td><td>{r.new_count}</td><td>{r.changed}</td><td>{r.gone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default SyncPanel;
