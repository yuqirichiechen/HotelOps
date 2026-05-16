import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../auth';

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

// Compute [from, to] (inclusive) for a named period — used by CSV export.
const periodRange = (period) => {
  const now = new Date();
  if (period === 'today') {
    const k = isoDay(now);
    return { from: k, to: k };
  }
  if (period === 'week') {
    const dow    = now.getDay() || 7;
    const monday = new Date(now); monday.setDate(now.getDate() - (dow - 1));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { from: isoDay(monday), to: isoDay(sunday) };
  }
  if (period === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(),     1);
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: isoDay(first), to: isoDay(last) };
  }
  // year
  return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
};

const StaffManager = () => {
  const nav = useNavigate();

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

  // CSV export popover (Sprint 6.4)
  const [csvOpen,    setCsvOpen]    = useState(false);
  const [csvBusy,    setCsvBusy]    = useState(false);
  const [csvPeriod,  setCsvPeriod]  = useState('week');     // today | week | month | year
  const [csvScope,   setCsvScope]   = useState('all');      // all | department | filtered
  const csvWrapRef = useRef(null);

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

  const handleAdd = async (e) => {
    e.preventDefault();
    // Sprint 7: at least one of phone / username / employee ID is required.
    // Server enforces too — this is just a friendlier early bail.
    if (!form.phone && !form.username && !form.employeeCode) {
      setFormError('Provide at least one of phone, username, or employee ID');
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

  const maxHours = Math.max(8, ...filtered.map(e => e.hours_this_week || 0));

  // ── CSV export ────────────────────────────────────────────────────────────
  const runExport = async () => {
    setCsvBusy(true);
    const { from, to } = periodRange(csvPeriod);

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
    }

    const { ok, data } = await apiFetch(`/admin/entries?${params.toString()}`);
    setCsvBusy(false);

    if (!ok || !data?.success) {
      alert(data?.message || 'Export failed.');
      return;
    }

    const rows = [['Name', 'Department', 'Date', 'Day', 'Clock In', 'Clock Out', 'Hours', 'Manual', 'OT Approved']];
    (data.entries || []).forEach(e => {
      const start = new Date(e.clock_in_time);
      rows.push([
        e.name,
        e.department || 'Unassigned',
        isoDay(start),
        start.toLocaleDateString([], { weekday: 'short' }),
        start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        e.clock_out_time
          ? new Date(e.clock_out_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          : 'In progress',
        e.clock_out_time ? e.hours.toFixed(2) : '',
        e.manual_entry ? 'Yes' : '',
        e.ot_approved  ? 'Yes' : '',
      ]);
    });

    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `staff-${scopeLabel}-${csvPeriod}-${from}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

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
        <button className="btn-back" onClick={() => nav('/admin')}>‹ Home</button>
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
              <div className="staff-mgr-export-title">Export CSV</div>

              <div className="staff-mgr-export-section">
                <div className="staff-mgr-export-label">Period</div>
                <div className="staff-mgr-export-period">
                  {[
                    { v: 'today', label: 'Today' },
                    { v: 'week',  label: 'Week'  },
                    { v: 'month', label: 'Month' },
                    { v: 'year',  label: 'Year'  },
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
                </div>
              </div>

              <button
                type="button"
                className="staff-mgr-export-go"
                onClick={runExport}
                disabled={csvBusy || (csvScope === 'department' && !deptScopeAvailable)}
              >
                {csvBusy ? 'Exporting…' : 'Download CSV'}
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
            const pct = maxHours > 0 ? ((e.hours_this_week || 0) / maxHours) * 100 : 0;
            return (
              <li
                key={e.user_id}
                className={`staff-mgr-row ${e.active ? '' : 'is-inactive'}`}
                onClick={() => nav(`/admin/staff/${e.user_id}`)}
              >
                <div className="staff-mgr-avatar">
                  {(e.name || '?').charAt(0).toUpperCase()}
                </div>

                <div className="staff-mgr-row-info">
                  <div className="staff-mgr-row-name">{e.name}</div>
                  <div className="staff-mgr-row-meta">
                    <span style={{ textTransform: 'capitalize' }}>{fmtRole(e.role)}</span>
                    <span className="staff-mgr-row-dot">·</span>
                    <span>{e.department || 'Unassigned'}</span>
                    <span className="staff-mgr-row-dot">·</span>
                    <span>Hired {fmtHireDate(e.hire_date)}</span>
                  </div>
                </div>

                <div className="staff-mgr-row-hours">
                  <div className="staff-mgr-row-hours-num">{e.hours_this_week || 0}h</div>
                  <div className="staff-mgr-row-bar">
                    <div className="staff-mgr-row-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="staff-mgr-row-pills">
                  {e.is_on_clock && (
                    <span className="staff-mgr-pill is-live">
                      <span className="staff-mgr-pill-dot" /> On the clock
                    </span>
                  )}
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
