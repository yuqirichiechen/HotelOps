import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useAuth } from '../../../auth';
import { useView } from '../../../shells/ViewContext';
import YearView from './YearView';
import MonthView from './MonthView';
import CalendarWeekView from '../../Calendar/views/CalendarWeekView';
import DayView from './DayView';
import AssignModal from './AssignModal';
import AssignPanel from './AssignPanel';
import NotesDrawer from '../../Calendar/atoms/NotesDrawer';
import NotesCenter from '../../Calendar/atoms/NotesCenter';
// Sprint 11.1: DayToggle removed from admin Day view (admins use the
// outer prev/next day-nav). Staff Calendar still imports it.
import './Scheduling.css';
import '../../Calendar/Calendar.css';

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

// Browser-supported view transition wrapper. Sprint 8.5: takes an optional
// `dir` ('prev' | 'next' | null) that's set on the document root for the
// duration of the transition. CSS reads `[data-sched-dir]` to drive
// directional slide animations on `.sched-content` for prev/next nav,
// while zoom transitions (no `dir`) use the inner element FLIPs unchanged.
// Falls back to an instant state update if startViewTransition is
// unavailable (e.g. older Firefox).
const runWithTransition = (cb, dir = null) => {
  if (typeof document !== 'undefined' && document.startViewTransition) {
    if (dir) document.documentElement.dataset.schedDir = dir;
    const t = document.startViewTransition(() => flushSync(cb));
    t.finished.finally(() => { delete document.documentElement.dataset.schedDir; });
  } else {
    cb();
  }
};

