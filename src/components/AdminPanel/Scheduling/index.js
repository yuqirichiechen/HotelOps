import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import YearView from './YearView';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';
import AssignModal from './AssignModal';
import './Scheduling.css';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Sprint 8.0: scheduling now mirrors the iOS Calendar app — Year / Month /
// Week / Day. A single `cursor` date drives every view; switching views
// preserves the cursor so the admin keeps their place. Zooming between
// views (Year → Month → Day) is animated via the View Transitions API,
// reusing the Sprint 7.4 pattern (document.startViewTransition + flushSync).
//
// Default landing view is Month, matching iOS Calendar's default.

const startOfWeek = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
};

const fmtDate = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Browser-supported view transition wrapper. Falls back to an instant
// state update if startViewTransition is unavailable (e.g. older Firefox).
const runWithTransition = (cb) => {
  if (typeof document !== 'undefined' && document.startViewTransition) {
    document.startViewTransition(() => flushSync(cb));
  } else {
    cb();
  }
};

const SchedulingManager = () => {
  const nav = useNavigate();

  // ── View + cursor state ─────────────────────────────────────────────────
  const [view,   setView]   = useState('month'); // year | month | week | day
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });

  // ── Data ────────────────────────────────────────────────────────────────
  const [schedules,    setSchedules]    = useState([]);
  const [employees,    setEmployees]    = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [templates,    setTemplates]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modal,        setModal]        = useState(null);

  // Load base data once
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/employees').then(r => r.json()),
      fetch('/api/admin/departments').then(r => r.json()),
      fetch('/api/admin/shift-templates').then(r => r.json()),
    ]).then(([emp, dept, tmpl]) => {
      if (emp.success)  setEmployees(emp.employees.filter(e => e.active));
      if (dept.success) setDepartments(dept.departments);
      if (tmpl.success) setTemplates(tmpl.templates);
    });
  }, []);

  // Range to fetch is driven by the current view + cursor. We always fetch a
  // little extra so view-internal navigation (next/prev day, etc.) doesn't
  // refetch unless the cursor leaves the range.
  const fetchRange = useMemo(() => {
    if (view === 'year') {
      return { start: `${cursor.getFullYear()}-01-01`, end: `${cursor.getFullYear()}-12-31` };
    }
    if (view === 'month') {
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      return {
        start: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2,'0')}-01`,
        end:   `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2,'0')}-${String(last).padStart(2,'0')}`,
      };
    }
    if (view === 'week') {
      const ws = startOfWeek(cursor);
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      return { start: fmtDate(ws), end: fmtDate(we) };
    }
    // day
    return { start: fmtDate(cursor), end: fmtDate(cursor) };
  }, [view, cursor]);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/admin/schedule?start=${fetchRange.start}&end=${fetchRange.end}`);
    const data = await res.json();
    if (data.success) setSchedules(data.schedules);
    setLoading(false);
  }, [fetchRange]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  // ── Save / delete / move (unchanged from prior sprint) ──────────────────
  const handleSave = async ({ startTime, endTime, shiftId, notes }) => {
    if (modal?.type === 'assign') {
      const res = await fetch('/api/admin/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:        modal.employee.user_id,
          scheduled_date: fmtDate(modal.date),
          start_time:     startTime,
          end_time:       endTime,
          shift_id:       shiftId || null,
          notes:          notes   || null,
        }),
      });
      const result = await res.json();
      if (!result.success) return result.message;
    } else if (modal?.type === 'edit') {
      const s   = modal.schedule;
      const res = await fetch(`/api/admin/schedule/${s.schedule_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:        s.user_id,
          scheduled_date: s.scheduled_date,
          start_time:     startTime,
          end_time:       endTime,
          shift_id:       shiftId || null,
          notes:          notes   || null,
        }),
      });
      const result = await res.json();
      if (!result.success) return result.message;
    }
    setModal(null);
    loadSchedules();
    return null;
  };

  const handleDelete = async (scheduleId) => {
    await fetch(`/api/admin/schedule/${scheduleId}`, { method: 'DELETE' });
    setModal(null);
    loadSchedules();
  };

  const handleMove = async (scheduleId, newUserId, newDate) => {
    const s = schedules.find(sc => sc.schedule_id === scheduleId);
    if (!s) return;
    await fetch(`/api/admin/schedule/${scheduleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:        newUserId,
        scheduled_date: newDate,
        start_time:     s.start_time,
        end_time:       s.end_time,
        shift_id:       s.shift_id  || null,
        notes:          s.notes     || null,
      }),
    });
    loadSchedules();
  };

  // ── Navigation helpers (animated via View Transitions API) ──────────────
  const zoomTo = (nextView, nextCursor) => runWithTransition(() => {
    if (nextCursor) setCursor(nextCursor);
    setView(nextView);
  });

  const goPrev = () => {
    const d = new Date(cursor);
    if (view === 'year')  d.setFullYear(d.getFullYear() - 1);
    if (view === 'month') d.setMonth(d.getMonth() - 1);
    if (view === 'week')  d.setDate(d.getDate() - 7);
    if (view === 'day')   d.setDate(d.getDate() - 1);
    setCursor(d);
  };
  const goNext = () => {
    const d = new Date(cursor);
    if (view === 'year')  d.setFullYear(d.getFullYear() + 1);
    if (view === 'month') d.setMonth(d.getMonth() + 1);
    if (view === 'week')  d.setDate(d.getDate() + 7);
    if (view === 'day')   d.setDate(d.getDate() + 1);
    setCursor(d);
  };
  const goToday = () => setCursor(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });

  // ── Header label depending on view ──────────────────────────────────────
  const headerLabel = (() => {
    if (view === 'year')  return `${cursor.getFullYear()}`;
    if (view === 'month') return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === 'week')  {
      const ws = startOfWeek(cursor);
      return `${MONTH_NAMES[ws.getMonth()]} ${ws.getFullYear()}`;
    }
    return cursor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  })();

  // Back-arrow target depending on current view (mirrors iOS Calendar):
  // Day → Month, Month → Year, Year/Week → none.
  const backTarget = view === 'day' ? 'month' : view === 'month' ? 'year' : null;

  return (
    <div className="sched-manager">
      <div className="sched-header">
        <div className="sched-header-left">
          {backTarget ? (
            <button className="btn-back" onClick={() => zoomTo(backTarget)} aria-label="Back">
              ‹ {backTarget === 'month' ? MONTH_NAMES[cursor.getMonth()] : cursor.getFullYear()}
            </button>
          ) : (
            <button className="btn-back" onClick={() => nav('/admin')}>‹ Home</button>
          )}
          <h2 className="sched-title">{headerLabel}</h2>
        </div>
        <div className="sched-header-right">
          <div className="sched-view-toggle">
            {['year','month','week','day'].map(v => (
              <button
                key={v}
                className={`view-btn${view === v ? ' active' : ''}`}
                onClick={() => zoomTo(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {/* Sprint 8.1 lands the docked Assign Shifts side panel here. */}
          <button className="sched-add-btn" aria-label="Assign shifts" disabled title="Side panel coming in 8.1">＋</button>
        </div>
      </div>

      <div className="sched-nav-bar">
        <button className="nav-arrow" onClick={goPrev} aria-label="Previous">‹</button>
        <button className="nav-today" onClick={goToday}>Today</button>
        <button className="nav-arrow" onClick={goNext} aria-label="Next">›</button>
      </div>

      <div className="sched-content">
        {view === 'year' && (
          <YearView
            year={cursor.getFullYear()}
            schedules={schedules}
            loading={loading}
            onSelectMonth={(m) => {
              const d = new Date(cursor); d.setMonth(m, 1); zoomTo('month', d);
            }}
          />
        )}
        {view === 'month' && (
          <MonthView
            year={cursor.getFullYear()}
            month={cursor.getMonth()}
            schedules={schedules}
            departments={departments}
            loading={loading}
            onSelectDay={(date) => zoomTo('day', new Date(date))}
          />
        )}
        {view === 'week' && (
          <WeekView
            weekStart={startOfWeek(cursor)}
            employees={employees}
            departments={departments}
            schedules={schedules}
            loading={loading}
            onAssign={(emp, date) => setModal({ type: 'assign', employee: emp, date })}
            onEdit={(schedule)    => setModal({ type: 'edit',   schedule })}
            onMove={handleMove}
          />
        )}
        {view === 'day' && (
          <DayView
            date={cursor}
            schedules={schedules}
            employees={employees}
            departments={departments}
            loading={loading}
            onPickDate={(d)   => setCursor(new Date(d))}
            onEdit={(schedule) => setModal({ type: 'edit', schedule })}
          />
        )}
      </div>

      {modal && (
        <AssignModal
          modal={modal}
          templates={templates}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default SchedulingManager;
