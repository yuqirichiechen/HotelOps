import React from 'react';

// Sprint 8.0: 12 mini-month grids in a 4×3 desktop / 2×6 tablet / 1×12 mobile
// layout. Each tile is a click target — clicking anywhere on a month zooms
// into the Month view for that month (mirrors iOS Calendar's Year view
// where you tap a month, not a specific day, to drill in).
//
// Days with at least one shift get a small dot; today's number is circled.
// Per-cell shift counts aren't shown — too dense for the year scale.

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const fmtDate = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const MiniMonth = ({ year, month, schedules, today }) => {
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
  const lastDay        = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(d);

  // Days that have at least one shift this month.
  const shiftedDays = new Set();
  schedules.forEach(s => {
    const d = new Date(s.scheduled_date + 'T00:00:00');
    if (d.getFullYear() === year && d.getMonth() === month) {
      shiftedDays.add(d.getDate());
    }
  });

  return (
    <div className="mini-month">
      {DAY_HEADERS.map((d, i) => (
        <div key={`h-${i}`} className="mini-month-h">{d}</div>
      ))}
      {cells.map((d, i) => {
        if (d === null) return <div key={`d-${i}`} className="mini-month-day mini-month-day-blank" />;
        const isToday = today.year === year && today.month === month && today.day === d;
        const hasShift = shiftedDays.has(d);
        return (
          <div key={`d-${i}`} className={`mini-month-day ${isToday ? 'mini-month-day-today' : ''} ${hasShift ? 'has-shift' : ''}`}>
            <span className="mini-month-day-num">{d}</span>
          </div>
        );
      })}
    </div>
  );
};

const YearView = ({ year, schedules, loading, onSelectMonth }) => {
  const now   = new Date();
  const today = { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };

  if (loading && schedules.length === 0) {
    return <div className="sched-loading">Loading schedule…</div>;
  }

  return (
    <div className="year-view">
      <div className="year-grid">
        {Array.from({ length: 12 }, (_, m) => (
          <button
            key={m}
            type="button"
            className="year-month-tile"
            style={{ viewTransitionName: `sched-month-${m}` }}
            onClick={() => onSelectMonth(m)}
          >
            <div className={`year-month-title ${today.year === year && today.month === m ? 'is-current' : ''}`}>
              {MONTH_NAMES[m]}
            </div>
            <MiniMonth year={year} month={m} schedules={schedules} today={today} />
          </button>
        ))}
      </div>
    </div>
  );
};

export default YearView;
