import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { apiFetch } from '../../auth';
import { useView } from '../../shells/ViewContext';

// List-as-dashboard pattern (Sprint 6.3): clickable stats banner drives the
// list filter, rich rows show this-week metrics inline, Add Staff is a
// low-key tile at the bottom that inline-expands the existing form.

const ROLES     = ['employee', 'front_desk', 'admin'];
const today     = () => new Date().toISOString().split('T')[0];
const emptyForm = () => ({
  name: '', phone: '', username: '', employeeCode: '', birthday: '', role: 'employee',
  departmentId: '', hireDate: today(), baseHourlyRate: '',
});

const fmtHireDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString([], { month: 'short', year: 'numeric' });
};

const fmtRole = (r) => (r || '').replace('_', ' ');

const isoDay = (d) => {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Sprint 9.4: payroll-aligned period ranges. Options changed from
// `today | week | month | year` to `today | biweekly | month | custom`.
// `biweekly` is the most recently completed 14-day pay cycle, anchored
// to `pay_period_start_day` (0=Sun .. 6=Sat) from app_settings. `custom`
// uses caller-supplied from/to dates and the caller is responsible for
// clamping to the 365-day max.
const periodRange = (period, opts = {}) => {
  const now = new Date();
  const payStartDay = opts.payStartDay != null
    ? parseInt(opts.payStartDay, 10)
    : 0;

  if (period === 'today') {
    const k = isoDay(now);
    return { from: k, to: k };
  }
  if (period === 'biweekly') {
    // End of the just-ended cycle = day before the most recent
    // pay-period-start-day (so the cycle is fully closed). Start =
    // 13 days before that end (inclusive 14-day window).
    const todayDOW = now.getDay();
    const daysSinceStart = (todayDOW - payStartDay + 7) % 7;
    const periodEnd = new Date(now);
    periodEnd.setDate(now.getDate() - daysSinceStart - 1);
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodEnd.getDate() - 13);
    return { from: isoDay(periodStart), to: isoDay(periodEnd) };
  }
  if (period === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(),     1);
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: isoDay(first), to: isoDay(last) };
  }
  if (period === 'custom') {
    return {
      from: opts.customFrom || isoDay(now),
      to:   opts.customTo   || isoDay(now),
    };
  }
  // Defensive fallback to today.
  const k = isoDay(now);
  return { from: k, to: k };
};

// Sprint 9.4: difference in days between two YYYY-MM-DD strings,
// inclusive. Used to clamp the custom range to 365 days.
const daysBetween = (fromIso, toIso) => {
  const f = new Date(fromIso + 'T00:00:00');
  const t = new Date(toIso   + 'T00:00:00');
  return Math.round((t - f) / 86400000) + 1;
};

// Sprint 9.4: group entries by workweek (7-day window starting on
// payStartDay) and split each week's hours into regular + overtime
// against the threshold (default 40). Returns totals across all weeks
// for one employee.
const computeWorkweekTotals = (entries, payStartDay, threshold) => {
  const byWeek = new Map();
  entries.forEach(e => {
    if (!e.clock_out_time || !e.hours) return;
    const date = new Date(e.clock_in_time);
    const dow = date.getDay();
    const daysBack = (dow - payStartDay + 7) % 7;
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - daysBack);
    const key = isoDay(weekStart);
    byWeek.set(key, (byWeek.get(key) || 0) + e.hours);
  });
  let totalHours = 0, regularHours = 0, overtimeHours = 0;
  for (const hours of byWeek.values()) {
    totalHours    += hours;
    regularHours  += Math.min(hours, threshold);
    overtimeHours += Math.max(0, hours - threshold);
  }
  return { totalHours, regularHours, overtimeHours };
};

// Sprint 9.4: Excel sheet names: max 31 chars, no []:*?/\, must be
// unique within the workbook. Caller passes a Set to track names
// already used and we suffix duplicates as "Name (2)", "Name (3)".
const sanitizeSheetName = (name, used) => {
  let base = String(name || 'Sheet').replace(/[[\]:*?/\\]/g, '').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  used.add(candidate);
  return candidate;
};

