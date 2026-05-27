import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { apiFetch, useAuth } from '../../../auth';
import { useView } from '../../../shells/ViewContext';
import YearView from './YearView';
import MonthView from './MonthView';
import CalendarWeekView from '../../Calendar/views/CalendarWeekView';
import DayView from './DayView';
import AssignModal from './AssignModal';
import AssignPanel from './AssignPanel';
// Sprint 11.1: DayToggle removed from admin Day view (admins use the
// outer prev/next day-nav). Staff Calendar still imports it.
// Sprint 12.1: NotesCenter / NotesDrawer imports removed — those
// affordances moved to the Logbook surface (AdminReports).
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

// ── Sprint 13: stats + notes-feed shared between Day / Week ──────────────
//
// Day at a glance / Week at a glance share four stats. With Sprint 12's
// data source = `/admin/entries`, we already have the entries on the
// client; just count them.
//
//   Finished shifts — clocked-out entries in the range.
//   On clock       — in-progress entries (clock_out_time === null).
//   Notes          — unresolved handoff_notes count for the range
//                    (fetched separately; lives in the Logbook surface).
//   Conflicts      — pairs of *different* staff whose entries overlap
//                    in time (any dept). Mostly an attention signal —
//                    overlap is normal in a hotel but the GM asked for
//                    a count to surface multi-staff coverage windows.
//
// Open Shifts intentionally dropped (Sprint 13 — see iteration log).
const computeDayStats = (entries, notesCount = 0, scheduledCount = 0) => {
  let finished = 0;
  let onClock  = 0;
  for (const s of entries) {
    if (s.is_in_progress) onClock++;
    else                  finished++;
  }
  return {
    finished,
    onClock,
    notes:     notesCount,
    scheduled: scheduledCount,
  };
};

// Sprint 13.2: `countConflicts` removed — the at-a-glance card's
// 4th stat is now "Scheduled" (count of admin-assigned shifts via
// the + scheduler), not "Conflicts." Overlap counting was a noisy
// signal in a hotel where multi-staff coverage is the norm.

// Day at a glance / Week at a glance share the same 4-stat layout.
const AtAGlanceCard = ({ title, stats }) => (
  <section className="sched-glance-card" aria-label={title}>
    <header className="sched-glance-header">
      <span className="sched-glance-icon" aria-hidden>📋</span>
      <h3 className="sched-glance-title">{title}</h3>
    </header>
    <div className="sched-glance-stats">
      <div className="sched-glance-stat">
        <div className="sched-glance-num">{stats.finished}</div>
        <div className="sched-glance-label">Finished shifts</div>
      </div>
      <div className="sched-glance-stat">
        <div className={`sched-glance-num${stats.onClock > 0 ? ' is-live' : ''}`}>{stats.onClock}</div>
        <div className="sched-glance-label">On clock</div>
      </div>
      <div className="sched-glance-stat">
        <div className="sched-glance-num">{stats.notes}</div>
        <div className="sched-glance-label">Notes</div>
      </div>
      <div className="sched-glance-stat">
        {/* Sprint 13.2: was "Conflicts" (overlap-pair count). Replaced
            with "Scheduled" — count of shifts the admin assigned via
            the + scheduler (rows in `schedules`). Distinct from the
            clock-entry-derived top three stats. */}
        <div className="sched-glance-num">{stats.scheduled}</div>
        <div className="sched-glance-label">Scheduled</div>
      </div>
    </div>
  </section>
);

