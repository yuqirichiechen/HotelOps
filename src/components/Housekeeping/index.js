// Sprint 23 → 24.5 — Housekeeping: who cleans / services which rooms, then one printed sheet per housekeeper.
//   Sprint 24.5 layout (matches Reservations / Forecast): header (title, links, live badge, Refresh / Save / Print) · six KPI tiles · LEFT "Not assigned"
//   (fixed height, scrolls on its own, rooms by floor in accordions) · RIGHT: Assignment overview (progress + four donuts) over the Housekeepers'
//   assignments (one card per person: workload bar, rooms by floor in accordions). Everything else is unchanged: who is working lives in a pop-over
//   ("Who's working"), the rules in "Rules" / "Housekeeping settings", past days in "Assignment log".
//   · Nothing is assigned by itself: choose the people, then "Auto-assign" (same floor → same person where possible, cards glide into place) or drag
//     cards (or tap one, then "Move here") — a hand-placed card is pinned and Auto-assign leaves it alone. "Reset" (asks first) hands everything back.
//   · Dev ("Full" view) additionally sees the guest on each card, balancer details, a table of every room, the print colours and Snapshot history.
// Data is read once on open / refresh — no timers.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../auth';
import { useViewOptional } from '../../shells/ViewContext';
import KpiCard from '../shared/KpiCard';
import SyncBadge from '../shared/SyncBadge';
import InfoTip from '../Forecast/InfoTip';
import ForecastHistory from '../Forecasting/ForecastHistory';
import { IcBroom, IcBed, IcLayers, IcPeople, IcBars, IcCheck, IcUser, IcPrint, IcWand, IcGear, IcClock, IcDoc, IcRefresh, IcHand, IcHourglass, IcMinus, IcPlus, IcChevron, IcChevronL, IcChevronR, IcPencil, MoveMenu, FloorSection, HkModal, Popover, StaffChecklist } from './HkParts';
import { DEFAULT_ALLOWANCE, addDays, normFloor, floorLabel } from '../Forecast/forecastModel';
import useFlip from '../shared/useFlip';
import { buildRoomSheet } from '../Forecast/roomSheet';
import HkSheets from './HkSheets';
import useDragAutoScroll from './useDragAutoScroll';
import HkRoomTable from './HkRoomTable';
import HkPrintColors from './HkPrintColors';
import ConfirmModal from '../shared/ConfirmModal';
import { buildWorkList, summarize, balance, warnings, reconcile, resolveAssign, toAssignments, weightOf, parseColors, buildMasterSheet, DEFAULT_SETTINGS } from './hkWork';
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
const EDGE_ZONE = 90, EDGE_STEP = 24;   // px from the board's edge where it starts scrolling; px per frame at the very edge
const byFloor = (cards) => {
  const m = new Map();
  cards.forEach(c => { if (!m.has(c.floorId)) m.set(c.floorId, { floorId: c.floorId, label: c.floorLabel, cards: [] }); m.get(c.floorId).cards.push(c); });
  return [...m.values()].sort((a, b) => floorRank(a.floorId) - floorRank(b.floorId));
};

