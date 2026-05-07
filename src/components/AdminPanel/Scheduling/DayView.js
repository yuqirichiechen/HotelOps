import React, { useMemo } from 'react';

// Sprint 8.0: iOS-Calendar-style day view. Top: a horizontal week strip
// (M T W T F S S with the cursor day highlighted) so the admin can hop
// between days without leaving the view. Below: 24-hour timeline running
// 00:00 → 24:00 with shifts as positioned colored blocks (department-tinted,
// lane-packed when they overlap).
//
// Overnight shifts (start_time > end_time) are clipped to the visible day.
// We render the portion that lives within today; the next-day portion will
// surface when the admin moves to the next day. Hotels rarely log shifts
// that wrap midnight in the schedule table — the existing assign modal
// validates start < end — but the clip keeps the view robust if one slips
// through.

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const DEPT_COLORS = {
  'Front Desk':      { bg: '#ebf8ff', border: '#3182ce', text: '#2c5282' },
  'Housekeeping':    { bg: '#f0fff4', border: '#38a169', text: '#276749' },
  'Maintenance':     { bg: '#fffaf0', border: '#dd6b20', text: '#7b341e' },
  'Food & Beverage': { bg: '#faf5ff', border: '#805ad5', text: '#553c9a' },
  'Management':      { bg: '#f7fafc', border: '#4a5568', text: '#1a202c' },
};
const DEFAULT_COLOR = { bg: '#f7fafc', border: '#a0aec0', text: '#2d3748' };

const fmtDate = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const startOfWeek = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
};

const timeToMinutes = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const fmtHour = (h) => {
  if (h === 0)  return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
};

const fmtTimeRange = (start, end) => {
  const f = (t) => {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'pm' : 'am';
    const hour = h % 12 || 12;
    return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, '0')}${period}`;
  };
  return `${f(start)} – ${f(end)}`;
};

// Greedy lane-packing — sort shifts by start, drop each into the leftmost
// lane whose last shift ends ≤ this one's start. Returns the lane assigned
// to each shift plus the total lane count for layout math.
const laneAssign = (shifts) => {
  const sorted = [...shifts].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const lanes = []; // array of "last end time per lane" minute offsets
  return {
    shifts: sorted.map(s => {
      const startMin = timeToMinutes(s.start_time);
      let lane = lanes.findIndex(end => end <= startMin);
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = timeToMinutes(s.end_time);
      return { ...s, _lane: lane };
    }),
    laneCount: lanes.length || 1,
  };
};

const DayView = ({ date, schedules, employees, loading, onPickDate, onEdit }) => {
  const dateStr = fmtDate(date);

  // Build the week strip anchored on the cursor's week.
  const weekStartDate = startOfWeek(date);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Filter to today's shifts. Server fetches a wider range when the cursor
  // moves; we just slice here so click-to-switch-day is instant (no refetch).
  const todayShifts = useMemo(
    () => schedules.filter(s => s.scheduled_date === dateStr),
    [schedules, dateStr]
  );

  // Enrich with employee name + department if not already present, then
  // assign lanes.
  const empById = useMemo(() => {
    const m = {};
    employees.forEach(e => { m[e.user_id] = e; });
    return m;
  }, [employees]);

  const { shifts, laneCount } = useMemo(() => laneAssign(
    todayShifts.map(s => ({
      ...s,
      employee_name: s.employee_name || empById[s.user_id]?.name || 'Unknown',
      department_name: s.department_name || empById[s.user_id]?.department || null,
    }))
  ), [todayShifts, empById]);

  if (loading && schedules.length === 0) {
    return <div className="sched-loading">Loading schedule…</div>;
  }

  return (
    <div className="day-view" style={{ viewTransitionName: `sched-day-${dateStr}` }}>
      {/* Week strip — clickable, current cursor highlighted */}
      <div className="day-week-strip">
        {weekDays.map((d, i) => {
          const ds = fmtDate(d);
          const isCursor = ds === dateStr;
          const isToday  = ds === fmtDate(new Date());
          return (
            <button
              key={ds}
              type="button"
              className={`day-week-strip-cell ${isCursor ? 'is-cursor' : ''} ${isToday ? 'is-today' : ''}`}
              onClick={() => onPickDate(d)}
            >
              <span className="day-week-strip-letter">{DAY_LETTERS[i]}</span>
              <span className="day-week-strip-num">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* 24h timeline */}
      <div className="day-timeline-wrap">
        <div className="day-timeline">
          {/* Hour rail (left side) — 24 rows of hour labels */}
          <div className="day-hour-rail">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="day-hour-row">
                <span className="day-hour-label">{fmtHour(h)}</span>
              </div>
            ))}
          </div>

          {/* Shift surface — positioned blocks */}
          <div className="day-shift-surface">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="day-hour-line" style={{ top: `${(h / 24) * 100}%` }} />
            ))}

            {shifts.length === 0 && (
              <div className="day-empty">No shifts scheduled.</div>
            )}

            {shifts.map(s => {
              const startMin = timeToMinutes(s.start_time);
              const endMinRaw = timeToMinutes(s.end_time);
              // Clip overnight shifts to today's portion.
              const endMin = endMinRaw > startMin ? endMinRaw : 24 * 60;
              const top    = (startMin / (24 * 60)) * 100;
              const height = ((endMin - startMin) / (24 * 60)) * 100;
              const left   = (s._lane / laneCount) * 100;
              const width  = (1 / laneCount) * 100;
              const color  = DEPT_COLORS[s.department_name] || DEFAULT_COLOR;
              return (
                <button
                  key={s.schedule_id}
                  type="button"
                  className="day-shift-block"
                  style={{
                    top:   `${top}%`,
                    height: `calc(${height}% - 2px)`,
                    left:  `calc(${left}% + 2px)`,
                    width: `calc(${width}% - 4px)`,
                    background:   color.bg,
                    borderColor:  color.border,
                    color:        color.text,
                  }}
                  onClick={() => onEdit(s)}
                >
                  <div className="day-shift-name">{s.employee_name}</div>
                  <div className="day-shift-meta">
                    {s.department_name || 'Unassigned'} · {fmtTimeRange(s.start_time.slice(0,5), s.end_time.slice(0,5))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayView;
