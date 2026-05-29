import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../auth';

// Sprint 11: combined Week view per mockup #26 — used by both staff
// (`/calendar`) and admin (`/admin/calendar`) Calendar surfaces.
// Layout (top to bottom):
//   1. 7-day pill row (Mon..Sun) — click to drill into Day view
//   2. Permission tabs:
//        - Staff: "{Dept name}" / "All Staff Updates"
//        - Admin: "All staff" / "By department" (or just the dept chips)
//      For 11 minimal: render the same shape; tabs only meaningful for staff
//   3. Permission notice (staff only, when on Dept tab)
//   4. Three stat cards: My Shifts / Department Notes / All-Staff Notes
//      (for admin: Total Shifts / Open Shifts / Handoff Notes)
//   5. Team matrix: rows = staff (scoped), cols = 7 days
//   6. Department & All-Staff Notes section: Department / All Staff
//      toggle + note rows + "View all notes →"
//
// Props:
//   weekStart         — Date (Sunday or Monday anchored; caller decides)
//   schedules         — [] schedule rows from /api/shifts/range
//   employees         — [] user rows
//   departments       — [{ department_id, name, color }]
//   currentUser       — { user_id, role, department_id }
//   staffScope        — true = scope to staff's own dept by default
//   staffDepartmentId — staff's department_id (when staffScope)
//   onPickDate        — (Date) => void, click a day cell or pill
//   onViewAllNotes    — () => void; opens the full-screen notes page
//                       (Sprint 11.2.1: replaces a hard-coded URL link)

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

