import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, useAuth } from '../../auth';
import CalendarWeekView from '../../components/Calendar/views/CalendarWeekView';
import NotesDrawer from '../../components/Calendar/atoms/NotesDrawer';
import NotesCenter from '../../components/Calendar/atoms/NotesCenter';
import DayToggle from '../../components/Calendar/atoms/DayToggle';
import '../../components/Calendar/Calendar.css';
import './StaffCalendar.css';

// Sprint 10.1: authed staff Calendar replaces the legacy kiosk
// ShiftsView at /calendar. Staff see a week-grid view (matrix-per-
// staff per mockup #12) by default; clicking a day or column header
// drills into Day view with the handoffs drawer.
//
// Editable scope on the drawer:
//   - Staff CAN compose handoff notes (scope: 'department' or 'all')
//     because the user wants staff to "view + put in shift notes."
//   - Staff CANNOT add / edit / delete shifts — that's admin-only.
//
// Year and Month views are deferred to a later sprint; for 10.1 the
// staff Calendar has Week (default) and Day. Toggle in the header.

const VIEW_MODES = [
  { key: 'week', label: 'Week' },
  { key: 'day',  label: 'Day'  },
];

const isoDay = (d) => {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const startOfWeek = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  // Sunday-anchored to match the admin Calendar and matches the
  // pay_period_start_day default. Per-tenant override comes later.
  date.setDate(date.getDate() - day);
  return date;
};

