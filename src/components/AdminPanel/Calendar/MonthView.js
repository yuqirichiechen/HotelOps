import React from 'react';

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Department abbreviations shown on each day cell. Mirrors the labels users
// already recognize from staff cards / scheduling. Anything not in this map
// falls back to first 2 letters uppercased.
const DEPT_ABBREV = {
  'Front Desk':      'FD',
  'Housekeeping':    'HK',
  'Maintenance':     'MT',
  'Food & Beverage': 'F&B',
  'Management':      'MG',
};
const DEPT_DOTS = {
  'Front Desk':      '#3182ce',
  'Housekeeping':    '#38a169',
  'Maintenance':     '#dd6b20',
  'Food & Beverage': '#805ad5',
  'Management':      '#718096',
};

const abbreviate = (name) => DEPT_ABBREV[name] || (name || '').slice(0, 2).toUpperCase();

const fmtDate = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Sprint 8.0: month cells now show department-grouped headcount summaries
// (e.g. "FD: 2 · HK: 2") instead of a single shift count + dots. Compact
// enough to fit a 7-col month grid; each line is sorted alphabetically so
// the order is stable across days.
const MonthView = ({ year, month, schedules, departments, loading, onSelectDay }) => {
  const firstDay       = new Date(year, month, 1);
  const lastDay        = new Date(year, month + 1, 0);
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7;

  const days = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push({ date: new Date(year, month, 1 - firstDayOfWeek + i), current: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), current: true });
  }
  const remaining = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month + 1, i), current: false });
  }

  // Per-day, per-department count: { 'YYYY-MM-DD': { 'Front Desk': 2, ... } }
  const dayDeptCounts = {};
  schedules.forEach(s => {
    const date = s.scheduled_date;
    const dept = s.department_name || 'Unassigned';
    if (!dayDeptCounts[date]) dayDeptCounts[date] = {};
    dayDeptCounts[date][dept] = (dayDeptCounts[date][dept] || 0) + 1;
  });

  const today = fmtDate(new Date());

  if (loading) return <div className="sched-loading">Loading schedule…</div>;

  return (
    <div className="month-view">
      <div className="month-grid">
        {DAY_HEADERS.map(d => (
          <div key={d} className="month-day-header">{d}</div>
        ))}

        {days.map((item, i) => {
          const dateStr = fmtDate(item.date);
          const counts  = item.current ? dayDeptCounts[dateStr] : null;
          const isToday = dateStr === today;
          const deptList = counts ? Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])) : [];

          return (
            <button
              key={i}
              type="button"
              className={[
                'month-day-cell',
                !item.current ? 'month-day-other' : '',
                isToday       ? 'month-day-today' : '',
              ].join(' ').trim()}
              onClick={() => item.current && onSelectDay(item.date)}
              disabled={!item.current}
            >
              <span className={`month-day-num${isToday ? ' month-day-num-today' : ''}`}>
                {item.date.getDate()}
              </span>
              {deptList.length > 0 && (
                <div className="month-day-content">
                  {deptList.map(([deptName, n]) => (
                    <div key={deptName} className="month-dept-line">
                      <span
                        className="month-dept-tag"
                        style={{ background: DEPT_DOTS[deptName] || '#a0aec0' }}
                      >
                        {abbreviate(deptName)}
                      </span>
                      <span className="month-dept-count">: {n}</span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MonthView;
