// Sprint 23 / 23.1 — Housekeeping: who cleans / services which rooms, then one printed sheet per housekeeper.
//   · Day strip: the last 14 days (read-only history of what was assigned), today and tomorrow (editable).
//   · Left card = all staff (search, scroll, Add) · right card = who is working + the rules (minimum / maximum workload, weights).
//   · Rooms are small cards. Adding or removing a housekeeper re-balances automatically (same floor → same person where possible, cards glide
//     into place); drag a card (or tap it, then "Move here") to place it by hand — a hand-placed card is pinned and left alone by the balancer.
//   · Dev ("Full" view) additionally sees the guest on each card (current guest, or the last stay for a dirty vacant room) and balancer details.
// Data is read once on open / refresh — no timers.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../auth';
import { DEFAULT_ALLOWANCE, addDays, normFloor, floorLabel } from '../Forecast/forecastModel';
import { CountUp } from '../shared/CountUp';
import useFlip from '../shared/useFlip';
import HkSheets from './HkSheets';
import { buildWorkList, summarize, balance, warnings, reconcile, toAssignments, weightOf, DEFAULT_SETTINGS } from './hkWork';
import './Housekeeping.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const parts = (ymd) => { const d = new Date(Date.parse(ymd + 'T12:00:00Z')); return { wd: WD[d.getUTCDay()], m: MONTHS[d.getUTCMonth()], d: d.getUTCDate() }; };
const dayText = (ymd) => { if (!ymd) return ''; const p = parts(ymd); return `${p.wd}, ${p.m} ${p.d}`; };
const fmt = (n) => (Math.round(n * 10) / 10).toString();
const HK_DEPT = /housekeep/i;
const HISTORY_DAYS = 14;
const floorRank = (f) => (f === 'G' ? -1 : parseInt(f, 10) || 99);

/** Group room cards under their floor. */
const byFloor = (cards) => {
  const m = new Map();
  cards.forEach(c => { if (!m.has(c.floorId)) m.set(c.floorId, { floorId: c.floorId, label: c.floorLabel, cards: [] }); m.get(c.floorId).cards.push(c); });
  return [...m.values()].sort((a, b) => floorRank(a.floorId) - floorRank(b.floorId));
};

