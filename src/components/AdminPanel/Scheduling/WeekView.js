import React, { useMemo, useState } from 'react';

// Sprint 8.5.1: Week view repurposed as a monthly-hours-by-week summary
// table. The previous staff×days assign-grid was useful before the docked
// "+" panel, but now that bulk-assigning lives there, Week is best used as
// the *aggregate* view between Month (calendar) and Day (timeline). Each
// row is a staff member, each column is one of the 4 weeks anchored on the
// cursor's week, and the cell is the total scheduled hours that week.
// Cells over the OT threshold (40h, the project default) get an amber
// tint so a manager can spot OT risk at a glance across the month.

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const OT_THRESHOLD = 40;

const fmtDate = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const todayStr = () => fmtDate(new Date());

const timeToMinutes = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// Hours represented by a single schedule row. Overnight shifts (end ≤
// start) clip to "until midnight" same as everywhere else in scheduling.
const shiftHours = (s) => {
  const sm = timeToMinutes(s.start_time);
  const eRaw = timeToMinutes(s.end_time);
  const em = eRaw > sm ? eRaw : 1440;
  return (em - sm) / 60;
};

const fmtHours = (h) => {
  if (h <= 0) return '—';
  return Math.round(h * 10) / 10 + 'h';
};

const fmtRangeShort = (start, end) => {
  // "May 5 – 11" or "May 26 – Jun 1" if the week crosses a month boundary.
  if (start.getMonth() === end.getMonth()) {
    return `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${end.getDate()}`;
  }
  return `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${MONTH_SHORT[end.getMonth()]} ${end.getDate()}`;
};

const WeekView = ({ weekStart, employees, departments, schedules, loading }) => {
  const [deptFilter, setDeptFilter] = useState('all');

  // Build the 4-week window anchored on the cursor's week (Monday).
  const weeks = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const start = new Date(weekStart);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { start, end, startStr: fmtDate(start), endStr: fmtDate(end) };
    });
  }, [weekStart]);

  // Per-employee, per-week total hours. Pre-index for O(1) cell lookup.
  // Weeks are keyed by their Monday date so we can map a schedule row to
  // its containing week.
  const hoursByEmpWeek = useMemo(() => {
    const m = {};
    schedules.forEach(s => {
      // Find which of the 4 weeks this schedule belongs to.
      const w = weeks.findIndex(({ startStr, endStr }) => s.scheduled_date >= startStr && s.scheduled_date <= endStr);
      if (w === -1) return;
      const key = s.user_id;
      if (!m[key]) m[key] = [0, 0, 0, 0];
      m[key][w] += shiftHours(s);
    });
    return m;
  }, [schedules, weeks]);

  // Department-grouped employees, filtered by chip.
  const deptGroups = useMemo(() => {
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

  if (loading) return <div className="sched-loading">Loading schedule…</div>;

  return (
    <div className="week-view">
      {/* Same chassis pattern as Day — chips only (no mode toggle since
          Week has a single, focused purpose now). */}
      <div className="day-controls">
        <div className="day-filter-chips">
          <button
            type="button"
            className={`day-chip ${deptFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setDeptFilter('all')}
          >All</button>
          {departments.map(d => (
            <button
              key={d.department_id}
              type="button"
              className={`day-chip ${deptFilter === d.department_id ? 'is-active' : ''}`}
              onClick={() => setDeptFilter(d.department_id)}
            >{d.name}</button>
          ))}
        </div>
      </div>

      <div className="week-summary-wrap">
        <table className="week-summary">
          <thead>
            <tr>
              <th className="week-summary-name-col">Staff</th>
              {weeks.map((w, i) => {
                const isCurrentWeek = todayStr() >= w.startStr && todayStr() <= w.endStr;
                return (
                  <th key={i} className={`week-summary-week-col ${isCurrentWeek ? 'is-current' : ''}`}>
                    <div className="week-summary-week-num">Week {i + 1}</div>
                    <div className="week-summary-week-range">{fmtRangeShort(w.start, w.end)}</div>
                  </th>
                );
              })}
              <th className="week-summary-total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            {deptGroups.map(dept => (
              <React.Fragment key={dept.department_id}>
                <tr className="week-summary-dept-row">
                  <td colSpan={weeks.length + 2}>{dept.name}</td>
                </tr>
                {dept.staff.map(emp => {
                  const cells = hoursByEmpWeek[emp.user_id] || [0, 0, 0, 0];
                  const total = cells.reduce((a, b) => a + b, 0);
                  return (
                    <tr key={emp.user_id} className="week-summary-row">
                      <td className="week-summary-name-cell">
                        <span className="week-summary-initial">{(emp.name || '?').charAt(0).toUpperCase()}</span>
                        <span className="week-summary-name">{emp.name}</span>
                      </td>
                      {cells.map((h, i) => (
                        <td
                          key={i}
                          className={`week-summary-cell ${h > OT_THRESHOLD ? 'is-over-ot' : ''} ${h === 0 ? 'is-zero' : ''}`}
                        >
                          {fmtHours(h)}
                        </td>
                      ))}
                      <td className={`week-summary-cell week-summary-total-cell ${total > OT_THRESHOLD * 4 ? 'is-over-ot' : ''}`}>
                        {fmtHours(total)}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {deptGroups.length === 0 && (
          <div className="week-summary-empty">No staff in this filter.</div>
        )}
      </div>
    </div>
  );
};

export default WeekView;