const StaffManager = () => {
  // Sprint 11.2.1: row click + back button drive the AdminShell's
  // view state instead of URL nav.
  const { goTo } = useView();

  const [employees,   setEmployees]   = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading,     setLoading]     = useState(true);

  // Add form (existing flow, just relocated to a bottom tile)
  const [showAdd,     setShowAdd]     = useState(false);
  const [form,        setForm]        = useState(emptyForm());
  const [formError,   setFormError]   = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // List controls
  const [search,          setSearch]          = useState('');
  const [selectedDept,    setSelectedDept]    = useState('all');
  const [statFilter,      setStatFilter]      = useState('all'); // 'all' | 'needs-ot' | 'recent-hires'
  const [includeInactive, setIncludeInactive] = useState(false);

  // Export popover (Sprint 6.4 → 9.4). Renamed from "CSV" but state
  // keys kept for diff-friendliness.
  const [csvOpen,    setCsvOpen]    = useState(false);
  const [csvBusy,    setCsvBusy]    = useState(false);
  // Sprint 9.4: today | biweekly | month | custom (was today | week | month | year).
  const [csvPeriod,  setCsvPeriod]  = useState('biweekly');
  const [csvScope,   setCsvScope]   = useState('all');      // all | department | filtered
  // Sprint 9.4: custom range pickers — only used when csvPeriod === 'custom'.
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo,   setCustomTo]   = useState(today());
  // Sprint 9.4: cached settings for the export — pay-period start day
  // (drives biweekly + workweek boundary) and overtime threshold.
  // Fetched once when the export popover opens.
  const [payStartDay,  setPayStartDay]  = useState('0');
  const [otThreshold,  setOtThreshold]  = useState(40);
  // Sprint 9.4.1: whether the export includes time entries for staff
  // currently marked inactive. Default false — payroll usually only
  // pays active staff, and including former employees in the workbook
  // confused the user. Admin can opt-in when they need historical
  // payroll for departed staff.
  const [csvIncludeInactive, setCsvIncludeInactive] = useState(false);
  const csvWrapRef = useRef(null);

  // Sprint 11.4: per-row selection for the export popover's "Selected"
  // scope. Each row has a checkbox; ticking it adds user_id to this
  // Set. Selected scope in the export dialog uses these ids verbatim.
  // Independent of the list-filter chips (admin can search the whole
  // roster, tick a handful, and still get just those staff in the
  // workbook).
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleSelected = (userId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else                  next.add(userId);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const reload = async () => {
    setLoading(true);
    const [emp, dept] = await Promise.all([
      fetch('/api/admin/employees').then(r => r.json()),
      fetch('/api/admin/departments').then(r => r.json()),
    ]);
    if (emp.success)  setEmployees(emp.employees);
    if (dept.success) setDepartments(dept.departments);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  // Click-outside dismiss for the export popover
  useEffect(() => {
    if (!csvOpen) return;
    const onDown = (e) => {
      if (csvWrapRef.current && !csvWrapRef.current.contains(e.target)) {
        setCsvOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [csvOpen]);

  // Sprint 9.4: pull the pay-period start day + OT threshold when the
  // export popover opens. Two values are admin-set in
  // /admin/settings; this avoids stale defaults the first time the
  // user exports after changing the setting.
  useEffect(() => {
    if (!csvOpen) return;
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => {
        if (!data?.success) return;
        if (/^[0-6]$/.test(String(data.settings.pay_period_start_day))) {
          setPayStartDay(String(data.settings.pay_period_start_day));
        }
        const t = parseFloat(data.settings.overtime_threshold_hours);
        if (!Number.isNaN(t) && t > 0) setOtThreshold(t);
      })
      .catch(() => { /* defaults are fine */ });
  }, [csvOpen]);

  const handleAdd = async (e) => {
    e.preventDefault();
    // Sprint 9.1: birthday now counts as a first-class identifier (per GM
    // feedback). Server enforces too — this is just a friendlier early bail.
    if (!form.phone && !form.username && !form.employeeCode && !form.birthday) {
      setFormError('Provide at least one of phone, username, employee ID, or birthday');
      return;
    }
    setFormLoading(true);
    setFormError('');
    const res  = await fetch('/api/admin/employees', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:           form.name,
        phoneNumber:    form.phone        || null,
        username:       form.username     || null,
        employeeCode:   form.employeeCode || null,
        birthday:       form.birthday     || null,
        role:           form.role,
        hireDate:       form.hireDate,
        departmentId:   form.departmentId || null,
        baseHourlyRate: form.baseHourlyRate || null,
      }),
    });
    const data = await res.json();
    setFormLoading(false);
    if (data.success) {
      setShowAdd(false);
      setForm(emptyForm());
      // Re-fetch so the new row picks up its hours_this_week / is_on_clock fields.
      reload();
    } else {
      setFormError(data.message);
    }
  };

  // ── Stats (roster lens — see claude-instructions.md "operational vs roster") ──
  const stats = useMemo(() => {
    const activeOnly = employees.filter(e => e.active);
    const total      = activeOnly.length;

    // Avg hours denominator = staff who actually worked any hours this week.
    // Including non-working staff drags the average down even when no one
    // joined or left, which makes the metric noisy and misleading.
    const working  = activeOnly.filter(e => (e.hours_this_week || 0) > 0);
    const totalHrs = working.reduce((s, e) => s + (e.hours_this_week || 0), 0);

    // Needs OT approval = active staff whose pending_ot_hours > 0. Server
    // already accounted for the threshold and ot_approved flag.
    const needsOT = activeOnly.filter(e => (e.pending_ot_hours || 0) > 0).length;

    // Recent hires = active staff whose hire_date is within the last 30 days.
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const recent = activeOnly.filter(e => {
      if (!e.hire_date) return false;
      return new Date(e.hire_date).getTime() >= cutoff;
    }).length;

    return {
      total,
      needsOT,
      avgHours:    working.length ? Math.round((totalHrs / working.length) * 10) / 10 : 0,
      recentHires: recent,
    };
  }, [employees]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q      = search.trim().toLowerCase();
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    return employees.filter(e => {
      if (!includeInactive && !e.active) return false;
      if (selectedDept !== 'all') {
        const key = e.department_id == null ? '__none__' : String(e.department_id);
        if (key !== selectedDept) return false;
      }
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (statFilter === 'needs-ot'     && !((e.pending_ot_hours || 0) > 0)) return false;
      if (statFilter === 'recent-hires' && (!e.hire_date || new Date(e.hire_date).getTime() < cutoff)) {
        return false;
      }
      return true;
    });
  }, [employees, search, selectedDept, statFilter, includeInactive]);

  // Sprint 11.4: the progress bar now reports each staff member's
  // hours-this-week as a fraction of a fixed 40h workweek (was a
  // ratio against the loudest staff in the filtered list, which
  // made everyone look proportional to whoever was at the top —
  // not useful for spotting OT). Anything above 40h pegs the bar
  // at 100% and flips to a warn-tint to flag overtime.
  const HOURS_FULL = 40;

  // ── Export (Sprint 9.4: now XLSX, multi-sheet) ────────────────────────────
  //
  // Per-employee sheet layout:
  //   Row 1: header (Name, Department, Date, Day, Clock In, Clock Out, Hours)
  //   Rows 2..N: one row per time entry, sorted by clock-in time
  //   blank row
  //   Summary block (label | value pairs):
  //     Total Hours, Regular Hours, Overtime Hours, Hourly Rate,
  //     Total Pay, OT Pay (TBD)
  // OT is computed per-workweek (7-day window starting on the
  // pay_period_start_day) against `overtime_threshold_hours` —
  // matches FLSA semantics and the existing dashboard math.
  const runExport = async () => {
    setCsvBusy(true);

    // Resolve date range. Custom needs a 365-day cap so an accidental
    // "2020 → today" range doesn't time out the server.
    let from, to;
    if (csvPeriod === 'custom') {
      if (!customFrom || !customTo) {
        setCsvBusy(false);
        alert('Pick a start and end date.');
        return;
      }
      if (customFrom > customTo) {
        setCsvBusy(false);
        alert('Start date must be before end date.');
        return;
      }
      if (daysBetween(customFrom, customTo) > 365) {
        setCsvBusy(false);
        alert('Custom range can\'t exceed 365 days.');
        return;
      }
      ({ from, to } = periodRange('custom', { customFrom, customTo }));
    } else {
      ({ from, to } = periodRange(csvPeriod, { payStartDay }));
    }

    const params = new URLSearchParams({ from, to });
    let scopeLabel = 'all-staff';
    if (csvScope === 'department' && selectedDept !== 'all' && selectedDept !== '__none__') {
      params.set('dept_id', selectedDept);
      const dept = departments.find(d => String(d.department_id) === selectedDept);
      scopeLabel = `dept-${(dept?.name || 'department').toLowerCase().replace(/\s+/g, '-')}`;
    } else if (csvScope === 'filtered') {
      const ids = filtered.map(e => e.user_id);
      if (ids.length === 0) {
        setCsvBusy(false);
        alert('Filtered list is empty — nothing to export.');
        return;
      }
      params.set('user_ids', ids.join(','));
      scopeLabel = `filtered-${ids.length}`;
    } else if (csvScope === 'selected') {
      // Sprint 11.4: explicitly-ticked staff. Independent of the
      // search/dept filter so the admin can roam the full roster
      // and just tick the ones they need.
      if (selectedIds.size === 0) {
        setCsvBusy(false);
        alert('No staff selected — tick one or more from the list first.');
        return;
      }
      params.set('user_ids', Array.from(selectedIds).join(','));
      scopeLabel = `selected-${selectedIds.size}`;
    }

    const { ok, data } = await apiFetch(`/admin/entries?${params.toString()}`);
    setCsvBusy(false);

    if (!ok || !data?.success) {
      alert(data?.message || 'Export failed.');
      return;
    }

    let entries = data.entries || [];

    // Sprint 9.4.1: drop entries belonging to inactive users unless
    // the admin opted in. The active flag lives on the local
    // `employees` list (server returns all staff by default), so we
    // build a Set of active user_ids and filter against it. Doing
    // this client-side keeps the server endpoint unchanged.
    if (!csvIncludeInactive) {
      const activeIds = new Set(
        employees.filter(e => e.active !== false).map(e => e.user_id)
      );
      entries = entries.filter(e => activeIds.has(e.user_id));
    }

    if (entries.length === 0) {
      alert(
        csvIncludeInactive
          ? 'No entries in this range — nothing to export.'
          : 'No entries for active staff in this range. Check "Include inactive staff" if you need historical payroll for departed employees.'
      );
      return;
    }

    // Group entries by employee. Server returns them sorted by name +
    // clock_in_time, so the group order is stable.
    const groups = new Map();
    entries.forEach(e => {
      if (!groups.has(e.user_id)) {
        groups.set(e.user_id, {
          user_id: e.user_id,
          name: e.name,
          department: e.department,
          rate: e.base_hourly_rate,
          rows: [],
        });
      }
      groups.get(e.user_id).rows.push(e);
    });

    const wb = XLSX.utils.book_new();
    const usedSheetNames = new Set();
    const payStartDayNum = parseInt(payStartDay, 10) || 0;

    for (const group of groups.values()) {
      const sheetData = [
        ['Name', 'Department', 'Date', 'Day', 'Clock In', 'Clock Out', 'Hours'],
      ];

      group.rows.forEach(e => {
        const start = new Date(e.clock_in_time);
        sheetData.push([
          e.name,
          e.department || 'Unassigned',
          isoDay(start),
          start.toLocaleDateString([], { weekday: 'short' }),
          start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          e.clock_out_time
            ? new Date(e.clock_out_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : 'In progress',
          e.clock_out_time ? Number(e.hours.toFixed(2)) : '',
        ]);
      });

      // Summary block — calculated against the workweek boundary
      // defined by pay_period_start_day so the OT splits match what
      // payroll would actually owe.
      const { totalHours, regularHours, overtimeHours } =
        computeWorkweekTotals(group.rows, payStartDayNum, otThreshold);
      const rate     = group.rate;
      const totalPay = rate != null ? Number((regularHours * rate).toFixed(2)) : null;
      // OT pay intentionally left as "TBD" — implementation deferred
      // (typical FLSA: overtimeHours × rate × 1.5, but the user wants
      // this revisited as its own decision).

      sheetData.push([]);
      sheetData.push(['Summary', `${from} → ${to}`]);
      sheetData.push(['Total Hours',    Number(totalHours.toFixed(2))]);
      sheetData.push(['Regular Hours',  Number(regularHours.toFixed(2))]);
      sheetData.push(['Overtime Hours', Number(overtimeHours.toFixed(2))]);
      sheetData.push(['Hourly Rate',    rate != null ? rate : '—']);
      sheetData.push(['Total Pay',      totalPay != null ? totalPay : '—']);
      sheetData.push(['OT Pay',         'TBD']);

      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Column widths — let the timestamps + names breathe.
      ws['!cols'] = [
        { wch: 22 }, // Name
        { wch: 16 }, // Department
        { wch: 12 }, // Date
        { wch:  6 }, // Day
        { wch: 10 }, // Clock In
        { wch: 12 }, // Clock Out
        { wch:  8 }, // Hours
      ];

      const sheetName = sanitizeSheetName(group.name, usedSheetNames);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const filename = `staff-${scopeLabel}-${csvPeriod}-${from}.xlsx`;
    XLSX.writeFile(wb, filename);

    setCsvOpen(false);
  };

  // Department option only valid when a single dept is filtered
  const deptScopeAvailable = selectedDept !== 'all' && selectedDept !== '__none__';
  const deptScopeName      = departments.find(d => String(d.department_id) === selectedDept)?.name || '';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="staff-mgr">

      {/* Header */}
      <div className="staff-mgr-topbar">
        <button className="btn-back" onClick={() => goTo('home')}>‹ Home</button>
        <h2 className="staff-mgr-h1">Staff</h2>
      </div>

      {/* Stats banner (clickable cards drive the filter below) */}
      <div className="staff-mgr-stats">
        {[
          {
            key: 'all',        eyebrow: 'Active staff',
            value: loading ? '—' : stats.total,
            meta: 'on the roster',  clickable: true,
          },
          // Roster lens: who needs my attention as a manager? "On the clock"
          // moved to AdminHome (operational lens). Pending OT shows up here
          // as a head count — staff above the weekly threshold pending
          // approval — and on AdminHome as an hours total.
          {
            key: 'needs-ot',   eyebrow: 'Needs OT approval',
            value: loading ? '—' : stats.needsOT,
            meta: stats.needsOT ? 'over weekly threshold' : 'all caught up',
            tone: stats.needsOT ? 'warn' : null,
            clickable: stats.needsOT > 0,
          },
          {
            key: 'avg-hours', eyebrow: 'Avg hours / staff',
            value: loading ? '—' : `${stats.avgHours}h`,
            meta: 'this week, working staff',  clickable: false,
          },
          {
            key: 'recent-hires', eyebrow: 'Recent hires',
            value: loading ? '—' : stats.recentHires,
            meta: stats.recentHires > 0 ? 'last 30 days' : 'no one new',
            tone: stats.recentHires > 0 ? 'action' : null,
            clickable: stats.recentHires > 0,
          },
        ].map(s => {
          const isSelected = s.clickable && statFilter === s.key;
          const cls = [
            'staff-mgr-stat',
            s.tone === 'live' ? 'is-live' : '',
            s.tone === 'warn' ? 'is-warn' : '',
            s.clickable       ? 'is-clickable' : '',
            isSelected        ? 'is-selected'  : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={s.key}
              type="button"
              className={cls}
              onClick={s.clickable ? () => setStatFilter(s.key) : undefined}
              disabled={!s.clickable}
            >
              <div className="staff-mgr-stat-eyebrow">{s.eyebrow}</div>
              <div className="staff-mgr-stat-num">{s.value}</div>
              <div className={`staff-mgr-stat-meta ${s.tone === 'live' ? 'is-live' : ''}`}>
                {s.meta}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter row — search, dept chips, inactive toggle */}
      <div className="staff-mgr-filters">
        <div className="staff-mgr-search">
          <span className="staff-mgr-search-icon" aria-hidden>⌕</span>
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="staff-mgr-search-clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >×</button>
          )}
        </div>

        <div className="staff-mgr-chips">
          <button
            type="button"
            className={`staff-mgr-chip ${selectedDept === 'all' ? 'is-active' : ''}`}
            onClick={() => setSelectedDept('all')}
          >
            All departments
          </button>
          {departments.map(d => (
            <button
              key={d.department_id}
              type="button"
              className={`staff-mgr-chip ${selectedDept === String(d.department_id) ? 'is-active' : ''}`}
              onClick={() => setSelectedDept(String(d.department_id))}
            >
              {d.name}
            </button>
          ))}
          <button
            type="button"
            className={`staff-mgr-chip ${selectedDept === '__none__' ? 'is-active' : ''}`}
            onClick={() => setSelectedDept('__none__')}
          >
            Unassigned
          </button>
        </div>

        {/* Separates the *filter* row (search + dept chips) from the
            *display + action* row (include-inactive toggle + export).
            Different concerns shouldn't read as one continuous control band. */}
        <div className="staff-mgr-filter-divider" aria-hidden />

        <button
          type="button"
          className={`staff-mgr-toggle ${includeInactive ? 'is-active' : ''}`}
          onClick={() => setIncludeInactive(v => !v)}
          aria-pressed={includeInactive}
        >
          Include inactive
        </button>

        {/* Sprint 11.4: selection summary — only renders when at
            least one row is ticked. Lets the admin see how many
            are picked and clear them all in one click. */}
        {selectedIds.size > 0 && (
          <button
            type="button"
            className="staff-mgr-selection-chip"
            onClick={clearSelection}
            aria-label="Clear selection"
            title="Clear selection"
          >
            {selectedIds.size} selected
            <span className="staff-mgr-selection-clear" aria-hidden>✕</span>
          </button>
        )}

        <div className={`staff-mgr-export ${csvOpen ? 'is-open' : ''}`} ref={csvWrapRef}>
          <button
            type="button"
            className="staff-mgr-export-btn"
            onClick={() => setCsvOpen(o => !o)}
          >
            ↓ Export <span className="staff-mgr-export-caret">▾</span>
          </button>
          {csvOpen && (
            <div className="staff-mgr-export-menu" role="menu">
              <div className="staff-mgr-export-title">Export payroll (XLSX)</div>

              <div className="staff-mgr-export-section">
                <div className="staff-mgr-export-label">Period</div>
                <div className="staff-mgr-export-period">
                  {[
                    { v: 'today',    label: 'Today'    },
                    { v: 'biweekly', label: 'Biweekly' },
                    { v: 'month',    label: 'Month'    },
                    { v: 'custom',   label: 'Custom'   },
                  ].map(p => (
                    <button
                      key={p.v}
                      type="button"
                      className={`staff-mgr-export-period-btn ${csvPeriod === p.v ? 'is-active' : ''}`}
                      onClick={() => setCsvPeriod(p.v)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {csvPeriod === 'custom' && (
                  <div className="staff-mgr-export-custom">
                    <label className="staff-mgr-export-custom-field">
                      <span>From</span>
                      <input
                        type="date"
                        value={customFrom}
                        max={customTo || undefined}
                        onChange={e => setCustomFrom(e.target.value)}
                      />
                    </label>
                    <label className="staff-mgr-export-custom-field">
                      <span>To</span>
                      <input
                        type="date"
                        value={customTo}
                        min={customFrom || undefined}
                        max={today()}
                        onChange={e => setCustomTo(e.target.value)}
                      />
                    </label>
                    <div className="staff-mgr-export-custom-help">
                      Max range: 365 days.
                    </div>
                  </div>
                )}
              </div>

              <div className="staff-mgr-export-section">
                <div className="staff-mgr-export-label">Scope</div>
                <div className="staff-mgr-export-scope">
                  <label className="staff-mgr-export-radio">
                    <input
                      type="radio"
                      className="hop-radio"
                      name="csv-scope"
                      checked={csvScope === 'all'}
                      onChange={() => setCsvScope('all')}
                    />
                    <span>All staff <span className="staff-mgr-export-meta">{stats.total}</span></span>
                  </label>
                  <label className={`staff-mgr-export-radio ${!deptScopeAvailable ? 'is-disabled' : ''}`}>
                    <input
                      type="radio"
                      className="hop-radio"
                      name="csv-scope"
                      disabled={!deptScopeAvailable}
                      checked={csvScope === 'department'}
                      onChange={() => setCsvScope('department')}
                    />
                    <span>
                      {deptScopeAvailable
                        ? <>Department: <strong>{deptScopeName}</strong></>
                        : <>Department <span className="staff-mgr-export-meta">pick a chip first</span></>}
                    </span>
                  </label>
                  <label className="staff-mgr-export-radio">
                    <input
                      type="radio"
                      className="hop-radio"
                      name="csv-scope"
                      checked={csvScope === 'filtered'}
                      onChange={() => setCsvScope('filtered')}
                    />
                    <span>Filtered list <span className="staff-mgr-export-meta">{filtered.length}</span></span>
                  </label>
                  {/* Sprint 11.4: only show the Selected option when at
                      least one row is ticked. Keeps the popover tidy
                      when the admin isn't using the selection feature. */}
                  <label className={`staff-mgr-export-radio ${selectedIds.size === 0 ? 'is-disabled' : ''}`}>
                    <input
                      type="radio"
                      className="hop-radio"
                      name="csv-scope"
                      disabled={selectedIds.size === 0}
                      checked={csvScope === 'selected'}
                      onChange={() => setCsvScope('selected')}
                    />
                    <span>
                      {selectedIds.size > 0
                        ? <>Selected staff <span className="staff-mgr-export-meta">{selectedIds.size}</span></>
                        : <>Selected staff <span className="staff-mgr-export-meta">tick rows first</span></>}
                    </span>
                  </label>
                </div>
              </div>

              {/* Sprint 9.4.1: opt-in to include former / inactive staff.
                  Off by default — payroll typically only covers active
                  employees, and the unfiltered behavior surprised the
                  GM (departed staff showing in the workbook). */}
              <label className="staff-mgr-export-checkbox">
                <input
                  type="checkbox"
                  className="hop-check"
                  checked={csvIncludeInactive}
                  onChange={e => setCsvIncludeInactive(e.target.checked)}
                />
                <span>Include inactive staff</span>
              </label>

              <button
                type="button"
                className="staff-mgr-export-go"
                onClick={runExport}
                disabled={
                  csvBusy ||
                  (csvScope === 'department' && !deptScopeAvailable) ||
                  (csvScope === 'selected' && selectedIds.size === 0)
                }
              >
                {csvBusy ? 'Exporting…' : 'Download XLSX'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add staff tile — sits between filters and the list (Sprint 6.4 tweak) */}
      <div className={`staff-mgr-add ${showAdd ? 'is-open' : ''}`}>
        {!showAdd ? (
          <button
            type="button"
            className="staff-mgr-add-tile"
            onClick={() => { setShowAdd(true); setFormError(''); }}
          >
            <span className="staff-mgr-add-icon">＋</span>
            <span>
              <span className="staff-mgr-add-label">Add new staff member</span>
              <span className="staff-mgr-add-sub">Name, phone, role, department</span>
            </span>
          </button>
        ) : (
          <form className="add-form staff-mgr-add-form" onSubmit={handleAdd}>
            <div className="staff-mgr-add-form-head">
              <h3>New staff member</h3>
              <button
                type="button"
                className="staff-mgr-add-cancel"
                onClick={() => { setShowAdd(false); setForm(emptyForm()); setFormError(''); }}
              >
                ✕
              </button>
            </div>
            <div className="add-form-grid">
              <div className="admin-field">
                <label>Full Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" required />
              </div>
              <div className="admin-field">
                <label>Role *</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
                </select>
              </div>
              <div className="admin-field">
                <label>Department</label>
                <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}>
                  <option value="">— None —</option>
                  {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
                </select>
              </div>
              <div className="admin-field">
                <label>Hire Date *</label>
                <input type="date" value={form.hireDate} onChange={e => setForm(f => ({ ...f, hireDate: e.target.value }))} required />
              </div>
              <div className="admin-field">
                <label>Hourly Rate ($)</label>
                <input type="number" step="0.01" min="0" value={form.baseHourlyRate} onChange={e => setForm(f => ({ ...f, baseHourlyRate: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="admin-field add-form-section">
                <div className="add-form-section-label">Login identifiers — at least one required</div>
                <div className="add-form-section-sub">Staff can sign in using any of these.</div>
              </div>
              <div className="admin-field">
                <label>Phone Number</label>
                <input
                  inputMode="numeric"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g,'').slice(0,10) }))}
                  placeholder="10 digits"
                />
              </div>
              <div className="admin-field">
                <label>Username</label>
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value.replace(/[^A-Za-z0-9._-]/g,'').slice(0,16) }))}
                  placeholder="3–16 chars · letters/numbers/._-"
                />
              </div>
              <div className="admin-field">
                <label>Employee ID</label>
                <input
                  inputMode="numeric"
                  value={form.employeeCode}
                  onChange={e => setForm(f => ({ ...f, employeeCode: e.target.value.replace(/\D/g,'').slice(0,6) }))}
                  placeholder="4–6 digits"
                />
              </div>
              <div className="admin-field">
                <label>Birthday</label>
                <input
                  type="date"
                  value={form.birthday}
                  onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))}
                />
                {form.birthday && employees.some(e => e.birthday === form.birthday && e.active !== false) && (
                  <span className="admin-field-warn">
                    ⚠ Another staff member already has this birthday — they'll share the birthday login method
                    (the server will ask the staff to use a phone/ID instead at sign-in).
                  </span>
                )}
              </div>
            </div>
            {formError && <div className="admin-error">{formError}</div>}
            <div className="add-form-actions">
              <button type="submit" className="btn-save" disabled={formLoading}>
                {formLoading ? 'Saving…' : 'Save staff member'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="staff-mgr-loading">Loading staff…</div>
      ) : filtered.length === 0 ? (
        <div className="staff-mgr-empty">
          No staff match the current filters.
          <div className="staff-mgr-empty-sub">Try clearing search or changing the department.</div>
        </div>
      ) : (
        <ul className="staff-mgr-list">
          {filtered.map(e => {
            const hours = e.hours_this_week || 0;
            const pct   = Math.min(100, (hours / HOURS_FULL) * 100);
            const isOT  = hours > HOURS_FULL;
            const isSelected = selectedIds.has(e.user_id);
            return (
              <li
                key={e.user_id}
                className={`staff-mgr-row ${e.active ? '' : 'is-inactive'} ${isSelected ? 'is-selected' : ''}`}
                onClick={() => goTo('staffDetail', { userId: e.user_id })}
              >
                {/* Sprint 11.4: per-row checkbox for the export popover's
                    "Selected" scope. stopPropagation so ticking doesn't
                    drill into StaffDetail. */}
                <label
                  className="staff-mgr-row-select"
                  onClick={(ev) => ev.stopPropagation()}
                  aria-label={`Select ${e.name}`}
                >
                  <input
                    type="checkbox"
                    className="hop-check"
                    checked={isSelected}
                    onChange={() => toggleSelected(e.user_id)}
                  />
                </label>

                <div className="staff-mgr-avatar">
                  {(e.name || '?').charAt(0).toUpperCase()}
                </div>

                <div className="staff-mgr-row-info">
                  <div className="staff-mgr-row-name-line">
                    <span className="staff-mgr-row-name">{e.name}</span>
                    {/* Sprint 11.4: on-the-clock badge moved next to
                        the name so the progress bar column stays the
                        same width for every row (was eating the pills
                        column's `auto` slot before, misaligning bars
                        across rows). */}
                    {e.is_on_clock && (
                      <span className="staff-mgr-pill is-live staff-mgr-pill-inline">
                        <span className="staff-mgr-pill-dot" /> On the clock
                      </span>
                    )}
                  </div>
                  <div className="staff-mgr-row-meta">
                    <span style={{ textTransform: 'capitalize' }}>{fmtRole(e.role)}</span>
                    <span className="staff-mgr-row-dot">·</span>
                    <span>{e.department || 'Unassigned'}</span>
                    <span className="staff-mgr-row-dot">·</span>
                    <span>Hired {fmtHireDate(e.hire_date)}</span>
                  </div>
                </div>

                {/* Sprint 11.4: bar shows hours/40h (fixed denominator
                    so the visual scale reads as "% of a full week"
                    instead of "% of the loudest staff in the list").
                    `is-ot` flips the fill to a warn tint when the
                    user's gone over 40h. */}
                <div className="staff-mgr-row-hours">
                  <div className="staff-mgr-row-hours-num">
                    {hours}h
                    {isOT && <span className="staff-mgr-row-ot-flag"> OT</span>}
                  </div>
                  <div className="staff-mgr-row-bar">
                    <div
                      className={`staff-mgr-row-bar-fill ${isOT ? 'is-ot' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="staff-mgr-row-pills">
                  {(e.pending_ot_hours || 0) > 0 && (
                    <span className="staff-mgr-pill is-warn">
                      {e.pending_ot_hours}h OT pending
                    </span>
                  )}
                  {!e.active && <span className="staff-mgr-pill is-inactive">Inactive</span>}
                </div>

                <div className="staff-mgr-row-chevron">›</div>
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
};

export default StaffManager;
