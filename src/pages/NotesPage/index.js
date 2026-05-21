import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import NotesDrawer from '../../components/Calendar/atoms/NotesDrawer';
import '../../components/Calendar/Calendar.css';
import './NotesPage.css';

// Sprint 11: full-screen "View all notes" page reached from the
// NotesCenter's "View all notes →" link on Day view, and from the
// "View all notes →" link at the bottom of the CalendarWeekView
// notes feed.
//
// Renders the NotesDrawer in `variant='page'` mode — no close
// button, no surrounding card chrome; takes the whole content area.
// All 4 tabs (All / Assigned / General / Cross-day) work. Compose
// footer is present so admins/staff can post directly from here.
//
// Route is shared:
//   /admin/calendar/notes  — admin context (full visibility)
//   /calendar/notes        — staff context (own dept + all-staff)
// Both render this same component; we read the current pathname to
// know which one we're on and apply scoping accordingly.
//
// The `?date=YYYY-MM-DD` query param sets the page's date; defaults
// to today.

const isoDay = (d) => {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

const NotesPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isStaffRoute = location.pathname.startsWith('/calendar/notes');
  const backHref = isStaffRoute ? '/calendar' : '/admin/calendar';

  // Read ?date= from the URL, default to today.
  const params = new URLSearchParams(location.search);
  const initialDate = params.get('date') || isoDay(new Date());
  const [forDate, setForDate] = useState(initialDate);

  const [departments, setDepartments] = useState([]);
  useEffect(() => {
    fetch('/api/admin/departments')
      .then(r => r.json())
      .then(d => { if (d?.success) setDepartments(d.departments || []); })
      .catch(() => {});
  }, []);

  const staffScope = isStaffRoute;
  const staffDepartmentId = isStaffRoute ? (user?.department_id || null) : null;

  // Sync ?date= back to the URL on date changes so refresh + share
  // links land on the same date.
  useEffect(() => {
    const next = new URLSearchParams(location.search);
    next.set('date', forDate);
    navigate({ pathname: location.pathname, search: `?${next.toString()}` }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forDate]);

  return (
    <div className="notes-page">
      <header className="notes-page-header">
        <Link to={backHref} className="notes-page-back">
          <span aria-hidden>‹</span> Back to Calendar
        </Link>
        <div className="notes-page-date-nav">
          <button
            type="button"
            className="notes-page-nav-btn"
            onClick={() => setForDate(addDays(forDate, -1))}
            aria-label="Previous day"
          >‹</button>
          <input
            type="date"
            className="notes-page-date-input"
            value={forDate}
            onChange={e => setForDate(e.target.value)}
          />
          <button
            type="button"
            className="notes-page-nav-btn"
            onClick={() => setForDate(addDays(forDate, 1))}
            aria-label="Next day"
          >›</button>
          <button
            type="button"
            className="notes-page-today"
            onClick={() => setForDate(isoDay(new Date()))}
          >Today</button>
        </div>
      </header>

      <div className="notes-page-body">
        <NotesDrawer
          forDate={forDate}
          departments={departments}
          editable={true}
          currentUser={user}
          variant="page"
          staffScope={staffScope}
          staffDepartmentId={staffDepartmentId}
        />
      </div>
    </div>
  );
};

export default NotesPage;
