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

// Sprint 8.5: computed shift duration in hours, used as the extra-detail
// signal that distinguishes Day from Week. JS template literals strip
// trailing zero, so 8 → "8h" and 8.5 → "8.5h" without extra formatting.
const computeShiftHours = (start, end) => {
  const sMin = timeToMinutes(start);
  const eRaw = timeToMinutes(end);
  const eMin = eRaw > sMin ? eRaw : 1440;
  return Math.round(((eMin - sMin) / 60) * 10) / 10;
};

// Sprint 12.4: lane-packing now groups by department first, then
// packs lanes within each dept group. Two shifts in the same dept
// that don't overlap share a lane (saves horizontal space); two
// shifts in the same dept that do overlap get adjacent sub-lanes
// inside that dept's column band. Departments end up as contiguous
// column groups, so the dept-color tinting on each bar reads as a
// visual grouping cue (vs. before, where five dept-mixed lanes
// looked like five unrelated columns).
//
// Output shape:
//   shifts: [{ ..., _lane: globalIndex }]
//   laneCount: total lanes across all depts
//   deptBands: [{ deptId, deptName, startLane, lanes }]  — for the
//              optional faint dept-band background overlays.
const laneAssign = (shifts) => {
  // Group by department (null department_id = "__unassigned__" bucket).
  const byDept = new Map();
  for (const s of shifts) {
    const key = s.department_id ?? '__none__';
    if (!byDept.has(key)) byDept.set(key, []);
    byDept.get(key).push(s);
  }
  // Stable dept order: by the earliest start time inside each group.
  const deptOrder = [...byDept.entries()].sort((a, b) => {
    const aStart = Math.min(...a[1].map(s => timeToMinutes(s.start_time)));
    const bStart = Math.min(...b[1].map(s => timeToMinutes(s.start_time)));
    return aStart - bStart;
  });

  const placed = [];
  const deptBands = [];
  let globalLane = 0;
  for (const [deptId, list] of deptOrder) {
    const sorted = [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const lanes = [];
    for (const s of sorted) {
      const startMin = timeToMinutes(s.start_time);
      let lane = lanes.findIndex(end => end <= startMin);
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = timeToMinutes(s.end_time);
      placed.push({ ...s, _lane: globalLane + lane });
    }
    const deptLaneCount = lanes.length || 1;
    deptBands.push({
      deptId,
      deptName: sorted[0]?.department_name || null,
      startLane: globalLane,
      lanes: deptLaneCount,
    });
    globalLane += deptLaneCount;
  }
  return {
    shifts: placed,
    laneCount: globalLane || 1,
    deptBands,
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

// Sprint 12.4: friendly clock-time formatter for ISO timestamps in
// the modal. Returns "8:38 AM"-ish; falls back to the HH:MM:SS slice
// for the rare case the modal gets a synthesized (no-clock-out)
// shift whose start was already derived from `clock_in_time`.
const fmtClockTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// Sprint 12.4: shift-detail modal. Opens when any bar (timeline or
// resource mode) is tapped. Centered card with a small dept-color
// dot, name + on-shift live pill, department, and a 3-row clock-in
// / clock-out / hours summary. Backdrop click + ✕ button both
// dismiss; ESC handled at the document level via a useEffect below.
const ShiftDetailModal = ({ shift, onClose }) => {
  const color = DEPT_COLORS[shift.department_name] || DEFAULT_COLOR;
  const inTime  = fmtClockTime(shift.clock_in_time)
                  || fmtTimeRange(shift.start_time.slice(0,5), '00:00').split(' – ')[0];
  const outTime = shift.is_in_progress
    ? 'On shift'
    : (fmtClockTime(shift.clock_out_time)
       || fmtTimeRange('00:00', shift.end_time.slice(0,5)).split(' – ')[1]);
  const hours = computeShiftHours(shift.start_time, shift.end_time);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="day-shift-detail-backdrop" onClick={onClose} role="presentation">
      <div
        className="day-shift-detail-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-shift-detail-name"
      >
        <button
          type="button"
          className="day-shift-detail-close"
          onClick={onClose}
          aria-label="Close"
        >✕</button>
        <div
          className="day-shift-detail-dept-bar"
          style={{ background: color.border }}
          aria-hidden
        />
        <h3 id="day-shift-detail-name" className="day-shift-detail-name">
          {shift.employee_name}
          {shift.is_in_progress && (
            <span className="day-shift-detail-live-pill">
              <span className="day-shift-detail-live-dot" /> ON SHIFT
            </span>
          )}
        </h3>
        <div className="day-shift-detail-dept">
          {shift.department_name || 'Unassigned'}
        </div>
        <dl className="day-shift-detail-rows">
          <div><dt>Clock in</dt><dd>{inTime}</dd></div>
          <div><dt>Clock out</dt><dd>{outTime}</dd></div>
          <div><dt>Hours</dt><dd>{hours}h{shift.is_in_progress ? ' (so far)' : ''}</dd></div>
        </dl>
      </div>
    </div>
  );
};

const DayView = ({ date, schedules, employees, departments, loading, onPickDate, onEdit }) => {
  const dateStr = fmtDate(date);

  // ── view state ──────────────────────────────────────────────────────────
  const [deptFilter, setDeptFilter] = useState('all'); // 'all' | dept_id
  const [viewMode,   setViewMode]   = useState('resource'); // 'resource' | 'timeline'
  // Sprint 12.4: tap-to-see-detail. Mobile rows can't fit the full
  // time range inside the bar (the screenshot showed "8:38am – ..."
  // truncated), so any bar (timeline or rows mode) opens a modal
  // with the full info. Desktop also benefits — same modal, same
  // click affordance, no need to depend on hover/title tooltips.
  const [detailShift, setDetailShift] = useState(null);
  const closeDetail = () => setDetailShift(null);

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
    <div className="day-view">
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
        <TimelineMode
          shifts={filteredShifts}
          onEdit={onEdit}
          onShowDetail={setDetailShift}
        />
      ) : (
        <ResourceMode
          deptGroups={empsByDept}
          shifts={filteredShifts}
          onEdit={onEdit}
          onShowDetail={setDetailShift}
        />
      )}

      {/* Sprint 12.4: shift-detail modal — opened by any bar click. */}
      {detailShift && (
        <ShiftDetailModal shift={detailShift} onClose={closeDetail} />
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
const TimelineMode = ({ shifts, onEdit, onShowDetail }) => {
  const { shifts: laneShifts, laneCount, deptBands } = useMemo(
    () => laneAssign(shifts), [shifts]
  );
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
          {/* Sprint 12.4: faint dept-band underlays render *first*
              so hour-lines and shift buttons (both rendered after)
              stack on top. Each band spans its dept's contiguous
              lane range; multi-lane bands read as "this whole
              column-block is one dept." */}
          {deptBands.map(band => {
            const color = DEPT_COLORS[band.deptName] || DEFAULT_COLOR;
            const left  = (band.startLane / laneCount) * 100;
            const width = (band.lanes     / laneCount) * 100;
            return (
              <div
                key={`band-${band.deptId}`}
                className="day-timeline-dept-band"
                style={{
                  left:  `${left}%`,
                  width: `${width}%`,
                  background: color.bg,
                  borderColor: color.border,
                }}
                aria-hidden
              />
            );
          })}
          {hours.map(h => (
            <div key={h} className="day-hour-line" style={{ top: `${(h / 24) * 100}%` }} />
          ))}
          {laneShifts.length === 0 && <div className="day-empty">No clock entries for this day yet.</div>}
          {laneShifts.map(s => {
            const box   = verticalShiftBox(s.start_time, s.end_time);
            const left  = (s._lane / laneCount) * 100;
            const width = (1 / laneCount) * 100;
            const color = DEPT_COLORS[s.department_name] || DEFAULT_COLOR;
            const endLabel = s.is_in_progress
              ? 'now'
              : fmtTimeRange(s.start_time.slice(0,5), s.end_time.slice(0,5)).split(' – ')[1];
            // Sprint 12.4: every bar opens the detail modal. Edit
            // affordance is preserved only for legacy non-actual
            // (admin-assigned) shifts that would still benefit from
            // the AssignModal — clock entries route to the modal.
            const handleClick = () => {
              if (s.is_actual) onShowDetail(s);
              else onEdit(s);
            };
            return (
              <button
                key={s.schedule_id}
                type="button"
                className={`day-shift-block${s.is_in_progress ? ' is-in-progress' : ''}`}
                style={{
                  top:    `${box.top}%`,
                  height: `calc(${box.height}% - 2px)`,
                  left:   `calc(${left}% + 2px)`,
                  width:  `calc(${width}% - 4px)`,
                  background:  color.bg,
                  borderColor: color.border,
                  color:       color.text,
                  cursor:      'pointer',
                }}
                onClick={handleClick}
              >
                <div className="day-shift-name">
                  {s.employee_name}
                  {s.is_in_progress && <span className="day-shift-live-dot" aria-label="On the clock" />}
                </div>
                <div className="day-shift-meta">
                  {s.department_name || 'Unassigned'} · {fmtTimeRange(s.start_time.slice(0,5), s.end_time.slice(0,5)).split(' – ')[0]} – {endLabel} · {computeShiftHours(s.start_time, s.end_time)}h
                </div>
                {s.notes && <div className="day-shift-notes">Note: {s.notes}</div>}
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
const ResourceMode = ({ deptGroups, shifts, onEdit, onShowDetail }) => {
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

{/* Sprint 12.1: drop staff who clocked 0h today from the
            row list. Resource mode used to render *every* employee
            in the dept (empty track for non-workers) but with the
            data source now being actual clock entries, an empty
            track just adds visual noise. Dept header still shows
            "N on" so the admin can see at-a-glance who's
            *not* in (compare against StaffManager for a roster). */}
      {deptGroups.map(dept => {
        const onStaff = dept.staff.filter(e => shiftByUser[e.user_id]);
        if (onStaff.length === 0) return null;
        return (
        <React.Fragment key={dept.department_id}>
          <div className="day-resource-dept-row">
            <span
              className="day-resource-dept-dot"
              style={{ background: (DEPT_COLORS[dept.name] || DEFAULT_COLOR).border }}
            />
            <span className="day-resource-dept-name">{dept.name}</span>
            <span className="day-resource-dept-count">
              {onStaff.length} / {dept.staff.length} on
            </span>
          </div>
          {onStaff.map(emp => {
            const s = shiftByUser[emp.user_id];
            const box = s ? horizontalShiftBox(s.start_time, s.end_time) : null;
            const color = s
              ? (DEPT_COLORS[s.department_name] || DEPT_COLORS[dept.name] || DEFAULT_COLOR)
              : DEFAULT_COLOR;
            return (
              <div key={emp.user_id} className="day-resource-row">
                <div
                  className={`day-resource-name-col${s?.is_in_progress ? ' is-in-progress' : ''}`}
                  title={s?.is_in_progress ? `${emp.name} — on shift` : emp.name}
                >
                  <span className="day-resource-initial">{(emp.name || '?').charAt(0).toUpperCase()}</span>
                  <span className="day-resource-name">{emp.name.split(' ')[0]}</span>
                  {/* Sprint 12.4: green live dot at the name when
                      the staff is currently on shift. Survives even
                      when the bar gets ellipsised on narrow viewports
                      — the dot is the primary "is this person live?"
                      signal in rows mode. */}
                  {s?.is_in_progress && (
                    <span className="day-resource-name-live-dot" aria-label="On shift" />
                  )}
                </div>
                <div className="day-resource-track">
                  {/* Ticks at 6 / 12 / 18 */}
                  <div className="day-resource-tick" style={{ left: '25%' }} />
                  <div className="day-resource-tick" style={{ left: '50%' }} />
                  <div className="day-resource-tick" style={{ left: '75%' }} />
                  {s && box && (() => {
                    const startStr = s.start_time.slice(0,5);
                    const endStr   = s.is_in_progress ? 'now' : s.end_time.slice(0,5);
                    const rangeLabel = `${fmtTimeRange(startStr, endStr === 'now' ? '00:00' : endStr).split(' – ')[0]} – ${endStr === 'now' ? 'now' : fmtTimeRange(startStr, endStr).split(' – ')[1]}`;
                    // Sprint 12.4: bars open the detail modal on tap
                    // — keeps mobile usable when the time-range text
                    // is ellipsised by the narrow bar width.
                    const handleClick = () => {
                      if (s.is_actual) onShowDetail(s);
                      else onEdit(s);
                    };
                    return (
                      <button
                        type="button"
                        className={`day-resource-shift ${s.notes ? 'has-notes' : ''}${s.is_in_progress ? ' is-in-progress' : ''}`}
                        style={{
                          left:  `${box.left}%`,
                          width: `${box.width}%`,
                          background:  color.bg,
                          borderColor: color.border,
                          color:       color.text,
                          cursor:      'pointer',
                        }}
                        title={`${rangeLabel} · ${computeShiftHours(s.start_time, s.end_time)}h${s.is_in_progress ? ' · on shift' : ''}${s.notes ? ` · ${s.notes}` : ''}`}
                        onClick={handleClick}
                      >
                        {/* Sprint 12.4: live pill takes precedence when
                            on shift — it's a stronger signal than the
                            ticking "now" suffix the time-range used. */}
                        {s.is_in_progress ? (
                          <span className="day-resource-shift-time">
                            <span className="day-resource-live-pill">
                              <span className="day-resource-live-dot" /> ON SHIFT
                            </span>
                          </span>
                        ) : (
                          <span className="day-resource-shift-time">
                            {rangeLabel}
                            {' · '}
                            <span className="day-resource-shift-hours">{computeShiftHours(s.start_time, s.end_time)}h</span>
                          </span>
                        )}
                        {s.notes && (
                          <span className="day-resource-shift-notes">{s.notes}</span>
                        )}
                      </button>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </React.Fragment>
        );
      })}
    </div>
  );
};

export default DayView;