/** "No name" mode: how many housekeepers are working. − / + only change the number in the box; Start / Update shares the rooms out. */
const clampCount = (v) => Math.max(1, Math.min(40, Math.floor(Number(v)) || 1));
const CountCard = ({ count, draft, setDraft, onApply, disabled, blank, onBlank, people, onName }) => {
  const n = clampCount(draft), started = !!count;
  return (
    <section className="hk-panel hk-staff hk-countcard" aria-label="How many housekeepers">
      <div className="hk-panel-head"><h2>How many housekeepers?</h2></div>
      <div className="hk-count-main">
        <div className="hk-stepper">
          <button type="button" className="hk-btn hk-step" aria-label="One fewer" disabled={disabled || n <= 1} onClick={() => setDraft(String(clampCount(n - 1)))}><IcMinus size={22} /></button>
          <input className="hk-input hk-count-input" type="number" min="1" max="40" step="1" aria-label="Number of housekeepers" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onApply(draft); }} />
          <button type="button" className="hk-btn hk-step" aria-label="One more" disabled={disabled || n >= 40} onClick={() => setDraft(String(clampCount(n + 1)))}><IcPlus size={22} /></button>
        </div>
        <div className="hk-people" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} className="on" />)}</div>   {/* Sprint 24.6: always blue — one dot per housekeeper in the box */}
      </div>
      <button type="button" className="hk-btn hk-btn-primary hk-count-go" onClick={() => onApply(draft)} disabled={disabled || (started && n === count)}>{started ? 'Update' : 'Start'}</button>
      {onBlank && (
        <div className="hk-blank-row">
          <button type="button" role="switch" aria-checked={!blank} aria-label="Name the sheets Housekeeper 1, 2, 3" className={`hk-switch${!blank ? ' on' : ''}`} disabled={disabled} onClick={() => onBlank(!blank)}>
            <span className="hk-switch-track"><span className="hk-switch-knob" /></span>Name them Housekeeper 1, 2, 3…
          </button>
          <small>{blank ? 'Off: a sheet with no name typed below prints a blank line (______) to write on by hand.' : 'On: a sheet with no name typed below says Housekeeper 1, 2, 3…'}</small>
        </div>
      )}
      {onName && (
        <div className="hk-names" aria-label="Housekeeper names">
          <h3>Names <small>optional — typed names show on the cards and print on the sheets</small></h3>
          {people.length === 0 ? <small className="hk-muted">Press Start, then type a name for each housekeeper here.</small> : (
            <ul>
              {people.map((p, i) => (
                <li key={p.userId}><label><span>{i + 1}</span><input className="hk-input" type="text" maxLength={40} value={p.typed} placeholder={`Housekeeper ${i + 1}`} aria-label={`Name for Housekeeper ${i + 1}`} disabled={disabled} autoComplete="off" onChange={(e) => onName(p.userId, e.target.value)} /></label></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

/** Sprint 25.4 — "For [ Today · Nov 7 | Tomorrow · Nov 8 ]": one box the same height as the Rules / How many buttons next to it. */
const DayPicker = ({ offset, today, onChoose }) => (
  <div className="hk-dayswitch" role="group" aria-label="Plan for">
    <span className="hk-dayfor">For</span>
    <span className="hk-dayseg" role="tablist" aria-label="Day">
      {[0, 1].map(n => { const p = today ? parts(addDays(today, n)) : null; return (
        <button key={n} type="button" role="tab" aria-selected={offset === n} className={offset === n ? 'on' : ''} onClick={() => onChoose(n)}>
          <b>{n === 0 ? 'Today' : 'Tomorrow'}</b>{p && <span>{p.m} {p.d}</span>}
        </button>
      ); })}
    </span>
  </div>
);

const NumField = ({ label, value, onChange, min, max, step, disabled }) => (
  <label className="hk-field">{label}<input className="hk-input hk-num-in" type="number" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} /></label>
);

// macOS turns Ctrl-click into a right-click (contextmenu with ctrlKey and button 0): the front desk on a Mac expects it to add to the selection
const isMacCtrlClick = (e) => !!(e && e.ctrlKey && e.button === 0 && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || ''));

/** One small room card. Draggable; click selects it (Ctrl/⌘-click adds or removes, Shift-click selects a range); right-click opens a "Move to" menu. */
const RoomCard = ({ it, group, pinned, selected, pick, justMoved, guest, dev, readOnly, onSelect, onDragStart, onDragEnd, onUnpin, onMenu }) => (
  <div
    className={`hk-rc hk-rc-${it.kind}${it.priority ? ' prio' : ''}${pinned ? ' pinned' : ''}${selected ? ' selected' : ''}${justMoved ? ' just-moved' : ''}${it.tbd ? ' tbd' : ''}${it.ip ? ' ip' : ''}${pick ? ' pick' : ''}${dev && guest ? ' withguest' : ''}`}
    data-flip={it.roomNumber} data-flip-group={group} data-room={it.roomNumber}
    draggable={!readOnly}
    role={readOnly ? undefined : 'button'} tabIndex={readOnly ? undefined : 0} aria-pressed={readOnly ? undefined : !!selected}
    aria-label={`${it.tbd ? 'Room to be assigned' : 'Room ' + it.roomNumber}, ${it.typeCode || ''}, ${it.ip ? 'in progress, someone is already on it' : it.kind === 'clean' ? 'clean' : 'stay-over service'}${it.priority ? ', clean first' : ''}${it.locked ? ', guest asked not to be moved' : ''}`}
    title={`${it.tbd ? 'Room not assigned yet' : 'Room ' + it.roomNumber} · ${it.typeCode} · ${it.why || (it.kind === 'clean' ? 'Clean' : 'Service')}${guest ? ' · ' + guest : ''}`}
    onClick={(e) => !readOnly && onSelect(it.roomNumber, pick ? { ctrlKey: true } : e)}      // "Select rooms" mode on this floor: a plain click ticks / unticks
    onContextMenu={(e) => { if (readOnly) return; if (isMacCtrlClick(e)) { e.preventDefault(); onSelect(it.roomNumber, { ctrlKey: true }); return; } onMenu(e, it.roomNumber); }}   // on a Mac, Ctrl-click is a right-click: treat it as the multi-select click
    onKeyDown={(e) => { if (!readOnly && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(it.roomNumber, e); } }}
    onDragStart={(e) => onDragStart(e, it.roomNumber)} onDragEnd={onDragEnd}
  >
    {pick && <span className={`hk-rc-box${selected ? ' on' : ''}`} aria-hidden="true">{selected ? '✓' : ''}</span>}
    <span className="hk-rc-top"><strong>{it.tbd ? 'TBD' : it.roomNumber}</strong><span className="hk-rc-marks">{it.locked && <i className="hk-rc-lock" title="Guest asked not to be moved" aria-hidden="true">⚑</i>}{it.ip && <i className="hk-rc-iptag" title="In progress — someone is already on this room">IP</i>}{it.priority && <i className="hk-rc-star" aria-hidden="true">★</i>}</span></span>
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

// Sprint 24: `apiBase` — '/admin' (managers, dev) or '/frontdesk' (the staff portal; same handlers, guest data stripped server-side).
// `simple` — the portal layout: no stat cards / 14-day history strip; a Today | Tomorrow switch sits next to "Plan by". Every planning
// function (names / no name, staff picker, rules, auto-assign, reset, drag, copy/paste, save, print) is unchanged.
// Sprint 24.9 — No-name sheets can print an empty name line instead of "Housekeeper N" (the front desk writes the name in by hand).
const BLANK_NAME = '______________________';
/** Dev only (Rules): a global on/off setting, saved straight away through the dev-only settings route; everyone's pages follow it. */
const HkDevSwitch = ({ settingKey, aria, label, hint, value, onChange }) => {
  const [msg, setMsg] = useState(null);
  const toggle = async () => {
    const next = !value; setMsg(null);
    const { ok, data } = await apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ [settingKey]: next ? 'true' : 'false' }) });
    if (ok && data?.success) { onChange(next); setMsg({ ok: true, text: 'Saved' }); } else setMsg({ ok: false, text: data?.message || 'Could not save' });
  };
  return (
    <div className="hk-opt-row" aria-label={aria}>
      <button type="button" role="switch" aria-checked={value} className={`hk-switch${value ? ' on' : ''}`} onClick={toggle}>
        <span className="hk-switch-track"><span className="hk-switch-knob" /></span>{label} <span className="hk-tag-dev">DEV</span>
      </button>
      <small>{hint}</small>
      {msg && <span className={`hk-opt-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.text}</span>}
    </div>
  );
};

const Housekeeping = ({ mode = 'manager', apiBase = '/admin', simple = false }) => {
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
  const [namesAllowed, setNamesAllowed] = useState(false);   // dev option (Rules): may managers / front desk plan BY NAME? off = only "No name" (dev always can)
  const canNames = dev || namesAllowed;
  const [anon, setAnon] = useState(!dev);              // plan by NUMBER of housekeepers (no names); the default for everyone but dev until names are switched on
  const [renaming, setRenaming] = useState(null);       // userId whose name is being typed in the column header (pencil icon)
  const [renameDraft, setRenameDraft] = useState('');
  const [anonNames, setAnonNames] = useState({});        // Sprint 25.3: names typed for the numbered housekeepers { 'anon-1': 'Maria' } (blank = Housekeeper N)
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
  const [pick, setPick] = useState({});                 // "Select rooms" mode per floor section: { 'group|floor': true } — a plain click ticks rooms there
  const [dragging, setDragging] = useState(false);       // a card / floor is being dragged (shows the edge arrows when there are more housekeepers than fit)
  const [edge, setEdge] = useState(null);                 // 'left' | 'right' while the mouse holds the edge of the board
  const [canScroll, setCanScroll] = useState({ l: false, r: false });
  const [lastStays, setLastStays] = useState({});
  const [lockedRooms, setLockedRooms] = useState([]);
  const [justMoved, setJustMoved] = useState([]);
  const dragRef = useRef(null);
  const autoScroll = useDragAutoScroll();
  const skipFlip = useRef(false);
  const boardRef = useRef(null);
  const viewCtx = useViewOptional();
  const [acc, setAcc] = useState({});                   // floor accordions the user opened / closed: { 'pool|2': true, 'userId|3': false }
  const [prefs, setPrefs] = useState({ floors: {}, priorityTypes: [] });   // Sprint 25: housekeepers' preferred floors + priority room types (saved for the whole property)
  const [slips, setSlips] = useState(false);       // dev option (Rules): print the return slips after each housekeeper's sheet
  const [confirmed, setConfirmed] = useState(false);   // step 1 → step 2: the plan has been confirmed, the rooms board is shown (manager / dev; the portal has no steps yet)
  const [confirmTick, setConfirmTick] = useState(0);
  const stepRef = useRef(null);
  const [held, setHeld] = useState(null);             // rooms a Reset handed back: No-name mode must not instantly share them out again
  const stripRef = useRef(null);
  const [fresh, setFresh] = useState(null);             // { source, at, health } of the reservation data (freshness badge)
  const [whoOpen, setWhoOpen] = useState(false);        // "Who's working" pop-over
  const [rulesOpen, setRulesOpen] = useState(false);    // rules (+ print colours for dev) dialog
  const [logOpen, setLogOpen] = useState(false);        // assignment log (past days) dialog
  const [histOpen, setHistOpen] = useState(false);      // dev: forecast snapshot history
  useFlip(boardRef, skipFlip);

  const loadAll = useCallback(async () => {
    setError(null);
    const [cur, lv, st, emp, pf] = await Promise.all([apiFetch(`${apiBase}/forecast/current`), apiFetch(`${apiBase}/forecast/live`), apiFetch(`${apiBase}/settings`), apiFetch(`${apiBase}/employees`), apiFetch(`${apiBase}/housekeeping/prefs`)]);
    if (cur.ok && cur.data?.success && cur.data.snapshot) { setPayload(cur.data.snapshot.payload); setFresh({ source: cur.data.source || null, at: cur.data.snapshot.scraped_at || null, health: cur.data.sync || null }); } else setError(cur.data?.message || 'Could not load the room data.');
    if (lv.ok && lv.data?.success) setLive(lv.data.live);
    const s = st.ok && st.data && st.data.settings;
    if (s) {
      setColors(parseColors(s.hk_print_colors)); setSlips(s.hk_print_slips === 'true'); setNamesAllowed(s.hk_plan_by_name === 'true');
      const num = (v, d) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
      setAllowance({ enabled: s.forecast_allowance_enabled == null ? DEFAULT_ALLOWANCE.enabled : s.forecast_allowance_enabled !== 'false', scalePct: num(s.forecast_allowance_scale_pct, DEFAULT_ALLOWANCE.scalePct), minExtra: num(s.forecast_allowance_min_extra, DEFAULT_ALLOWANCE.minExtra) });
    }
    if (pf && pf.ok && pf.data?.success && pf.data.prefs) setPrefs({ floors: pf.data.prefs.floors || {}, priorityTypes: pf.data.prefs.priorityTypes || [] });
    if (emp.ok && emp.data?.success) setStaff((emp.data.employees || []).filter(e => e.active !== false));
    setLoading(false);
  }, [apiBase]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const today = (live && live.forecastDate) || (payload && payload.forecastDate) || '';
  const date = today ? addDays(today, offset) : '';
  const readOnly = offset < 0;

  const loadPlans = useCallback(async () => {
    if (!today) return;
    const { ok, data } = await apiFetch(`${apiBase}/housekeeping/plans?from=${addDays(today, -HISTORY_DAYS)}&to=${addDays(today, 1)}`);
    if (ok && data?.success) setPlans(data.plans || []);
  }, [today, apiBase]);
  useEffect(() => { loadPlans(); }, [loadPlans]);

  // today / tomorrow: the work list from the room board; history: the saved cards only
  // rooms guests asked not to be moved out of (rGuest "Do not move") — cleaned first; read from what the detail job already stored
  useEffect(() => {
    if (!date || readOnly) { setLockedRooms([]); return undefined; }
    let alive = true;
    (async () => {
      const { ok, data } = await apiFetch(`${apiBase}/housekeeping/locked-rooms?date=${date}`);
      if (alive) setLockedRooms(ok && data?.success ? data.rooms || [] : []);
    })();
    return () => { alive = false; };
  }, [date, readOnly, apiBase]);
  const work = useMemo(() => (readOnly ? { date, offset, items: [], unplaced: { clean: 0, service: 0 } } : buildWorkList({ payload, live, allowance, offset, lockedRooms, priorityTypes: prefs.priorityTypes })), [payload, live, allowance, offset, readOnly, date, lockedRooms, prefs.priorityTypes]);
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
      const { ok, data } = await apiFetch(`${apiBase}/housekeeping/plan?date=${date}`);
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
        const savedNamed = !!(saved && (saved.assignments || []).length && !isAnon);     // a plan already made BY NAME stays by name, even if names were switched off since
        const wantAnon = isAnon || (!canNames && !savedNamed);
        const typed = {}; if (isAnon) r.hks.forEach((h, i) => { if (h.name && h.name !== `Housekeeper ${i + 1}`) typed[h.userId] = h.name; }); setAnonNames(typed);
        setAnon(wantAnon); setAnonCount(isAnon ? r.hks.length : null); setCountDraft(String(isAnon && r.hks.length ? r.hks.length : 3));
        setHks(r.hks); setPinned(r.pinned); setAuto(r.auto); setSettings({ ...DEFAULT_SETTINGS, ...((saved && saved.settings) || {}) }); setConfirmed(Object.keys(r.pinned).length + Object.keys(r.auto).length > 0);
        setSavedAt(saved ? saved.updatedAt : null); setDirty(false); setSaveMsg(null);
      }
      setPlanFor(date);
    })();
    return () => { alive = false; };
  }, [date, planFor, readOnly, work, apiBase, canNames]);

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
  // Sprint 25: a room rGuest shows as In Progress is not work to hand out — it only counts once somebody was given it
  const countable = useCallback((i, a) => !i.ip || !!a[i.roomNumber], []);
  const sum = useMemo(() => summarize(items.filter(i => countable(i, assign)), assign, viewHks, viewSettings), [items, assign, viewHks, viewSettings, countable]);
  const totalUnits = items.filter(i => countable(i, assign)).reduce((n, i) => n + weightOf(i, viewSettings), 0);
  const warn = useMemo(() => warnings(sum, totalUnits, viewSettings), [sum, totalUnits, viewSettings]);
  const cleanN = items.filter(i => i.kind === 'clean' && !i.ip).length, serviceN = items.filter(i => i.kind === 'service').length, ipN = items.filter(i => i.ip).length;

  // Sprint 24.7 — two steps for managers / dev: (1) the Plan card (who is working, rules, a preview of how many rooms each person gets) → Confirm → (2) the rooms board
  // (Not assigned + the housekeepers' cards). The front-desk portal has no steps yet: its board is always there.
  const gated = !simple;
  const isConfirmed = !gated || confirmed;
  const showBoard = readOnly || isConfirmed;
  // the preview: the balancer's proposal until the plan is confirmed (nothing is assigned yet), the real assignment afterwards — counts only, no rooms
  const proposal = useMemo(() => ((!gated || readOnly || isConfirmed || hks.length === 0 || work.items.length === 0) ? null : balance(work.items, hks, pinned, settings, prefs.floors)), [gated, readOnly, isConfirmed, hks, work, pinned, settings, prefs.floors]);
  const previewAssign = useMemo(() => (isConfirmed || readOnly ? assign : (proposal || {})), [isConfirmed, readOnly, assign, proposal]);
  const previewSum = useMemo(() => summarize(items.filter(i => countable(i, previewAssign)), previewAssign, viewHks, viewSettings), [items, previewAssign, viewHks, viewSettings, countable]);
  const pvWarn = useMemo(() => warnings(previewSum, totalUnits, viewSettings), [previewSum, totalUnits, viewSettings]);

  // number mode: any room that is not hand-placed and not yet handed out (a new room after Refresh) is shared out right away
  useEffect(() => {
    if (!anon || readOnly || !isConfirmed || !anonCount || hks.length === 0) return;
    const waiting = work.items.some(i => !i.ip && !Object.prototype.hasOwnProperty.call(pinned, i.roomNumber) && !auto[i.roomNumber] && !(held && held.has(i.roomNumber)));   // In Progress rooms are never handed out, so they must not keep this firing
    if (!waiting) return;
    const res = balance(work.items, hks, pinned, settings, prefs.floors), next = {}; Object.keys(res).forEach(k => { if (!Object.prototype.hasOwnProperty.call(pinned, k)) next[k] = res[k]; });
    setAuto(next); setDirty(true);
  }, [anon, anonCount, readOnly, isConfirmed, work, hks, pinned, auto, settings, held, prefs.floors]);
  const touch = () => { setDirty(true); setSaveMsg(null); };
  // preferred floors / priority room types are kept for the whole property (not per day): saved the moment they change, separately from the day's plan
  const savePrefs = async (next) => {
    const prev = prefs; setPrefs(next);
    const { ok, data } = await apiFetch(`${apiBase}/housekeeping/prefs`, { method: 'PUT', body: JSON.stringify({ prefs: next }) });
    if (!(ok && data?.success)) { setPrefs(prev); setSaveMsg({ ok: false, text: data?.message || 'Could not save that preference' }); }
  };
  const toggleFloorPref = (userId, floor) => {
    const cur = prefs.floors[userId] || [], nextList = cur.includes(floor) ? cur.filter(f => f !== floor) : [...cur, floor];
    const floors = { ...prefs.floors }; if (nextList.length) floors[userId] = nextList; else delete floors[userId];
    savePrefs({ ...prefs, floors });
  };
  const togglePriorityType = (code) => {
    const cur = prefs.priorityTypes, next = cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code];
    savePrefs({ ...prefs, priorityTypes: next });
  };
  const addHk = (h) => { setHks(prev => (prev.some(x => x.userId === h.userId) ? prev : [...prev, h])); touch(); };
  const removeHk = (id) => {
    const drop = (prev) => { const n = {}; Object.keys(prev).forEach(k => { if (prev[k] !== id) n[k] = prev[k]; }); return n; };
    setHks(prev => prev.filter(h => h.userId !== id)); setPinned(drop); setAuto(drop); touch();
  };
  // Auto-assign: share the rooms that are not hand-placed across everyone working (same floor → same person where possible)
  const autoAssign = () => {
    const res = balance(work.items, hks, pinned, settings, prefs.floors), next = {};
    Object.keys(res).forEach(k => { if (!Object.prototype.hasOwnProperty.call(pinned, k)) next[k] = res[k]; });
    setAuto(next); setHeld(null); touch();
  };
  // Confirm the plan: share the rooms out (or leave them for you to place by hand) and reveal the rooms board below, scrolling to it.
  const confirmPlan = (byHand) => {
    if (!byHand) autoAssign();
    if (!isConfirmed) { setConfirmed(true); setConfirmTick(t => t + 1); }
    setHeld(null);
  };
  useEffect(() => { if (confirmTick > 0 && stepRef.current && stepRef.current.scrollIntoView) stepRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [confirmTick]);
  // ── "just a number": Housekeeper 1…N, rooms handed out automatically whenever the number (or the work) changes ──
  const anonHks = (n) => Array.from({ length: n }, (_, i) => ({ userId: `anon-${i + 1}`, name: anonNames[`anon-${i + 1}`] || `Housekeeper ${i + 1}` }));
  const commitRename = () => { if (renaming) nameAnon(renaming, renameDraft); setRenaming(null); };
  // type a name for a numbered housekeeper (blank puts "Housekeeper N" back); it shows everywhere and prints on the sheet
  const nameAnon = (userId, raw) => {
    const v = String(raw).slice(0, 40), n = Number(userId.replace('anon-', ''));
    setAnonNames(prev => { const o = { ...prev }; if (v.trim()) o[userId] = v; else delete o[userId]; return o; });
    setHks(prev => prev.map(h => (h.userId === userId ? { ...h, name: v.trim() || `Housekeeper ${n}` } : h))); touch();
  };
  const applyCount = (raw) => {
    const n = Math.max(1, Math.min(40, Math.floor(Number(raw)) || 0)); if (!n) return;
    const next = anonHks(n), ids = new Set(next.map(h => h.userId));
    const keep = (prev) => { const o = {}; Object.keys(prev).forEach(k => { if (prev[k] === null || ids.has(prev[k])) o[k] = prev[k]; }); return o; };
    const pins = keep(pinned); setHks(next); setPinned(pins); setAnonCount(n); setCountDraft(String(n));
    if (!isConfirmed) { setAuto({}); touch(); return; }   // step 1: only the number changes (the preview follows); Confirm plan shares the rooms out
    const res = balance(work.items, next, pins, settings, prefs.floors), nextAuto = {}; Object.keys(res).forEach(k => { if (!Object.prototype.hasOwnProperty.call(pins, k)) nextAuto[k] = res[k]; });
    setAuto(nextAuto); setHeld(null); touch();
  };
  const switchMode = (toAnon) => {
    if (toAnon === anon) return;
    const go = () => { setConfirmed(false); setHeld(null); setAnon(toAnon); setAnonCount(null); setAnonNames({}); setHks([]); setPinned({}); setAuto({}); setSelected([]); setCountDraft('3'); touch(); if (toAnon) setWhoOpen(true); };   // "No name" asks how many right away
    if (hks.length > 0 || Object.keys(pinned).length > 0) {
      setAsk({ title: `Switch to "${toAnon ? 'No name' : 'Names'}"?`, message: 'Switching clears the housekeepers and every assignment for this day.', confirmLabel: 'Switch', tone: 'danger', onConfirm: go });
    } else go();
  };
  // Reset hands every room back and keeps the people. In No-name mode the page normally shares new rooms out by itself — `held` stops it from doing that to the rooms just handed back
  // (it lifts when you press Auto-assign, Start / Update, change the mode or the day, or when a genuinely new room appears).
  const doReset = () => { setPinned({}); setAuto({}); setSelected([]); setResetAsk(false); setHeld(new Set(work.items.map(i => i.roomNumber))); touch(); };
  // move one or many cards to a housekeeper (id) or back to Not assigned (null); hand-placed from then on
  const moveCards = (rooms, id) => {
    const list = [...new Set((rooms || []).filter(r => itemByRoom.has(r)))];
    if (readOnly || !list.length) return;
    skipFlip.current = true;
    setPinned(prev => { const n = { ...prev }; list.forEach(r => { n[r] = id; }); return n; });
    setSelected([]); setMenu(null); touch(); setJustMoved(list); setTimeout(() => setJustMoved([]), 450);
    // show where they landed: open the destination's floor sections that received cards
    setAcc(a => { const n = { ...a }; list.forEach(r => { const it = itemByRoom.get(r); if (it) n[`${id || 'pool'}|${it.floorId}`] = true; }); return n; });
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
    const { ok, data } = await apiFetch(`${apiBase}/housekeeping/plan`, { method: 'PUT', body: JSON.stringify(body) });
    if (ok && data?.success) { setDirty(false); setSavedAt(data.updatedAt); setSaveMsg({ ok: true, text: 'Saved' }); loadPlans(); return true; }
    setSaveMsg({ ok: false, text: data?.message || 'Could not save' }); return false;
  }, [work, settings, anon, assign, hks, pinned, loadPlans, apiBase]);

  // Sprint 24.10/24.11: "Print all sheets" = the ONE-PAGE sheet of every room, for today (the room board) and tomorrow (the plan). A past day has no room
  // board any more, so it keeps the housekeeper sheets, and so does the "Print housekeeper sheets" link.
  const canMaster = !readOnly && !!payload;
  const printAll = () => (canMaster ? printNow('master') : printNow('all'));
  const printNow = async (who) => {
    if (who === 'master') { setPrinting('master'); return; }
    if (viewHks.length === 0) return;
    if (!readOnly && (dirty || !savedAt)) { if (!(await save())) return; }
    setPrinting(who);
  };
  const chooseDay = (n) => {
    if (n === offset) return;
    const go = () => { setOffset(n); setPlanFor(null); setSelected([]); setClip([]); setHeld(null); };
    if (dirty) setAsk({ title: 'Switch day?', message: 'You have unsaved changes for this day. They will be lost.', confirmLabel: 'Switch anyway', tone: 'danger', onConfirm: go }); else go();
  };

  const master = useMemo(() => (printing === 'master' ? buildMasterSheet({ payload, live, items: work.items, offset }) : null), [printing, payload, live, work, offset]);
  const sheets = useMemo(() => {
    if (!printing || printing === 'master') return [];
    const shown = (a) => (viewSettings.blankNames && /^anon-/.test(a.userId) && /^Housekeeper \d+$/.test(a.name) ? BLANK_NAME : a.name);   // No name + "leave blank": an underscore line to write on
    const rows = readOnly
      ? past.assignments.map(a => ({ userId: a.userId, name: shown(a), rooms: a.rooms.map(r => ({ ...itemByRoom.get(r.roomNumber), ...r })) }))
      : toAssignments(work.items, assign, hks, pinned).map(a => ({ userId: a.userId, name: shown(a), rooms: a.rooms.map(r => ({ ...itemByRoom.get(r.roomNumber), ...r })) }));
    return rows.filter(a => printing === 'all' || a.userId === printing);
  }, [printing, readOnly, past, work, assign, hks, pinned, itemByRoom, viewSettings]);

  // ── drag & drop (HTML5) + tap-to-move for touch ──
  const onDragStart = (e, room, whole) => {
    const rooms = whole || (selected.includes(room) ? selected : [room]);      // dragging a selected card takes the whole selection along; dragging a floor header takes the whole floor
    dragRef.current = rooms; setDragging(true); autoScroll.start(e.currentTarget);      // the page scrolls by itself when the card is held near the top / bottom edge
    try { e.dataTransfer.setData('text/plain', rooms.join(',')); e.dataTransfer.effectAllowed = 'move'; } catch { /* some browsers */ }
  };
  const onDragEnd = () => { dragRef.current = null; autoScroll.stop(); setOver(null); setDragging(false); setEdge(null); };
  const dropOn = (id) => (e) => { e.preventDefault(); const rooms = dragRef.current || String((e.dataTransfer && e.dataTransfer.getData('text/plain')) || '').split(',').filter(Boolean); dragRef.current = null; autoScroll.stop(); setOver(null); setDragging(false); setEdge(null); moveCards(rooms, id); };
  const zone = (key, id) => ({
    onDragOver: (e) => { if (readOnly) return; e.preventDefault(); if (over !== key) setOver(key); },
    onDragLeave: (e) => { if (e.currentTarget.contains(e.relatedTarget)) return; setOver(o => (o === key ? null : o)); },
    onDrop: dropOn(id),
    onMouseEnter: () => { hoverGroup.current = id; }, onMouseLeave: () => { if (hoverGroup.current === id) hoverGroup.current = undefined; },
    onMouseDown: () => { lastGroup.current = id; },
    onContextMenu: (e) => openGroupMenu(e, id),
  });

  const poolCards = items.filter(i => !assign[i.roomNumber]);
  const cardEl = (it, pick = false) => (
    <RoomCard key={it.roomNumber} it={it} pick={pick && !it.ip} group={assign[it.roomNumber] || 'pool'} pinned={Object.prototype.hasOwnProperty.call(pinned, it.roomNumber)} selected={selected.includes(it.roomNumber)} justMoved={justMoved.includes(it.roomNumber)} guest={guestOf(it.roomNumber)} dev={dev} readOnly={readOnly}
      onSelect={selectCard} onDragStart={onDragStart} onDragEnd={onDragEnd} onUnpin={unpin} onMenu={openMenu} />
  );
  // floor accordions: open/closed is remembered per (group, floor); until the user touches one, the first floor with rooms is open
  const accOpen = (key, dflt) => (Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : dflt);
  const accToggle = (key, dflt) => setAcc(a => ({ ...a, [key]: !(Object.prototype.hasOwnProperty.call(a, key) ? a[key] : dflt) }));
  const renderFloors = (groupKey, floors, openAll = false) => {
    const firstWith = floors.findIndex(f => f.cards.length > 0);
    return floors.map((f, i) => {
      const key = `${groupKey}|${f.floorId}`, dflt = openAll ? f.cards.length > 0 : i === firstWith;
      const gid = groupKey === 'pool' ? null : groupKey, rooms = f.cards.filter(c => !c.ip).map(c => c.roomNumber), allSel = rooms.length > 0 && rooms.every(r => selected.includes(r));
      const pickOn = !!pick[key], ticked = rooms.filter(r => selected.includes(r)), movers = ticked.length ? ticked : rooms;
      const actions = readOnly || rooms.length === 0 ? null : (
        <>
          <button type="button" className={`hk-btn hk-btn-xs hk-floor-sel${pickOn ? ' on' : ''}`} aria-pressed={pickOn} aria-label={`Select rooms on ${f.label}`} title="Tick rooms with the mouse, then drag them, right-click, or use Move to…"
            onClick={() => setPick(p => ({ ...p, [key]: !p[key] }))}><i className={`hk-tick${pickOn ? ' on' : ''}`} aria-hidden="true" />Select rooms</button>
          {pickOn && <button type="button" className="hk-btn hk-btn-xs hk-floor-all" aria-pressed={allSel} title={allSel ? 'Untick every room on this floor' : 'Tick every room on this floor'}
            onClick={() => setSelected(prev => (allSel ? prev.filter(r => !rooms.includes(r)) : [...new Set([...prev, ...rooms])]))}>{allSel ? 'None' : 'All'}</button>}
          <MoveMenu label={ticked.length ? `Move ${ticked.length} to…` : 'Move to…'} ariaLabel={`Move ${ticked.length ? 'the ticked rooms of' : 'all of'} ${f.label} to`}
            options={[...(gid !== null ? [{ value: '__pool', label: 'Not assigned' }] : []), ...hks.filter(h => h.userId !== gid).map(h => ({ value: h.userId, label: h.name }))]}
            onPick={(v) => moveCards(movers, v === '__pool' ? null : v)} />
        </>
      );
      const dragProps = readOnly || rooms.length === 0 ? null : { draggable: true, 'data-floor-drag': f.floorId, onDragStart: (e) => onDragStart(e, movers[0], movers), onDragEnd };
      return (
        <FloorSection key={f.floorId} floorId={f.floorId} label={f.label} count={f.cards.length} open={accOpen(key, dflt)} onToggle={() => accToggle(key, dflt)} actions={actions} dragProps={dragProps}>
          {f.cards.length ? <div className="hk-cards">{f.cards.map(c => cardEl(c, pickOn))}</div> : <span className="hk-none">none</span>}
        </FloorSection>
      );
    });
  };
  // Not assigned: one block per floor, always G · 1 · 2 · 3 · 4 (and any other floor that has cards)
  const poolFloors = useMemo(() => {
    const got = new Map(byFloor(poolCards.filter(c => !c.ip)).map(f => [f.floorId, f]));
    const base = PRESET_FLOORS.map(id => got.get(id) || { floorId: id, label: floorLabel(id), cards: [] });
    const extra = [...got.values()].filter(f => !PRESET_FLOORS.includes(f.floorId));
    const ips = poolCards.filter(c => c.ip);      // Sprint 25.3: rooms rGuest shows as In Progress are their own group, not part of any floor
    return [...base, ...extra, ...(ips.length ? [{ floorId: 'ip', label: 'In progress', cards: ips }] : [])];
  }, [poolCards]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stripRef.current) stripRef.current.scrollLeft = stripRef.current.scrollWidth; }, [today, plans.length, loading]);
  const planByDate = useMemo(() => new Map(plans.map(p => [p.date, p])), [plans]);
  const days = useMemo(() => (today ? Array.from({ length: HISTORY_DAYS + 2 }, (_, i) => i - HISTORY_DAYS) : []), [today]);
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
  // Sprint 25.2 — holding a card near the left / right edge of the housekeeper board scrolls it (smoothly, faster nearer the edge) to the next / previous
  // housekeepers; a faded edge with an arrow shows where it will go whenever there are more housekeepers than fit.
  const edgeRef = useRef({ dir: 0, speed: 0, at: 0 });
  const measureScroll = () => { const b = boardEl.current; if (!b) return; const l = b.scrollLeft > 2, r = b.scrollLeft < b.scrollWidth - b.clientWidth - 2; setCanScroll(c => (c.l === l && c.r === r ? c : { l, r })); };
  const edgeScroll = (e) => {
    const b = boardEl.current; if (!b || !dragRef.current) return;
    const r = b.getBoundingClientRect(), x = e.clientX; let dir = 0, speed = 0;
    if (x < r.left + EDGE_ZONE) { dir = -1; speed = Math.ceil(EDGE_STEP * Math.min(1, (r.left + EDGE_ZONE - x) / EDGE_ZONE)); }
    else if (x > r.right - EDGE_ZONE) { dir = 1; speed = Math.ceil(EDGE_STEP * Math.min(1, (x - (r.right - EDGE_ZONE)) / EDGE_ZONE)); }
    edgeRef.current = { dir, speed, at: Date.now() };
    const name = dir < 0 ? 'left' : dir > 0 ? 'right' : null; setEdge(c => (c === name ? c : name));
  };
  useEffect(() => {
    if (!dragging) return undefined;
    const rf = (fn) => (window.requestAnimationFrame ? window.requestAnimationFrame(fn) : setTimeout(fn, 16)), cf = (id) => (window.cancelAnimationFrame ? window.cancelAnimationFrame(id) : clearTimeout(id));
    const stop = () => { setDragging(false); setEdge(null); };   // dragRef is cleared by the drop / drag-end handlers themselves (this capture listener runs first)
    window.addEventListener('dragend', stop, true); window.addEventListener('drop', stop, true);
    measureScroll(); let id;
    const tick = () => {
      const b = boardEl.current, e = edgeRef.current;
      if (b && e.dir && Date.now() - e.at < 250) { const before = b.scrollLeft; b.scrollLeft += e.dir * e.speed; if (b.scrollLeft !== before) measureScroll(); }
      id = rf(tick);
    };
    id = rf(tick);
    return () => { cf(id); window.removeEventListener('dragend', stop, true); window.removeEventListener('drop', stop, true); };
  }, [dragging]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setVstart(v => Math.max(0, Math.min(v, Math.max(0, colCount - 3)))); }, [colCount]);
  const sheet = useMemo(() => (dev && !readOnly && payload ? buildRoomSheet(payload, live) : null), [dev, readOnly, payload, live]);
  const saveText = readOnly ? 'History — read-only' : saveMsg ? <span className={saveMsg.ok ? 'ok' : 'bad'}>{saveMsg.text}</span> : dirty ? 'Unsaved changes' : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not saved yet';

  // ── numbers for the tiles / overview (all from the same work list + assignment the page already holds) ──
  const total = items.filter(i => countable(i, assign)).length, assignedN = total - poolCards.filter(i => !i.ip).length;
  const avgUnits = viewHks.length ? totalUnits / viewHks.length : 0;
  const pctAssigned = total > 0 ? Math.round((assignedN / total) * 100) : 0;
  const goHome = () => { if (viewCtx && viewCtx.goTo) viewCtx.goTo('home'); };
  const fmtClock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—');
  const legend = (
    <p className="hk-legend" aria-label="Legend"><span><i className="lg lg-clean" />Clean</span><span><i className="lg lg-service" />Stay-over</span><span><i className="lg-star">★</i>Clean first</span><span><i className="lg-lock">⚑</i>Guest asked not to be moved</span><span><i className="lg-pin">●</i>Placed by hand</span></p>
  );
  const whoCount = viewHks.length;
  // who is under the minimum / over the maximum, as one line (it used to be an extra line inside every card, which pushed the cards out of line)
  const flagLines = (hksList, perHk, st) => {
    const names = (kind) => hksList.filter(h => perHk[h.userId] === kind).map(h => h.name), out = [];
    const u = names('under'), o = names('over'), who = (l) => (l.length > 3 ? `${l.length} housekeepers` : l.join(', '));      // long lists become a count
    if (u.length) out.push(`${who(u)} ${u.length === 1 ? 'is' : 'are'} below the minimum of ${st.min}`);
    if (o.length) out.push(`${who(o)} ${o.length === 1 ? 'is' : 'are'} over the maximum of ${st.max}`);
    return out;
  };
  const boardFlags = readOnly ? [] : flagLines(sum.hks, warn.perHk, viewSettings);
  const previewFlags = readOnly ? [] : flagLines(previewSum.hks, pvWarn.perHk, viewSettings);
  const floorChoices = useMemo(() => [...new Set([...PRESET_FLOORS, ...items.map(i => i.floorId).filter(f => f && f !== 'unknown')])].sort((a, b) => floorRank(a) - floorRank(b)), [items]);
  const typeChoices = useMemo(() => {
    const m = new Map(); if (payload) buildRoomSheet(payload, live).floors.forEach(f => f.rooms.forEach(r => { if (r.typeCode && !m.has(r.typeCode)) m.set(r.typeCode, r.typeLabel || r.typeCode); }));
    prefs.priorityTypes.forEach(c => { if (!m.has(c)) m.set(c, c); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [payload, live, prefs.priorityTypes]);

  return (
    <div className="hk-page-wrap hk-v2" ref={boardRef}>
      <header className="hk-header hk-head2">
        <div className="hk-head-l">
          <nav className="hk-crumb" aria-label="Breadcrumb"><button type="button" onClick={goHome}>Home</button><span aria-hidden="true">›</span><span>Housekeeping</span></nav>
          <h1>Housekeeping</h1>
          <p className="hk-sub">Assign rooms, balance workload, and track daily cleaning progress.</p>
        </div>
        <div className="hk-actions hk-head-r">
          {fresh && <SyncBadge source={fresh.source} syncedAt={fresh.at} health={fresh.health} label="" />}
          {!loading && payload && (live
            ? <div className="hk-live" title="Room conditions as read from rGuest when this page was opened or refreshed"><span className="hk-live-dot" /><span>Rooms live</span><strong>{fmtClock(live.fetchedAt)}</strong></div>
            : <div className="hk-live is-off" title="rGuest could not be reached just now — room conditions are from the last sync"><span className="hk-live-dot" /><span>Live unavailable</span></div>)}
          <button type="button" className="hk-btn" onClick={() => { loadAll(); loadPlans(); }} disabled={loading}><IcRefresh size={15} />Refresh rooms</button>
          {simple && !readOnly && <button type="button" className="hk-btn hk-btn-primary" onClick={save} disabled={!dirty || hks.length === 0}>{dirty ? 'Save' : 'Saved'}</button>}
          <button type="button" className="hk-btn hk-btn-dark" onClick={printAll} disabled={canMaster ? loading : viewHks.length === 0}><IcPrint size={16} />Print all sheets</button>
        </div>
        {!simple && (
            <div className="hk-links" role="group" aria-label="Housekeeping tools">
              {dev && <button type="button" className="hk-link" onClick={() => setHistOpen(true)}><IcClock size={16} />Snapshot history</button>}
              <button type="button" className="hk-link" onClick={() => setRulesOpen(true)}><IcGear size={16} />Housekeeping settings</button>
              <button type="button" className="hk-link" onClick={() => printNow('all')} disabled={viewHks.length === 0}><IcPrint size={16} />Print housekeeper sheets</button>
              <button type="button" className="hk-link" onClick={() => setLogOpen(true)}><IcDoc size={16} />Assignment log</button>
            </div>
        )}
      </header>

      {error && <p className="hk-error" role="alert">{error}</p>}
      {loading && <p className="hk-muted">Loading rooms…</p>}

      {!loading && payload && (
        <>
          {!simple && (
            <section className="fc-kpis hk-kpis hk-kpis-7" aria-label="Workload">
              <KpiCard accent="staying" icon={<IcBroom />} label="To clean" primary={cleanN} sublabel="check-outs" ring={total > 0 ? cleanN / total : 0} ringColor="#2f855a" ringLabel={`${cleanN} of ${total} rooms to clean`} />
              <KpiCard accent="inhouse" icon={<IcBed />} label="To service" primary={serviceN} sublabel="stay-overs" ring={total > 0 ? serviceN / total : 0} ringColor="#2b6cb0" ringLabel={`${serviceN} of ${total} rooms to service`} />
              <KpiCard accent="dirty" icon={<IcHourglass />} label="IP" primary={ipN} sublabel="being cleaned" />
              <KpiCard accent="arrivals" icon={<IcLayers />} label="Total workload" primary={Math.round(totalUnits * 10) / 10} sublabel="clean + service" />
              <KpiCard accent="inhouse" icon={<IcPeople />} label="Housekeepers" primary={viewHks.length} sublabel="working" />
              <KpiCard accent="default" icon={<IcBars />} label="Avg. workload" primary={viewHks.length ? Math.round(avgUnits * 10) / 10 : '—'} sublabel={`target ${viewSettings.min}–${viewSettings.max}`} />
              <KpiCard accent="staying" icon={<IcCheck />} label="Progress" primary={`${pctAssigned}%`} sublabel={`${assignedN} of ${total} rooms`} ring={total > 0 ? assignedN / total : 0} ringColor="#2f855a" ringLabel={`${assignedN} of ${total} rooms assigned`} />
            </section>
          )}

          {!readOnly && warn.overall && <p className="hk-warnbar" role="alert">{warn.overall}</p>}
          {readOnly && (
            <div className="hk-readonly" role="status">
              <strong>{dayText(date)}</strong> — saved plan, read-only.
              <button type="button" className="hk-btn hk-btn-sm" onClick={() => chooseDay(0)}>Back to today</button>
              {!past && <span className="hk-muted-inline">Nothing was saved for this day.</span>}
            </div>
          )}
          {!readOnly && items.length === 0 && <p className="hk-muted">Nothing to clean or service for this day.</p>}

          {!simple && (
                <section className="hk-panel hk-daycard hk-daycard-wide" aria-label="Days">
                  <div className="hk-daycard-head">
                    <h2>Calendar<InfoTip title="Days" label="About the calendar"><p>Pick a day to plan it (today, tomorrow) or to look at what was saved on a past day. Past days open read-only and can be printed again. A day with a saved plan shows its housekeepers and rooms.</p></InfoTip></h2>
                    <span className="hk-daynav" role="group" aria-label="Scroll days">
                      <button type="button" className="hk-btn hk-btn-sm" aria-label="Earlier days" onClick={() => { const e = stripRef.current; if (e) { if (e.scrollBy) e.scrollBy({ left: -e.clientWidth * 0.8, behavior: 'smooth' }); else e.scrollLeft -= e.clientWidth * 0.8; } }}>‹</button>
                      <button type="button" className="hk-btn hk-btn-sm" aria-label="Later days" onClick={() => { const e = stripRef.current; if (e) { if (e.scrollBy) e.scrollBy({ left: e.clientWidth * 0.8, behavior: 'smooth' }); else e.scrollLeft += e.clientWidth * 0.8; } }}>›</button>
                    </span>
                  </div>
                  <div className="hk-strip" ref={stripRef} role="tablist" aria-label="Day">
                    {days.map(n => {
                      const ymd = addDays(today, n), p = parts(ymd), pl = planByDate.get(ymd);
                      return (
                        <button key={n} type="button" role="tab" aria-selected={offset === n} className={`hk-day${offset === n ? ' on' : ''}${n < 0 ? ' past' : ''}${pl ? ' has' : ''}`} onClick={() => chooseDay(n)} title={n < 0 ? (pl ? `${pl.hks} housekeepers · ${pl.rooms} rooms (read-only)` : 'No plan was saved') : undefined}>
                          <b>{n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : p.wd}</b><span>{p.m} {p.d}</span>
                          <small>{pl ? `${pl.hks} HK · ${pl.rooms} rooms` : n < 0 ? 'no plan' : ''}</small>
                        </button>
                      );
                    })}
                  </div>
                </section>
          )}
          {!simple && (
            <section className="hk-panel hk-plan" aria-label="Plan the day">
              <div className="hk-plan-head">
                <div>
                  <h2>Plan the day{!isConfirmed && !readOnly && <span className="hk-stepchip">Step 1</span>}</h2>
                  <p className="hk-muted">{readOnly ? 'The plan saved for this day — read-only.' : isConfirmed ? 'Plan confirmed — place the rooms below, or change the people / rules and auto-assign again.' : 'Choose who is working and check the split, then confirm — the rooms appear below.'}</p>
                </div>
                <div className="hk-tools">
                  {!readOnly && (
                    <>
                      <button type="button" className="hk-btn hk-btn-primary" onClick={() => confirmPlan(false)} disabled={hks.length === 0 || items.length === 0}>{isConfirmed ? <><IcWand size={16} />Auto-assign</> : <><IcCheck size={16} />Confirm plan</>}</button>
                      {!isConfirmed && <button type="button" className="hk-btn" onClick={() => confirmPlan(true)} disabled={hks.length === 0 || items.length === 0}>Assign by hand</button>}
                      <button type="button" className="hk-btn hk-btn-save" onClick={save} disabled={!dirty || hks.length === 0}>{dirty ? 'Save' : 'Saved'}</button>
                      {isConfirmed && (resetAsk ? (
                        <span className="hk-confirm" role="alertdialog" aria-label="Confirm reset">Put every room back in "Not assigned"?
                          <button type="button" className="hk-btn hk-btn-sm hk-btn-danger" onClick={doReset}>Yes, reset</button>
                          <button type="button" className="hk-btn hk-btn-sm" onClick={() => setResetAsk(false)}>Cancel</button>
                        </span>
                      ) : (
                        <button type="button" className="hk-btn" onClick={() => setResetAsk(true)} disabled={poolCards.length === items.length}>Reset</button>
                      ))}
                    </>
                  )}
                </div>
              </div>
              {!readOnly && (
                <div className="hk-modebar" role="group" aria-label="How to plan">
                  {canNames && (
                    <>
                      <span>Plan by</span>
                      <span className="hk-seg">
                        <button type="button" className={!anon ? 'on' : ''} aria-pressed={!anon} onClick={() => switchMode(false)}>Names</button>
                        <button type="button" className={anon ? 'on' : ''} aria-pressed={anon} onClick={() => switchMode(true)}>No name</button>
                      </span>
                    </>
                  )}
                  <DayPicker offset={offset} today={today} onChoose={chooseDay} />
                  <span className="hk-who-wrap">
                    <button type="button" className="hk-btn hk-who-btn" data-pop-anchor aria-expanded={whoOpen} onClick={() => setWhoOpen(o => !o)}><IcPeople size={16} />{anon ? 'How many' : "Who's working"}<b>{whoCount}</b><IcChevron size={14} sw={2.4} /></button>
                    <Popover open={whoOpen} onClose={() => setWhoOpen(false)} className="hk-who-pop">
                      {anon
                        ? <CountCard count={anonCount} draft={countDraft} setDraft={setCountDraft} onApply={applyCount} disabled={readOnly} blank={!!settings.blankNames} onBlank={(v) => { setSettings(st => ({ ...st, blankNames: v })); touch(); }} people={hks.map(h => ({ userId: h.userId, typed: anonNames[h.userId] || '' }))} onName={nameAnon} />
                        : <StaffChecklist staff={staff} chosen={hks} disabled={readOnly} hkDept={HK_DEPT} onToggle={(p, on) => (on ? addHk(p) : removeHk(p.userId))} />}
                    </Popover>
                  </span>
                  <button type="button" className="hk-btn" onClick={() => setRulesOpen(true)}><IcGear size={16} />Rules</button>
                  <span className="hk-savestate" role="status">{saveText}</span>
                </div>
              )}


              <div className="hk-preview" aria-label="Plan preview">
                <div className="hk-preview-head">
                  <h3>{readOnly ? 'Saved split' : isConfirmed ? 'Current split' : 'Proposed split'}</h3>
                  <span className="hk-muted-inline">{previewSum.hks.length ? `${previewSum.hks.reduce((n, h) => n + h.rooms, 0)} of ${total} rooms · ${previewSum.hks.length} housekeeper${previewSum.hks.length === 1 ? '' : 's'}` : `${total} rooms need work`}{!readOnly && !isConfirmed && previewSum.hks.length > 0 ? ' · nothing is assigned until you confirm' : ''}</span>
                  {previewFlags.length > 0 && <span className="hk-carflag hk-pv-flags" role="status">{previewFlags.join(' · ')}</span>}
                </div>
                {previewSum.hks.length === 0 ? (
                  <div className="hk-emptyboard hk-empty-plan">
                    {readOnly ? <p>Nothing was saved for this day.</p> : (
                      <>
                        <IcPeople size={26} />
                        <p>{anon ? 'Say how many housekeepers are working to see the split.' : 'Choose who is working to see how the rooms would be shared.'}</p>
                        <button type="button" className="hk-btn hk-btn-primary" onClick={() => setWhoOpen(true)}>{anon ? 'Enter how many' : 'Choose who is working'}</button>
                      </>
                    )}
                  </div>
                ) : (
                  <ul className="hk-pv-list">
                    {previewSum.hks.map(h => {
                      const pct = Math.min(100, viewSettings.max > 0 ? (h.units / viewSettings.max) * 100 : 100), minPct = Math.min(100, (viewSettings.min / viewSettings.max) * 100);
                      const flag = pvWarn.perHk[h.userId];
                      const floors = dev ? [...new Set(items.filter(i => previewAssign[i.roomNumber] === h.userId).map(i => i.floorId))].sort((a, b) => floorRank(a) - floorRank(b)).map(f => (f === 'G' ? 'G' : f)).join(' · ') : '';
                      return (
                        <li key={h.userId} className={`hk-pv${flag ? ` flag-${flag}` : ''}`} data-user={h.userId}>
                          <span className="hk-avatar" aria-hidden="true"><IcUser size={18} /></span>
                          <div className="hk-pv-body">
                            <div className="hk-pv-top"><b>{h.name}</b><span className="hk-pv-rooms"><strong>{h.rooms}</strong> rooms</span></div>
                            <small>{h.clean} clean · {h.service} service · workload <strong>{fmt(h.units)}</strong>{dev && floors ? ` · floors ${floors}` : ''}</small>
                            <div className="hk-meterrow"><div className="hk-meter" title={`Minimum ${viewSettings.min} · maximum ${viewSettings.max}`}><span className={flag || ''} style={{ width: `${pct}%` }} /><i style={{ left: `${minPct}%` }} /></div><span className="hk-pct">{Math.round(pct)}%</span></div>
                            {!readOnly && !anon && (
                              <div className="hk-pv-prefs" role="group" aria-label={`${h.name}'s preferred floors`}>
                                <span>Prefers</span>
                                {floorChoices.map(f => { const on = (prefs.floors[h.userId] || []).includes(f); return <button key={f} type="button" className={`hk-chip${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${h.name} prefers ${floorLabel(f)}`} onClick={() => toggleFloorPref(h.userId, f)}>{f}</button>; })}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {previewSum.unassigned.rooms > 0 && (
                      <li className="hk-pv hk-pv-un"><span className="hk-avatar" aria-hidden="true"><IcHand size={18} /></span><div className="hk-pv-body"><div className="hk-pv-top"><b>Not assigned</b><span className="hk-pv-rooms"><strong>{previewSum.unassigned.rooms}</strong> rooms</span></div><small>{previewSum.unassigned.clean} clean · {previewSum.unassigned.service} service</small></div></li>
                    )}
                  </ul>
                )}
              </div>
            </section>
          )}

          {showBoard && (
            <div className="hk-step2" ref={stepRef}>
            {!readOnly && <section className={`hk-panel hk-pool hk-pool2 hk-pool-wide${over === 'pool' ? ' over' : ''}`} aria-label="Unassigned rooms" {...zone('pool', null)}>
              <div className="hk-pool-top">
                <div className="hk-col-head"><h2>Not assigned</h2><span className="hk-count">{poolCards.filter(c => !c.ip).length}</span>{!readOnly && <span className="hk-dragtip"><IcHand size={15} />Drag to a housekeeper below</span>}</div>
                {!readOnly && poolCards.some(c => !c.ip) && (
                  <div className="hk-pool-tools">
                    <button type="button" className="hk-btn hk-btn-xs hk-pool-all" onClick={() => setSelected(poolCards.filter(c => !c.ip).map(c => c.roomNumber))}>Select all {poolCards.filter(c => !c.ip).length}</button>
                    <small className="hk-multihint">Several at once: Ctrl/⌘-click · Shift-click for a range · <b>Select rooms</b> on a floor to tick with the mouse · <b>Move to…</b> sends the ticked rooms (or the whole floor) · or drag a floor's header</small>
                  </div>
                )}
                {legend}
                {poolCards.some(c => c.ip) && <p className="hk-ipnote" role="note"><b>{poolCards.filter(c => c.ip).length} in progress</b> — someone is already on {poolCards.filter(c => c.ip).length === 1 ? 'it' : 'them'}, so Auto-assign leaves {poolCards.filter(c => c.ip).length === 1 ? 'it' : 'them'} alone. Drag one to a housekeeper if it still needs a cleaner.</p>}
                {items.length > 0 && hks.length === 0 && !readOnly && <p className="hk-muted">{anon ? 'Enter how many housekeepers are working.' : 'Choose who is working, then place the rooms.'}</p>}
              </div>
              <div className="hk-pool-floors hk-pool-cols hk-scroll">{renderFloors('pool', poolFloors, true)}</div>
            </section>}
              <section className="hk-panel hk-assign" aria-label="Housekeepers' assignments">
                <div className="hk-assign-head">
                  <div className="hk-col-head"><h2>Housekeepers&rsquo; assignments</h2><span className="hk-count">{viewHks.length}</span></div>
                  {simple && !readOnly && (
                    <div className="hk-tools">
                      <button type="button" className="hk-btn hk-btn-primary" onClick={autoAssign} disabled={hks.length === 0 || items.length === 0}><IcWand size={16} />Auto-assign</button>
                      {resetAsk ? (
                        <span className="hk-confirm" role="alertdialog" aria-label="Confirm reset">Put every room back in "Not assigned"?
                          <button type="button" className="hk-btn hk-btn-sm hk-btn-danger" onClick={doReset}>Yes, reset</button>
                          <button type="button" className="hk-btn hk-btn-sm" onClick={() => setResetAsk(false)}>Cancel</button>
                        </span>
                      ) : (
                        <button type="button" className="hk-btn" onClick={() => setResetAsk(true)} disabled={poolCards.length === items.length}>Reset</button>
                      )}
                      <button type="button" className="hk-btn" onClick={printAll} disabled={canMaster ? loading : viewHks.length === 0}><IcPrint size={16} />Print all sheets</button>
                    </div>
                  )}
                </div>

                {simple && (<>
                {!readOnly && (
                  <div className="hk-modebar" role="group" aria-label="How to plan">
                    {canNames && (
                      <>
                        <span>Plan by</span>
                        <span className="hk-seg">
                          <button type="button" className={!anon ? 'on' : ''} aria-pressed={!anon} onClick={() => switchMode(false)}>Names</button>
                          <button type="button" className={anon ? 'on' : ''} aria-pressed={anon} onClick={() => switchMode(true)}>No name</button>
                        </span>
                      </>
                    )}
                    <DayPicker offset={offset} today={today} onChoose={chooseDay} />
                    <span className="hk-who-wrap">
                      <button type="button" className="hk-btn hk-who-btn" data-pop-anchor aria-expanded={whoOpen} onClick={() => setWhoOpen(o => !o)}><IcPeople size={16} />{anon ? 'How many' : "Who's working"}<b>{whoCount}</b><IcChevron size={14} sw={2.4} /></button>
                      <Popover open={whoOpen} onClose={() => setWhoOpen(false)} className="hk-who-pop">
                        {anon
                          ? <CountCard count={anonCount} draft={countDraft} setDraft={setCountDraft} onApply={applyCount} disabled={readOnly} blank={!!settings.blankNames} onBlank={(v) => { setSettings(st => ({ ...st, blankNames: v })); touch(); }} people={hks.map(h => ({ userId: h.userId, typed: anonNames[h.userId] || '' }))} onName={nameAnon} />
                          : <StaffChecklist staff={staff} chosen={hks} disabled={readOnly} hkDept={HK_DEPT} onToggle={(p, on) => (on ? addHk(p) : removeHk(p.userId))} />}
                      </Popover>
                    </span>
                    <button type="button" className="hk-btn" onClick={() => setRulesOpen(true)}><IcGear size={16} />Rules</button>
                    <span className="hk-savestate" role="status">{saveText}</span>
                  </div>
                )}

                </>)}

                {clip.length > 0 && !readOnly && <p className="hk-clipbar" role="status">{clip.length} card{clip.length === 1 ? '' : 's'} copied — put the mouse over a housekeeper (or Not assigned) and press <kbd>Ctrl/⌘ V</kbd>, or right-click a group → Paste. <button type="button" className="hk-btn hk-btn-sm" onClick={() => setClip([])}>Clear</button></p>}

                {items.length > 0 && (colCount > 3 || boardFlags.length > 0) && (
                  <div className="hk-carctl" role="group" aria-label="Housekeepers in view">
                    {colCount > 3 && (
                      <>
                        <span className="hk-carcount">Housekeepers {vstart + 1}–{Math.min(colCount, vstart + perView())} of {colCount}</span>
                        <button type="button" className="hk-btn hk-btn-sm" aria-label="Previous housekeeper" disabled={vstart <= 0} onClick={() => goCol(vstart - 1)}><IcChevronL size={14} sw={2.4} />Prev</button>
                        <button type="button" className="hk-btn hk-btn-sm" aria-label="Next housekeeper" disabled={vstart + perView() >= colCount} onClick={() => goCol(vstart + 1)}>Next<IcChevronR size={14} sw={2.4} /></button>
                      </>
                    )}
                    {boardFlags.length > 0 && <span className="hk-carflag" role="status">{boardFlags.join(' · ')}</span>}
                  </div>
                )}
                {sum.hks.length === 0 && (
                  <div className="hk-emptyboard">
                    {readOnly ? '' : (
                      <>
                        <IcPeople size={28} />
                        <p>{anon ? 'Housekeepers appear once you say how many.' : 'Housekeepers appear here once you choose who is working.'}</p>
                        <button type="button" className="hk-btn hk-btn-primary" onClick={() => setWhoOpen(true)}>{anon ? 'Enter how many' : 'Choose who is working'}</button>
                      </>
                    )}
                  </div>
                )}
                {sum.hks.length > 0 && (
                  <div className="hk-board-wrap">
                  {dragging && colCount > perView() && (
                    <>
                      <div className={`hk-edge hk-edge-left${canScroll.l ? ' can' : ''}${edge === 'left' && canScroll.l ? ' hot' : ''}`} aria-hidden="true"><span>‹</span></div>
                      <div className={`hk-edge hk-edge-right${canScroll.r ? ' can' : ''}${edge === 'right' && canScroll.r ? ' hot' : ''}`} aria-hidden="true"><span>›</span></div>
                    </>
                  )}
                  <div className={`hk-board${dev ? ' dev' : ''}${dragging ? ' is-dragging' : ''}`} ref={boardEl} onScroll={onBoardScroll} onDragOver={edgeScroll}>
                    {sum.hks.map(h => {
                      const mine = items.filter(i => assign[i.roomNumber] === h.userId);
                      const pct = Math.min(100, viewSettings.max > 0 ? (h.units / viewSettings.max) * 100 : 100), minPct = Math.min(100, (viewSettings.min / viewSettings.max) * 100);
                      const flag = warn.perHk[h.userId];
                      return (
                        <section key={h.userId} className={`hk-col hk-hkcol${over === h.userId ? ' over' : ''}${flag ? ` flag-${flag}` : ''}`} aria-label={`${h.name}'s rooms`} {...zone(h.userId, h.userId)}>
                          <div className="hk-col-head hk-hk-head">
                            <span className="hk-avatar" aria-hidden="true"><IcUser size={20} /></span>
                            <div className="hk-hk-title">
                              {renaming === h.userId ? (
                                <input className="hk-input hk-rename" autoFocus type="text" maxLength={40} value={renameDraft} placeholder={`Housekeeper ${h.userId.replace('anon-', '')}`} aria-label={`New name for ${h.name}`} autoComplete="off"
                                  onChange={(e) => setRenameDraft(e.target.value)} onBlur={commitRename}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } else if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }} />
                              ) : (
                                <>
                                  <h2>{h.name}</h2>
                                  {!readOnly && anon && <button type="button" className="hk-rename-btn" aria-label={`Rename ${h.name}`} title="Type a name" onClick={() => { setRenameDraft(anonNames[h.userId] || ''); setRenaming(h.userId); }}><IcPencil size={14} /></button>}
                                </>
                              )}
                            </div>
                            {!readOnly && !anon && <button type="button" className="hk-x" aria-label={`Remove ${h.name}`} onClick={() => removeHk(h.userId)}>×</button>}
                            <button type="button" className="hk-btn hk-btn-sm hk-print-btn" onClick={() => printNow(h.userId)} disabled={mine.length === 0}><IcPrint size={14} />Print sheet</button>
                          </div>
                          <p className="hk-col-sum"><strong>{h.rooms}</strong> rooms · {h.clean} clean · {h.service} service · workload <strong>{fmt(h.units)}</strong></p>
                          <div className="hk-meterrow">
                            <div className="hk-meter" title={`Minimum ${viewSettings.min} · maximum ${viewSettings.max}`}><span className={flag || ''} style={{ width: `${pct}%` }} /><i style={{ left: `${minPct}%` }} /></div>
                            <span className="hk-pct">{Math.round(pct)}%</span>
                          </div>
                          <div className="hk-col-body hk-scroll">{mine.length === 0 ? <p className="hk-muted">No rooms yet.</p> : renderFloors(h.userId, byFloor(mine).map(f => ({ ...f })))}</div>
                        </section>
                      );
                    })}
                  </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {dev && !readOnly && items.length > 0 && (
            <>
              <p className="hk-devnote" aria-label="Balancer details">DEV · total workload {fmt(totalUnits)} · {hks.length || 0} housekeeper(s) · target {hks.length ? fmt(totalUnits / hks.length) : '—'} each · hand-placed {Object.keys(pinned).length} · auto-assigned {Object.keys(auto).length} · locked rooms {lockedRooms.length} · cuts snap to floor boundaries within 20% of a share unless that would exceed the max</p>
              <HkRoomTable sheet={sheet} items={items} assign={assign} hks={hks} pinned={pinned} guestOf={guestOf} offset={offset} date={date} />
            </>
          )}
        </>
      )}

      {rulesOpen && (
        <HkModal title="Housekeeping settings" onClose={() => setRulesOpen(false)}>
          <p className="hk-muted">Workload rules for {dayText(date)} — saved with the plan. A check-out clean counts <b>Clean =</b>, a stay-over service counts <b>Service =</b>; each housekeeper should land between <b>Min</b> and <b>Max</b>.</p>
          <div className="hk-rules">
            <NumField label="Min" value={settings.min} min={1} max={100} step={1} disabled={readOnly} onChange={(v) => setNum('min', v)} />
            <NumField label="Max" value={settings.max} min={1} max={200} step={1} disabled={readOnly} onChange={(v) => setNum('max', v)} />
            <NumField label="Clean =" value={settings.cleanWeight} min={0.1} max={5} step={0.1} disabled={readOnly} onChange={(v) => setNum('cleanWeight', v)} />
            <NumField label="Service =" value={settings.serviceWeight} min={0} max={5} step={0.1} disabled={readOnly} onChange={(v) => setNum('serviceWeight', v)} />
          </div>
          {readOnly && <p className="hk-muted">This is a past day — its rules can't be changed.</p>}
          <div className="hk-opt-row hk-prio-row" aria-label="Priority room types">
            <b>Priority room types</b>
            <small>Every room of a ticked type that needs cleaning is cleaned first and printed pink — in addition to rooms already pre-assigned to an arriving guest. Kept for every day.</small>
            <div className="hk-chips">
              {typeChoices.length === 0 && <small>Room types appear once the room data has loaded.</small>}
              {typeChoices.map(([code, label]) => { const on = prefs.priorityTypes.includes(code); return <button key={code} type="button" className={`hk-chip hk-chip-type${on ? ' on' : ''}`} aria-pressed={on} title={label} disabled={readOnly} onClick={() => togglePriorityType(code)}>{code}<small>{label !== code ? label : ''}</small></button>; })}
            </div>
          </div>
          {dev && <HkDevSwitch settingKey="hk_plan_by_name" aria="Planning options (dev)" value={namesAllowed} onChange={setNamesAllowed} label="Managers and the front desk may plan by name"
            hint="Off (the default): they only plan with “No name” — the numbered housekeepers, whose names can be typed in before printing. On: they also get the Names mode with the staff list. Dev always has both." />}
          {dev && <HkDevSwitch settingKey="hk_print_slips" aria="Print options (dev)" value={slips} onChange={setSlips} label="Print return slips after each sheet"
            hint="One extra page per housekeeper with two half-page slips (to hand back during and at the end of the shift). Each has three columns — Cleaned, Serviced, DND — with the housekeeper's own rooms already listed to tick, and blank lines for DND rooms." />}
          {dev && <HkPrintColors colors={colors} onSaved={setColors} />}
        </HkModal>
      )}
      {logOpen && (
        <HkModal title="Assignment log" onClose={() => setLogOpen(false)}>
          <p className="hk-muted">Saved plans for the last {HISTORY_DAYS} days. Past days open read-only; you can print them again.</p>
          <ul className="hk-log">
            {[...days].reverse().map(n => {
              const ymd = addDays(today, n), p = parts(ymd), pl = planByDate.get(ymd);
              return (
                <li key={n} className={`${offset === n ? 'on ' : ''}${n < 0 ? 'past' : ''}`}>
                  <button type="button" onClick={() => { setLogOpen(false); chooseDay(n); }}>
                    <b>{n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : p.wd}</b><span>{p.m} {p.d}</span>
                    <small>{pl ? `${pl.hks} housekeeper${pl.hks === 1 ? '' : 's'} · ${pl.rooms} rooms` : n < 0 ? 'no plan saved' : 'not saved yet'}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </HkModal>
      )}
      {histOpen && dev && <ForecastHistory onClose={() => setHistOpen(false)} />}

      {ask && <ConfirmModal {...ask} onClose={() => setAsk(null)} />}
      {menu && <CardMenu menu={menu} hks={hks} canPaste={clip.length > 0} clipCount={clip.length} onMove={moveCards} onCopy={copyCards} onPaste={(g) => { pasteTo(g); setMenu(null); }} onClose={() => setMenu(null)} />}
      {printing && <HkSheets dateLabel={dayText(date)} master={master} sheets={sheets} settings={viewSettings} colors={colors} slips={slips} onDone={() => setPrinting(null)} />}
    </div>
  );
};

export default Housekeeping;
