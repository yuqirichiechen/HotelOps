import React from 'react';

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DEPT_DOTS = {
  'Front Desk':      '#3182ce',
  'Housekeeping':    '#38a169',
  'Maintenance':     '#dd6b20',
  'Food & Beverage': '#805ad5',
  'Management':      '#718096',
};

const fmtDate = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const MonthView = ({ year, month, schedules, loading, onSelectDay }) => {
  const firstDay      = new Date(year, month, 1);
  const lastDay       = new Date(year, month + 1, 0);
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // 0 = Mon

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

  // Per-day stats: { count, depts: Set }
  const dayData = {};
  schedules.forEach(s => {
    if (!dayData[s.scheduled_date]) dayData[s.scheduled_date] = { count: 0, depts: new Set() };
    dayData[s.scheduled_date].count++;
    dayData[s.scheduled_date].depts.add(s.department_name);
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
          const data    = item.current ? dayData[dateStr] : null;
          const isToday = dateStr === today;

          return (
            <div
              key={i}
              className={[
                'month-day-cell',
                !item.current  ? 'month-day-other' : '',
                isToday        ? 'month-day-today'  : '',
              ].join(' ').trim()}
              onClick={() => item.current && onSelectDay(item.date)}
            >
              <span className={`month-day-num${isToday ? ' month-day-num-today' : ''}`}>
                {item.date.getDate()}
              </span>
              {data && (
                <div className="month-day-content">
                  <span className="month-shift-count">
                    {data.count} shift{data.count !== 1 ? 's' : ''}
                  </span>
                  <div className="month-dept-dots">
                    {[...data.depts].map(deptName => (
                      <span
                        key={deptName}
                        className="month-dept-dot"
                        style={{ background: DEPT_DOTS[deptName] || '#a0aec0' }}
                        title={deptName}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="month-legend">
        {Object.entries(DEPT_DOTS).map(([name, color]) => (
          <div key={name} className="month-legend-item">
            <span className="month-legend-dot" style={{ background: color }} />
            <span>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MonthView;