const SchedulingManager = () => {
  // Sprint 11.2.1: back-to-Home + notes "view all" go through the
  // AdminShell's view state instead of URL nav.
  const { goTo } = useView();
  const { user } = useAuth(); // Sprint 10.1: needed for HandoffsDrawer author gating

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
  const [panelOpen,    setPanelOpen]    = useState(false);
  const [panelPrefill, setPanelPrefill] = useState(null);

  // Sprint 11: Day-view-only state. The notes drawer's tab is
  // controlled by the parent so the NotesCenter tiles can switch
  // tabs on click. Default 'all'.
  const [notesTab, setNotesTab] = useState('all');
  const notesDrawerRef = useRef(null);

  // Tile click on NotesCenter → switch drawer tab + scroll drawer
  // into view so the user lands on the relevant content.
  const handleNotesTile = (tabKey) => {
    setNotesTab(tabKey);
    if (notesDrawerRef.current) {
      notesDrawerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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
      // Sprint 8.5.1: Week view shows a 4-week summary anchored on the
      // cursor's week, so pull 28 days of schedules (last day inclusive).
      const ws = startOfWeek(cursor);
      const we = new Date(ws); we.setDate(we.getDate() + 27);
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

  // Bulk POST loop for the AssignPanel. The existing /api/admin/schedule
  // endpoint accepts one shift per request, so for recurring assignments
  // we just iterate. Returns { ok, fail, message } so the panel can show a
  // summary; we re-load schedules once at the end so the calendar reflects
  // every successful insert.
  const handlePanelSubmit = async ({ userId, dates, startTime, endTime, shiftId, notes }) => {
    let ok = 0, fail = 0, lastErr = '';
    for (const d of dates) {
      try {
        const res = await fetch('/api/admin/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id:        userId,
            scheduled_date: d,
            start_time:     startTime,
            end_time:       endTime,
            shift_id:       shiftId || null,
            notes:          notes   || null,
          }),
        });
        const data = await res.json();
        if (data.success) ok++;
        else { fail++; lastErr = data.message || lastErr; }
      } catch (e) {
        fail++;
        lastErr = e.message || lastErr;
      }
    }
    if (ok > 0) loadSchedules();
    return { ok, fail, message: lastErr };
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
  // Sprint 8.5.1: classify the view change as a zoom-in (going deeper —
  // year→month, month→day) or zoom-out (year backwards). Used by CSS to
  // apply a subtle scale animation on the canvas so view-to-view switches
  // have a visible animation even when no inner element name matches
  // between the two views (e.g. switching to Week from Day via the toggle).
  const zoomTo = (nextView, nextCursor) => {
    const levels = { year: 1, month: 2, week: 3, day: 4 };
    const oldLevel = levels[view] ?? 0;
    const newLevel = levels[nextView] ?? 0;
    const dir = newLevel > oldLevel ? 'zoom-in'
              : newLevel < oldLevel ? 'zoom-out'
              : null;
    runWithTransition(() => {
      if (nextCursor) setCursor(nextCursor);
      setView(nextView);
    }, dir);
  };

  const goPrev = () => runWithTransition(() => {
    const d = new Date(cursor);
    if (view === 'year')  d.setFullYear(d.getFullYear() - 1);
    if (view === 'month') d.setMonth(d.getMonth() - 1);
    if (view === 'week')  d.setDate(d.getDate() - 7);
    if (view === 'day')   d.setDate(d.getDate() - 1);
    setCursor(d);
  }, 'prev');

  const goNext = () => runWithTransition(() => {
    const d = new Date(cursor);
    if (view === 'year')  d.setFullYear(d.getFullYear() + 1);
    if (view === 'month') d.setMonth(d.getMonth() + 1);
    if (view === 'week')  d.setDate(d.getDate() + 7);
    if (view === 'day')   d.setDate(d.getDate() + 1);
    setCursor(d);
  }, 'next');

  // Today jumps directly without a directional slide — could go either way
  // depending on where the cursor is, so a default cross-fade reads better
  // than an arbitrary slide direction.
  const goToday = () => runWithTransition(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCursor(d);
  });

  // ── Header label depending on view ──────────────────────────────────────
  // Sprint 8.5.1: Day view label was breaking onto two lines and pushing the
  // segmented control to its own row in narrow widths. Use a "Weekday | Mon
  // D, YYYY" format with a thin separator instead of a comma — reads at a
  // glance and saves enough horizontal space that the controls fit.
  const headerLabel = (() => {
    if (view === 'year')  return `${cursor.getFullYear()}`;
    if (view === 'month') return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === 'week')  {
      const ws = startOfWeek(cursor);
      return `${MONTH_NAMES[ws.getMonth()]} ${ws.getFullYear()}`;
    }
    const wd  = cursor.toLocaleDateString([], { weekday: 'long' });
    const md  = cursor.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    return `${wd} │ ${md}`;
  })();

  // Back-arrow target depending on current view (mirrors iOS Calendar):
  // Day → Month, Month → Year, Year/Week → none.
  const backTarget = view === 'day' ? 'month' : view === 'month' ? 'year' : null;

  return (
    <div className="sched-manager">
      {/* Sprint 8.5.1: header row is now just back + title. View toggle and
          "+" button moved down to share the nav-bar row with prev/today/next.
          Frees horizontal space on mobile so the segmented control no
          longer wraps to its own line on long Day labels. */}
      <div className="sched-header">
        <div className="sched-header-left">
          {backTarget ? (
            <button className="btn-back" onClick={() => zoomTo(backTarget)} aria-label="Back">
              ‹ {backTarget === 'month' ? MONTH_NAMES[cursor.getMonth()] : cursor.getFullYear()}
            </button>
          ) : (
            <button className="btn-back" onClick={() => goTo('home')}>‹ Home</button>
          )}
          <h2 className="sched-title">{headerLabel}</h2>
        </div>
      </div>

      <div className="sched-nav-bar">
        <button className="nav-arrow" onClick={goPrev} aria-label="Previous">‹</button>
        <button className="nav-today" onClick={goToday}>Today</button>
        <button className="nav-arrow" onClick={goNext} aria-label="Next">›</button>
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
        <button
          className="sched-add-btn"
          aria-label="Assign shifts"
          title="Assign shifts"
          onClick={() => { setPanelPrefill(null); setPanelOpen(true); }}
        >＋</button>
      </div>

      <div className="sched-content" style={{ viewTransitionName: 'sched-canvas' }}>
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
          // Sprint 11: combined Week view (matrix-per-staff + notes
          // feed) per mockup #26. AdminWeekView (matrix-per-dept
          // from 10.1) is repurposed for Month view in Sprint 11.x
          // since the user spec moved that style to Month.
          <CalendarWeekView
            weekStart={startOfWeek(cursor)}
            schedules={schedules}
            employees={employees}
            departments={departments}
            currentUser={user}
            staffScope={false}
            onPickDate={(d) => zoomTo('day', new Date(d))}
            onViewAllNotes={() => goTo('notes', { date: fmtDate(cursor) })}
          />
        )}
        {view === 'day' && (
          <>
            {/* Sprint 11 Day view shell. 11.1 dropped the
                Today/Tomorrow toggle for admin — the outer prev/next
                day-nav buttons already cover that motion, and the
                toggle didn't update relative to the active cursor
                so it read as broken. Staff Day view still uses the
                toggle (no other day-nav surfaces). */}
            <NotesCenter
              forDate={fmtDate(cursor)}
              onTileClick={handleNotesTile}
              onViewAll={() => goTo('notes', { date: fmtDate(cursor) })}
              currentUser={user}
            />
            <DayView
              date={cursor}
              schedules={schedules}
              employees={employees}
              departments={departments}
              loading={loading}
              onPickDate={(d)   => setCursor(new Date(d))}
              onEdit={(schedule) => setModal({ type: 'edit', schedule })}
            />
            <div ref={notesDrawerRef}>
              <NotesDrawer
                forDate={fmtDate(cursor)}
                departments={departments}
                editable={true}
                currentUser={user}
                tab={notesTab}
                onTabChange={setNotesTab}
              />
            </div>
          </>
        )}
      </div>

      {modal && (
        <AssignModal
          modal={modal}
          templates={templates}
          schedules={schedules}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}

      <AssignPanel
        open={panelOpen}
        employees={employees}
        departments={departments}
        templates={templates}
        schedules={schedules}
        prefill={panelPrefill}
        onClose={() => setPanelOpen(false)}
        onSubmit={handlePanelSubmit}
      />
    </div>
  );
};

export default SchedulingManager;