const fmtTimeFull = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const CalendarWeekView = ({
  weekStart,
  schedules = [],
  employees = [],
  departments = [],
  currentUser = null,
  staffScope = false,
  staffDepartmentId = null,
  onPickDate,
  onViewAllNotes,
}) => {
  // 'dept' (staff sees only own dept) | 'all' (staff sees all-staff
  // broadcasts only; admin defaults to this — "all staff" view)
  const [activeTab, setActiveTab] = useState(staffScope ? 'dept' : 'all');
  // Notes-feed sub-toggle: which subset to show at the bottom
  const [notesFilter, setNotesFilter] = useState('dept'); // 'dept' | 'all'
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }),
    [weekStart]
  );
  const fromIso = isoDay(days[0]);
  const toIso   = isoDay(days[6]);

  // Sprint 12.1: notes UI is gated on the parent supplying an
  // onViewAllNotes callback. Admin Calendar no longer passes it
  // (handoff notes moved to the Logbook surface), staff Calendar
  // still does. Skip the fetch entirely when notes are off so we
  // don't poll an endpoint whose data we'll never render.
  const showNotes = typeof onViewAllNotes === 'function';

  // Fetch notes for the week. We pull them all once for the feed +
  // for the count badges on stat cards.
  useEffect(() => {
    if (!showNotes) return;
    let cancelled = false;
    setNotesLoading(true);
    const params = new URLSearchParams({ from: fromIso, to: toIso });
    apiFetch(`/handoff-notes?${params.toString()}`).then(({ data }) => {
      if (cancelled) return;
      if (data?.success) setNotes(data.notes || []);
      setNotesLoading(false);
    });
    return () => { cancelled = true; };
  }, [showNotes, fromIso, toIso]);

  // ── staff matrix scope ──────────────────────────────────────────────────
  const staffDept = departments.find(d => d.department_id === staffDepartmentId);
  const visibleStaff = useMemo(() => {
    return employees
      .filter(e => e.active !== false)
      .filter(e => {
        if (!staffScope) return true;
        if (activeTab === 'all') return false; // "All Staff Updates" hides matrix
        return e.department_id === staffDepartmentId;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [employees, staffScope, staffDepartmentId, activeTab]);

  const byStaffDay = useMemo(() => {
    const m = new Map();
    schedules.forEach(s => {
      const iso = s.scheduled_date ? s.scheduled_date.split('T')[0] : null;
      if (!iso) return;
      const key = `${s.user_id}|${iso}`;
      if (!m.has(key)) m.set(key, s);
    });
    return m;
  }, [schedules]);

  // ── stats ───────────────────────────────────────────────────────────────
  const myShifts = useMemo(() =>
    schedules.filter(s => s.user_id === currentUser?.user_id).length,
    [schedules, currentUser]
  );
  const deptNotes = useMemo(() =>
    notes.filter(n =>
      !n.resolved_at &&
      n.scope === 'department' &&
      (staffScope ? n.department_id === staffDepartmentId : true)
    ).length,
    [notes, staffScope, staffDepartmentId]
  );
  const allStaffNotes = useMemo(() =>
    notes.filter(n => !n.resolved_at && n.scope === 'all').length,
    [notes]
  );
  const totalShifts = schedules.length;
  // Open shifts isn't surfaced in the schedules payload today; placeholder 0.
  // A future endpoint can return per-shift-template unassigned slots.
  const openShifts = 0;

  // ── notes feed (bottom of week view) ────────────────────────────────────
  const feedNotes = useMemo(() => {
    return notes
      .filter(n => !n.resolved_at)
      .filter(n => {
        if (notesFilter === 'all') return n.scope === 'all';
        // 'dept' filter:
        if (staffScope) {
          return (n.scope === 'department' && n.department_id === staffDepartmentId) ||
                 n.scope === 'all';
        }
        return n.scope === 'department' || n.scope === 'all';
      })
      .sort((a, b) => {
        // Pinned first, then newest.
        if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1;
        return b.created_at.localeCompare(a.created_at);
      })
      .slice(0, 5); // Cap the feed; "View all notes →" expands.
  }, [notes, notesFilter, staffScope, staffDepartmentId]);

  return (
    <div className="cal-week">
      {/* ── 7-day pill row ─────────────────────────────────────────────── */}
      <div className="cal-week-day-pills">
        {days.map(d => {
          const iso = isoDay(d);
          const isToday = iso === isoDay(new Date());
          const todayShifts = schedules.filter(s =>
            s.scheduled_date && s.scheduled_date.split('T')[0] === iso
          ).length;
          return (
            <button
              key={iso}
              type="button"
              className={`cal-week-day-pill ${isToday ? 'is-today' : ''}`}
              onClick={() => onPickDate && onPickDate(d)}
            >
              <span className="cal-week-day-pill-name">{DAY_NAMES[d.getDay()]}</span>
              <span className="cal-week-day-pill-num">{d.getDate()}</span>
              {todayShifts > 0 && (
                <span className="cal-week-day-pill-count">{todayShifts}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Permission tabs (staff) ───────────────────────────────────── */}
      {staffScope && (
        <div className="cal-week-perm-tabs">
          <button
            type="button"
            className={`cal-week-perm-tab ${activeTab === 'dept' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('dept')}
          >
            <span className="cal-week-perm-tab-icon" aria-hidden>👥</span>
            {staffDept?.name || 'My Department'}
          </button>
          <button
            type="button"
            className={`cal-week-perm-tab ${activeTab === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <span className="cal-week-perm-tab-icon" aria-hidden>🌐</span>
            All Staff Updates
          </button>
          {activeTab === 'dept' && (
            <div className="cal-week-perm-notice">
              <span className="cal-week-perm-notice-icon" aria-hidden>🔒</span>
              You can view your department only plus all-staff general notes.
            </div>
          )}
        </div>
      )}

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="cal-week-stats">
        {staffScope ? (
          <>
            <div className="cal-week-stat">
              <span className="cal-week-stat-icon cal-week-stat-icon-shifts" aria-hidden>📋</span>
              <div className="cal-week-stat-text">
                <div className="cal-week-stat-num">{myShifts}</div>
                <div className="cal-week-stat-label">My Shifts</div>
              </div>
            </div>
            <div className="cal-week-stat">
              <span className="cal-week-stat-icon cal-week-stat-icon-dept" aria-hidden>💬</span>
              <div className="cal-week-stat-text">
                <div className="cal-week-stat-num">{deptNotes}</div>
                <div className="cal-week-stat-label">Department Notes</div>
                <div className="cal-week-stat-meta">{staffDept?.name || ''}</div>
              </div>
            </div>
            <div className="cal-week-stat">
              <span className="cal-week-stat-icon cal-week-stat-icon-all" aria-hidden>👥</span>
              <div className="cal-week-stat-text">
                <div className="cal-week-stat-num">{allStaffNotes}</div>
                <div className="cal-week-stat-label">All-Staff Notes</div>
                <div className="cal-week-stat-meta">All Departments</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="cal-week-stat">
              <span className="cal-week-stat-icon cal-week-stat-icon-shifts" aria-hidden>📋</span>
              <div className="cal-week-stat-text">
                <div className="cal-week-stat-num">{totalShifts}</div>
                <div className="cal-week-stat-label">Total Shifts</div>
              </div>
            </div>
            <div className="cal-week-stat">
              <span className="cal-week-stat-icon cal-week-stat-icon-dept" aria-hidden>🟰</span>
              <div className="cal-week-stat-text">
                <div className="cal-week-stat-num">{openShifts}</div>
                <div className="cal-week-stat-label">Open Shifts</div>
              </div>
            </div>
            {/* Sprint 12.1: Handoff Notes tile only renders when the
                parent surface owns the notes feed (staff Calendar);
                admin Calendar hides it since notes moved to Logbook. */}
            {showNotes && (
              <div className="cal-week-stat">
                <span className="cal-week-stat-icon cal-week-stat-icon-all" aria-hidden>💬</span>
                <div className="cal-week-stat-text">
                  <div className="cal-week-stat-num">{deptNotes + allStaffNotes}</div>
                  <div className="cal-week-stat-label">Handoff Notes</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Sprint 13.1: admin dept × day grid ──────────────────────────
          Replaces the staff-row matrix for admin (staffScope=false).
          Rows = departments, columns = the 7 days. Each cell stacks
          one mini-card per shift in that dept on that day. Click
          drills into Day view via onPickDate. */}
      {!staffScope && (
        <div className="cal-week-deptgrid-wrap">
          <header className="cal-week-deptgrid-header">
            <span className="cal-week-deptgrid-icon" aria-hidden>📅</span>
            <h3 className="cal-week-deptgrid-title">Departments × Days</h3>
          </header>
          <div className="cal-week-deptgrid" role="grid">
            <div className="cal-week-deptgrid-row cal-week-deptgrid-row-head" role="row">
              <div className="cal-week-deptgrid-cell cal-week-deptgrid-cell-corner">Department</div>
              {days.map(d => (
                <div key={isoDay(d)} className="cal-week-deptgrid-cell cal-week-deptgrid-cell-day">
                  <span className="cal-week-deptgrid-day-name">{DAY_NAMES[d.getDay()]}</span>
                  <span className="cal-week-deptgrid-day-num">{d.getDate()}</span>
                </div>
              ))}
            </div>
            {departments.map(dept => {
              const deptShifts = schedules.filter(s => s.department_id === dept.department_id);
              if (deptShifts.length === 0) return null;
              return (
                <div key={dept.department_id} className="cal-week-deptgrid-row" role="row">
                  <div className="cal-week-deptgrid-cell cal-week-deptgrid-cell-dept">
                    <span
                      className="cal-week-deptgrid-dot"
                      style={{ background: dept.color || '#a0aec0' }}
                      aria-hidden
                    />
                    <span className="cal-week-deptgrid-dept-name">{dept.name}</span>
                    <span className="cal-week-deptgrid-dept-count">
                      {deptShifts.length} {deptShifts.length === 1 ? 'shift' : 'shifts'}
                    </span>
                  </div>
                  {days.map(d => {
                    const iso = isoDay(d);
                    const dayShifts = deptShifts
                      .filter(s => (s.scheduled_date || '').split('T')[0] === iso)
                      .sort((a, b) => a.start_time.localeCompare(b.start_time));
                    return (
                      <button
                        key={iso}
                        type="button"
                        className={`cal-week-deptgrid-cell cal-week-deptgrid-cell-data ${dayShifts.length === 0 ? 'is-empty' : ''}`}
                        onClick={() => onPickDate && onPickDate(d, dept.department_id)}
                      >
                        {dayShifts.length === 0 ? (
                          <span className="cal-week-deptgrid-empty">—</span>
                        ) : (
                          <ul className="cal-week-deptgrid-mini-list">
                            {dayShifts.slice(0, 3).map(s => (
                              <li key={s.schedule_id} className={`cal-week-deptgrid-mini${s.is_in_progress ? ' is-in-progress' : ''}`}>
                                <span className="cal-week-deptgrid-mini-time">
                                  {fmtTimeShort(s.start_time)}–{s.is_in_progress ? 'now' : fmtTimeShort(s.end_time)}
                                </span>
                                <span className="cal-week-deptgrid-mini-name">
                                  {s.employee_name}
                                </span>
                              </li>
                            ))}
                            {dayShifts.length > 3 && (
                              <li className="cal-week-deptgrid-mini-more">
                                +{dayShifts.length - 3} more
                              </li>
                            )}
                          </ul>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Team matrix (staff only — admin uses the dept grid above) ── */}
      {staffScope && (!staffScope || activeTab === 'dept') && visibleStaff.length > 0 && (
        <div className="cal-week-matrix-wrap">
          <header className="cal-week-matrix-header">
            <span className="cal-week-matrix-icon" aria-hidden>👥</span>
            <h3 className="cal-week-matrix-title">
              {staffScope ? `${staffDept?.name || 'My Department'} Team` : 'Staff'}
            </h3>
          </header>
          <div className="cal-week-matrix" role="grid">
            <div className="cal-week-matrix-row cal-week-matrix-row-head" role="row">
              <div className="cal-week-matrix-cell cal-week-matrix-cell-corner" />
              {days.map(d => (
                <div key={isoDay(d)} className="cal-week-matrix-cell cal-week-matrix-cell-day">
                  <span className="cal-week-matrix-day-name">{DAY_NAMES[d.getDay()]} {d.getDate()}</span>
                </div>
              ))}
            </div>
            {visibleStaff.map(emp => {
              const isMe = currentUser?.user_id === emp.user_id;
              return (
                <div key={emp.user_id} className={`cal-week-matrix-row ${isMe ? 'is-me' : ''}`} role="row">
                  <div className="cal-week-matrix-cell cal-week-matrix-cell-staff">
                    <div className="cal-week-matrix-staff-initial">
                      {(emp.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="cal-week-matrix-staff-name">
                      {emp.name}
                      {isMe && <span className="cal-week-matrix-staff-you">You</span>}
                    </div>
                  </div>
                  {days.map(d => {
                    const iso = isoDay(d);
                    const s = byStaffDay.get(`${emp.user_id}|${iso}`);
                    // Sprint 12.1: only count shift-scoped notes when
                    // the parent owns the notes UI; skip the filter
                    // pass entirely on the admin Calendar.
                    const cellNotes = showNotes ? notes.filter(n =>
                      !n.resolved_at &&
                      n.scope === 'shift' &&
                      n.for_date === iso &&
                      n.schedule_user_name === emp.name
                    ).length : 0;
                    return (
                      <button
                        key={iso}
                        type="button"
                        className={`cal-week-matrix-cell cal-week-matrix-cell-data ${s ? '' : 'is-off'}`}
                        onClick={() => onPickDate && onPickDate(d)}
                      >
                        {s ? (
                          <>
                            <span className="cal-week-matrix-time">
                              {fmtTimeShort(s.start_time)}–{fmtTimeShort(s.end_time)}
                            </span>
                            {cellNotes > 0 && (
                              <span className="cal-week-matrix-note-badge">💬 {cellNotes}</span>
                            )}
                          </>
                        ) : (
                          <span className="cal-week-matrix-off">Off</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Notes feed (Sprint 12.1: only when parent owns notes) ─── */}
      {showNotes && (
      <section className="cal-week-notes">
        <header className="cal-week-notes-header">
          <span className="cal-week-notes-icon" aria-hidden>💬</span>
          <h3 className="cal-week-notes-title">Department &amp; All-Staff Notes</h3>
          <div className="cal-week-notes-toggle">
            <button
              type="button"
              className={`cal-week-notes-toggle-btn ${notesFilter === 'dept' ? 'is-active' : ''}`}
              onClick={() => setNotesFilter('dept')}
            >Department</button>
            <button
              type="button"
              className={`cal-week-notes-toggle-btn ${notesFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setNotesFilter('all')}
            >All Staff</button>
          </div>
        </header>

        {notesLoading ? (
          <div className="cal-week-notes-empty">Loading…</div>
        ) : feedNotes.length === 0 ? (
          <div className="cal-week-notes-empty">No notes in this week.</div>
        ) : (
          <ul className="cal-week-notes-list">
            {feedNotes.map(n => (
              <li key={n.note_id} className="cal-week-notes-item">
                <div className="cal-week-notes-item-head">
                  <span className="cal-week-notes-author">{n.author_name}</span>
                  {n.scope === 'department' && n.department_name && (
                    <span className="cal-week-notes-badge">{n.department_name}</span>
                  )}
                  {n.scope === 'all' && (
                    <span className="cal-week-notes-badge is-all">All Departments</span>
                  )}
                  <span className="cal-week-notes-time">
                    {new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {fmtTimeFull(n.created_at)}
                  </span>
                </div>
                <div className="cal-week-notes-body">{n.body}</div>
              </li>
            ))}
          </ul>
        )}

        <div className="cal-week-notes-foot">
          {onViewAllNotes && (
            <button
              type="button"
              onClick={onViewAllNotes}
              className="cal-week-notes-view-all"
            >
              View all notes <span aria-hidden>›</span>
            </button>
          )}
        </div>
      </section>
      )}
    </div>
  );
};

export default CalendarWeekView;
