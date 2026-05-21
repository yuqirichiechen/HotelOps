import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../auth';
import DepartmentChips from '../atoms/DepartmentChips';

// Sprint 10.1: matrix-per-staff week view for the staff Calendar
// (and as an alternative density mode admin can offer later).
// Inspired by mockup #12.
//
// Rows: staff. Cols: 7 days. Each cell shows the shift time range
// + a 💬 badge if any handoff notes touch that day (global counts;
// matched per-staff scoping in a later sprint). "Off" days render
// faded.
//
// Self-fetches /handoff-notes/counts using the visible week range.
//
// Props:
//   weekStart    — Date (week start)
//   schedules    — [] of schedule rows
//   employees    — [] of users (active only filtered by caller, or
//                  by this component via .active flag)
//   departments  — [] of { department_id, name } for the chip filter
//   currentUserId — string; row for current user highlights when set
//   onPickDate   — (Date) => void; zooms to that day's view

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

const StaffWeekView = ({
  weekStart,
  schedules = [],
  employees = [],
  departments = [],
  currentUserId = null,
  onPickDate,
}) => {
  const [deptFilter, setDeptFilter] = useState(null);
  const [noteCounts, setNoteCounts] = useState({});

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const fromIso = isoDay(days[0]);
  const toIso   = isoDay(days[6]);

  useEffect(() => {
    const params = new URLSearchParams({ from: fromIso, to: toIso });
    if (deptFilter != null) params.set('department_id', String(deptFilter));
    apiFetch(`/handoff-notes/counts?${params.toString()}`).then(({ data }) => {
      if (data?.success) setNoteCounts(data.counts || {});
    });
  }, [fromIso, toIso, deptFilter]);

  // ── group schedules by (user_id, dateIso) for fast cell lookup ────────────
  const byStaffDay = useMemo(() => {
    const m = new Map();
    schedules.forEach(s => {
      const iso = s.scheduled_date ? s.scheduled_date.split('T')[0] : null;
      if (!iso) return;
      const key = `${s.user_id}|${iso}`;
      // If multiple shifts per day, we just keep the first for the
      // cell summary — staff who double-shift can drill into Day
      // view for detail.
      if (!m.has(key)) m.set(key, s);
    });
    return m;
  }, [schedules]);

  // ── filter staff list by dept chip + active flag ──────────────────────────
  const visibleStaff = useMemo(() => {
    return employees
      .filter(e => e.active !== false)
      .filter(e => deptFilter == null ? true : e.department_id === deptFilter)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [employees, deptFilter]);

  // ── stats row ─────────────────────────────────────────────────────────────
  const totalShifts = schedules.length;
  const totalHandoffs = Object.values(noteCounts)
    .reduce((sum, v) => sum + (v.total || 0), 0);

  return (
    <div className="staff-week-view">
      <div className="staff-week-stats">
        <div className="staff-week-stat">
          <span className="staff-week-stat-num">{totalShifts}</span>
          <span className="staff-week-stat-label">Shifts this week</span>
        </div>
        <div className="staff-week-stat">
          <span className="staff-week-stat-num">{totalHandoffs}</span>
          <span className="staff-week-stat-label">Handoff notes</span>
        </div>
      </div>

      <DepartmentChips
        departments={departments}
        value={deptFilter}
        onChange={setDeptFilter}
        className="staff-week-dept-chips"
      />

      <div className="staff-week-grid" role="grid">
        {/* Day header row */}
        <div className="staff-week-row staff-week-row-header" role="row">
          <div className="staff-week-cell staff-week-cell-corner" role="columnheader" />
          {days.map(d => {
            const iso = isoDay(d);
            const isToday = iso === isoDay(new Date());
            const noteCount = noteCounts[iso]?.total || 0;
            return (
              <button
                key={iso}
                type="button"
                role="columnheader"
                className={`staff-week-cell staff-week-cell-day ${isToday ? 'is-today' : ''}`}
                onClick={() => onPickDate && onPickDate(d)}
              >
                <span className="staff-week-cell-day-name">{DAY_NAMES[d.getDay()]}</span>
                <span className="staff-week-cell-day-num">{d.getDate()}</span>
                {noteCount > 0 && (
                  <span className="staff-week-cell-day-badge">💬 {noteCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Staff rows */}
        {visibleStaff.length === 0 ? (
          <div className="staff-week-empty">No staff in this filter.</div>
        ) : visibleStaff.map(emp => {
          const isMe = currentUserId === emp.user_id;
          const dept = departments.find(d => d.department_id === emp.department_id);
          return (
            <div
              key={emp.user_id}
              className={`staff-week-row ${isMe ? 'is-me' : ''}`}
              role="row"
            >
              <div className="staff-week-cell staff-week-cell-staff" role="rowheader">
                <div className="staff-week-cell-staff-initial">
                  {(emp.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="staff-week-cell-staff-meta">
                  <div className="staff-week-cell-staff-name">
                    {emp.name}
                    {isMe && <span className="staff-week-cell-staff-you"> (you)</span>}
                  </div>
                  {dept && (
                    <div className="staff-week-cell-staff-dept">{dept.name}</div>
                  )}
                </div>
              </div>
              {days.map(d => {
                const iso = isoDay(d);
                const s = byStaffDay.get(`${emp.user_id}|${iso}`);
                const cellNoteCount = noteCounts[iso]?.total || 0;
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    className={`staff-week-cell staff-week-cell-data ${s ? '' : 'is-off'}`}
                    onClick={() => onPickDate && onPickDate(d)}
                  >
                    {s ? (
                      <>
                        <span className="staff-week-cell-time">
                          {fmtTimeShort(s.start_time)}–{fmtTimeShort(s.end_time)}
                        </span>
                        {cellNoteCount > 0 && (
                          <span className="staff-week-cell-note-badge">💬 {cellNoteCount}</span>
                        )}
                      </>
                    ) : (
                      <span className="staff-week-cell-off">Off</span>
                    )}
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

export default StaffWeekView;
