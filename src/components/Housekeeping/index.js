// Sprint 23 — Housekeeping: decide who cleans / services which rooms, then print one sheet per housekeeper.
// Pick the day (today / tomorrow), add the housekeepers working (existing staff accounts, searchable), "Auto-suggest" a split, adjust by moving
// rooms between people, Save (stored per day) and Print. Same page for managers and dev. Data is read once on open / refresh — no timers.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../auth';
import { DEFAULT_ALLOWANCE, addDays } from '../Forecast/forecastModel';
import { CountUp } from '../shared/CountUp';
import HkSheets from './HkSheets';
import { buildWorkList, summarize, suggest, reconcile, toAssignments, weightOf, DEFAULT_SETTINGS, KIND_LABEL } from './hkWork';
import './Housekeeping.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayText = (ymd) => { if (!ymd) return ''; const d = new Date(Date.parse(ymd + 'T12:00:00Z')); return `${WD[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const fmt = (n) => (Math.round(n * 10) / 10).toString();
const HK_DEPT = /housekeep/i;

const StaffPicker = ({ staff, chosen, onAdd }) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const hasHk = staff.some(s => HK_DEPT.test(s.department || ''));
  const [onlyHk, setOnlyHk] = useState(true);
  const restrict = onlyHk && hasHk;
  const boxRef = useRef(null);
  useEffect(() => {   // click outside closes the list
    if (!open) return undefined;
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const list = useMemo(() => {
    const taken = new Set(chosen.map(c => c.userId)), needle = q.trim().toLowerCase();
    return staff.filter(s => !taken.has(s.user_id) && (!restrict || HK_DEPT.test(s.department || '')) && (!needle || s.name.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
  }, [staff, chosen, q, restrict]);
  return (
    <div className="hk-picker" ref={boxRef}>
      <label className="hk-picker-label" htmlFor="hk-search">Add housekeeper</label>
      <input id="hk-search" className="hk-input" type="search" placeholder="Search staff by name…" value={q} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} />
      {hasHk && (
        <label className="hk-check"><input type="checkbox" checked={onlyHk} onChange={(e) => setOnlyHk(e.target.checked)} /> Housekeeping department only</label>
      )}
      {open && (
        <ul className="hk-picker-list" role="listbox" aria-label="Matching staff">
          {list.length === 0 && <li className="hk-picker-empty">{staff.length === 0 ? 'No staff loaded.' : 'No one matches.'}</li>}
          {list.map(s => (
            <li key={s.user_id}>
              <button type="button" role="option" aria-selected="false" onClick={() => { onAdd({ userId: s.user_id, name: s.name }); setQ(''); setOpen(false); }}>
                <span>{s.name}</span><small>{s.department || '—'}</small>
              </button>
            </li>
          ))}
          <li className="hk-picker-close"><button type="button" onClick={() => setOpen(false)}>Done</button></li>
        </ul>
      )}
    </div>
  );
};

const RoomRow = ({ it, owner, hks, onMove }) => (
  <li className={`hk-room hk-${it.kind}${it.priority ? ' hk-prio' : ''}`}>
    <strong className="hk-room-num">{it.roomNumber}</strong>
    <span className="hk-room-meta"><span className={`hk-badge hk-badge-${it.kind}`}>{KIND_LABEL[it.kind]}</span>{it.priority && <span className="hk-badge hk-badge-first">Clean first</span>}<small>{it.typeCode} · {it.why}</small></span>
    <select className="hk-move" aria-label={`Move room ${it.roomNumber}`} value={owner || ''} onChange={(e) => onMove(it.roomNumber, e.target.value || null)}>
      <option value="">Unassigned</option>
      {hks.map(h => <option key={h.userId} value={h.userId}>{h.name}</option>)}
    </select>
  </li>
);

const Housekeeping = () => {
  const [payload, setPayload] = useState(null);
  const [live, setLive] = useState(null);
  const [allowance, setAllowance] = useState(DEFAULT_ALLOWANCE);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hks, setHks] = useState([]);
  const [assign, setAssign] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);
  const [planFor, setPlanFor] = useState(null);       // date whose saved plan has been loaded
  const [printing, setPrinting] = useState(null);     // null | 'all' | userId

  const loadAll = useCallback(async () => {
    setError(null);
    const [cur, lv, st, emp] = await Promise.all([apiFetch('/admin/forecast/current'), apiFetch('/admin/forecast/live'), apiFetch('/admin/settings'), apiFetch('/admin/employees')]);
    if (cur.ok && cur.data?.success && cur.data.snapshot) setPayload(cur.data.snapshot.payload); else setError(cur.data?.message || 'Could not load the room data.');
    if (lv.ok && lv.data?.success) setLive(lv.data.live);
    const s = st.ok && st.data && st.data.settings;
    if (s) {
      const num = (v, d) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
      setAllowance({ enabled: s.forecast_allowance_enabled == null ? DEFAULT_ALLOWANCE.enabled : s.forecast_allowance_enabled !== 'false', scalePct: num(s.forecast_allowance_scale_pct, DEFAULT_ALLOWANCE.scalePct), minExtra: num(s.forecast_allowance_min_extra, DEFAULT_ALLOWANCE.minExtra) });
    }
    if (emp.ok && emp.data?.success) setStaff((emp.data.employees || []).filter(e => e.active !== false));
    setLoading(false);
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const work = useMemo(() => buildWorkList({ payload, live, allowance, offset }), [payload, live, allowance, offset]);
  const itemByRoom = useMemo(() => new Map(work.items.map(i => [i.roomNumber, i])), [work]);

  // saved plan for the chosen day (once the work list for it exists)
  useEffect(() => {
    if (!work.date) return undefined;
    if (planFor === work.date) return undefined;
    let live2 = true;
    (async () => {
      const { ok, data } = await apiFetch(`/admin/housekeeping/plan?date=${work.date}`);
      if (!live2) return;
      const saved = ok && data?.success ? data.plan : null;
      const r = reconcile(saved, work.items);
      setHks(r.hks); setAssign(r.assign); setSettings({ ...DEFAULT_SETTINGS, ...((saved && saved.settings) || {}) });
      setSavedAt(saved ? saved.updatedAt : null); setDirty(false); setSaveMsg(null); setPlanFor(work.date);
    })();
    return () => { live2 = false; };
  }, [work, planFor, payload]);

  // after a refresh: rooms that no longer need work leave the board
  useEffect(() => {
    setAssign(prev => { const next = {}; let changed = false; Object.keys(prev).forEach(k => { if (itemByRoom.has(k)) next[k] = prev[k]; else changed = true; }); return changed ? next : prev; });
  }, [itemByRoom]);

  const touch = () => { setDirty(true); setSaveMsg(null); };
  const addHk = (h) => { setHks(prev => (prev.some(x => x.userId === h.userId) ? prev : [...prev, h])); touch(); };
  const removeHk = (id) => { setHks(prev => prev.filter(h => h.userId !== id)); setAssign(prev => { const n = {}; Object.keys(prev).forEach(k => { if (prev[k] !== id) n[k] = prev[k]; }); return n; }); touch(); };
  const move = (room, id) => { setAssign(prev => { const n = { ...prev }; if (id) n[room] = id; else delete n[room]; return n; }); touch(); };
  const autoSuggest = () => { setAssign(suggest(work.items, hks, settings)); touch(); };
  const clearAll = () => { setAssign({}); touch(); };
  const setNum = (k, v) => { const n = Number(v); setSettings(s => ({ ...s, [k]: Number.isFinite(n) ? n : s[k] })); touch(); };

  const sum = useMemo(() => summarize(work.items, assign, hks, settings), [work, assign, hks, settings]);
  const totalUnits = work.items.reduce((n, i) => n + weightOf(i, settings), 0);
  const cleanN = work.items.filter(i => i.kind === 'clean').length, serviceN = work.items.length - cleanN;

  const save = useCallback(async () => {
    const body = { date: work.date, settings, assignments: toAssignments(work.items, assign, hks) };
    const { ok, data } = await apiFetch('/admin/housekeeping/plan', { method: 'PUT', body: JSON.stringify(body) });
    if (ok && data?.success) { setDirty(false); setSavedAt(data.updatedAt); setSaveMsg({ ok: true, text: 'Saved' }); return true; }
    setSaveMsg({ ok: false, text: data?.message || 'Could not save' }); return false;
  }, [work, settings, assign, hks]);

  const printNow = async (who) => { if (hks.length === 0) return; if (dirty || !savedAt) { if (!(await save())) return; } setPrinting(who); };
  const chooseDay = (n) => { if (n === offset) return; if (dirty && !window.confirm('You have unsaved changes for this day. Switch anyway?')) return; setOffset(n); setPlanFor(null); };

  const sheets = useMemo(() => {
    if (!printing) return [];
    const itemsFor = (a) => a.rooms.map(r => ({ ...itemByRoom.get(r.roomNumber), ...r })).filter(r => r.typeCode !== undefined);
    return toAssignments(work.items, assign, hks).filter(a => printing === 'all' || a.userId === printing).map(a => ({ userId: a.userId, name: a.name, rooms: itemsFor(a) }));
  }, [printing, work, assign, hks, itemByRoom]);

  const today = (live && live.forecastDate) || (payload && payload.forecastDate) || '';
  const roomsOf = (id) => work.items.filter(i => (id ? assign[i.roomNumber] === id : !assign[i.roomNumber] || !hks.some(h => h.userId === assign[i.roomNumber])));
  const unassigned = roomsOf(null);

  return (
    <div className="hk-page-wrap">
      <header className="hk-header">
        <div>
          <h1>Housekeeping</h1>
          <p className="hk-sub">Decide who cleans which rooms, then print one sheet per housekeeper.</p>
        </div>
        <div className="hk-actions">
          <button type="button" className="hk-btn" onClick={loadAll} disabled={loading}>Refresh rooms</button>
          <button type="button" className="hk-btn hk-btn-primary" onClick={save} disabled={!dirty || hks.length === 0}>{dirty ? 'Save' : 'Saved'}</button>
          <button type="button" className="hk-btn hk-btn-dark" onClick={() => printNow('all')} disabled={hks.length === 0}>Print all sheets</button>
        </div>
      </header>

      <div className="hk-days" role="tablist" aria-label="Day">
        {[0, 1].map(n => (
          <button key={n} type="button" role="tab" aria-selected={offset === n} className={`hk-day${offset === n ? ' on' : ''}`} onClick={() => chooseDay(n)}>
            {n === 0 ? 'Today' : 'Tomorrow'}<small>{today ? dayText(addDays(today, n)) : ''}</small>
          </button>
        ))}
        <span className="hk-savestate" role="status">{saveMsg ? <span className={saveMsg.ok ? 'ok' : 'bad'}>{saveMsg.text}</span> : dirty ? 'Unsaved changes' : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not saved yet'}</span>
      </div>

      {error && <p className="hk-error" role="alert">{error}</p>}
      {loading && <p className="hk-muted">Loading rooms…</p>}

      {!loading && payload && (
        <>
          <section className="hk-tiles" aria-label="Workload">
            <div className="hk-tile"><span>Rooms to clean</span><strong><CountUp value={cleanN} animKey={work.date} /></strong></div>
            <div className="hk-tile"><span>Stay-overs to service</span><strong><CountUp value={serviceN} animKey={work.date} /></strong></div>
            <div className="hk-tile"><span>Total workload</span><strong>{fmt(totalUnits)}</strong><small>clean = {fmt(settings.cleanWeight)} · service = {fmt(settings.serviceWeight)}</small></div>
            <div className="hk-tile"><span>Housekeepers</span><strong><CountUp value={hks.length} animKey={work.date} /></strong><small>{hks.length ? `about ${fmt(totalUnits / hks.length)} each` : 'add who is working'}</small></div>
          </section>
          {(work.unplaced.clean > 0 || work.unplaced.service > 0) && (
            <p className="hk-note">{work.unplaced.clean + work.unplaced.service} reservation{work.unplaced.clean + work.unplaced.service === 1 ? '' : 's'} for this day {work.unplaced.clean + work.unplaced.service === 1 ? 'has' : 'have'} no room number yet, so can't be handed out ({work.unplaced.clean} to clean, {work.unplaced.service} to service). Refresh later in the day.</p>
          )}

          <section className="hk-card hk-controls">
            <StaffPicker staff={staff} chosen={hks} onAdd={addHk} />
            <div className="hk-chosen" aria-label="Housekeepers working">
              {hks.length === 0 && <span className="hk-muted">No housekeepers added yet.</span>}
              {hks.map(h => <span key={h.userId} className="hk-pill">{h.name}<button type="button" aria-label={`Remove ${h.name}`} onClick={() => removeHk(h.userId)}>×</button></span>)}
            </div>
            <div className="hk-settings">
              <label>Minimum workload each<input className="hk-input hk-num-in" type="number" min="1" max="100" step="1" value={settings.min} onChange={(e) => setNum('min', e.target.value)} /></label>
              <label>Clean counts<input className="hk-input hk-num-in" type="number" min="0.1" max="5" step="0.1" value={settings.cleanWeight} onChange={(e) => setNum('cleanWeight', e.target.value)} /></label>
              <label>Service counts<input className="hk-input hk-num-in" type="number" min="0" max="5" step="0.1" value={settings.serviceWeight} onChange={(e) => setNum('serviceWeight', e.target.value)} /></label>
              <button type="button" className="hk-btn hk-btn-primary" onClick={autoSuggest} disabled={hks.length === 0 || work.items.length === 0}>Auto-suggest</button>
              <button type="button" className="hk-btn" onClick={clearAll} disabled={work.items.length === 0}>Clear all</button>
            </div>
            <p className="hk-help">Auto-suggest hands rooms out floor by floor and only uses as many housekeepers as the minimum allows. You can then move any room with its drop-down.</p>
          </section>

          {work.items.length === 0 && <p className="hk-muted">Nothing to clean or service for this day.</p>}

          <div className="hk-board">
            {(unassigned.length > 0 || hks.length === 0) && (
              <section className="hk-card hk-col hk-col-un" aria-label="Unassigned rooms">
                <h2>Unassigned <span className="hk-count">{unassigned.length}</span></h2>
                <ul className="hk-rooms">{unassigned.map(it => <RoomRow key={it.roomNumber} it={it} owner={null} hks={hks} onMove={move} />)}</ul>
              </section>
            )}
            {sum.hks.map(h => {
              const mine = roomsOf(h.userId);
              const pct = Math.min(100, settings.min > 0 ? (h.units / settings.min) * 100 : 100);
              return (
                <section className="hk-card hk-col" key={h.userId} aria-label={`${h.name}'s rooms`}>
                  <div className="hk-col-head">
                    <h2>{h.name}</h2>
                    <button type="button" className="hk-btn hk-btn-sm" onClick={() => printNow(h.userId)} disabled={mine.length === 0}>Print sheet</button>
                  </div>
                  <p className="hk-col-sum"><strong>{h.rooms}</strong> rooms · {h.clean} clean · {h.service} service · workload <strong>{fmt(h.units)}</strong></p>
                  <div className="hk-meter" title={`Minimum ${settings.min}`}><span className={h.belowMin ? 'low' : ''} style={{ width: `${pct}%` }} /></div>
                  {h.belowMin && <p className="hk-warn">Below the minimum of {settings.min}</p>}
                  {mine.length === 0 ? <p className="hk-muted">No rooms yet.</p> : <ul className="hk-rooms">{mine.map(it => <RoomRow key={it.roomNumber} it={it} owner={h.userId} hks={hks} onMove={move} />)}</ul>}
                </section>
              );
            })}
          </div>
        </>
      )}

      {printing && <HkSheets dateLabel={dayText(work.date)} sheets={sheets} settings={settings} onDone={() => setPrinting(null)} />}
    </div>
  );
};

export default Housekeeping;
