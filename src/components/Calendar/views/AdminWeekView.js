import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../auth';
import DepartmentChips from '../atoms/DepartmentChips';

// Sprint 10.1: matrix-per-department week view for admin Calendar.
// Inspired by mockup #13.
//
// Rows: departments. Cols: 7 days starting from `weekStart`. Each
// cell shows the dept's scheduled staff for that day and a 💬 N
// badge when handoff notes touch the cell. Clicking a cell zooms
// into Day view for that date via the `onPickDate` callback.
//
// Note counts are fetched from /api/handoff-notes/counts (10.1
// endpoint) — one round-trip for the whole week. Without a
// department filter the count is the *global* per-day total
// (broadcast notes appear in every dept's column). With a dept
// chosen, counts are scoped to that dept + all-scope notes only.
//
// Props:
//   weekStart    — Date, first day shown (Sunday-anchored per the
//                  rest of the app)
//   schedules    — [] of schedule rows (server shape from
//                  /api/admin/schedule) containing user_id,
//                  department_id, department_name, start_time,
//                  end_time, scheduled_date
//   employees    — [] of users; we cross-reference for staff counts
//   departments  — [] of { department_id, name }
//   onPickDate   — (Date) => void, zooms to Day view

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isoDay = (d) => {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const fmtTimeShort = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'p' : 'a';
  const hour   = h % 12 || 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, '0')}${period}`;
};

const AdminWeekView = ({
  weekStart,
  schedules = [],
  employees = [],
  departments = [],
  onPickDate,
}) => {
  const [deptFilter, setDeptFilter] = useState(null);
  const [noteCounts, setNoteCounts] = useState({});

  // ── days array ────────────────────────────────────────────────────────────
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const fromIso = isoDay(days[0]);
  const toIso   = isoDay(days[6]);

  // ── fetch note counts for the week ────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams({ from: fromIso, to: toIso });
    if (deptFilter != null) params.set('department_id', String(deptFilter));
    apiFetch(`/handoff-notes/counts?${params.toString()}`).then(({ data }) => {
      if (data?.success) setNoteCounts(data.counts || {});
    });
  }, [fromIso, toIso, deptFilter]);

  // ── group schedules by (department_id, dateIso) for fast cell lookup ──────
  const byDeptDay = useMemo(() => {
    const m = new Map();
    schedules.forEach(s => {
      const iso = s.scheduled_date
        ? s.scheduled_date.split('T')[0]
        : null;
      if (!iso) return;
      const key = `${s.department_id || 0}|${iso}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(s);
    });
    return m;
  }, [schedules]);

  // Departments shown (respecting the chip filter)
  const visibleDepts = deptFilter == null
    ? departments
    : departments.filter(d => d.department_id === deptFilter);

  // Staff capacity per department (active staff count) — drives the
  // "n / capacity" label on the cells.
  const deptCapacity = useMemo(() => {
    const m = new Map();
    departments.forEach(d => m.set(d.department_id, 0));
    employees.forEach(e => {
      if (e.active === false) return;
      if (e.department_id != null) {
        m.set(e.department_id, (m.get(e.department_id) || 0) + 1);
      }
    });
    return m;
  }, [departments, employees]);

  // Total schedules + handoffs across the week (header stats)
  const totalShifts = schedules.length;
  const totalHandoffs = Object.values(noteCounts)
    .reduce((sum, v) => sum + (v.total || 0), 0);

  return (
    <div className="admin-week-view">
      <div className="admin-week-stats">
        <div className="admin-week-stat">
          <span className="admin-week-stat-num">{totalShifts}</span>
          <span className="admin-week-stat-label">Shifts</span>
        </div>
        <div className="admin-week-stat">
          <span className="admin-week-stat-num">{totalHandoffs}</span>
          <span className="admin-week-stat-label">Handoff notes</span>
        </div>
      </div>

      <DepartmentChips
        departments={departments}
        value={deptFilter}
        onChange={setDeptFilter}
        className="admin-week-dept-chips"
      />

      <div className="admin-week-grid" role="grid">
        {/* Day header row */}
        <div className="admin-week-row admin-week-row-header" role="row">
          <div className="admin-week-cell admin-week-cell-corner" role="columnheader" />
          {days.map(d => {
            const iso = isoDay(d);
            const isToday = iso === isoDay(new Date());
            return (
              <button
                key={iso}
                type="button"
                role="columnheader"
                className={`admin-week-cell admin-week-cell-day ${isToday ? 'is-today' : ''}`}
                onClick={() => onPickDate && onPickDate(d)}
              >
                <span className="admin-week-cell-day-name">{DAY_NAMES[d.getDay()]}</span>
                <span className="admin-week-cell-day-num">{d.getDate()}</span>
              </button>
            );
          })}
        </div>

        {/* Department rows */}
        {visibleDepts.map(dept => (
          <div key={dept.department_id} className="admin-week-row" role="row">
            <div className="admin-week-cell admin-week-cell-dept" role="rowheader">
              <div className="admin-week-cell-dept-name">{dept.name}</div>
              <div className="admin-week-cell-dept-cap">
                {deptCapacity.get(dept.department_id) || 0} staff
              </div>
            </div>
            {days.map(d => {
              const iso = isoDay(d);
              const cellSchedules = byDeptDay.get(`${dept.department_id}|${iso}`) || [];
              const noteCount = noteCounts[iso]?.total || 0;
              return (
                <button
                  key={iso}
                  type="button"
                  role="gridcell"
                  className="admin-week-cell admin-week-cell-data"
                  onClick={() => onPickDate && onPickDate(d)}
                >
                  {cellSchedules.length > 0 ? (
                    <div className="admin-week-cell-bands">
                      {/* Show up to 3 bands; rest aggregated */}
                      {cellSchedules.slice(0, 3).map((s, i) => (
                        <div key={s.schedule_id || i} className="admin-week-cell-band">
                          {fmtTimeShort(s.start_time)}–{fmtTimeShort(s.end_time)}
                        </div>
                      ))}
                      {cellSchedules.length > 3 && (
                        <div className="admin-week-cell-band admin-week-cell-band-more">
                          +{cellSchedules.length - 3}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="admin-week-cell-empty">—</div>
                  )}
                  <div className="admin-week-cell-meta">
                    <span className="admin-week-cell-staff">
                      {cellSchedules.length} / {deptCapacity.get(dept.department_id) || 0}
                    </span>
                    {noteCount > 0 && (
                      <span className="admin-week-cell-note-badge">💬 {noteCount}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminWeekView;
