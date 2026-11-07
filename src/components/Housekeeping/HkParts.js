/* global globalThis */
// Sprint 24.5 — small building blocks of the redesigned Housekeeping page: icons, the donut, the floor accordion, the "who is working" panel
// (checkbox list / number stepper), and a modal. Presentational only — all assignment logic stays in index.js / hkWork.js.
import React, { useEffect, useMemo, useRef, useState } from 'react';

const Svg = ({ children, size = 20, sw = 2 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const IcBroom   = (p) => <Svg {...p}><path d="M14 3l7 7" /><path d="M13 6l5 5-6 6c-2 2-6 3-9 3 0-3 1-7 3-9z" /><path d="M8 13l3 3" /></Svg>;
export const IcBed     = (p) => <Svg {...p}><path d="M2 17v-5a2 2 0 0 1 2-2h11a4 4 0 0 1 4 4v3" /><path d="M2 17h20" /><circle cx="7" cy="12" r="1.5" /></Svg>;
export const IcLayers  = (p) => <Svg {...p}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /><path d="M3 17.5l9 5 9-5" /></Svg>;
export const IcPeople  = (p) => <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17 14c2.8.2 4.5 2.2 4.5 5" /></Svg>;
export const IcBars    = (p) => <Svg {...p}><path d="M6 20v-7M12 20V5M18 20v-10" /></Svg>;
export const IcCheck   = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></Svg>;
export const IcUser    = (p) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></Svg>;
export const IcPrint   = (p) => <Svg {...p}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></Svg>;
export const IcWand    = (p) => <Svg {...p}><path d="M5 19L17 7" /><path d="M15 5l4 4" /><path d="M19 2v3M17.5 3.5h3M5 4v2M4 5h2" /></Svg>;
export const IcGear    = (p) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>;
export const IcClock   = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const IcDoc     = (p) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></Svg>;
export const IcRefresh = (p) => <Svg {...p}><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M3 21v-5h5" /></Svg>;
export const IcHand    = (p) => <Svg {...p}><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.7 0-4-1.4-5.5-4L4 14.5a1.5 1.5 0 0 1 2.4-1.7L8 14" /></Svg>;
export const IcHourglass = (p) => <Svg {...p}><path d="M6 3h12M6 21h12" /><path d="M7 3c0 5 3 6 5 9-2 3-5 4-5 9" /><path d="M17 3c0 5-3 6-5 9 2 3 5 4 5 9" /></Svg>;

/** Collapsible floor section: header (floor, room count, caret) + body. The body stays mounted (so cards are always in the DOM, and closing animates). */
// Sprint 25: `actions` = per-floor controls next to the header (select the whole floor, move it to a housekeeper); `dragProps` makes the header draggable (drag a whole floor).
export const FloorSection = ({ label, count, open, onToggle, floorId, children, actions, dragProps }) => (
  <div className={`hk-floor hk-acc${open ? ' open' : ''}${count === 0 ? ' is-empty' : ''}`} data-floor={floorId}>
    <div className="hk-acc-bar" {...(dragProps || {})}>
      <button type="button" className="hk-acc-head" aria-expanded={open} onClick={onToggle}>
        <span className="hk-floor-label">{label}</span>
        <span className="hk-acc-count">{count === 0 ? 'none' : `${count} room${count === 1 ? '' : 's'}`}</span>
        <span className="hk-acc-caret" aria-hidden="true">⌄</span>
      </button>
      {actions && <div className="hk-acc-actions">{actions}</div>}
    </div>
    <div className="hk-acc-body"><div className="hk-acc-in" aria-hidden={!open}>{children}</div></div>
  </div>
);

// Sprint 24.6 — pop-ups fade in and out. Tests (and "reduce motion") set globalThis.__HOTELOPS_NO_ANIM / prefers-reduced-motion: then they appear and vanish at once.
const FADE_MS = 180;
const noAnim = () => { try { return !!globalThis.__HOTELOPS_NO_ANIM || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };
const raf = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
const caf = (id) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));
/** Keeps something mounted while it fades out. `shown` = the CSS "in" state. */
function useFade(open) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open && noAnim());
  useEffect(() => {
    if (open) {
      setMounted(true);
      if (noAnim()) { setShown(true); return undefined; }
      const id = raf(() => raf(() => setShown(true)));
      return () => caf(id);
    }
    setShown(false);
    if (noAnim()) { setMounted(false); return undefined; }
    const t = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(t);
  }, [open]);
  return { mounted, shown };
}

/** A centred dialog (rules, assignment log). Fades in; Esc / backdrop / × fade it out, then call onClose. */
export const HkModal = ({ title, onClose, children, wide }) => {
  const [open, setOpen] = useState(true);
  const { mounted, shown } = useFade(open);
  const closing = useRef(false);
  const close = () => { if (closing.current) return; closing.current = true; setOpen(false); if (noAnim()) onClose(); else setTimeout(onClose, FADE_MS); };
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });   // eslint-disable-line react-hooks/exhaustive-deps
  if (!mounted) return null;
  return (
    <div className={`hk-modal-back${shown ? ' in' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={`hk-modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button type="button" className="hk-x" aria-label="Close" onClick={close}>×</button></header>
        <div className="hk-modal-body">{children}</div>
      </div>
    </div>
  );
};

/** Pop-over under a button; fades in / out; closes on outside click / Esc. */
export const Popover = ({ open, onClose, children, className = '' }) => {
  const ref = useRef(null);
  const { mounted, shown } = useFade(open);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !(e.target.closest && e.target.closest('[data-pop-anchor]'))) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down); window.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key); };
  }, [open, onClose]);
  if (!mounted) return null;
  return <div className={`hk-pop ${shown ? 'in' : ''} ${className}`} ref={ref} role="dialog">{children}</div>;
};

/** Names mode: everyone, searchable; tick = working. */
export const StaffChecklist = ({ staff, chosen, onToggle, disabled, hkDept }) => {
  const [q, setQ] = useState('');
  const hasHk = staff.some(s => hkDept.test(s.department || ''));
  const [onlyHk, setOnlyHk] = useState(true);
  const restrict = onlyHk && hasHk;
  const taken = useMemo(() => new Set(chosen.map(c => c.userId)), [chosen]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return staff.filter(s => (!restrict || hkDept.test(s.department || '')) && (!needle || s.name.toLowerCase().includes(needle))).sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, q, restrict, hkDept]);
  return (
    <section className="hk-staff" aria-label="Staff">
      <div className="hk-panel-head"><h2>Staff</h2><span className="hk-count">{list.length}</span></div>
      <input id="hk-search" className="hk-input" type="search" placeholder="Search by name…" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
      {hasHk && (
        <button type="button" role="switch" aria-checked={onlyHk} className={`hk-switch${onlyHk ? ' on' : ''}`} onClick={() => setOnlyHk(!onlyHk)}>
          <span className="hk-switch-track"><span className="hk-switch-knob" /></span>Housekeeping department only
        </button>
      )}
      <ul className="hk-staff-list" aria-label="Staff list">
        {list.length === 0 && <li className="hk-empty">{staff.length === 0 ? 'No staff loaded.' : 'No one matches.'}</li>}
        {list.map(s => {
          const on = taken.has(s.user_id);
          return (
            <li key={s.user_id} className={on ? 'added' : ''}>
              <label className="hk-check">
                <input type="checkbox" checked={on} disabled={disabled} aria-label={`${s.name} is working`} onChange={(e) => onToggle({ userId: s.user_id, name: s.name }, e.target.checked)} />
                <span className="hk-staff-name">{s.name}<small>{s.department || '—'}</small></span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
