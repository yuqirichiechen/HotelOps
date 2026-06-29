import React, { useEffect, useMemo, useRef, useState } from 'react';
import './HopDateTimePicker.css';

// Sprint 18.12 — themed datetime picker for HotelOps. Replaces the
// native <input type="datetime-local"> in places where the OS picker
// reads as foreign next to our chip-pill control language (most
// notably the StaffDetail entry-edit/add modal).
//
// API mirrors the native input shape so it's a drop-in:
//   value     — "YYYY-MM-DDTHH:MM" string (or '' for empty)
//   onChange  — (value) => void  (same string shape)
//   required  — bool, marks the trigger when empty
//   allowEmpty— bool, shows a Clear button + null state
//   minuteStep— int, default 1; 5/10/15 if you want coarser stepping
//
// Implementation notes:
// - Date side: month grid with prev/next nav. Week starts Sunday
//   (matches the rest of the admin app — payroll week start is set
//   per-property and shown elsewhere).
// - Time side: HH/MM numeric inputs + AM/PM toggle. 12h display is
//   the locale convention already used across the admin app (see
//   fmtTime helpers everywhere).
// - The popover lives in the document flow under the trigger;
//   if you anchor it inside a position:relative parent it'll respect
//   that parent's bounds. For modal use the parent should give
//   overflow: visible (or the modal needs to be tall enough to fit
//   the popover below the trigger).

const pad2 = (n) => String(n).padStart(2, '0');

const parseValue = (value) => {
  if (!value) return null;
  // "YYYY-MM-DDTHH:MM" — split rather than `new Date(...)` to avoid
  // surprises from local-vs-UTC parsing.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return {
    y: +m[1], mo: +m[2], d: +m[3],
    h: +m[4], mi: +m[5],
  };
};

const formatValue = ({ y, mo, d, h, mi }) =>
  `${y}-${pad2(mo)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}`;

