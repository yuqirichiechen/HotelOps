import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth';
import { useView } from '../../shells/ViewContext';
import NotesCenter from '../../components/Calendar/atoms/NotesCenter';
import NotesDrawer from '../../components/Calendar/atoms/NotesDrawer';
import '../../components/Calendar/Calendar.css';
import './Logbook.css';

// Sprint 12.1: this surface used to be the "Reports" placeholder;
// it now hosts the Logbook — the new home for handoff notes that
// previously lived inside the admin Calendar's Day view (NotesCenter
// + NotesDrawer combo). The Calendar itself drops those affordances
// in this sprint and focuses on actual clock-in/out data.
//
// The Logbook is intentionally minimal for now — just date-scoped
// NotesCenter + NotesDrawer with prev/next/today day-nav. The
// proper Logbook surface (separate tabs, export, search, etc.)
// lands in a later sprint; the GM asked for the move first so
// notes still work while the next surface is being designed.
//
// File path stays at `pages/AdminReports/` because the AdminShell
// maps view='reports' to this file; renaming the folder would be
// a separate, larger refactor with no visible benefit yet.

const isoDay = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

const AdminReports = () => {
  const { goTo } = useView();
  const { user } = useAuth();

  const [forDate, setForDate]         = useState(() => isoDay(new Date()));
  const [departments, setDepartments] = useState([]);
  const [notesTab, setNotesTab]       = useState('all');
  const drawerRef                     = useRef(null);

  useEffect(() => {
    fetch('/api/admin/departments')
      .then(r => r.json())
      .then(d => { if (d?.success) setDepartments(d.departments || []); })
      .catch(() => {});
  }, []);

  // Sprint 11 carryover behavior: clicking a NotesCenter tile sets
  // the drawer's active tab AND scrolls the drawer into view, so the
  // tile -> drawer relationship is obvious.
  const handleTileClick = (tab) => {
    setNotesTab(tab);
    if (drawerRef.current) {
      drawerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="logbook-page">
      <div className="logbook-topbar">
        <div className="logbook-topbar-left">
          <button className="btn-back" onClick={() => goTo('home')}>‹ Home</button>
          <h2 className="logbook-title">Logbook</h2>
        </div>
        <div className="logbook-date-nav">
          <button
            type="button"
            className="logbook-nav-btn"
            onClick={() => setForDate(addDays(forDate, -1))}
            aria-label="Previous day"
          >‹</button>
          <input
            type="date"
            className="logbook-date-input"
            value={forDate}
            onChange={(e) => setForDate(e.target.value)}
          />
          <button
            type="button"
            className="logbook-nav-btn"
            onClick={() => setForDate(addDays(forDate, 1))}
            aria-label="Next day"
          >›</button>
          <button
            type="button"
            className="logbook-today"
            onClick={() => setForDate(isoDay(new Date()))}
          >Today</button>
        </div>
      </div>

      <div className="logbook-body">
        <NotesCenter
          forDate={forDate}
          onTileClick={handleTileClick}
          currentUser={user}
        />
        <div ref={drawerRef}>
          <NotesDrawer
            forDate={forDate}
            departments={departments}
            editable={true}
            currentUser={user}
            tab={notesTab}
            onTabChange={setNotesTab}
          />
        </div>
      </div>
    </div>
  );
};

export default AdminReports;
