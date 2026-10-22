// Sprint 23 / 23.7 — Housekeeping: who cleans / services which rooms, then one printed sheet per housekeeper.
//   · Day strip: the last 14 days (read-only history of what was assigned), today and tomorrow (editable).
//   · Left card = all staff (search, scroll, Add) · right card = who is working + the rules (minimum / maximum workload, weights).
//   · Rooms are small cards. Nothing is assigned by itself: add the people, then press "Auto-assign" (same floor → same person where possible, cards
//     glide into place) or drag cards (or tap one, then "Move here") — a hand-placed card is pinned and Auto-assign leaves it alone. "Reset" (asks first)
//     hands everything back to the pool.
//   · Dev ("Full" view) additionally sees the guest on each card (current guest, or the last stay for a dirty vacant room), balancer details and a
//     table of every room with who is cleaning it.
// Data is read once on open / refresh — no timers.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../auth';
import { DEFAULT_ALLOWANCE, addDays, normFloor, floorLabel } from '../Forecast/forecastModel';
import { CountUp } from '../shared/CountUp';
import useFlip from '../shared/useFlip';
import { buildRoomSheet } from '../Forecast/roomSheet';
import HkSheets from './HkSheets';
import HkRoomTable from './HkRoomTable';
import HkPrintColors from './HkPrintColors';
import ConfirmModal from '../shared/ConfirmModal';
import { buildWorkList, summarize, balance, warnings, reconcile, resolveAssign, toAssignments, weightOf, parseColors, DEFAULT_SETTINGS } from './hkWork';
import './Housekeeping.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const parts = (ymd) => { const d = new Date(Date.parse(ymd + 'T12:00:00Z')); return { wd: WD[d.getUTCDay()], m: MONTHS[d.getUTCMonth()], d: d.getUTCDate() }; };
const dayText = (ymd) => { if (!ymd) return ''; const p = parts(ymd); return `${p.wd}, ${p.m} ${p.d}`; };
const fmt = (n) => (Math.round(n * 10) / 10).toString();
const HK_DEPT = /housekeep/i;
const HISTORY_DAYS = 14;
const floorRank = (f) => (f === 'G' ? -1 : parseInt(f, 10) || 99);

/** Group room cards under their floor. */
// Not assigned always shows these floors ("none" when empty); any other floor with cards (e.g. reservations without a room yet) is added after them
const PRESET_FLOORS = ['G', '1', '2', '3', '4'];
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

/** "No name" mode: how many housekeepers are working. − / + only change the number in the box; Start / Update shares the rooms out. */
const clampCount = (v) => Math.max(1, Math.min(40, Math.floor(Number(v)) || 1));
const CountCard = ({ count, draft, setDraft, onApply, disabled }) => {
  const n = clampCount(draft), started = !!count;
  return (
    <section className="hk-panel hk-staff hk-countcard" aria-label="How many housekeepers">
      <div className="hk-panel-head"><h2>How many housekeepers?</h2></div>
      <div className="hk-count-main">
        <div className="hk-stepper">
          <button type="button" className="hk-btn hk-step" aria-label="One fewer" disabled={disabled || n <= 1} onClick={() => setDraft(String(clampCount(n - 1)))}>−</button>
          <input className="hk-input hk-count-input" type="number" min="1" max="40" step="1" aria-label="Number of housekeepers" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onApply(draft); }} />
          <button type="button" className="hk-btn hk-step" aria-label="One more" disabled={disabled || n >= 40} onClick={() => setDraft(String(clampCount(n + 1)))}>+</button>
        </div>
        <div className="hk-people" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} className={started && i < count ? 'on' : ''} />)}</div>
      </div>
      <button type="button" className="hk-btn hk-btn-primary hk-count-go" onClick={() => onApply(draft)} disabled={disabled || (started && n === count)}>{started ? 'Update' : 'Start'}</button>
    </section>
  );
};

const NumField = ({ label, value, onChange, min, max, step, disabled }) => (
  <label className="hk-field">{label}<input className="hk-input hk-num-in" type="number" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} /></label>
);

