// Sprint 26 — small controls for the Log Book in the app's own style (no browser date / time / select widgets): a floating panel, a date field with a
// month popover, a time field with a 15-minute list, and a "…" action menu. Panels are portaled with fixed coordinates so a scrolling parent never clips them.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { monthGrid, addMonths, todayYmd, shortDay, fmtTime, TIME_SLOTS } from './logbookModel';

const Svg = ({ children, size = 18, sw = 2 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
export const Ic = {
  Calendar: (p) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Svg>,
  Clock: (p) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>,
  Pencil: (p) => <Svg {...p}><path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Svg>,
  Dots: (p) => <Svg {...p}><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></Svg>,
  Pin: (p) => <Svg {...p}><path d="M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z" /></Svg>,
  Plus: (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  ChevL: (p) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>,
  ChevR: (p) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>,
  ChevD: (p) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>,
  People: (p) => <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17 14c2.8.2 4.5 2.2 4.5 5" /></Svg>,
  Alert: (p) => <Svg {...p}><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.3v.2" /></Svg>,
  Flag: (p) => <Svg {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Svg>,
  Info: (p) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.2" /></Svg>,
  Send: (p) => <Svg {...p}><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" /></Svg>,
  Check: (p) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>,
  X: (p) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  Archive: (p) => <Svg {...p}><rect x="3" y="4" width="18" height="4.5" rx="1.2" /><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4" /></Svg>,
  Copy: (p) => <Svg {...p}><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></Svg>,
  Restore: (p) => <Svg {...p}><path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5" /><path d="M4 4v4.5h4.5" /></Svg>,
  Search: (p) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Svg>,
};

/** a panel under (or, near the bottom of the window, above) the element it belongs to */
export const Floating = ({ anchorRef, onClose, children, className = '', height = 320, align = 'left', width }) => {
  const box = useRef(null);
  const [at, setAt] = useState(null);
  useLayoutEffect(() => {
    const a = anchorRef.current; if (!a) return;
    const r = a.getBoundingClientRect(), vw = window.innerWidth || 1200, vh = window.innerHeight || 800, w = width || Math.max(r.width, 240);
    const left = align === 'right' ? Math.max(8, Math.min(r.right - w, vw - w - 8)) : Math.max(8, Math.min(r.left, vw - w - 8));
    setAt({ left, minWidth: w, ...(r.bottom + height + 12 > vh && r.top > height ? { bottom: vh - r.top + 6 } : { top: r.bottom + 6 }) });
  }, [anchorRef, height, align, width]);
  useEffect(() => {
    const inside = (e) => (box.current && box.current.contains(e.target)) || (anchorRef.current && anchorRef.current.contains(e.target));
    const down = (e) => { if (!inside(e)) onClose(); }, key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const scroll = (e) => { if (!inside(e)) onClose(); };
    document.addEventListener('mousedown', down); window.addEventListener('keydown', key, true); window.addEventListener('resize', onClose); window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); window.removeEventListener('resize', onClose); window.removeEventListener('scroll', scroll, true); };
  }, [onClose, anchorRef]);
  if (!at) return null;
  return createPortal(<div className={`lb-float ${className}`} ref={box} style={at} role="dialog">{children}</div>, document.body);
};

const Field = ({ icon, label, value, ariaLabel, open, setOpen, btn, children, placeholder }) => (
  <div className="lb-field">
    <button type="button" ref={btn} className={`lb-fieldbtn${open ? ' open' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen(!open)}>
      {icon}<span>{value || <em>{placeholder}</em>}</span><Ic.ChevD size={15} sw={2.4} />
    </button>
    {open && children}
  </div>
);

export const DateField = ({ value, onChange, ariaLabel }) => {
  const btn = useRef(null), [open, setOpen] = useState(false);
  const [view, setView] = useState(value || todayYmd());
  useEffect(() => { if (open) setView(value || todayYmd()); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const g = monthGrid(view), today = todayYmd();
  const label = value ? `${shortDay(value)}, ${value.slice(0, 4)}` : '';
  return (
    <Field icon={<Ic.Calendar size={16} />} value={label} ariaLabel={ariaLabel} open={open} setOpen={setOpen} btn={btn} placeholder="Pick a date">
      <Floating anchorRef={btn} onClose={() => setOpen(false)} height={330} width={280} className="lb-datepop">
        <div className="lb-dp-head">
          <button type="button" className="lb-iconbtn" aria-label="Previous month" onClick={() => setView(addMonths(view, -1))}><Ic.ChevL size={16} sw={2.4} /></button>
          <b>{g.title}</b>
          <button type="button" className="lb-iconbtn" aria-label="Next month" onClick={() => setView(addMonths(view, 1))}><Ic.ChevR size={16} sw={2.4} /></button>
        </div>
        <div className="lb-dp-week">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="lb-dp-grid">
          {g.weeks.flat().map(c => (
            <button key={c.ymd} type="button" data-ymd={c.ymd} className={`lb-dp-day${c.inMonth ? '' : ' out'}${c.ymd === today ? ' today' : ''}${c.ymd === value ? ' sel' : ''}`} onClick={() => { onChange(c.ymd); setOpen(false); }}>{c.day}</button>
          ))}
        </div>
        <button type="button" className="lb-dp-today" onClick={() => { onChange(today); setOpen(false); }}>Today</button>
      </Floating>
    </Field>
  );
};

export const TimeField = ({ value, onChange, ariaLabel, disabled }) => {
  const btn = useRef(null), [open, setOpen] = useState(false), sel = useRef(null);
  useEffect(() => { if (open && sel.current && sel.current.scrollIntoView) sel.current.scrollIntoView({ block: 'center' }); }, [open]);
  if (disabled) return <div className="lb-field"><button type="button" className="lb-fieldbtn" disabled aria-label={ariaLabel}><Ic.Clock size={16} /><span><em>All day</em></span></button></div>;
  return (
    <Field icon={<Ic.Clock size={16} />} value={fmtTime(value)} ariaLabel={ariaLabel} open={open} setOpen={setOpen} btn={btn} placeholder="Pick a time">
      <Floating anchorRef={btn} onClose={() => setOpen(false)} height={260} className="lb-timepop">
        <ul role="listbox" aria-label="Times">
          {TIME_SLOTS.map(t => (
            <li key={t} role="option" aria-selected={t === value}><button type="button" ref={t === value ? sel : null} className={t === value ? 'sel' : ''} onClick={() => { onChange(t); setOpen(false); }}>{fmtTime(t)}</button></li>
          ))}
        </ul>
      </Floating>
    </Field>
  );
};

/** the "…" button with a small menu: items = [{ label, icon, onClick, danger }] */
export const ActionMenu = ({ items, ariaLabel = 'More options' }) => {
  const btn = useRef(null), [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" ref={btn} className={`lb-iconbtn${open ? ' open' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen(o => !o)}><Ic.Dots size={18} /></button>
      {open && (
        <Floating anchorRef={btn} onClose={() => setOpen(false)} height={40 + items.length * 38} align="right" width={190} className="lb-menu">
          <ul role="menu">{items.map(it => <li key={it.label} role="none"><button type="button" role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick(); }}>{it.icon}{it.label}</button></li>)}</ul>
        </Floating>
      )}
    </>
  );
};
