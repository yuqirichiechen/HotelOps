import React, { useState, useEffect, useMemo } from 'react';

const DAY_NAMES   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const fmtHour = (h) => {
  if (h === 0)  return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
};

// Sprint 8.5: greedy lane-packing for timeline mode (per-day-column).
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

const DEPT_COLORS = {
  'Front Desk':      { bg: '#ebf8ff', border: '#3182ce', text: '#2c5282', dot: '#3182ce' },
  'Housekeeping':    { bg: '#f0fff4', border: '#38a169', text: '#276749', dot: '#38a169' },
  'Maintenance':     { bg: '#fffaf0', border: '#dd6b20', text: '#7b341e', dot: '#dd6b20' },
  'Food & Beverage': { bg: '#faf5ff', border: '#805ad5', text: '#553c9a', dot: '#805ad5' },
  'Management':      { bg: '#f7fafc', border: '#4a5568', text: '#1a202c', dot: '#718096' },
};
const DEFAULT_COLOR = { bg: '#f7fafc', border: '#a0aec0', text: '#2d3748', dot: '#a0aec0' };

const getDeptColor = (name) => DEPT_COLORS[name] || DEFAULT_COLOR;

const formatTime = (timeStr) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour   = h % 12 || 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, '0')}${period}`;
};

// Sprint 8.2: shifts now render as time-positioned bars on a 24h track
// instead of full-width text. timeToMinutes converts HH:MM[:SS] → minutes
// since midnight; the bar's left/width percentage is just min/1440.
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

// Compute the {left, width} percentages for a shift on a 24h track.
// Overnight shifts (end ≤ start) are clipped to "until midnight" so the
// bar still represents the portion that lives in this day.
const shiftBarPos = (start, end) => {
  const s = timeToMinutes(start);
  const eRaw = timeToMinutes(end);
  const e = eRaw > s ? eRaw : 1440;
  return { left: (s / 1440) * 100, width: ((e - s) / 1440) * 100 };
};

const fmtDate = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const todayStr = () => fmtDate(new Date());

const WeekView = ({ weekStart, employees, departments, schedules, loading, onAssign, onEdit, onMove }) => {
  const [isMobile,      setIsMobile]      = useState(window.innerWidth < 768);
  const [activeDayIdx,  setActiveDayIdx]  = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (today >= weekStart && today <= weekEnd) {
      const day = today.getDay();
      return day === 0 ? 6 : day - 1;
    }
    return 0;
  });
  const [draggedId,     setDraggedId]     = useState(null);
  const [dragOverKey,   setDragOverKey]   = useState(null);
  // Sprint 8.5: chassis state (matches DayView). Same smart-default rule —
  // pick a single dept → switch to Timeline (lane count is bounded);
  // pick All → switch to Resource (no lane-packing). Mode toggle is hidden
  // on mobile because the existing day-tab list is already a single-day
  // focus that doesn't need a mode choice.
  const [deptFilter,    setDeptFilter]    = useState('all');
  const [viewMode,      setViewMode]      = useState('resource');

  const handleDeptFilterChange = (next) => {
    setDeptFilter(next);
    setViewMode(next === 'all' ? 'resource' : 'timeline');
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Filtered slice based on the dept chip. Schedules drop along with their
  // staff so the resource grid + timeline lanes only show what's in scope.
  const filteredEmployees = useMemo(() =>
    deptFilter === 'all' ? employees : employees.filter(e => e.department_id === deptFilter),
    [employees, deptFilter]
  );
  const filteredEmpIds = useMemo(() => new Set(filteredEmployees.map(e => e.user_id)), [filteredEmployees]);
  const filteredSchedules = useMemo(() =>
    schedules.filter(s => filteredEmpIds.has(s.user_id)),
    [schedules, filteredEmpIds]
  );

  const scheduleMap = {};
  filteredSchedules.forEach(s => { scheduleMap[`${s.user_id}__${s.scheduled_date}`] = s; });
  const getSchedule = (userId, date) => scheduleMap[`${userId}__${fmtDate(date)}`];

  const deptGroups = (deptFilter === 'all' ? departments : departments.filter(d => d.department_id === deptFilter))
    .map(dept => ({ ...dept, employees: filteredEmployees.filter(e => e.department_id === dept.department_id) }))
    .filter(d => d.employees.length > 0);

  const handleDragStart = (e, schedule) => {
    setDraggedId(schedule.schedule_id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e, empId, date) => {
    e.preventDefault();
    setDragOverKey(null);
    if (!draggedId) return;
    const dateStr = fmtDate(date);
    const dragged = schedules.find(s => s.schedule_id === draggedId);
    if (!dragged || (dragged.user_id === empId && dragged.scheduled_date === dateStr)) return;
    onMove(draggedId, empId, dateStr);
    setDraggedId(null);
  };

  if (loading) return <div className="sched-loading">Loading schedule…</div>;

  // Chassis — same dept-filter chips + mode-toggle pattern Day uses.
  // Mode toggle hidden on mobile because the day-tab list there IS the
  // single-day focus the toggle would otherwise pick.
  const chassis = (
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
      {!isMobile && (
        <div className="day-mode-toggle">
          <button
            type="button"
            className={`day-mode-btn ${viewMode === 'resource' ? 'is-active' : ''}`}
            onClick={() => setViewMode('resource')}
            title="Staff rows × 7 day columns — best for an overview of who works which days"
          >Rows</button>
          <button
            type="button"
            className={`day-mode-btn ${viewMode === 'timeline' ? 'is-active' : ''}`}
            onClick={() => setViewMode('timeline')}
            title="7 day columns × 24h vertical — best for one department"
          >Timeline</button>
        </div>
      )}
    </div>
  );

  // ── MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) {
    const activeDay = days[activeDayIdx];
    const today     = todayStr();

    return (
      <div className="week-view">
        {chassis}
        <div className="week-mobile">
        <div className="mobile-day-tabs">
          {days.map((day, i) => {
            const isToday = fmtDate(day) === today;
            const count   = employees.filter(e => getSchedule(e.user_id, day)).length;
            return (
              <button
                key={i}
                className={`mobile-day-tab${i === activeDayIdx ? ' mobile-day-tab-active' : ''}${isToday ? ' mobile-day-tab-today' : ''}`}
                onClick={() => setActiveDayIdx(i)}
              >
                <span className="mobile-day-name">{DAY_NAMES[i]}</span>
                <span className="mobile-day-num">{day.getDate()}</span>
                {count > 0 && <span className="mobile-day-dot" />}
              </button>
            );
          })}
        </div>

        <div className="mobile-active-date">
          {DAY_NAMES[activeDayIdx]}, {MONTH_SHORT[activeDay.getMonth()]} {activeDay.getDate()}
        </div>

        <div className="mobile-emp-list">
          {deptGroups.map(dept => (
            <div key={dept.department_id}>
              <div className="mobile-dept-header">{dept.name}</div>
              {dept.employees.map(emp => {
                const schedule = getSchedule(emp.user_id, activeDay);
                const color    = getDeptColor(dept.name);
                const pos      = schedule ? shiftBarPos(schedule.start_time, schedule.end_time) : null;
                return (
                  <div key={emp.user_id} className="mobile-emp-row">
                    <span className="mobile-emp-name">{emp.name}</span>
                    {schedule && pos ? (
                      <button
                        className="mobile-shift-track-btn"
                        onClick={() => onEdit(schedule)}
                        title={`${formatTime(schedule.start_time)}–${formatTime(schedule.end_time)}`}
                      >
                        <div className="week-shift-track" aria-hidden>
                          <div className="week-shift-tick" style={{ left: '25%' }} />
                          <div className="week-shift-tick" style={{ left: '50%' }} />
                          <div className="week-shift-tick" style={{ left: '75%' }} />
                          <div
                            className="week-shift-block"
                            style={{
                              left:        `${pos.left}%`,
                              width:       `${pos.width}%`,
                              background:  color.bg,
                              borderColor: color.border,
                              color:       color.text,
                            }}
                          >
                            <span className="shift-time">
                              {formatTime(schedule.start_time)}–{formatTime(schedule.end_time)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ) : (
                      <button
                        className="mobile-assign-btn"
                        onClick={() => onAssign(emp, activeDay)}
                      >
                        + Assign
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {deptGroups.length === 0 && (
            <div className="sched-empty">No active employees found. Add employees first.</div>
          )}
        </div>
        </div>
      </div>
    );
  }

  // ── DESKTOP TIMELINE MODE (7 day columns × 24h vertical) ─────────────────
  if (viewMode === 'timeline') {
    return (
      <div className="week-view">
        {chassis}
        <WeekTimelineMode
          days={days}
          schedules={filteredSchedules}
          employees={filteredEmployees}
          onEdit={onEdit}
        />
      </div>
    );
  }

  // ── DESKTOP RESOURCE MODE (Gantt grid — staff rows × day columns) ────────
  const today = todayStr();

  return (
    <div className="week-view">
      {chassis}
      <div className="week-desktop-wrapper">
      <div className="week-grid">
        {/* Header row */}
        <div className="week-corner" />
        {days.map((day, i) => {
          const isToday = fmtDate(day) === today;
          return (
            <div key={i} className={`week-day-header${isToday ? ' week-day-today' : ''}`}>
              <span className="week-day-name">{DAY_NAMES[i]}</span>
              <span className={`week-day-num${isToday ? ' week-day-num-today' : ''}`}>{day.getDate()}</span>
              <span className="week-day-month">{MONTH_SHORT[day.getMonth()]}</span>
            </div>
          );
        })}

        {/* Department groups */}
        {deptGroups.map(dept => {
          const color = getDeptColor(dept.name);
          return (
            <React.Fragment key={dept.department_id}>
              <div className="week-dept-row">
                <span className="week-dept-dot" style={{ background: color.dot }} />
                {dept.name}
              </div>

              {dept.employees.map(emp => (
                <React.Fragment key={emp.user_id}>
                  <div className="week-emp-cell">
                    <span className="week-emp-initial">{emp.name.charAt(0).toUpperCase()}</span>
                    <span className="week-emp-name">{emp.name.split(' ')[0]}</span>
                  </div>

                  {days.map((day, di) => {
                    const schedule = getSchedule(emp.user_id, day);
                    const cellKey  = `${emp.user_id}__${fmtDate(day)}`;
                    const isOver   = dragOverKey === cellKey;
                    const pos      = schedule ? shiftBarPos(schedule.start_time, schedule.end_time) : null;
                    return (
                      <div
                        key={di}
                        className={`week-shift-cell${isOver ? ' drag-over' : ''}`}
                        onDragOver={e => { e.preventDefault(); setDragOverKey(cellKey); }}
                        onDragLeave={() => setDragOverKey(null)}
                        onDrop={e => handleDrop(e, emp.user_id, day)}
                        onClick={() => !schedule && onAssign(emp, day)}
                      >
                        <div className="week-shift-track" aria-hidden>
                          {/* Hour-mark guides at 06, 12, 18 — anchor for "see at a glance
                              when the shift lives in the day". */}
                          <div className="week-shift-tick" style={{ left: '25%' }} />
                          <div className="week-shift-tick" style={{ left: '50%' }} />
                          <div className="week-shift-tick" style={{ left: '75%' }} />
                          {schedule && pos && (
                            <div
                              className={`week-shift-block${draggedId === schedule.schedule_id ? ' dragging' : ''}`}
                              style={{
                                left:        `${pos.left}%`,
                                width:       `${pos.width}%`,
                                background:  color.bg,
                                borderColor: color.border,
                                color:       color.text,
                              }}
                              draggable
                              title={`${formatTime(schedule.start_time)}–${formatTime(schedule.end_time)}`}
                              onDragStart={e => handleDragStart(e, schedule)}
                              onDragEnd={() => setDraggedId(null)}
                              onClick={e => { e.stopPropagation(); onEdit(schedule); }}
                            >
                              <span className="shift-time">
                                {formatTime(schedule.start_time)}–{formatTime(schedule.end_time)}
                              </span>
                            </div>
                          )}
                        </div>
                        {!schedule && <div className="week-cell-empty">+</div>}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </React.Fragment>
          );
        })}

        {deptGroups.length === 0 && (
          <div className="week-empty-state">
            No active employees found.
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

// Sprint 8.5: Week timeline mode — 7 day columns × 24h vertical axis.
// Each day column gets its own greedy lane-pack so overlapping shifts within
// that day split horizontally inside the column. Reads like Outlook week
// view; complementary to the Resource grid which has days-on-X / staff-on-Y.
const WeekTimelineMode = ({ days, schedules, employees, onEdit }) => {
  const todayStrCached = todayStr();
  const empById = useMemo(() => {
    const m = {};
    employees.forEach(e => { m[e.user_id] = e; });
    return m;
  }, [employees]);

  // Per-day lane assignments, keyed by YYYY-MM-DD.
  const perDay = useMemo(() => {
    const m = {};
    days.forEach(d => {
      const ds = fmtDate(d);
      m[ds] = laneAssign(schedules.filter(s => s.scheduled_date === ds));
    });
    return m;
  }, [days, schedules]);

  const hours = useMemo(() => Array.from({ length: 25 }, (_, h) => h), []);

  return (
    <div className="week-tl-wrap">
      <div className="week-tl-grid">
        <div className="week-tl-corner" />
        {days.map((d, i) => {
          const ds = fmtDate(d);
          const isToday = ds === todayStrCached;
          return (
            <div key={i} className={`week-tl-day-header${isToday ? ' is-today' : ''}`}>
              <span className="week-tl-day-name">{DAY_NAMES[i]}</span>
              <span className={`week-tl-day-num${isToday ? ' is-today' : ''}`}>{d.getDate()}</span>
            </div>
          );
        })}

        <div className="week-tl-rail">
          {hours.map(h => (
            <span
              key={h}
              className="week-tl-hour-label"
              style={{ top: `${(h / 24) * 100}%` }}
            >
              {fmtHour(h % 24)}
            </span>
          ))}
        </div>

        {days.map((d, i) => {
          const ds = fmtDate(d);
          const { shifts, laneCount } = perDay[ds] || { shifts: [], laneCount: 1 };
          return (
            <div key={i} className="week-tl-day-col">
              {hours.map(h => (
                <div key={h} className="week-tl-hour-line" style={{ top: `${(h / 24) * 100}%` }} />
              ))}
              {shifts.map(s => {
                const startMin = timeToMinutes(s.start_time);
                const endMinRaw = timeToMinutes(s.end_time);
                const endMin = endMinRaw > startMin ? endMinRaw : 1440;
                const top    = (startMin / 1440) * 100;
                const height = ((endMin - startMin) / 1440) * 100;
                const left   = (s._lane / laneCount) * 100;
                const width  = (1 / laneCount) * 100;
                const empData = empById[s.user_id];
                const deptName = s.department_name || empData?.department || null;
                const color = getDeptColor(deptName);
                const firstName = (empData?.name || 'Unknown').split(' ')[0];
                return (
                  <button
                    key={s.schedule_id}
                    type="button"
                    className="week-tl-shift"
                    style={{
                      top:    `${top}%`,
                      height: `calc(${height}% - 2px)`,
                      left:   `calc(${left}% + 2px)`,
                      width:  `calc(${width}% - 4px)`,
                      background:  color.bg,
                      borderColor: color.border,
                      color:       color.text,
                    }}
                    title={`${empData?.name || 'Unknown'} · ${formatTime(s.start_time)}–${formatTime(s.end_time)}`}
                    onClick={() => onEdit(s)}
                  >
                    <div className="week-tl-shift-name">{firstName}</div>
                    <div className="week-tl-shift-time">
                      {formatTime(s.start_time)}–{formatTime(s.end_time)}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeekView;