/** One small room card. Draggable; click selects it (Ctrl/⌘-click adds or removes, Shift-click selects a range); right-click opens a "Move to" menu. */
const RoomCard = ({ it, pinned, selected, justMoved, guest, dev, readOnly, onSelect, onDragStart, onDragEnd, onUnpin, onMenu }) => (
  <div
    className={`hk-rc hk-rc-${it.kind}${it.priority ? ' prio' : ''}${pinned ? ' pinned' : ''}${selected ? ' selected' : ''}${justMoved ? ' just-moved' : ''}${it.tbd ? ' tbd' : ''}${dev && guest ? ' withguest' : ''}`}
    data-flip={it.roomNumber} data-room={it.roomNumber}
    draggable={!readOnly}
    role={readOnly ? undefined : 'button'} tabIndex={readOnly ? undefined : 0} aria-pressed={readOnly ? undefined : !!selected}
    aria-label={`${it.tbd ? 'Room to be assigned' : 'Room ' + it.roomNumber}, ${it.typeCode || ''}, ${it.kind === 'clean' ? 'clean' : 'stay-over service'}${it.priority ? ', clean first' : ''}${it.locked ? ', guest asked not to be moved' : ''}`}
    title={`${it.tbd ? 'Room not assigned yet' : 'Room ' + it.roomNumber} · ${it.typeCode} · ${it.why || (it.kind === 'clean' ? 'Clean' : 'Service')}${guest ? ' · ' + guest : ''}`}
    onClick={(e) => !readOnly && onSelect(it.roomNumber, e)}
    onContextMenu={(e) => { if (!readOnly) onMenu(e, it.roomNumber); }}
    onKeyDown={(e) => { if (!readOnly && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(it.roomNumber, e); } }}
    onDragStart={(e) => onDragStart(e, it.roomNumber)} onDragEnd={onDragEnd}
  >
    <span className="hk-rc-top"><strong>{it.tbd ? 'TBD' : it.roomNumber}</strong><span className="hk-rc-marks">{it.locked && <i className="hk-rc-lock" title="Guest asked not to be moved" aria-hidden="true">⚑</i>}{it.priority && <i className="hk-rc-star" aria-hidden="true">★</i>}</span></span>
    <small>{it.typeCode}</small>
    {dev && guest && <em className="hk-rc-guest">{guest}</em>}
    {pinned && !readOnly && <button type="button" className="hk-rc-pin" aria-label={`Let the balancer move room ${it.roomNumber}`} title="Placed by hand — click to let the balancer move it" onClick={(e) => { e.stopPropagation(); onUnpin(it.roomNumber); }}>●</button>}
  </div>
);

