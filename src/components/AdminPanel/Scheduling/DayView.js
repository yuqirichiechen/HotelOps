import React, { useEffect, useMemo, useRef, useState } from 'react';

// Sprint 8.4: DayView now supports two render modes — `timeline` (iOS-Calendar
// hours-on-Y, lane-packed shifts) and `resource` (staff-on-Y / hours-on-X,
// one row per person). The `timeline` mode reads beautifully for a single
// department but cramps badly when 4+ people overlap; the `resource` mode
// scales to any number of staff because each person has their own row.
//
// Smart defaults on dept-filter change:
//   - Pick a single department → switch to `timeline` (lane count is bounded
//     by that dept's headcount, so blocks stay readable).
//   - Pick "All" → switch to `resource` (no lane-packing needed; works at
//     any scale).
// The admin can still override via the toggle — both modes work in either
// filter state, the smart default is a starting point.
//
// Overnight shifts (start_time > end_time) are clipped to the visible day
// in both modes; the next-day portion surfaces when the cursor moves.

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

// Greedy lane-packing for timeline mode.
const laneAssign = (shifts) => {
  const sorted = [...shifts].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const lanes = [];
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

// Compute the {top, height} percentages for a shift on a 24h vertical axis.
const verticalShiftBox = (start, end) => {
  const s = timeToMinutes(start);
  const eRaw = timeToMinutes(end);
  const e = eRaw > s ? eRaw : 1440;
  return { top: (s / 1440) * 100, height: ((e - s) / 1440) * 100 };
};

// Compute the {left, width} percentages for a shift on a 24h horizontal axis
// (resource view).
const horizontalShiftBox = (start, end) => {
  const s = timeToMinutes(start);
  const eRaw = timeToMinutes(end);
  const e = eRaw > s ? eRaw : 1440;
  return { left: (s / 1440) * 100, width: ((e - s) / 1440) * 100 };
};

const DayView = ({ date, schedules, employees, departments, loading, onPickDate, onEdit }) => {
  const dateStr = fmtDate(date);

  // ── view state ──────────────────────────────────────────────────────────
  const [deptFilter, setDeptFilter] = useState('all'); // 'all' | dept_id
  const [viewMode,   setViewMode]   = useState('resource'); // 'resource' | 'timeline'

  // Smart default on filter change. Admin can still override the toggle
  // afterward — this just sets the *starting* mode.
  const handleDeptFilterChange = (next) => {
    setDeptFilter(next);
    setViewMode(next === 'all' ? 'resource' : 'timeline');
  };

  // ── week strip ──────────────────────────────────────────────────────────
  const weekStartDate = startOfWeek(date);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    return d;
  });

  // ── shift data, enrichment, filtering ───────────────────────────────────
  const empById = useMemo(() => {
    const m = {};
    employees.forEach(e => { m[e.user_id] = e; });
    return m;
  }, [employees]);

  const enrichedShifts = useMemo(() => schedules
    .filter(s => s.scheduled_date === dateStr)
    .map(s => ({
      ...s,
      employee_name:   s.employee_name   || empById[s.user_id]?.name       || 'Unknown',
      department_name: s.department_name || empById[s.user_id]?.department || null,
      department_id:   s.department_id  ?? empById[s.user_id]?.department_id ?? null,
    })),
    [schedules, dateStr, empById]
  );

  const filteredShifts = useMemo(() =>
    deptFilter === 'all'
      ? enrichedShifts
      : enrichedShifts.filter(s => s.department_id === deptFilter),
    [enrichedShifts, deptFilter]
  );

  // ── department-grouped staff for resource view ─────────────────────────
  const empsByDept = useMemo(() => {
    const visible = deptFilter === 'all'
      ? departments
      : departments.filter(d => d.department_id === deptFilter);
    return visible
      .map(d => ({
        ...d,
        staff: employees.filter(e => e.department_id === d.department_id && e.active !== false),
      }))
      .filter(d => d.staff.length > 0);
  }, [departments, employees, deptFilter]);

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

      {/* Filter + mode controls */}
      <div className="day-controls">
        <div className="day-filter-chips">
          <button
            type="button"
            className={`day-chip ${deptFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => handleDeptFilterChange('all')}
          >All</button>
          {departments.map(d => (
            <button
              key={d.department_id}
              type="button"
              className={`day-chip ${deptFilter === d.department_id ? 'is-active' : ''}`}
              onClick={() => handleDeptFilterChange(d.department_id)}
            >{d.name}</button>
          ))}
        </div>
        <div className="day-mode-toggle">
          <button
            type="button"
            className={`day-mode-btn ${viewMode === 'resource' ? 'is-active' : ''}`}
            onClick={() => setViewMode('resource')}
            title="One row per person (best for many staff or all departments)"
          >Rows</button>
          <button
            type="button"
            className={`day-mode-btn ${viewMode === 'timeline' ? 'is-active' : ''}`}
            onClick={() => setViewMode('timeline')}
            title="Hours-on-Y stacked timeline (best for one department)"
          >Timeline</button>
        </div>
      </div>

      {viewMode === 'timeline' ? (
        <TimelineMode shifts={filteredShifts} onEdit={onEdit} />
      ) : (
        <ResourceMode deptGroups={empsByDept} shifts={filteredShifts} onEdit={onEdit} />
      )}
    </div>
  );
};

// ── Timeline mode (iOS-Calendar Day, lane-packed) ─────────────────────────
// Sprint 8.4.1: render 25 hour markers (00:00 → 24:00) so the close-of-day
// midnight is visible — without it the day reads as "11 PM is the end"
// which is misleading for a 24-hour view. Hour labels + lines positioned
// absolutely at top: (h / 24) * 100% so the spacing between every pair of
// hours is identical (the prior 24-row layout had the first row's label
// special-cased and the gap between 12 AM and 1 AM read smaller than the
// others).
const TimelineMode = ({ shifts, onEdit }) => {
  const { shifts: laneShifts, laneCount } = useMemo(() => laneAssign(shifts), [shifts]);
  const hours = useMemo(() => Array.from({ length: 25 }, (_, h) => h), []);
  return (
    <div className="day-timeline-wrap">
      <div className="day-timeline">
        <div className="day-hour-rail">
          {hours.map(h => (
            <span
              key={h}
              className="day-hour-label"
              data-edge={h === 0 ? 'start' : h === 24 ? 'end' : undefined}
              style={{ top: `${(h / 24) * 100}%` }}
            >
              {fmtHour(h % 24)}
            </span>
          ))}
        </div>
        <div className="day-shift-surface">
          {hours.map(h => (
            <div key={h} className="day-hour-line" style={{ top: `${(h / 24) * 100}%` }} />
          ))}
          {laneShifts.length === 0 && <div className="day-empty">No shifts scheduled.</div>}
          {laneShifts.map(s => {
            const box   = verticalShiftBox(s.start_time, s.end_time);
            const left  = (s._lane / laneCount) * 100;
            const width = (1 / laneCount) * 100;
            const color = DEPT_COLORS[s.department_name] || DEFAULT_COLOR;
            return (
              <button
                key={s.schedule_id}
                type="button"
                className="day-shift-block"
                style={{
                  top:    `${box.top}%`,
                  height: `calc(${box.height}% - 2px)`,
                  left:   `calc(${left}% + 2px)`,
                  width:  `calc(${width}% - 4px)`,
                  background:  color.bg,
                  borderColor: color.border,
                  color:       color.text,
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
  );
};

// ── Resource mode (staff rows × hours columns) ───────────────────────────
// Sprint 8.4.1: hour-label density adapts to the bar's measured width via a
// ResizeObserver. Three discrete steps so labels never crowd or feel sparse:
//   - bar < 360px → step 6h (5 labels: 12 AM · 6 AM · 12 PM · 6 PM · 12 AM)
//   - bar 360-720px → step 3h (9 labels)
//   - bar ≥ 720px → step 1h (25 labels)
// The first (h=0) and last (h=24) labels are anchored to their respective
// edges via data-edge so they don't get clipped by translate(-50%).
const ResourceMode = ({ deptGroups, shifts, onEdit }) => {
  // Build shift index by user_id for the per-row lookup. Limited to one
  // shift per user per day to match the data model the rest of the views
  // assume.
  const shiftByUser = useMemo(() => {
    const m = {};
    shifts.forEach(s => { m[s.user_id] = s; });
    return m;
  }, [shifts]);

  const hourBarRef = useRef(null);
  const [labelStep, setLabelStep] = useState(6);
  useEffect(() => {
    const el = hourBarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      setLabelStep(w >= 720 ? 1 : w >= 360 ? 3 : 6);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hourLabels = useMemo(() => {
    const out = [];
    for (let h = 0; h <= 24; h += labelStep) out.push(h);
    return out;
  }, [labelStep]);

  if (deptGroups.length === 0) {
    return <div className="day-empty day-empty-static">No staff in this filter.</div>;
  }

  return (
    <div className="day-resource-wrap">
      {/* Hour-axis header. Labels are absolute-positioned at left:
          (h / 24) * 100%; first/last anchored to their edges so the
          start/end "12 AM" labels stay fully visible. */}
      <div className="day-resource-row day-resource-hour-header">
        <div className="day-resource-name-col" />
        <div className="day-resource-hour-bar" aria-hidden ref={hourBarRef}>
          {hourLabels.map(h => (
            <span
              key={h}
              className="day-resource-hour-label"
              data-edge={h === 0 ? 'start' : h === 24 ? 'end' : undefined}
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {fmtHour(h % 24)}
            </span>
          ))}
        </div>
      </div>

      {deptGroups.map(dept => (
        <React.Fragment key={dept.department_id}>
          <div className="day-resource-dept-row">
            <span
              className="day-resource-dept-dot"
              style={{ background: (DEPT_COLORS[dept.name] || DEFAULT_COLOR).border }}
            />
            <span className="day-resource-dept-name">{dept.name}</span>
            <span className="day-resource-dept-count">
              {dept.staff.filter(e => shiftByUser[e.user_id]).length} / {dept.staff.length} on
            </span>
          </div>
          {dept.staff.map(emp => {
            const s = shiftByUser[emp.user_id];
            const box = s ? horizontalShiftBox(s.start_time, s.end_time) : null;
            const color = s
              ? (DEPT_COLORS[s.department_name] || DEPT_COLORS[dept.name] || DEFAULT_COLOR)
              : DEFAULT_COLOR;
            return (
              <div key={emp.user_id} className="day-resource-row">
                <div className="day-resource-name-col" title={emp.name}>
                  <span className="day-resource-initial">{(emp.name || '?').charAt(0).toUpperCase()}</span>
                  <span className="day-resource-name">{emp.name.split(' ')[0]}</span>
                </div>
                <div className="day-resource-track">
                  {/* Ticks at 6 / 12 / 18 */}
                  <div className="day-resource-tick" style={{ left: '25%' }} />
                  <div className="day-resource-tick" style={{ left: '50%' }} />
                  <div className="day-resource-tick" style={{ left: '75%' }} />
                  {s && box && (
                    <button
                      type="button"
                      className="day-resource-shift"
                      style={{
                        left:  `${box.left}%`,
                        width: `${box.width}%`,
                        background:  color.bg,
                        borderColor: color.border,
                        color:       color.text,
                      }}
                      title={`${fmtTimeRange(s.start_time.slice(0,5), s.end_time.slice(0,5))}`}
                      onClick={() => onEdit(s)}
                    >
                      <span className="day-resource-shift-time">
                        {fmtTimeRange(s.start_time.slice(0,5), s.end_time.slice(0,5))}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};

export default DayView;