const Toggle = ({ on, onChange, children }) => (
  <button type="button" role="switch" aria-checked={on} className={`hk-switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
    <span className="hk-switch-track"><span className="hk-switch-knob" /></span>{children}
  </button>
);

/** Left card: every staff member, searchable, scrollable; Add puts them on the right. */
const StaffCard = ({ staff, chosen, onAdd, disabled }) => {
  const [q, setQ] = useState('');
  const hasHk = staff.some(s => HK_DEPT.test(s.department || ''));
  const [onlyHk, setOnlyHk] = useState(true);
  const restrict = onlyHk && hasHk;
  const taken = useMemo(() => new Set(chosen.map(c => c.userId)), [chosen]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return staff.filter(s => (!restrict || HK_DEPT.test(s.department || '')) && (!needle || s.name.toLowerCase().includes(needle))).sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, q, restrict]);
  return (
    <section className="hk-panel hk-staff" aria-label="Staff">
      <div className="hk-panel-head"><h2>Staff</h2><span className="hk-count">{list.length}</span></div>
      <input id="hk-search" className="hk-input" type="search" placeholder="Search by name…" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
      {hasHk && <Toggle on={onlyHk} onChange={setOnlyHk}>Housekeeping department only</Toggle>}
      <ul className="hk-staff-list" aria-label="Staff list">
        {list.length === 0 && <li className="hk-empty">{staff.length === 0 ? 'No staff loaded.' : 'No one matches.'}</li>}
        {list.map(s => {
          const added = taken.has(s.user_id);
          return (
            <li key={s.user_id} className={added ? 'added' : ''}>
              <span className="hk-staff-name">{s.name}<small>{s.department || '—'}</small></span>
              <button type="button" className="hk-btn hk-btn-sm" disabled={added || disabled} aria-label={added ? `${s.name} is working` : `Add ${s.name}`} onClick={() => onAdd({ userId: s.user_id, name: s.name })}>{added ? 'Added ✓' : 'Add'}</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const NumField = ({ label, value, onChange, min, max, step, disabled }) => (
  <label className="hk-field">{label}<input className="hk-input hk-num-in" type="number" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} /></label>
);

/** One small room card. Draggable; tap selects it (then "Move here" on a column). */
const RoomCard = ({ it, pinned, selected, guest, dev, readOnly, onSelect, onDragStart, onDragEnd, onUnpin }) => (
  <div
    className={`hk-rc hk-rc-${it.kind}${it.priority ? ' prio' : ''}${pinned ? ' pinned' : ''}${selected ? ' selected' : ''}${it.tbd ? ' tbd' : ''}${dev && guest ? ' withguest' : ''}`}
    data-flip={it.roomNumber} data-room={it.roomNumber}
    draggable={!readOnly}
    role={readOnly ? undefined : 'button'} tabIndex={readOnly ? undefined : 0} aria-pressed={readOnly ? undefined : !!selected}
    aria-label={`${it.tbd ? 'Room to be assigned' : 'Room ' + it.roomNumber}, ${it.typeCode || ''}, ${it.kind === 'clean' ? 'clean' : 'stay-over service'}${it.priority ? ', clean first' : ''}`}
    title={`${it.tbd ? 'Room not assigned yet' : 'Room ' + it.roomNumber} · ${it.typeCode} · ${it.why || (it.kind === 'clean' ? 'Clean' : 'Service')}${guest ? ' · ' + guest : ''}`}
    onClick={() => !readOnly && onSelect(it.roomNumber)}
    onKeyDown={(e) => { if (!readOnly && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(it.roomNumber); } }}
    onDragStart={(e) => onDragStart(e, it.roomNumber)} onDragEnd={onDragEnd}
  >
    <span className="hk-rc-top"><strong>{it.tbd ? 'TBD' : it.roomNumber}</strong>{it.priority && <i className="hk-rc-star" aria-hidden="true">★</i>}</span>
    <small>{it.typeCode}{it.kind === 'service' ? ' · svc' : ''}</small>
    {dev && guest && <em className="hk-rc-guest">{guest}</em>}
    {pinned && !readOnly && <button type="button" className="hk-rc-pin" aria-label={`Let the balancer move room ${it.roomNumber}`} title="Placed by hand — click to let the balancer move it" onClick={(e) => { e.stopPropagation(); onUnpin(it.roomNumber); }}>●</button>}
  </div>
);

const Housekeeping = ({ mode = 'manager' }) => {
  const dev = mode === 'dev';
  const [payload, setPayload] = useState(null);
  const [live, setLive] = useState(null);
  const [allowance, setAllowance] = useState(DEFAULT_ALLOWANCE);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);              // −14 … +1 (negative = history, read-only)
  const [hks, setHks] = useState([]);
  const [pinned, setPinned] = useState({});             // { room: userId | null } — placed by hand
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);
  const [planFor, setPlanFor] = useState(null);
  const [past, setPast] = useState(null);               // saved plan shown for a history day
  const [plans, setPlans] = useState([]);               // days that have a saved plan
  const [printing, setPrinting] = useState(null);
  const [selected, setSelected] = useState(null);
  const [over, setOver] = useState(null);
  const [lastStays, setLastStays] = useState({});
  const dragRef = useRef(null);
  const boardRef = useRef(null);
  const stripRef = useRef(null);
  useFlip(boardRef);

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

  const today = (live && live.forecastDate) || (payload && payload.forecastDate) || '';
  const date = today ? addDays(today, offset) : '';
  const readOnly = offset < 0;

  const loadPlans = useCallback(async () => {
    if (!today) return;
    const { ok, data } = await apiFetch(`/admin/housekeeping/plans?from=${addDays(today, -HISTORY_DAYS)}&to=${addDays(today, 1)}`);
    if (ok && data?.success) setPlans(data.plans || []);
  }, [today]);
  useEffect(() => { loadPlans(); }, [loadPlans]);
  useEffect(() => { if (stripRef.current) stripRef.current.scrollLeft = stripRef.current.scrollWidth; }, [today, plans.length]);

  // today / tomorrow: the work list from the room board; history: the saved cards only
  const work = useMemo(() => (readOnly ? { date, offset, items: [], unplaced: { clean: 0, service: 0 } } : buildWorkList({ payload, live, allowance, offset })), [payload, live, allowance, offset, readOnly, date]);
  const pastItems = useMemo(() => {
    if (!past) return [];
    return past.assignments.flatMap(a => a.rooms.map(r => { const f = normFloor(null, r.roomNumber); return { roomNumber: r.roomNumber, typeCode: r.typeCode || '', floorId: f, floorLabel: floorLabel(f), kind: r.kind, why: r.why || '', priority: !!r.priority, tbd: false, _owner: a.userId }; }));
  }, [past]);
  const items = readOnly ? pastItems : work.items;
  const itemByRoom = useMemo(() => new Map(items.map(i => [i.roomNumber, i])), [items]);

  // load the saved plan for the chosen day
  useEffect(() => {
    if (!date || planFor === date) return undefined;
    let alive = true;
    (async () => {
      const { ok, data } = await apiFetch(`/admin/housekeeping/plan?date=${date}`);
      if (!alive) return;
      const saved = ok && data?.success ? data.plan : null;
      setSelected(null);
      if (readOnly) {
        setPast(saved ? { assignments: saved.assignments || [], settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) }, updatedAt: saved.updatedAt } : null);
        setHks([]); setPinned({}); setSavedAt(saved ? saved.updatedAt : null); setDirty(false); setSaveMsg(null);
      } else {
        setPast(null);
        const r = reconcile(saved, work.items);
        setHks(r.hks); setPinned(r.pinned); setSettings({ ...DEFAULT_SETTINGS, ...((saved && saved.settings) || {}) });
        setSavedAt(saved ? saved.updatedAt : null); setDirty(false); setSaveMsg(null);
      }
      setPlanFor(date);
    })();
    return () => { alive = false; };
  }, [date, planFor, readOnly, work]);

  // pins for rooms that no longer need work are forgotten
  useEffect(() => {
    if (readOnly) return;
    setPinned(prev => { const n = {}; let ch = false; Object.keys(prev).forEach(k => { if (itemByRoom.has(k)) n[k] = prev[k]; else ch = true; }); return ch ? n : prev; });
  }, [itemByRoom, readOnly]);

  // dev: the last stay in each dirty vacant room (one request per day, dev only)
  const dirtyVacant = useMemo(() => (dev && !readOnly ? work.items.filter(i => !i.tbd && i.kind === 'clean' && /^(Dirty|In progress)/.test(i.why || '')).map(i => i.roomNumber) : []), [dev, readOnly, work]);
  useEffect(() => {
    if (!dirtyVacant.length) return undefined;
    let alive = true;
    (async () => {
      const { ok, data } = await apiFetch(`/dev/rooms/last-stays?rooms=${encodeURIComponent(dirtyVacant.slice(0, 200).join(','))}`);
      if (alive && ok && data?.success) setLastStays(data.stays || {});
    })();
    return () => { alive = false; };
  }, [dirtyVacant]);
  const guestOf = useCallback((room) => {
    if (!dev) return null;
    const g = ((payload && payload.reservations) || []).filter(r => r.status === 'INH' && String(r.roomNumber) === room).sort((a, b) => String(b.departureDate).localeCompare(String(a.departureDate)))[0];
    if (g) return `${g.guestName || '(no name)'}${g.confirmationId ? ' · ' + g.confirmationId : ''}`;
    const l = lastStays[room];
    return l ? `last: ${l.guest_name || '(no name)'}` : null;
  }, [dev, payload, lastStays]);

  // the balancer runs on EVERY change of people / rules / pins / rooms
  const hkIds = hks.map(h => h.userId).join('|');
  const assign = useMemo(() => (readOnly ? Object.fromEntries(pastItems.map(i => [i.roomNumber, i._owner])) : balance(work.items, hks, pinned, settings)),
    [readOnly, pastItems, work, hkIds, pinned, settings]);   // eslint-disable-line react-hooks/exhaustive-deps
  const viewHks = useMemo(() => (readOnly ? (past ? past.assignments.map(a => ({ userId: a.userId, name: a.name })) : []) : hks), [readOnly, past, hks]);
  const viewSettings = readOnly && past ? past.settings : settings;
  const sum = useMemo(() => summarize(items, assign, viewHks, viewSettings), [items, assign, viewHks, viewSettings]);
  const totalUnits = items.reduce((n, i) => n + weightOf(i, viewSettings), 0);
  const warn = useMemo(() => warnings(sum, totalUnits, viewSettings), [sum, totalUnits, viewSettings]);
  const cleanN = items.filter(i => i.kind === 'clean').length, serviceN = items.length - cleanN;

  const touch = () => { setDirty(true); setSaveMsg(null); };
  const addHk = (h) => { setHks(prev => (prev.some(x => x.userId === h.userId) ? prev : [...prev, h])); touch(); };
  const removeHk = (id) => { setHks(prev => prev.filter(h => h.userId !== id)); setPinned(prev => { const n = {}; Object.keys(prev).forEach(k => { if (prev[k] !== id) n[k] = prev[k]; }); return n; }); touch(); };
  const moveCard = (room, id) => { if (readOnly || !room || !itemByRoom.has(room)) return; setPinned(prev => ({ ...prev, [room]: id })); setSelected(null); touch(); };
  const unpin = (room) => { setPinned(prev => { const n = { ...prev }; delete n[room]; return n; }); touch(); };
  const resetManual = () => { setPinned({}); setSelected(null); touch(); };
  const setNum = (k, v) => { const n = Number(v); if (Number.isFinite(n)) { setSettings(s => ({ ...s, [k]: n })); touch(); } };

  const save = useCallback(async () => {
    const body = { date: work.date, settings, assignments: toAssignments(work.items, assign, hks, pinned) };
    const { ok, data } = await apiFetch('/admin/housekeeping/plan', { method: 'PUT', body: JSON.stringify(body) });
    if (ok && data?.success) { setDirty(false); setSavedAt(data.updatedAt); setSaveMsg({ ok: true, text: 'Saved' }); loadPlans(); return true; }
    setSaveMsg({ ok: false, text: data?.message || 'Could not save' }); return false;
  }, [work, settings, assign, hks, pinned, loadPlans]);

  const printNow = async (who) => {
    if (viewHks.length === 0) return;
    if (!readOnly && (dirty || !savedAt)) { if (!(await save())) return; }
    setPrinting(who);
  };
  const chooseDay = (n) => { if (n === offset) return; if (dirty && !window.confirm('You have unsaved changes for this day. Switch anyway?')) return; setOffset(n); setPlanFor(null); setSelected(null); };

  const sheets = useMemo(() => {
    if (!printing) return [];
    const rows = readOnly
      ? past.assignments.map(a => ({ userId: a.userId, name: a.name, rooms: a.rooms.map(r => ({ ...itemByRoom.get(r.roomNumber), ...r })) }))
      : toAssignments(work.items, assign, hks, pinned).map(a => ({ userId: a.userId, name: a.name, rooms: a.rooms.map(r => ({ ...itemByRoom.get(r.roomNumber), ...r })) }));
    return rows.filter(a => printing === 'all' || a.userId === printing);
  }, [printing, readOnly, past, work, assign, hks, pinned, itemByRoom]);

  // ── drag & drop (HTML5) + tap-to-move for touch ──
  const onDragStart = (e, room) => { dragRef.current = room; setSelected(null); try { e.dataTransfer.setData('text/plain', room); e.dataTransfer.effectAllowed = 'move'; } catch { /* some browsers */ } };
  const onDragEnd = () => { dragRef.current = null; setOver(null); };
  const dropOn = (id) => (e) => { e.preventDefault(); const room = dragRef.current || (e.dataTransfer && e.dataTransfer.getData('text/plain')); dragRef.current = null; setOver(null); moveCard(room, id); };
  const zone = (key, id) => ({ onDragOver: (e) => { if (readOnly) return; e.preventDefault(); if (over !== key) setOver(key); }, onDragLeave: () => setOver(o => (o === key ? null : o)), onDrop: dropOn(id) });

  const poolCards = items.filter(i => !assign[i.roomNumber]);
  const cardEl = (it) => (
    <RoomCard key={it.roomNumber} it={it} pinned={Object.prototype.hasOwnProperty.call(pinned, it.roomNumber)} selected={selected === it.roomNumber} guest={guestOf(it.roomNumber)} dev={dev} readOnly={readOnly}
      onSelect={(r) => setSelected(s => (s === r ? null : r))} onDragStart={onDragStart} onDragEnd={onDragEnd} onUnpin={unpin} />
  );
  const renderCards = (cards) => byFloor(cards).map(f => (
    <div className="hk-floor" key={f.floorId}><span className="hk-floor-label">{f.label}</span><div className="hk-cards">{f.cards.map(cardEl)}</div></div>
  ));
  const planByDate = useMemo(() => new Map(plans.map(p => [p.date, p])), [plans]);
  const days = useMemo(() => (today ? Array.from({ length: HISTORY_DAYS + 2 }, (_, i) => i - HISTORY_DAYS) : []), [today]);
  const selOwner = selected ? assign[selected] || null : null;

  return (
    <div className="hk-page-wrap">
      <header className="hk-header">
        <div><h1>Housekeeping</h1><p className="hk-sub">Pick who is working — rooms are shared out automatically. Drag a card to change it, then print one sheet per housekeeper.</p></div>
        <div className="hk-actions">
          <button type="button" className="hk-btn" onClick={() => { loadAll(); loadPlans(); }} disabled={loading}>Refresh rooms</button>
          {!readOnly && <button type="button" className="hk-btn hk-btn-primary" onClick={save} disabled={!dirty || hks.length === 0}>{dirty ? 'Save' : 'Saved'}</button>}
          <button type="button" className="hk-btn hk-btn-dark" onClick={() => printNow('all')} disabled={viewHks.length === 0}>Print all sheets</button>
        </div>
      </header>

      <div className="hk-strip-wrap">
        <div className="hk-strip" ref={stripRef} role="tablist" aria-label="Day">
          {days.map(n => {
            const ymd = addDays(today, n), p = parts(ymd), pl = planByDate.get(ymd);
            const label = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : p.wd;
            return (
              <button key={n} type="button" role="tab" aria-selected={offset === n} className={`hk-day${offset === n ? ' on' : ''}${n < 0 ? ' past' : ''}${pl ? ' has' : ''}`} onClick={() => chooseDay(n)} title={n < 0 ? (pl ? `${pl.hks} housekeepers · ${pl.rooms} rooms (read-only)` : 'No plan was saved') : undefined}>
                <b>{label}</b><span>{p.m} {p.d}</span>
                <small>{pl ? `${pl.hks} HK · ${pl.rooms} rooms` : n < 0 ? 'no plan' : ''}</small>
              </button>
            );
          })}
        </div>
        <span className="hk-savestate" role="status">{readOnly ? 'History — read-only' : saveMsg ? <span className={saveMsg.ok ? 'ok' : 'bad'}>{saveMsg.text}</span> : dirty ? 'Unsaved changes' : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not saved yet'}</span>
      </div>

      {error && <p className="hk-error" role="alert">{error}</p>}
      {loading && <p className="hk-muted">Loading rooms…</p>}

      {!loading && payload && (
        <>
          <section className="hk-statbar" aria-label="Workload">
            <div><span>To clean</span><strong><CountUp value={cleanN} animKey={date} /></strong></div>
            <div><span>To service</span><strong><CountUp value={serviceN} animKey={date} /></strong></div>
            <div><span>Workload</span><strong>{fmt(totalUnits)}</strong></div>
            <div><span>Housekeepers</span><strong><CountUp value={viewHks.length} animKey={date} /></strong></div>
            <div><span>Each (avg)</span><strong>{viewHks.length ? fmt(totalUnits / viewHks.length) : '—'}</strong></div>
          </section>

          {!readOnly && (
            <div className="hk-two">
              <StaffCard staff={staff} chosen={hks} onAdd={addHk} disabled={readOnly} />
              <section className="hk-panel hk-working" aria-label="Working">
                <div className="hk-panel-head"><h2>Working {offset === 0 ? 'today' : 'tomorrow'}</h2><span className="hk-count">{hks.length}</span></div>
                <ul className="hk-working-list">
                  {hks.length === 0 && <li className="hk-empty">Add housekeepers from the list on the left.</li>}
                  {hks.map(h => {
                    const row = sum.hks.find(x => x.userId === h.userId) || { rooms: 0, units: 0 };
                    return (
                      <li key={h.userId} className={warn.perHk[h.userId] ? `flag-${warn.perHk[h.userId]}` : ''}>
                        <span className="hk-staff-name">{h.name}<small>{row.rooms} rooms · workload {fmt(row.units)}</small></span>
                        <button type="button" className="hk-x" aria-label={`Remove ${h.name}`} onClick={() => removeHk(h.userId)}>×</button>
                      </li>
                    );
                  })}
                </ul>
                <div className="hk-rules">
                  <NumField label="Min" value={settings.min} min={1} max={100} step={1} onChange={(v) => setNum('min', v)} />
                  <NumField label="Max" value={settings.max} min={1} max={200} step={1} onChange={(v) => setNum('max', v)} />
                  <NumField label="Clean =" value={settings.cleanWeight} min={0.1} max={5} step={0.1} onChange={(v) => setNum('cleanWeight', v)} />
                  <NumField label="Service =" value={settings.serviceWeight} min={0} max={5} step={0.1} onChange={(v) => setNum('serviceWeight', v)} />
                  <button type="button" className="hk-btn hk-btn-sm" onClick={resetManual} disabled={Object.keys(pinned).length === 0}>Reset hand-placed ({Object.keys(pinned).length})</button>
                </div>
              </section>
            </div>
          )}

          {!readOnly && warn.overall && <p className="hk-warnbar" role="alert">{warn.overall}</p>}
          {readOnly && !past && <p className="hk-muted">Nothing was saved for {dayText(date)}.</p>}
          {!readOnly && items.length === 0 && <p className="hk-muted">Nothing to clean or service for this day.</p>}

          {items.length > 0 && (
            <div className={`hk-board${dev ? ' dev' : ''}`} ref={boardRef}>
              {!readOnly && (
                <section className={`hk-col hk-pool${over === 'pool' ? ' over' : ''}`} aria-label="Unassigned rooms" {...zone('pool', null)}>
                  <div className="hk-col-head"><h2>Not assigned</h2><span className="hk-count">{poolCards.length}</span></div>
                  {selected && selOwner && <button type="button" className="hk-btn hk-btn-sm hk-here" onClick={() => moveCard(selected, null)}>Move here</button>}
                  {poolCards.length === 0 ? <p className="hk-muted">Everything is assigned.</p> : renderCards(poolCards)}
                </section>
              )}
              {sum.hks.map(h => {
                const mine = items.filter(i => assign[i.roomNumber] === h.userId);
                const pct = Math.min(100, viewSettings.max > 0 ? (h.units / viewSettings.max) * 100 : 100), minPct = Math.min(100, (viewSettings.min / viewSettings.max) * 100);
                const flag = warn.perHk[h.userId];
                return (
                  <section key={h.userId} className={`hk-col${over === h.userId ? ' over' : ''}${flag ? ` flag-${flag}` : ''}`} aria-label={`${h.name}'s rooms`} {...zone(h.userId, h.userId)}>
                    <div className="hk-col-head">
                      <h2>{h.name}</h2>
                      <button type="button" className="hk-btn hk-btn-sm" onClick={() => printNow(h.userId)} disabled={mine.length === 0}>Print sheet</button>
                    </div>
                    <p className="hk-col-sum"><strong>{h.rooms}</strong> rooms · {h.clean} clean · {h.service} service · workload <strong>{fmt(h.units)}</strong></p>
                    <div className="hk-meter" title={`Minimum ${viewSettings.min} · maximum ${viewSettings.max}`}><span className={flag || ''} style={{ width: `${pct}%` }} /><i style={{ left: `${minPct}%` }} /></div>
                    {flag === 'over' && <p className="hk-warn">Over the maximum of {viewSettings.max}</p>}
                    {flag === 'under' && <p className="hk-warn">Below the minimum of {viewSettings.min}</p>}
                    {selected && !readOnly && selOwner !== h.userId && <button type="button" className="hk-btn hk-btn-sm hk-here" onClick={() => moveCard(selected, h.userId)}>Move here</button>}
                    {mine.length === 0 ? <p className="hk-muted">No rooms yet.</p> : renderCards(mine)}
                  </section>
                );
              })}
            </div>
          )}

          {dev && !readOnly && items.length > 0 && (
            <p className="hk-devnote" aria-label="Balancer details">DEV · total workload {fmt(totalUnits)} · {hks.length || 0} housekeeper(s) · target {hks.length ? fmt(totalUnits / hks.length) : '—'} each · hand-placed {Object.keys(pinned).length} · cuts snap to floor boundaries within 20% of a share unless that would exceed the max</p>
          )}
        </>
      )}

      {printing && <HkSheets dateLabel={dayText(date)} sheets={sheets} settings={viewSettings} onDone={() => setPrinting(null)} />}
    </div>
  );
};

export default Housekeeping;