const fmtTrigger = (parts) => {
  if (!parts) return '';
  const date = new Date(parts.y, parts.mo - 1, parts.d);
  const dateStr = date.toLocaleDateString([], {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  let h12 = parts.h % 12; if (h12 === 0) h12 = 12;
  const ampm = parts.h < 12 ? 'AM' : 'PM';
  return `${dateStr} · ${h12}:${pad2(parts.mi)} ${ampm}`;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_HEAD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Returns the cells for the visible month: leading days from prev
// month, this month, trailing days from next month — 6 rows × 7 cols
// so the grid height never shifts when navigating months.
const monthCells = (year, monthIdx /* 0-11 */) => {
  const first = new Date(year, monthIdx, 1);
  const startDow = first.getDay(); // 0 = Sun
  const cells = [];
  // Lead days (prev month tail)
  const prevLast = new Date(year, monthIdx, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ y: year, mo: monthIdx + 1, d: prevLast - i, inMonth: false, prev: true });
  }
  // This month
  const last = new Date(year, monthIdx + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    cells.push({ y: year, mo: monthIdx + 1, d, inMonth: true });
  }
  // Trail to reach 42 cells (6 × 7)
  let extra = 1;
  while (cells.length < 42) {
    cells.push({ y: year, mo: monthIdx + 1, d: extra++, inMonth: false, next: true });
  }
  // Normalize y/mo for prev/next month cells (the simple inc/dec above
  // labels them with this month's mo, which is wrong for display)
  return cells.map(c => {
    if (c.prev) {
      const prev = new Date(year, monthIdx - 1, 1);
      return { ...c, y: prev.getFullYear(), mo: prev.getMonth() + 1 };
    }
    if (c.next) {
      const next = new Date(year, monthIdx + 1, 1);
      return { ...c, y: next.getFullYear(), mo: next.getMonth() + 1 };
    }
    return c;
  });
};

const HopDateTimePicker = ({
  value,
  onChange,
  required = false,
  allowEmpty = true,
  minuteStep = 1,
  placeholder = 'Pick date & time',
  align = 'left',
  className = '',
}) => {
  const parsed = useMemo(() => parseValue(value), [value]);
  const [open, setOpen]   = useState(false);
  const wrapRef = useRef(null);

  // Visible month — defaults to the parsed value's month, else today
  const initialMonth = parsed
    ? { y: parsed.y, m: parsed.mo - 1 }
    : (() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; })();
  const [view, setView] = useState(initialMonth);

  // Reset view whenever the popover opens (so reopening a stale
  // picker lands on the right month even if you navigated away).
  useEffect(() => {
    if (!open) return;
    if (parsed) setView({ y: parsed.y, m: parsed.mo - 1 });
    else { const t = new Date(); setView({ y: t.getFullYear(), m: t.getMonth() }); }
  }, [open, parsed]);

  // Click-outside dismiss
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Time-side intermediate state — kept here rather than derived
  // from `parsed` so the user can type a partial value (e.g. "1"
  // into the hour field while heading toward "12") without us
  // immediately committing "1:something AM".
  const initialTime = parsed
    ? {
        h12: ((parsed.h % 12) || 12),
        mi:  parsed.mi,
        ampm: parsed.h < 12 ? 'AM' : 'PM',
      }
    : { h12: 12, mi: 0, ampm: 'PM' };
  const [time, setTime] = useState(initialTime);
  useEffect(() => { setTime(initialTime); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (parts) => {
    onChange(formatValue(parts));
  };

  const pickDate = (cell) => {
    const h24 = (time.ampm === 'PM' ? (time.h12 % 12) + 12 : time.h12 % 12);
    commit({ y: cell.y, mo: cell.mo, d: cell.d, h: h24, mi: time.mi });
  };

  const setHour = (n) => {
    let h12 = parseInt(n, 10);
    if (isNaN(h12)) h12 = 12;
    if (h12 < 1)  h12 = 1;
    if (h12 > 12) h12 = 12;
    const next = { ...time, h12 };
    setTime(next);
    if (parsed) {
      const h24 = (next.ampm === 'PM' ? (next.h12 % 12) + 12 : next.h12 % 12);
      commit({ ...parsed, h: h24, mi: next.mi });
    }
  };

  const setMinute = (n) => {
    let mi = parseInt(n, 10);
    if (isNaN(mi)) mi = 0;
    if (mi < 0)  mi = 0;
    if (mi > 59) mi = 59;
    const next = { ...time, mi };
    setTime(next);
    if (parsed) {
      const h24 = (next.ampm === 'PM' ? (next.h12 % 12) + 12 : next.h12 % 12);
      commit({ ...parsed, h: h24, mi: next.mi });
    }
  };

  const setAmPm = (ampm) => {
    const next = { ...time, ampm };
    setTime(next);
    if (parsed) {
      const h24 = (ampm === 'PM' ? (next.h12 % 12) + 12 : next.h12 % 12);
      commit({ ...parsed, h: h24, mi: next.mi });
    }
  };

  const setToNow = () => {
    const now = new Date();
    commit({
      y: now.getFullYear(),
      mo: now.getMonth() + 1,
      d: now.getDate(),
      h: now.getHours(),
      mi: now.getMinutes(),
    });
    setView({ y: now.getFullYear(), m: now.getMonth() });
  };

  const clear = () => {
    onChange('');
  };

  // Month nav
  const prevMonth = () => setView(v => {
    const d = new Date(v.y, v.m - 1, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const nextMonth = () => setView(v => {
    const d = new Date(v.y, v.m + 1, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const cells = useMemo(() => monthCells(view.y, view.m), [view.y, view.m]);
  const today = new Date();
  const isToday = (c) =>
    c.y === today.getFullYear() && c.mo === today.getMonth() + 1 && c.d === today.getDate();
  const isSelected = (c) =>
    parsed && c.y === parsed.y && c.mo === parsed.mo && c.d === parsed.d;

  return (
    <div
      ref={wrapRef}
      className={`hop-dtp ${open ? 'is-open' : ''} ${align === 'right' ? 'is-right' : ''} ${className}`}
    >
      <button
        type="button"
        className={`hop-dtp-trigger ${!parsed && required ? 'is-empty-required' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="hop-dtp-trigger-icon" aria-hidden>📅</span>
        <span className="hop-dtp-trigger-label">
          {parsed ? fmtTrigger(parsed) : <span className="hop-dtp-placeholder">{placeholder}</span>}
        </span>
        <span className="hop-dtp-trigger-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="hop-dtp-pop" role="dialog">
          <div className="hop-dtp-head">
            <button
              type="button"
              className="hop-dtp-nav"
              onClick={prevMonth}
              aria-label="Previous month"
            >‹</button>
            <div className="hop-dtp-title">
              {MONTH_NAMES[view.m]} {view.y}
            </div>
            <button
              type="button"
              className="hop-dtp-nav"
              onClick={nextMonth}
              aria-label="Next month"
            >›</button>
          </div>

          <div className="hop-dtp-weekhead">
            {WEEKDAY_HEAD.map((w, i) => (
              <div key={i} className="hop-dtp-weekday">{w}</div>
            ))}
          </div>

          <div className="hop-dtp-grid">
            {cells.map((c, i) => {
              const cls = [
                'hop-dtp-cell',
                c.inMonth   ? '' : 'is-out',
                isToday(c)  ? 'is-today' : '',
                isSelected(c) ? 'is-selected' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  onClick={() => pickDate(c)}
                >
                  {c.d}
                </button>
              );
            })}
          </div>

          <div className="hop-dtp-time">
            <span className="hop-dtp-time-label">Time</span>
            <input
              type="number"
              className="hop-dtp-time-input"
              min={1}
              max={12}
              value={time.h12}
              onChange={(e) => setHour(e.target.value)}
              aria-label="Hour"
            />
            <span className="hop-dtp-time-sep">:</span>
            <input
              type="number"
              className="hop-dtp-time-input"
              min={0}
              max={59}
              step={minuteStep}
              value={pad2(time.mi)}
              onChange={(e) => setMinute(e.target.value)}
              aria-label="Minute"
            />
            <div className="hop-dtp-ampm">
              <button
                type="button"
                className={`hop-dtp-ampm-btn ${time.ampm === 'AM' ? 'is-active' : ''}`}
                onClick={() => setAmPm('AM')}
              >AM</button>
              <button
                type="button"
                className={`hop-dtp-ampm-btn ${time.ampm === 'PM' ? 'is-active' : ''}`}
                onClick={() => setAmPm('PM')}
              >PM</button>
            </div>
          </div>

          <div className="hop-dtp-actions">
            {allowEmpty && parsed && (
              <button type="button" className="hop-dtp-action hop-dtp-clear" onClick={clear}>
                Clear
              </button>
            )}
            <button type="button" className="hop-dtp-action" onClick={setToNow}>
              Now
            </button>
            <button
              type="button"
              className="hop-dtp-action is-primary"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HopDateTimePicker;
