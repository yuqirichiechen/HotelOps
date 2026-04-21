import React, { useState, useEffect } from 'react';

const DAY_NAMES   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

  const scheduleMap = {};
  schedules.forEach(s => { scheduleMap[`${s.user_id}__${s.scheduled_date}`] = s; });
  const getSchedule = (userId, date) => scheduleMap[`${userId}__${fmtDate(date)}`];

  const deptGroups = departments
    .map(dept => ({ ...dept, employees: employees.filter(e => e.department_id === dept.department_id) }))
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

  // ── MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) {
    const activeDay = days[activeDayIdx];
    const today     = todayStr();

    return (
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
                return (
                  <div key={emp.user_id} className="mobile-emp-row">
                    <span className="mobile-emp-name">{emp.name}</span>
                    {schedule ? (
                      <button
                        className="mobile-shift-pill"
                        style={{ background: color.bg, borderColor: color.border, color: color.text }}
                        onClick={() => onEdit(schedule)}
                      >
                        {formatTime(schedule.start_time)}–{formatTime(schedule.end_time)}
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
    );
  }

  // ── DESKTOP (Gantt Grid) ──────────────────────────────────────────────────
  const today = todayStr();

  return (
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
                    return (
                      <div
                        key={di}
                        className={`week-shift-cell${isOver ? ' drag-over' : ''}`}
                        onDragOver={e => { e.preventDefault(); setDragOverKey(cellKey); }}
                        onDragLeave={() => setDragOverKey(null)}
                        onDrop={e => handleDrop(e, emp.user_id, day)}
                        onClick={() => !schedule && onAssign(emp, day)}
                      >
                        {schedule ? (
                          <div
                            className={`week-shift-block${draggedId === schedule.schedule_id ? ' dragging' : ''}`}
                            style={{ background: color.bg, borderColor: color.border, color: color.text }}
                            draggable
                            onDragStart={e => handleDragStart(e, schedule)}
                            onDragEnd={() => setDraggedId(null)}
                            onClick={e => { e.stopPropagation(); onEdit(schedule); }}
                          >
                            <span className="shift-time">
                              {formatTime(schedule.start_time)}–{formatTime(schedule.end_time)}
                            </span>
                          </div>
                        ) : (
                          <div className="week-cell-empty">+</div>
                        )}
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
  );
};

export default WeekView;
