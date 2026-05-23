import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth';
import { useView } from '../../shells/ViewContext';
import NotesDrawer from '../../components/Calendar/atoms/NotesDrawer';
import '../../components/Calendar/Calendar.css';
import './NotesPage.css';

// Sprint 11: full-screen "View all notes" view, reached from the
// NotesCenter's "View all notes →" tile on Day view, and from the
// "View all notes →" link at the bottom of the CalendarWeekView
// notes feed.
//
// Sprint 11.2.1: NotesPage is now a view-state target inside the
// Staff/Admin shell — no URL routing. Props:
//   role  — 'staff' | 'admin' (set by the parent shell). Drives
//           the staff-scope filter on the underlying NotesDrawer.
//   date  — 'YYYY-MM-DD' that opened the page (defaults to today
//           if missing). The shell's view params carry this; the
//           page also lets the user navigate days locally.
// Back navigation flips the shell view back to 'calendar'.

const isoDay = (d) => {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

const NotesPage = ({ role = 'staff', date }) => {
  const { user } = useAuth();
  const { goTo } = useView();

  const isStaffRoute = role !== 'admin';
  const [forDate, setForDate] = useState(date || isoDay(new Date()));

  const [departments, setDepartments] = useState([]);
  useEffect(() => {
    fetch('/api/admin/departments')
      .then(r => r.json())
      .then(d => { if (d?.success) setDepartments(d.departments || []); })
      .catch(() => {});
  }, []);

  const staffScope = isStaffRoute;
  const staffDepartmentId = isStaffRoute ? (user?.department_id || null) : null;

  return (
    <div className="notes-page">
      <header className="notes-page-header">
        <button type="button" onClick={() => goTo('calendar')} className="notes-page-back">
          <span aria-hidden>‹</span> Back to Calendar
        </button>
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