/** Right-click menu: move the selected cards to a group, copy them, or paste copied ones here. */
const CardMenu = ({ menu, hks, canPaste, clipCount, onMove, onCopy, onPaste, onClose }) => {
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key); window.addEventListener('blur', onClose);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  const x = Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 230), y = Math.min(menu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 60 - 34 * (hks.length + 3));
  const n = menu.rooms.length;
  return (
    <ul className="hk-menu" role="menu" ref={ref} style={{ left: Math.max(8, x), top: Math.max(8, y) }}>
      {n > 0 && <li className="hk-menu-head">{n} card{n === 1 ? '' : 's'}</li>}
      {n > 0 && <li role="none"><button type="button" role="menuitem" onClick={() => onCopy(menu.rooms)}>Copy <kbd>Ctrl/⌘ C</kbd></button></li>}
      {n > 0 && <li className="hk-menu-sep" role="separator" />}
      {n > 0 && <li className="hk-menu-sub">Move to</li>}
      {n > 0 && <li role="none"><button type="button" role="menuitem" onClick={() => onMove(menu.rooms, null)}>Not assigned</button></li>}
      {n > 0 && hks.map(h => <li role="none" key={h.userId}><button type="button" role="menuitem" onClick={() => onMove(menu.rooms, h.userId)}>{h.name}</button></li>)}
      {menu.group !== undefined && canPaste && <li role="none"><button type="button" role="menuitem" onClick={() => onPaste(menu.group)}>Paste {clipCount} card{clipCount === 1 ? '' : 's'} here <kbd>Ctrl/⌘ V</kbd></button></li>}
    </ul>
  );
};

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
  const [auto, setAuto] = useState({});                 // { room: userId } — handed out by the Auto-assign button
  const [resetAsk, setResetAsk] = useState(false);
  const [anon, setAnon] = useState(false);              // plan by NUMBER of housekeepers (no names)
  const [anonCount, setAnonCount] = useState(null);     // null = not asked yet
  const [countDraft, setCountDraft] = useState('3');
  const [colors, setColors] = useState(() => parseColors(null));   // print colours (dev can change them)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);
  const [planFor, setPlanFor] = useState(null);
  const [past, setPast] = useState(null);               // saved plan shown for a history day
  const [plans, setPlans] = useState([]);               // days that have a saved plan
  const [printing, setPrinting] = useState(null);
  const [selected, setSelected] = useState([]);       // selected cards (Ctrl/⌘-click adds)
  const [clip, setClip] = useState([]);                 // copied cards, waiting to be pasted into a group
  const [menu, setMenu] = useState(null);               // right-click menu { x, y, rooms, group? }
  const [ask, setAsk] = useState(null);                 // in-app confirm dialog
  const [vstart, setVstart] = useState(0);              // first housekeeper column in view (carousel)
  const hoverGroup = useRef(undefined);                  // group under the mouse (for paste): housekeeper id | null (= Not assigned)
  const lastGroup = useRef(undefined);
  const [over, setOver] = useState(null);
  const [lastStays, setLastStays] = useState({});
  const [lockedRooms, setLockedRooms] = useState([]);
  const [justMoved, setJustMoved] = useState([]);
  const dragRef = useRef(null);
  const skipFlip = useRef(false);
  const boardRef = useRef(null);
  const stripRef = useRef(null);
  useFlip(boardRef, skipFlip);

  const loadAll = useCallback(async () => {
    setError(null);
    const [cur, lv, st, emp] = await Promise.all([apiFetch('/admin/forecast/current'), apiFetch('/admin/forecast/live'), apiFetch('/admin/settings'), apiFetch('/admin/employees')]);
    if (cur.ok && cur.data?.success && cur.data.snapshot) setPayload(cur.data.snapshot.payload); else setError(cur.data?.message || 'Could not load the room data.');
    if (lv.ok && lv.data?.success) setLive(lv.data.live);
    const s = st.ok && st.data && st.data.settings;
    if (s) {
      setColors(parseColors(s.hk_print_colors));
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
  // rooms guests asked not to be moved out of (rGuest "Do not move") — cleaned first; read from what the detail job already stored
  useEffect(() => {
    if (!date || readOnly) { setLockedRooms([]); return undefined; }
    let alive = true;
    (async () => {
      const { ok, data } = await apiFetch(`/admin/housekeeping/locked-rooms?date=${date}`);
      if (alive) setLockedRooms(ok && data?.success ? data.rooms || [] : []);
    })();
    return () => { alive = false; };
  }, [date, readOnly]);
  const work = useMemo(() => (readOnly ? { date, offset, items: [], unplaced: { clean: 0, service: 0 } } : buildWorkList({ payload, live, allowance, offset, lockedRooms })), [payload, live, allowance, offset, readOnly, date, lockedRooms]);
  const pastItems = useMemo(() => {
    if (!past) return [];
    return past.assignments.flatMap(a => a.rooms.map(r => { const f = normFloor(null, r.roomNumber); return { roomNumber: r.roomNumber, typeCode: r.typeCode || '', floorId: f, floorLabel: floorLabel(f), kind: r.kind, why: r.why || '', priority: !!r.priority, tbd: false, cat: r.cat, stay: r.stay, _owner: a.userId }; }));
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
      setSelected([]);
      if (readOnly) {
        setPast(saved ? { assignments: saved.assignments || [], settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) }, updatedAt: saved.updatedAt } : null);
        setHks([]); setPinned({}); setSavedAt(saved ? saved.updatedAt : null); setDirty(false); setSaveMsg(null);
      } else {
        setPast(null);
        const r = reconcile(saved, work.items);
        const isAnon = !!(saved && saved.settings && saved.settings.anonymous);
        setAnon(isAnon); setAnonCount(isAnon ? r.hks.length : null); setCountDraft(String(isAnon && r.hks.length ? r.hks.length : 3));
        setHks(r.hks); setPinned(r.pinned); setAuto(r.auto); setSettings({ ...DEFAULT_SETTINGS, ...((saved && saved.settings) || {}) });
        setSavedAt(saved ? saved.updatedAt : null); setDirty(false); setSaveMsg(null);
      }
      setPlanFor(date);
    })();
    return () => { alive = false; };
  }, [date, planFor, readOnly, work]);

  // pins for rooms that no longer need work are forgotten
  useEffect(() => {
    if (readOnly) return;
    const prune = (prev) => { const n = {}; let ch = false; Object.keys(prev).forEach(k => { if (itemByRoom.has(k)) n[k] = prev[k]; else ch = true; }); return ch ? n : prev; };
    setPinned(prune); setAuto(prune);
  }, [itemByRoom, readOnly]);

  // dev: the last stay in each dirty vacant room (one request per day, dev only)
  const dirtyVacant = useMemo(() => (dev && !readOnly ? work.items.filter(i => !i.tbd && i.kind === 'clean' && /^(Dirty|In progress)/.test(i.why || '')).map(i => i.roomNumber) : []), [dev, readOnly, work]);
  const dirtyKey = dirtyVacant.join(',');
  useEffect(() => {
    if (!dirtyKey) return undefined;
    let alive = true;
    (async () => {
      const { ok, data } = await apiFetch(`/dev/rooms/last-stays?rooms=${encodeURIComponent(dirtyKey.split(',').slice(0, 200).join(','))}`);
      if (alive && ok && data?.success) setLastStays(data.stays || {});
    })();
    return () => { alive = false; };
  }, [dirtyKey]);
  const guestOf = useCallback((room) => {
    if (!dev) return null;
    const g = ((payload && payload.reservations) || []).filter(r => r.status === 'INH' && String(r.roomNumber) === room).sort((a, b) => String(b.departureDate).localeCompare(String(a.departureDate)))[0];
    if (g) return `${g.guestName || '(no name)'}${g.confirmationId ? ' · ' + g.confirmationId : ''}`;
    const l = lastStays[room];
    return l ? `last: ${l.guest_name || '(no name)'}` : null;
  }, [dev, payload, lastStays]);

  // what is on screen: hand-placed cards, then what Auto-assign handed out; the rest is in the pool
  const assign = useMemo(() => (readOnly ? Object.fromEntries(pastItems.map(i => [i.roomNumber, i._owner])) : resolveAssign(work.items, hks, pinned, auto)),
    [readOnly, pastItems, work, hks, pinned, auto]);
  const viewHks = useMemo(() => (readOnly ? (past ? past.assignments.map(a => ({ userId: a.userId, name: a.name })) : []) : hks), [readOnly, past, hks]);
  const viewSettings = readOnly && past ? past.settings : settings;
  const sum = useMemo(() => summarize(items, assign, viewHks, viewSettings), [items, assign, viewHks, viewSettings]);
  const totalUnits = items.reduce((n, i) => n + weightOf(i, viewSettings), 0);
  const warn = useMemo(() => warnings(sum, totalUnits, viewSettings), [sum, totalUnits, viewSettings]);
  const cleanN = items.filter(i => i.kind === 'clean').length, serviceN = items.length - cleanN;

  // number mode: any room that is not hand-placed and not yet handed out (a new room after Refresh) is shared out right away
  useEffect(() => {
    if (!anon || readOnly || !anonCount || hks.length === 0) return;
    const waiting = work.items.some(i => !Object.prototype.hasOwnProperty.call(pinned, i.roomNumber) && !auto[i.roomNumber]);
    if (!waiting) return;
    const res = balance(work.items, hks, pinned, settings), next = {}; Object.keys(res).forEach(k => { if (!Object.prototype.hasOwnProperty.call(pinned, k)) next[k] = res[k]; });
    setAuto(next); setDirty(true);
  }, [anon, anonCount, readOnly, work, hks, pinned, auto, settings]);
  const touch = () => { setDirty(true); setSaveMsg(null); };
  const addHk = (h) => { setHks(prev => (prev.some(x => x.userId === h.userId) ? prev : [...prev, h])); touch(); };
  const removeHk = (id) => {
    const drop = (prev) => { const n = {}; Object.keys(prev).forEach(k => { if (prev[k] !== id) n[k] = prev[k]; }); return n; };
    setHks(prev => prev.filter(h => h.userId !== id)); setPinned(drop); setAuto(drop); touch();
  };
  // Auto-assign: share the rooms that are not hand-placed across everyone working (same floor → same person where possible)
  const autoAssign = () => {
    const res = balance(work.items, hks, pinned, settings), next = {};
    Object.keys(res).forEach(k => { if (!Object.prototype.hasOwnProperty.call(pinned, k)) next[k] = res[k]; });
    setAuto(next); touch();
  };
  // ── "just a number": Housekeeper 1…N, rooms handed out automatically whenever the number (or the work) changes ──
  const anonHks = (n) => Array.from({ length: n }, (_, i) => ({ userId: `anon-${i + 1}`, name: `Housekeeper ${i + 1}` }));
  const applyCount = (raw) => {
    const n = Math.max(1, Math.min(40, Math.floor(Number(raw)) || 0)); if (!n) return;
    const next = anonHks(n), ids = new Set(next.map(h => h.userId));
    const keep = (prev) => { const o = {}; Object.keys(prev).forEach(k => { if (prev[k] === null || ids.has(prev[k])) o[k] = prev[k]; }); return o; };
    const pins = keep(pinned); setHks(next); setPinned(pins); setAnonCount(n); setCountDraft(String(n));
    const res = balance(work.items, next, pins, settings), nextAuto = {}; Object.keys(res).forEach(k => { if (!Object.prototype.hasOwnProperty.call(pins, k)) nextAuto[k] = res[k]; });
    setAuto(nextAuto); touch();
  };
  const switchMode = (toAnon) => {
    if (toAnon === anon) return;
    const go = () => { setAnon(toAnon); setAnonCount(null); setHks([]); setPinned({}); setAuto({}); setSelected([]); setCountDraft('3'); touch(); };
    if (hks.length > 0 || Object.keys(pinned).length > 0) {
      setAsk({ title: `Switch to "${toAnon ? 'No name' : 'Names'}"?`, message: 'Switching clears the housekeepers and every assignment for this day.', confirmLabel: 'Switch', tone: 'danger', onConfirm: go });
    } else go();
  };
  const doReset = () => { setPinned({}); setAuto({}); setSelected([]); setResetAsk(false); touch(); };
  // move one or many cards to a housekeeper (id) or back to Not assigned (null); hand-placed from then on
  const moveCards = (rooms, id) => {
    const list = [...new Set((rooms || []).filter(r => itemByRoom.has(r)))];
    if (readOnly || !list.length) return;
    skipFlip.current = true;
    setPinned(prev => { const n = { ...prev }; list.forEach(r => { n[r] = id; }); return n; });
    setSelected([]); setMenu(null); touch(); setJustMoved(list); setTimeout(() => setJustMoved([]), 450);
  };
  // selection: click = just this card · Ctrl/⌘-click (or a touch tap) = add/remove · Shift-click = range inside the same group
  const selectCard = (room, e) => {
    const mod = !!(e && (e.metaKey || e.ctrlKey)), shift = !!(e && e.shiftKey), tap = !!(e && e.nativeEvent && e.nativeEvent.pointerType === 'touch');
    setSelected(prev => {
      if (shift && prev.length) {
        const owner = assign[room] || null, order = items.filter(i => (assign[i.roomNumber] || null) === owner).map(i => i.roomNumber);
        const a = order.indexOf(prev[prev.length - 1]), b = order.indexOf(room);
        if (a >= 0 && b >= 0) { const [lo, hi] = a < b ? [a, b] : [b, a]; return [...new Set([...prev, ...order.slice(lo, hi + 1)])]; }
      }
      if (mod || tap) return prev.includes(room) ? prev.filter(x => x !== room) : [...prev, room];
      return prev.length === 1 && prev[0] === room ? [] : [room];
    });
  };
  const copyCards = (rooms) => { setClip([...rooms]); setMenu(null); };
  const pasteTo = (group) => { if (clip.length && group !== undefined) { moveCards(clip, group); } };
  const openMenu = (e, room) => { e.preventDefault(); const rooms = selected.includes(room) ? selected : [room]; if (!selected.includes(room)) setSelected([room]); setMenu({ x: e.clientX, y: e.clientY, rooms }); };
  const openGroupMenu = (e, group) => { if (readOnly || !clip.length) return; if (e.target.closest && e.target.closest('.hk-rc')) return; e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, rooms: [], group }); };

  useEffect(() => {
    if (readOnly) return undefined;
    const onKey = (e) => {
      const t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey, k = String(e.key || '').toLowerCase();
      if (e.key === 'Escape') { setSelected([]); setMenu(null); return; }
      if (mod && k === 'c' && selected.length) { e.preventDefault(); setClip([...selected]); return; }
      if (mod && k === 'v' && clip.length) {
        const g = hoverGroup.current !== undefined ? hoverGroup.current : lastGroup.current;
        if (g !== undefined) { e.preventDefault(); moveCards(clip, g); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });   // re-bound every render: it reads the latest selection / clipboard
  const unpin = (room) => { setPinned(prev => { const n = { ...prev }; delete n[room]; return n; }); touch(); };
  const setNum = (k, v) => { const n = Number(v); if (Number.isFinite(n)) { setSettings(s => ({ ...s, [k]: n })); touch(); } };

  const save = useCallback(async () => {
    const body = { date: work.date, settings: anon ? { ...settings, anonymous: true } : settings, assignments: toAssignments(work.items, assign, hks, pinned) };
    const { ok, data } = await apiFetch('/admin/housekeeping/plan', { method: 'PUT', body: JSON.stringify(body) });
    if (ok && data?.success) { setDirty(false); setSavedAt(data.updatedAt); setSaveMsg({ ok: true, text: 'Saved' }); loadPlans(); return true; }
    setSaveMsg({ ok: false, text: data?.message || 'Could not save' }); return false;
  }, [work, settings, anon, assign, hks, pinned, loadPlans]);

  const printNow = async (who) => {
    if (viewHks.length === 0) return;
    if (!readOnly && (dirty || !savedAt)) { if (!(await save())) return; }
    setPrinting(who);
  };
  const chooseDay = (n) => {
    if (n === offset) return;
    const go = () => { setOffset(n); setPlanFor(null); setSelected([]); setClip([]); };
    if (dirty) setAsk({ title: 'Switch day?', message: 'You have unsaved changes for this day. They will be lost.', confirmLabel: 'Switch anyway', tone: 'danger', onConfirm: go }); else go();
  };

  const sheets = useMemo(() => {
    if (!printing) return [];
    const rows = readOnly
      ? past.assignments.map(a => ({ userId: a.userId, name: a.name, rooms: a.rooms.map(r => ({ ...itemByRoom.get(r.roomNumber), ...r })) }))
      : toAssignments(work.items, assign, hks, pinned).map(a => ({ userId: a.userId, name: a.name, rooms: a.rooms.map(r => ({ ...itemByRoom.get(r.roomNumber), ...r })) }));
    return rows.filter(a => printing === 'all' || a.userId === printing);
  }, [printing, readOnly, past, work, assign, hks, pinned, itemByRoom]);

  // ── drag & drop (HTML5) + tap-to-move for touch ──
  const onDragStart = (e, room) => {
    const rooms = selected.includes(room) ? selected : [room];      // dragging a selected card takes the whole selection along
    dragRef.current = rooms;
    try { e.dataTransfer.setData('text/plain', rooms.join(',')); e.dataTransfer.effectAllowed = 'move'; } catch { /* some browsers */ }
  };
  const onDragEnd = () => { dragRef.current = null; setOver(null); };
  const dropOn = (id) => (e) => { e.preventDefault(); const rooms = dragRef.current || String((e.dataTransfer && e.dataTransfer.getData('text/plain')) || '').split(',').filter(Boolean); dragRef.current = null; setOver(null); moveCards(rooms, id); };
  const zone = (key, id) => ({
    onDragOver: (e) => { if (readOnly) return; e.preventDefault(); if (over !== key) setOver(key); },
    onDragLeave: (e) => { if (e.currentTarget.contains(e.relatedTarget)) return; setOver(o => (o === key ? null : o)); },
    onDrop: dropOn(id),
    onMouseEnter: () => { hoverGroup.current = id; }, onMouseLeave: () => { if (hoverGroup.current === id) hoverGroup.current = undefined; },
    onMouseDown: () => { lastGroup.current = id; },
    onContextMenu: (e) => openGroupMenu(e, id),
  });

  const poolCards = items.filter(i => !assign[i.roomNumber]);
  const cardEl = (it) => (
    <RoomCard key={it.roomNumber} it={it} pinned={Object.prototype.hasOwnProperty.call(pinned, it.roomNumber)} selected={selected.includes(it.roomNumber)} justMoved={justMoved.includes(it.roomNumber)} guest={guestOf(it.roomNumber)} dev={dev} readOnly={readOnly}
      onSelect={selectCard} onDragStart={onDragStart} onDragEnd={onDragEnd} onUnpin={unpin} onMenu={openMenu} />
  );
  const renderCards = (cards) => byFloor(cards).map(f => (
    <div className="hk-floor" key={f.floorId}><span className="hk-floor-label">{f.label}</span><div className="hk-cards">{f.cards.map(cardEl)}</div></div>
  ));
  // Not assigned: one block per floor, always G · 1 · 2 · 3 · 4 (and any other floor that has cards)
  const poolFloors = useMemo(() => {
    const got = new Map(byFloor(poolCards).map(f => [f.floorId, f]));
    const base = PRESET_FLOORS.map(id => got.get(id) || { floorId: id, label: floorLabel(id), cards: [] });
    const extra = [...got.values()].filter(f => !PRESET_FLOORS.includes(f.floorId));
    return [...base, ...extra];
  }, [poolCards]);   // eslint-disable-line react-hooks/exhaustive-deps
  const planByDate = useMemo(() => new Map(plans.map(p => [p.date, p])), [plans]);
  const days = useMemo(() => (today ? Array.from({ length: HISTORY_DAYS + 2 }, (_, i) => i - HISTORY_DAYS) : []), [today]);
  const needsMove = (id) => selected.length > 0 && selected.some(r => (assign[r] || null) !== id);   // would "Move here" change anything?
  // housekeeper columns: three at a time, Prev / Next slide one housekeeper
  const boardEl = useRef(null);
  const perView = () => { const b = boardEl.current, c = b && b.children[0]; return b && c && c.offsetWidth ? Math.max(1, Math.round(b.clientWidth / (c.offsetWidth + 12))) : 3; };
  const colCount = sum.hks.length;
  const goCol = (i) => {
    const next = Math.max(0, Math.min(Math.max(0, colCount - perView()), i)); setVstart(next);
    const b = boardEl.current, c = b && b.children[next];
    if (b && c) { const left = c.offsetLeft - b.offsetLeft; if (b.scrollTo) b.scrollTo({ left, behavior: 'smooth' }); else b.scrollLeft = left; }
  };
  const onBoardScroll = () => { const b = boardEl.current, c = b && b.children[0]; if (b && c && c.offsetWidth) setVstart(Math.max(0, Math.round(b.scrollLeft / (c.offsetWidth + 12)))); };
  const edgeScroll = (e) => { const b = boardEl.current; if (!b || !dragRef.current) return; const r = b.getBoundingClientRect(); if (e.clientX < r.left + 56) b.scrollLeft -= 18; else if (e.clientX > r.right - 56) b.scrollLeft += 18; };
  useEffect(() => { setVstart(v => Math.max(0, Math.min(v, Math.max(0, colCount - 3)))); }, [colCount]);
  const sheet = useMemo(() => (dev && !readOnly && payload ? buildRoomSheet(payload, live) : null), [dev, readOnly, payload, live]);

  return (
    <div className="hk-page-wrap" ref={boardRef}>
      <header className="hk-header">
        <div><h1>Housekeeping</h1><p className="hk-sub">Add who is working (or just how many), share the rooms out, drag cards to adjust, then print one sheet per housekeeper.</p></div>
        <div className="hk-actions">
          <button type="button" className="hk-btn" onClick={() => { loadAll(); loadPlans(); }} disabled={loading}>Refresh rooms</button>
          {!readOnly && <button type="button" className="hk-btn hk-btn-primary" onClick={save} disabled={!dirty || hks.length === 0}>{dirty ? 'Save' : 'Saved'}</button>}
          <button type="button" className="hk-btn hk-btn-dark" onClick={() => printNow('all')} disabled={viewHks.length === 0}>Print all sheets</button>
        </div>
      </header>

      {/* row 1: the numbers as small cards (left) · the days, a few at a time, scroll for more (right) */}
      <div className="hk-top">
        {!loading && payload ? (
          <section className="hk-stats" aria-label="Workload">
            <div className="hk-stat"><span>To clean</span><strong><CountUp value={cleanN} animKey={date} /></strong></div>
            <div className="hk-stat"><span>To service</span><strong><CountUp value={serviceN} animKey={date} /></strong></div>
            <div className="hk-stat"><span>Workload</span><strong>{fmt(totalUnits)}</strong></div>
            <div className="hk-stat"><span>Housekeepers</span><strong><CountUp value={viewHks.length} animKey={date} /></strong></div>
            <div className="hk-stat"><span>Each (avg)</span><strong>{viewHks.length ? fmt(totalUnits / viewHks.length) : '—'}</strong></div>
          </section>
        ) : <div />}
        <section className="hk-panel hk-daycard" aria-label="Days">
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
        </section>
      </div>

      {error && <p className="hk-error" role="alert">{error}</p>}
      {loading && <p className="hk-muted">Loading rooms…</p>}

      {!loading && payload && (
        <>
          {!readOnly && warn.overall && <p className="hk-warnbar" role="alert">{warn.overall}</p>}
          {readOnly && !past && <p className="hk-muted">Nothing was saved for {dayText(date)}.</p>}
          {!readOnly && items.length === 0 && <p className="hk-muted">Nothing to clean or service for this day.</p>}

          {/* row 2 (editable days): staff (wide, same height as the stack) · [working + buttons / not assigned] */}
          {!readOnly && (
            <div className="hk-modebar" role="group" aria-label="How to plan">
              <span>Plan by</span>
              <span className="hk-seg">
                <button type="button" className={!anon ? 'on' : ''} aria-pressed={!anon} onClick={() => switchMode(false)}>Names</button>
                <button type="button" className={anon ? 'on' : ''} aria-pressed={anon} onClick={() => switchMode(true)}>No name</button>
              </span>
            </div>
          )}
          {!readOnly && (
            <div className={`hk-mid${anon ? ' anon' : ''}`}>
              {anon ? <CountCard count={anonCount} draft={countDraft} setDraft={setCountDraft} onApply={applyCount} disabled={readOnly} /> : <StaffCard staff={staff} chosen={hks} onAdd={addHk} disabled={readOnly} />}
                <section className="hk-panel hk-working" aria-label="Working">
                  <div className="hk-panel-head">
                    <h2>Working {offset === 0 ? 'today' : 'tomorrow'}</h2><span className="hk-count">{hks.length}</span>
                    <div className="hk-tools">
                      <button type="button" className="hk-btn hk-btn-sm hk-btn-primary" onClick={autoAssign} disabled={hks.length === 0 || items.length === 0}>Auto-assign</button>
                      {resetAsk ? (
                        <span className="hk-confirm" role="alertdialog" aria-label="Confirm reset">Put every room back in "Not assigned"?
                          <button type="button" className="hk-btn hk-btn-sm hk-btn-danger" onClick={doReset}>Yes, reset</button>
                          <button type="button" className="hk-btn hk-btn-sm" onClick={() => setResetAsk(false)}>Cancel</button>
                        </span>
                      ) : (
                        <button type="button" className="hk-btn hk-btn-sm" onClick={() => setResetAsk(true)} disabled={poolCards.length === items.length}>Reset</button>
                      )}
                    </div>
                  </div>
                  <ul className="hk-working-list">
                    {hks.length === 0 && <li className="hk-empty">{anon ? 'Enter how many housekeepers are working.' : 'Add housekeepers from the list on the left.'}</li>}
                    {hks.map(h => {
                      const row = sum.hks.find(x => x.userId === h.userId) || { rooms: 0, units: 0 };
                      return (
                        <li key={h.userId} className={warn.perHk[h.userId] ? `flag-${warn.perHk[h.userId]}` : ''}>
                          <span className="hk-staff-name">{h.name}<small>{row.rooms} rooms · workload {fmt(row.units)}</small></span>
                          {!anon && <button type="button" className="hk-x" aria-label={`Remove ${h.name}`} onClick={() => removeHk(h.userId)}>×</button>}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="hk-rules">
                    <NumField label="Min" value={settings.min} min={1} max={100} step={1} onChange={(v) => setNum('min', v)} />
                    <NumField label="Max" value={settings.max} min={1} max={200} step={1} onChange={(v) => setNum('max', v)} />
                    <NumField label="Clean =" value={settings.cleanWeight} min={0.1} max={5} step={0.1} onChange={(v) => setNum('cleanWeight', v)} />
                    <NumField label="Service =" value={settings.serviceWeight} min={0} max={5} step={0.1} onChange={(v) => setNum('serviceWeight', v)} />
                  </div>
                </section>
                <section className={`hk-panel hk-col hk-pool${over === 'pool' ? ' over' : ''}`} aria-label="Unassigned rooms" {...zone('pool', null)}>
                  <div className="hk-col-head"><h2>Not assigned</h2><span className="hk-count">{poolCards.length}</span></div>
                  {needsMove(null) && <button type="button" className="hk-btn hk-btn-sm hk-here" onClick={() => moveCards(selected, null)}>Move {selected.length > 1 ? `${selected.length} cards ` : ''}here</button>}
                  {items.length > 0 && hks.length === 0 && <p className="hk-muted">{anon ? 'Enter how many housekeepers are working.' : 'Add a housekeeper, then Auto-assign or drag the cards.'}</p>}
                  <div className="hk-pool-floors">
                    {poolFloors.map(f => (
                      <div className="hk-floor" key={f.floorId} data-floor={f.floorId}>
                        <span className="hk-floor-label">{f.label}</span>
                        {f.cards.length ? <div className="hk-cards">{f.cards.map(cardEl)}</div> : <span className="hk-none">none</span>}
                      </div>
                    ))}
                  </div>
                </section>
            </div>
          )}

          {items.length > 0 && (
            <>
              <div className="hk-divider" role="separator"><span>Housekeepers' rooms</span></div>
              <div className="hk-legendrow">
                <p className="hk-legend" aria-label="Legend"><span><i className="lg lg-clean" />Clean</span><span><i className="lg lg-service" />Stay-over service</span><span><i className="lg-star">★</i>Clean first</span><span><i className="lg-lock">⚑</i>Guest asked not to be moved</span><span><i className="lg-pin">●</i>Placed by hand</span></p>
                {colCount > 3 && (
                  <div className="hk-carctl" role="group" aria-label="Housekeepers in view">
                    <span className="hk-carcount">Housekeepers {vstart + 1}–{Math.min(colCount, vstart + perView())} of {colCount}</span>
                    <button type="button" className="hk-btn hk-btn-sm" aria-label="Previous housekeeper" disabled={vstart <= 0} onClick={() => goCol(vstart - 1)}>‹ Prev</button>
                    <button type="button" className="hk-btn hk-btn-sm" aria-label="Next housekeeper" disabled={vstart + perView() >= colCount} onClick={() => goCol(vstart + 1)}>Next ›</button>
                  </div>
                )}
              </div>
              {clip.length > 0 && !readOnly && <p className="hk-clipbar" role="status">{clip.length} card{clip.length === 1 ? '' : 's'} copied — put the mouse over a housekeeper (or Not assigned) and press <kbd>Ctrl/⌘ V</kbd>, or right-click a group → Paste. <button type="button" className="hk-btn hk-btn-sm" onClick={() => setClip([])}>Clear</button></p>}
              {sum.hks.length === 0 && <p className="hk-muted">{readOnly ? '' : anon ? 'Housekeepers appear once you say how many.' : 'Housekeepers appear here once they are added.'}</p>}
              <div className={`hk-board${dev ? ' dev' : ''}`} ref={boardEl} onScroll={onBoardScroll} onDragOver={edgeScroll}>
                
                {sum.hks.map(h => {
                  const mine = items.filter(i => assign[i.roomNumber] === h.userId);
                  const pct = Math.min(100, viewSettings.max > 0 ? (h.units / viewSettings.max) * 100 : 100), minPct = Math.min(100, (viewSettings.min / viewSettings.max) * 100);
                  const flag = warn.perHk[h.userId];
                  return (
                    <section key={h.userId} className={`hk-col hk-hkcol${over === h.userId ? ' over' : ''}${flag ? ` flag-${flag}` : ''}`} aria-label={`${h.name}'s rooms`} {...zone(h.userId, h.userId)}>
                      <div className="hk-col-head">
                        <h2>{h.name}</h2>
                        <button type="button" className="hk-btn hk-btn-sm" onClick={() => printNow(h.userId)} disabled={mine.length === 0}>Print sheet</button>
                      </div>
                      <p className="hk-col-sum"><strong>{h.rooms}</strong> rooms · {h.clean} clean · {h.service} service · workload <strong>{fmt(h.units)}</strong></p>
                      <div className="hk-meter" title={`Minimum ${viewSettings.min} · maximum ${viewSettings.max}`}><span className={flag || ''} style={{ width: `${pct}%` }} /><i style={{ left: `${minPct}%` }} /></div>
                      {flag === 'over' && <p className="hk-warn">Over the maximum of {viewSettings.max}</p>}
                      {flag === 'under' && <p className="hk-warn">Below the minimum of {viewSettings.min}</p>}
                      {!readOnly && needsMove(h.userId) && <button type="button" className="hk-btn hk-btn-sm hk-here" onClick={() => moveCards(selected, h.userId)}>Move {selected.length > 1 ? `${selected.length} cards ` : ''}here</button>}
                      <div className="hk-col-body">{mine.length === 0 ? <p className="hk-muted">No rooms yet.</p> : renderCards(mine)}</div>
                    </section>
                  );
                })}
              </div>
            </>
          )}

          {dev && <HkPrintColors colors={colors} onSaved={setColors} />}
          {dev && !readOnly && items.length > 0 && (
            <>
              <p className="hk-devnote" aria-label="Balancer details">DEV · total workload {fmt(totalUnits)} · {hks.length || 0} housekeeper(s) · target {hks.length ? fmt(totalUnits / hks.length) : '—'} each · hand-placed {Object.keys(pinned).length} · auto-assigned {Object.keys(auto).length} · locked rooms {lockedRooms.length} · cuts snap to floor boundaries within 20% of a share unless that would exceed the max</p>
              <HkRoomTable sheet={sheet} items={items} assign={assign} hks={hks} pinned={pinned} guestOf={guestOf} offset={offset} date={date} />
            </>
          )}
        </>
      )}

      {ask && <ConfirmModal {...ask} onClose={() => setAsk(null)} />}
      {menu && <CardMenu menu={menu} hks={hks} canPaste={clip.length > 0} clipCount={clip.length} onMove={moveCards} onCopy={copyCards} onPaste={(g) => { pasteTo(g); setMenu(null); }} onClose={() => setMenu(null)} />}
      {printing && <HkSheets dateLabel={dayText(date)} sheets={sheets} settings={viewSettings} colors={colors} onDone={() => setPrinting(null)} />}
    </div>
  );
};

export default Housekeeping;