const fmtWeekLabel = (ws) => {
  const we = new Date(ws);
  we.setDate(ws.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${ws.toLocaleDateString([], opts)} – ${we.toLocaleDateString([], opts)}, ${we.getFullYear()}`;
};

const StaffCalendar = () => {
  const { user } = useAuth();

  const [view,   setView]   = useState('week');
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });

  const [schedules,   setSchedules]   = useState([]);
  const [employees,   setEmployees]   = useState([]);
  const [departments, setDepartments] = useState([]);

  // Sprint 11: Day-view notes tab + drawer ref + Today/Tomorrow
  // toggle helpers. Mirrors the admin Calendar's Day view shell.
  const [notesTab, setNotesTab] = useState('all');
  const notesDrawerRef = useRef(null);

  const todayMidnight    = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const tomorrowMidnight = useMemo(() => { const d = new Date(todayMidnight); d.setDate(d.getDate() + 1); return d; }, [todayMidnight]);
  const dayToggleSide    = isoDay(cursor) === isoDay(tomorrowMidnight) ? 'tomorrow' : 'today';
  const setDayToggleSide = (side) => {
    setCursor(side === 'tomorrow' ? new Date(tomorrowMidnight) : new Date(todayMidnight));
  };
  const handleNotesTile = (tabKey) => {
    setNotesTab(tabKey);
    if (notesDrawerRef.current) {
      notesDrawerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const [loading,     setLoading]     = useState(true);

  const weekStart = useMemo(() => startOfWeek(cursor), [cursor]);

  // Fetch range derived from current view.
  const fetchRange = useMemo(() => {
    if (view === 'week') {
      const ws = weekStart;
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      return { from: isoDay(ws), to: isoDay(we) };
    }
    // day
    const d = cursor;
    return { from: isoDay(d), to: isoDay(d) };
  }, [view, weekStart, cursor]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      from: fetchRange.from,
      to:   fetchRange.to,
    });
    if (user?.user_id) params.set('userId', user.user_id);
    const [schedResp, empResp, deptResp] = await Promise.all([
      apiFetch(`/shifts/range?${params.toString()}`),
      // Sprint 10.1 caveat: reusing the admin endpoints because they
      // happen to be unauthed today. A proper staff-scoped variant
      // would be cleaner; tracked in the iteration log.
      fetch('/api/admin/employees').then(r => r.json()).catch(() => ({ success: false })),
      fetch('/api/admin/departments').then(r => r.json()).catch(() => ({ success: false })),
    ]);
    if (schedResp.data?.success) setSchedules(schedResp.data.schedules || []);
    if (empResp?.success)        setEmployees(empResp.employees || []);
    if (deptResp?.success)       setDepartments(deptResp.departments || []);
    setLoading(false);
  }, [fetchRange.from, fetchRange.to, user?.user_id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── nav handlers ─────────────────────────────────────────────────────────
  const handlePrev = () => {
    const d = new Date(cursor);
    if (view === 'week') d.setDate(d.getDate() - 7);
    else                 d.setDate(d.getDate() - 1);
    setCursor(d);
  };
  const handleNext = () => {
    const d = new Date(cursor);
    if (view === 'week') d.setDate(d.getDate() + 7);
    else                 d.setDate(d.getDate() + 1);
    setCursor(d);
  };
  const handleToday = () => {
    const d = new Date(); d.setHours(0,0,0,0); setCursor(d);
  };

  const headerLabel = view === 'week'
    ? fmtWeekLabel(weekStart)
    : cursor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="staff-cal-page">
      <header className="staff-cal-header">
        <div className="staff-cal-header-left">
          <h1 className="staff-cal-title">Calendar</h1>
          <div className="staff-cal-nav">
            <button type="button" className="staff-cal-nav-btn" onClick={handlePrev} aria-label="Previous">‹</button>
            <button type="button" className="staff-cal-today" onClick={handleToday}>Today</button>
            <button type="button" className="staff-cal-nav-btn" onClick={handleNext} aria-label="Next">›</button>
          </div>
          <span className="staff-cal-range">{headerLabel}</span>
        </div>
        <div className="staff-cal-view-toggle">
          {VIEW_MODES.map(v => (
            <button
              key={v.key}
              type="button"
              className={`staff-cal-view-btn ${view === v.key ? 'is-active' : ''}`}
              onClick={() => setView(v.key)}
            >{v.label}</button>
          ))}
        </div>
      </header>

      <div className="staff-cal-body">
        {view === 'week' && (
          // Sprint 11: switched from the matrix-only StaffWeekView
          // to CalendarWeekView (pills + perm tabs + stats + matrix
          // + notes feed) per mockup #26.
          <CalendarWeekView
            weekStart={weekStart}
            schedules={schedules}
            employees={employees}
            departments={departments}
            currentUser={user}
            staffScope={true}
            staffDepartmentId={user?.department_id || null}
            onPickDate={(d) => { setCursor(new Date(d)); setView('day'); }}
          />
        )}

        {view === 'day' && (
          <>
            {/* Sprint 11: staff Day view mirrors admin per mockup #25,
                with two role-scoping differences:
                  - NotesCenter / NotesDrawer pass staffScope=true so
                    only own-dept + all-staff notes appear.
                  - DepartmentChips inside the drawer are hidden
                    (single dept context). */}
            <DayToggle
              today={todayMidnight}
              tomorrow={tomorrowMidnight}
              value={dayToggleSide}
              onChange={setDayToggleSide}
            />
            <NotesCenter
              forDate={isoDay(cursor)}
              onTileClick={handleNotesTile}
              viewAllHref={`/calendar/notes?date=${isoDay(cursor)}`}
              staffScope={true}
              staffDepartmentId={user?.department_id || null}
              currentUser={user}
            />

            <div className="staff-cal-day-list">
              {loading && <div className="staff-cal-empty">Loading…</div>}
              {!loading && schedules.length === 0 && (
                <div className="staff-cal-empty">No shifts scheduled for this day.</div>
              )}
              {!loading && schedules.length > 0 && (
                <ul className="staff-cal-day-shifts">
                  {schedules.map(s => (
                    <li
                      key={s.schedule_id}
                      className={`staff-cal-day-shift ${s.user_id === user?.user_id ? 'is-me' : ''}`}
                    >
                      <span className="staff-cal-day-shift-time">
                        {s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}
                      </span>
                      <span className="staff-cal-day-shift-name">
                        {s.employee_name}
                        {s.user_id === user?.user_id && ' (you)'}
                      </span>
                      <span className="staff-cal-day-shift-dept">
                        {s.department_name || 'Unassigned'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div ref={notesDrawerRef}>
              <NotesDrawer
                forDate={isoDay(cursor)}
                departments={departments}
                editable={true}
                currentUser={user}
                tab={notesTab}
                onTabChange={setNotesTab}
                staffScope={true}
                staffDepartmentId={user?.department_id || null}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StaffCalendar;
