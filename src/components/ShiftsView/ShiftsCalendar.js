import React, { useState, useEffect } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_SHORT   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const DEPT_COLORS = {
  'Front Desk':      { bg: '#ebf8ff', border: '#3182ce', text: '#2c5282', header: '#3182ce' },
  'Housekeeping':    { bg: '#f0fff4', border: '#38a169', text: '#276749', header: '#38a169' },
  'Maintenance':     { bg: '#fffaf0', border: '#dd6b20', text: '#7b341e', header: '#dd6b20' },
  'Food & Beverage': { bg: '#faf5ff', border: '#805ad5', text: '#553c9a', header: '#805ad5' },
  'Management':      { bg: '#f7fafc', border: '#4a5568', text: '#1a202c', header: '#718096' },
};
const DEFAULT_COLOR = { bg: '#f7fafc', border: '#a0aec0', text: '#2d3748', header: '#a0aec0' };
const getDeptColor  = (name) => DEPT_COLORS[name] || DEFAULT_COLOR;

const timeToMinutes = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const effectiveEndMin = (startMin, endMin) =>
  endMin < startMin ? endMin + 1440 : endMin;

const computeHours = (startStr, endStr) => {
  const s = timeToMinutes(startStr);
  const e = effectiveEndMin(s, timeToMinutes(endStr));
  return (e - s) / 60;
};

const formatTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour   = h % 12 || 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, '0')}${period}`;
};

const formatAxisMin = (totalMin) => {
  const wrapped = ((totalMin % 1440) + 1440) % 1440;
  const h       = Math.floor(wrapped / 60);
  const period  = h >= 12 ? 'pm' : 'am';
  const hour    = h % 12 || 12;
  const nextDay = totalMin >= 1440;
  return `${hour}${period}${nextDay ? ' +1' : ''}`;
};

const fmtDate = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getWeekStart = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
};

const assignRows = (groups) => {
  const rowEnds = [];
  return groups.map(g => {
    const s = timeToMinutes(g.start_time);
    const e = effectiveEndMin(s, timeToMinutes(g.end_time));
    let row = rowEnds.findIndex(end => end <= s);
    if (row === -1) { row = rowEnds.length; rowEnds.push(e); }
    else rowEnds[row] = e;
    return { ...g, row };
  });
};

const buildShiftGroups = (shifts) => {
  const map = {};
  shifts.forEach(s => {
    const key = `${s.start_time}|${s.end_time}`;
    if (!map[key]) map[key] = { start_time: s.start_time, end_time: s.end_time, employees: [] };
    map[key].employees.push({ name: s.employee_name, userId: s.user_id });
  });
  return Object.values(map).sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
};

const ROW_HEIGHT  = 56; // px per overlap row (desktop)
const MOBILE_HOUR = 56; // px per hour (mobile vertical)

// ── Component ─────────────────────────────────────────────────────────────────

const ShiftsCalendar = ({ employee, onBack }) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [schedules,    setSchedules]    = useState([]);
  const [visibility,   setVisibility]   = useState('all');
  const [loading,      setLoading]      = useState(true);
  const [popup,        setPopup]        = useState(null);
  const [isMobile,     setIsMobile]     = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const weekStart = getWeekStart(selectedDate);
  const weekDays  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  useEffect(() => {
    const dateStr = fmtDate(selectedDate);
    setLoading(true);
    setPopup(null);
    fetch(`/api/shifts/daily?date=${dateStr}&userId=${employee.user_id}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) { setSchedules(data.schedules); setVisibility(data.visibility); }
        setLoading(false);
      });
  }, [selectedDate, employee.user_id]);

  // ── Compute time axis ────────────────────────────────────────────────────
  const axisBounds = (() => {
    if (!schedules.length) return { startMin: 6 * 60, endMin: 22 * 60 };
    let lo = Infinity, hi = -Infinity;
    schedules.forEach(s => {
      const sMin = timeToMinutes(s.start_time);
      const eMin = effectiveEndMin(sMin, timeToMinutes(s.end_time));
      lo = Math.min(lo, sMin);
      hi = Math.max(hi, eMin);
    });
    // Always start at 6am at latest; never start before midnight
    const startMin = Math.min(Math.max(0, Math.floor(lo / 60) * 60 - 60), 6 * 60);
    // Cap span at 20h so overnight shifts don't make the axis huge
    const rawEnd   = Math.ceil(hi / 60) * 60 + 60;
    const endMin   = Math.min(rawEnd, startMin + 20 * 60);
    return { startMin, endMin };
  })();

  const axisRange   = axisBounds.endMin - axisBounds.startMin;
  const hourMarkers = [];
  for (let m = axisBounds.startMin; m <= axisBounds.endMin; m += 60) hourMarkers.push(m);
  const showMidnight = axisBounds.startMin < 1440 && axisBounds.endMin > 1440;
  const midnightPct  = ((1440 - axisBounds.startMin) / axisRange) * 100;

  const toPct = (min) => ((min - axisBounds.startMin) / axisRange) * 100;

  // ── Group schedules by department ────────────────────────────────────────
  const deptNames  = [...new Set(schedules.map(s => s.department_name))].sort();
  const deptGroups = deptNames.map(deptName => {
    const deptShifts = schedules.filter(s => s.department_name === deptName);
    const groups     = buildShiftGroups(deptShifts);
    const withRows   = assignRows(groups);
    const numRows    = withRows.reduce((m, g) => Math.max(m, g.row + 1), 1);
    return { deptName, groups: withRows, numRows };
  });

  const today = fmtDate(new Date());

  // ── Overlap detection for popup ──────────────────────────────────────────
  const handleBlockClick = (clickedGroup, deptEntry) => {
    const cs = timeToMinutes(clickedGroup.start_time);
    const ce = effectiveEndMin(cs, timeToMinutes(clickedGroup.end_time));
    const overlapping = deptEntry.groups.filter(g => {
      const gs = timeToMinutes(g.start_time);
      const ge = effectiveEndMin(gs, timeToMinutes(g.end_time));
      return !(ge <= cs || gs >= ce);
    });
    setPopup({ deptName: deptEntry.deptName, groups: overlapping });
  };

  // ── Mobile vertical layout ───────────────────────────────────────────────
  const mobileAxisH = (axisRange / 60) * MOBILE_HOUR;

  const renderMobile = () => (
    <div className="sv-mobile-view">
      {/* Sticky dept-header row */}
      <div className="sv-mobile-header-row">
        <div className="sv-mobile-gutter-spacer" />
        {deptGroups.map(d => {
          const color = getDeptColor(d.deptName);
          return (
            <div
              key={d.deptName}
              className="sv-mobile-col-header"
              style={{ borderTopColor: color.header }}
            >
              {d.deptName}
            </div>
          );
        })}
      </div>

      {/* Scrollable body */}
      <div className="sv-mobile-body" style={{ height: mobileAxisH }}>
        {/* Time gutter */}
        <div className="sv-mobile-gutter" style={{ height: mobileAxisH }}>
          {hourMarkers.map(m => (
            <div
              key={m}
              className="sv-mobile-tick"
              style={{ top: ((m - axisBounds.startMin) / 60) * MOBILE_HOUR }}
            >
              {formatAxisMin(m)}
            </div>
          ))}
        </div>

        {/* Dept columns */}
        {deptGroups.map(deptEntry => {
          const color = getDeptColor(deptEntry.deptName);
          return (
            <div
              key={deptEntry.deptName}
              className="sv-mobile-col"
              style={{ height: mobileAxisH }}
            >
              {/* Hour grid lines */}
              {hourMarkers.map(m => (
                <div
                  key={m}
                  className="sv-mobile-grid-line"
                  style={{ top: ((m - axisBounds.startMin) / 60) * MOBILE_HOUR }}
                />
              ))}

              {/* Midnight band */}
              {showMidnight && (
                <div
                  className="sv-mobile-midnight-band"
                  style={{ top: ((1440 - axisBounds.startMin) / 60) * MOBILE_HOUR }}
                />
              )}

              {/* Shift blocks */}
              {deptEntry.groups.map(g => {
                const sMin    = timeToMinutes(g.start_time);
                const eMin    = effectiveEndMin(sMin, timeToMinutes(g.end_time));
                const topPx   = ((sMin - axisBounds.startMin) / 60) * MOBILE_HOUR;
                const rawH    = ((eMin - sMin) / 60) * MOBILE_HOUR;
                const heightPx = Math.min(rawH, mobileAxisH - topPx);
                const colPct  = 100 / deptEntry.numRows;
                const isOwn   = g.employees.some(e => e.userId === employee.user_id);
                const isCapped = eMin > axisBounds.endMin;

                return (
                  <div
                    key={`${g.start_time}|${g.end_time}`}
                    className={`sv-mobile-block${isOwn ? ' sv-shift-own' : ''}${isCapped ? ' sv-block-capped' : ''}`}
                    style={{
                      top:         topPx,
                      height:      Math.max(heightPx, 28),
                      left:        `calc(${g.row * colPct}% + 2px)`,
                      width:       `calc(${colPct}% - 4px)`,
                      background:  isOwn ? color.border : color.bg,
                      borderColor: color.border,
                      color:       isOwn ? 'white' : color.text,
                    }}
                    onClick={() => handleBlockClick(g, deptEntry)}
                  >
                    <span className="sv-block-time">
                      {formatTime(g.start_time)}–{formatTime(g.end_time)}
                    </span>
                    <span className="sv-block-names">
                      {g.employees.map(e => e.name.split(' ')[0]).join(', ')}
                    </span>
                    {isCapped && <span className="sv-block-continues">→ +1</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Desktop horizontal layout ────────────────────────────────────────────
  const renderDesktop = () => (
    <div className="sv-timeline-scroll">
      <div className="sv-timeline-inner">

        {/* Time axis row */}
        <div className="sv-time-axis">
          <div className="sv-dept-label-spacer" />
          <div className="sv-axis-track">
            {hourMarkers.map((m, i) => (
              <span
                key={m}
                className="sv-hour-label"
                style={{
                  left:      `${toPct(m)}%`,
                  transform: i === 0
                    ? 'translateX(0)'
                    : i === hourMarkers.length - 1
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
                }}
              >
                {formatAxisMin(m)}
              </span>
            ))}
            {showMidnight && (
              <div className="sv-midnight-marker" style={{ left: `${midnightPct}%` }}>
                <div className="sv-midnight-line" />
                <span className="sv-midnight-label">midnight</span>
              </div>
            )}
          </div>
        </div>

        {/* Department lanes */}
        {deptGroups.map(deptEntry => {
          const color = getDeptColor(deptEntry.deptName);
          const laneH = deptEntry.numRows * ROW_HEIGHT + 16;
          return (
            <div key={deptEntry.deptName} className="sv-dept-lane">
              <div className="sv-dept-label" style={{ borderLeftColor: color.header }}>
                {deptEntry.deptName}
              </div>
              <div className="sv-dept-track" style={{ height: laneH }}>
                {hourMarkers.map(m => (
                  <div key={m} className="sv-grid-line" style={{ left: `${toPct(m)}%` }} />
                ))}
                {showMidnight && (
                  <div className="sv-midnight-band" style={{ left: `${midnightPct}%` }} />
                )}

                {deptEntry.groups.map(g => {
                  const sMin     = timeToMinutes(g.start_time);
                  const eMin     = effectiveEndMin(sMin, timeToMinutes(g.end_time));
                  // Clamp visual end to axis so overnight blocks don't overflow
                  const visualEnd = Math.min(eMin, axisBounds.endMin);
                  const leftPct   = toPct(sMin);
                  const widthPct  = ((visualEnd - sMin) / axisRange) * 100;
                  const topPx     = g.row * ROW_HEIGHT + 8;
                  const isOwn     = g.employees.some(e => e.userId === employee.user_id);
                  const isCapped  = eMin > axisBounds.endMin;

                  return (
                    <div
                      key={`${g.start_time}|${g.end_time}`}
                      className={`sv-shift-block${isOwn ? ' sv-shift-own' : ''}${isCapped ? ' sv-block-capped' : ''}`}
                      style={{
                        left:        `${leftPct}%`,
                        width:       `${widthPct}%`,
                        top:         `${topPx}px`,
                        height:      `${ROW_HEIGHT - 12}px`,
                        background:  isOwn ? color.border : color.bg,
                        borderColor: color.border,
                        color:       isOwn ? 'white' : color.text,
                      }}
                      onClick={() => handleBlockClick(g, deptEntry)}
                    >
                      <span className="sv-block-time">
                        {formatTime(g.start_time)}–{formatTime(g.end_time)}
                      </span>
                      <span className="sv-block-names">
                        {g.employees.map(e => e.name.split(' ')[0]).join(', ')}
                      </span>
                      {isCapped && <span className="sv-block-continues">→ +1</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="sv-calendar">

      {/* Header */}
      <div className="sv-cal-header">
        <button className="sv-back-btn" onClick={onBack}>← Done</button>
        <div className="sv-cal-title">
          <span className="sv-cal-greeting">Hello, {employee.name.split(' ')[0]}</span>
          <span className="sv-cal-sub">Shifts Board</span>
        </div>
        <div className="sv-cal-date-display">
          {MONTH_SHORT[selectedDate.getMonth()]} {selectedDate.getFullYear()}
        </div>
      </div>

      {/* Week day tabs */}
      <div className="sv-week-tabs">
        {weekDays.map((day, i) => {
          const ds       = fmtDate(day);
          const isToday  = ds === today;
          const isActive = ds === fmtDate(selectedDate);
          return (
            <button
              key={i}
              className={`sv-day-tab${isActive ? ' sv-day-tab-active' : ''}${isToday ? ' sv-day-tab-today' : ''}`}
              onClick={() => setSelectedDate(new Date(day))}
            >
              <span className="sv-day-name">{DAY_SHORT[day.getDay()]}</span>
              <span className="sv-day-num">{day.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* Main content */}
      {loading ? (
        <div className="sv-loading">Loading shifts…</div>
      ) : visibility === 'none' ? (
        <div className="sv-hidden-msg">
          <div className="sv-hidden-icon">📋</div>
          <div>Schedule is not available right now.</div>
        </div>
      ) : schedules.length === 0 ? (
        <div className="sv-empty">No shifts scheduled for this day.</div>
      ) : isMobile ? renderMobile() : renderDesktop()}

      {/* Popup cards */}
      {popup && (
        <div className="sv-popup-overlay" onClick={() => setPopup(null)}>
          <div className="sv-popup-sheet" onClick={e => e.stopPropagation()}>
            <div className="sv-popup-header">
              <div>
                <div className="sv-popup-dept">{popup.deptName}</div>
                <div className="sv-popup-date">
                  {DAY_SHORT[selectedDate.getDay()]}, {MONTH_SHORT[selectedDate.getMonth()]} {selectedDate.getDate()}
                </div>
              </div>
              <button className="sv-popup-close" onClick={() => setPopup(null)}>×</button>
            </div>

            <div className={`sv-popup-cards sv-popup-cards-${Math.min(popup.groups.length, 2)}`}>
              {popup.groups.map(g => {
                const color = getDeptColor(popup.deptName);
                const hrs   = computeHours(g.start_time, g.end_time);
                return (
                  <div
                    key={`${g.start_time}|${g.end_time}`}
                    className="sv-popup-card"
                    style={{ borderTopColor: color.border }}
                  >
                    <div className="sv-card-time-row">
                      <span className="sv-card-time">
                        {formatTime(g.start_time)} – {formatTime(g.end_time)}
                      </span>
                      <span className="sv-card-hrs">{hrs % 1 === 0 ? hrs : hrs.toFixed(1)}h</span>
                    </div>
                    {timeToMinutes(g.end_time) < timeToMinutes(g.start_time) && (
                      <span className="sv-card-overnight">Overnight shift</span>
                    )}
                    <div className="sv-card-chips">
                      {g.employees.map(emp => (
                        <div
                          key={emp.userId}
                          className={`sv-chip${emp.userId === employee.user_id ? ' sv-chip-own' : ''}`}
                        >
                          <span
                            className="sv-chip-initial"
                            style={{ background: emp.userId === employee.user_id ? color.border : '#edf2f7' }}
                          >
                            {emp.name.charAt(0)}
                          </span>
                          <span>{emp.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {popup.groups.length > 1 && (
              <div className="sv-popup-overlap-note">These shifts overlap on this day</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftsCalendar;