// Notes & updates / Weekly updates — purely presentational. Parent
// fetches /handoff-notes for the current range (Day or Week) and
// passes the array in via the `notes` prop. Same components, two
// surfaces; the count surfaced in AtAGlanceCard's "Notes" tile
// comes from the same fetch so we don't double-pull the endpoint.
const NotesUpdatesCard = ({ title, notes, loading, onOpenLogbook }) => {
  const visible = useMemo(
    () => (notes || []).filter(n => !n.resolved_at).slice(0, 4),
    [notes]
  );

  // Dept color dot — uses the schedule view's dept palette so the
  // colour language is consistent across the calendar.
  const dotFor = (scope, deptName) => {
    if (scope === 'all') return '#3182ce';   // blue
    const map = {
      'Food & Beverage': '#805ad5',
      'Front Desk':      '#3182ce',
      'Housekeeping':    '#38a169',
      'Maintenance':     '#dd6b20',
      'Management':      '#4a5568',
    };
    return map[deptName] || '#718096';
  };

  return (
    <section className="sched-notes-card" aria-label={title}>
      <header className="sched-notes-header">
        <span className="sched-notes-icon" aria-hidden>📝</span>
        <h3 className="sched-notes-title">{title}</h3>
      </header>
      {loading ? (
        <div className="sched-notes-empty">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="sched-notes-empty">No notes in this range yet.</div>
      ) : (
        <ul className="sched-notes-list">
          {visible.map(n => (
            <li key={n.note_id} className="sched-notes-item">
              <span
                className="sched-notes-dot"
                style={{ background: dotFor(n.scope, n.department_name) }}
                aria-hidden
              />
              <span className="sched-notes-body">{n.body}</span>
              <span className="sched-notes-time">
                {new Date(n.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {visible.length > 0 && onOpenLogbook && (
        <button
          type="button"
          className="sched-notes-view-all"
          onClick={onOpenLogbook}
        >
          Open Logbook <span aria-hidden>›</span>
        </button>
      )}
    </section>
  );
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

  // Sprint 12.1: NotesCenter + NotesDrawer (and their `notesTab` /
  // scroll-into-view state) moved out of the Calendar Day view and
  // into the Logbook surface (admin "reports" view). The admin
  // Calendar is now purely a clock-data visualization — no notes
  // composition or feed lives here anymore.

  // Sprint 13: handoff notes for the current cursor range. Used by
  // the AtAGlanceCard ("Notes" stat) and the NotesUpdatesCard
  // (recent items list). Single fetch keyed off the same range
  // window the calendar's data uses.
  const [notesData,    setNotesData]    = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);

  // Sprint 13.2: scheduled-shifts count for the AtAGlance card's
  // new "Scheduled" stat (replaced "Conflicts"). Pulled from
  // /admin/schedule — the table the + scheduler writes to. Kept
  // separate from `schedules` (which Sprint 12 redirected to
  // clock-entry data) because both surfaces want different things:
  // the calendar wants the actual time-entry visualisation,
  // the stat card wants the planned-shift count.
  const [scheduledCount, setScheduledCount] = useState(0);

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

  // Sprint 12: calendar now displays actual clock-in/out data instead
  // of admin-assigned shifts. Reason: the GM doesn't use the
  // assign-shifts surface, so the original "scheduled shifts" feed
  // (/api/admin/schedule) returned an empty calendar most of the time.
  // We pull from /api/admin/entries (time_entries with the same
  // user/department joins the export uses), merge clock-out→clock-in
  // sequences that are <5min apart (accidental signouts), then shape
  // each merged entry to match the schedule view's prop contract so
  // the existing year/month/week/day renderers work without changes
  // beyond a new is_in_progress flag.
  const MERGE_GAP_MS = 5 * 60 * 1000;

  const mergeAccidentalSignouts = useCallback((entries) => {
    const byUser = new Map();
    for (const e of entries) {
      if (!byUser.has(e.user_id)) byUser.set(e.user_id, []);
      byUser.get(e.user_id).push(e);
    }
    const out = [];
    for (const list of byUser.values()) {
      list.sort((a, b) => String(a.clock_in_time).localeCompare(String(b.clock_in_time)));
      let curr = null;
      for (const e of list) {
        if (curr && curr.clock_out_time && e.clock_in_time) {
          const gap = new Date(e.clock_in_time).getTime()
                    - new Date(curr.clock_out_time).getTime();
          if (gap >= 0 && gap < MERGE_GAP_MS) {
            curr.clock_out_time = e.clock_out_time;
            curr.hours = (curr.hours || 0) + (e.hours || 0);
            curr._mergedCount = (curr._mergedCount || 1) + 1;
            continue;
          }
        }
        if (curr) out.push(curr);
        curr = { ...e };
      }
      if (curr) out.push(curr);
    }
    return out;
  }, []);

  const entryToSchedule = useCallback((e) => {
    const inDate  = new Date(e.clock_in_time);
    const isInProgress = !e.clock_out_time;
    const outDate = isInProgress ? new Date() : new Date(e.clock_out_time);
    const pad = (n) => String(n).padStart(2, '0');
    const localDate = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const localTime = (d) =>
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return {
      schedule_id:     `entry-${e.entry_id}`,
      user_id:         e.user_id,
      employee_name:   e.name,
      department_id:   e.department_id,
      department_name: e.department,
      scheduled_date:  localDate(inDate),
      start_time:      localTime(inDate),
      end_time:        localTime(outDate),
      // Sprint 12: flag-set so the views can render a live indicator
      // and skip the edit affordance (these are observed, not planned).
      is_actual:       true,
      is_in_progress:  isInProgress,
      clock_in_time:   e.clock_in_time,
      clock_out_time:  e.clock_out_time,
      hours:           e.hours,
    };
  }, []);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    // Sprint 12.3: /admin/entries is requireAuth — switching from
    // raw fetch() to apiFetch so the bearer token rides along.
    // Plain fetch hit a 401 → empty calendar; apiFetch picks up
    // the JWT from localStorage like the rest of the admin code.
    const { ok, data } = await apiFetch(
      `/admin/entries?from=${fetchRange.start}&to=${fetchRange.end}`
    );
    if (ok && data?.success) {
      const merged = mergeAccidentalSignouts(data.entries || []);
      setSchedules(merged.map(entryToSchedule));
    } else {
      setSchedules([]);
    }
    setLoading(false);
  }, [fetchRange, mergeAccidentalSignouts, entryToSchedule]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  // Sprint 13: notes fetch — runs alongside loadSchedules. Only on
  // Day + Week views (the only surfaces that render the cards).
  useEffect(() => {
    if (view !== 'day' && view !== 'week') return;
    let cancelled = false;
    setNotesLoading(true);
    const params = new URLSearchParams({ from: fetchRange.start, to: fetchRange.end });
    apiFetch(`/handoff-notes?${params.toString()}`).then(({ ok, data }) => {
      if (cancelled) return;
      if (ok && data?.success) setNotesData(data.notes || []);
      else                     setNotesData([]);
      setNotesLoading(false);
    });
    return () => { cancelled = true; };
  }, [view, fetchRange.start, fetchRange.end]);

  // Sprint 13.2: scheduled-shifts count for the same range. Uses
  // the open `/admin/schedule` endpoint (no auth) — just need the
  // length, not the rows. Skip when not on Day/Week.
  useEffect(() => {
    if (view !== 'day' && view !== 'week') return;
    let cancelled = false;
    fetch(`/api/admin/schedule?start=${fetchRange.start}&end=${fetchRange.end}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d?.success) setScheduledCount((d.schedules || []).length);
        else            setScheduledCount(0);
      })
      .catch(() => { if (!cancelled) setScheduledCount(0); });
    return () => { cancelled = true; };
  }, [view, fetchRange.start, fetchRange.end]);

  // Stats for the AtAGlance card — same shape for both Day and Week.
  // `schedules` is already scoped to the active view's range by
  // loadSchedules, so finished/onClock just count over the array.
  const glanceStats = useMemo(() => {
    const notesUnread = notesData.filter(n => !n.resolved_at).length;
    return computeDayStats(schedules, notesUnread, scheduledCount);
  }, [schedules, notesData, scheduledCount]);

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
      {/* Sprint 13: header collapses prev/today/next + view toggle + the
          assign-shifts button onto a single line with the back/title row.
          Previously the back+title sat above the nav bar (which itself
          carried prev/today/next + view toggle + ＋), leaving the right
          half of the title row empty. flex-wrap means the controls drop
          to their own row on viewports that can't fit them. */}
      {/* Sprint 13.3: ＋ assign-shifts button removed from the
          controls row and replaced by a text "Assign" button inline
          with the title. The view toggle (Year/Month/Week/Day) now
          right-aligns inside the controls row on every viewport.
          The drag-and-drop assign-shifts surface lands in a later
          sprint; until then, "Assign" opens the existing
          AssignPanel side panel. */}
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
          <button
            type="button"
            className="sched-assign-btn"
            onClick={() => { setPanelPrefill(null); setPanelOpen(true); }}
          >Assign</button>
        </div>
        <div className="sched-header-controls">
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
        </div>
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
          <>
            {/* Sprint 13: at-a-glance + notes-feed cards above the
                week grid. Same shape as the Day-view block below. */}
            <div className="sched-glance-row">
              <AtAGlanceCard title="Week at a glance" stats={glanceStats} />
              <NotesUpdatesCard
                title="Weekly updates"
                notes={notesData}
                loading={notesLoading}
                onOpenLogbook={() => goTo('reports')}
              />
            </div>
            <CalendarWeekView
              weekStart={startOfWeek(cursor)}
              schedules={schedules}
              employees={employees}
              departments={departments}
              currentUser={user}
              staffScope={false}
              onPickDate={(d) => zoomTo('day', new Date(d))}
            />
          </>
        )}
        {view === 'day' && (
          <>
            {/* Sprint 13: Day at a glance + Notes & updates above
                the DayView body. Stacks on mobile via the CSS rules
                in Scheduling.css. */}
            <div className="sched-glance-row">
              <AtAGlanceCard title="Day at a glance" stats={glanceStats} />
              <NotesUpdatesCard
                title="Notes & updates"
                notes={notesData}
                loading={notesLoading}
                onOpenLogbook={() => goTo('reports')}
              />
            </div>
            <DayView
              date={cursor}
              schedules={schedules}
              employees={employees}
              departments={departments}
              loading={loading}
              onPickDate={(d)   => setCursor(new Date(d))}
              onEdit={(schedule) => setModal({ type: 'edit', schedule })}
            />
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
