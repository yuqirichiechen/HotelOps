import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// List-as-dashboard pattern (Sprint 6.3): clickable stats banner drives the
// list filter, rich rows show this-week metrics inline, Add Staff is a
// low-key tile at the bottom that inline-expands the existing form.

const ROLES     = ['employee', 'front_desk', 'admin'];
const today     = () => new Date().toISOString().split('T')[0];
const emptyForm = () => ({
  name: '', phone: '', role: 'employee',
  departmentId: '', hireDate: today(), baseHourlyRate: '',
});

const fmtHireDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString([], { month: 'short', year: 'numeric' });
};

const fmtRole = (r) => (r || '').replace('_', ' ');

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
  const [statFilter,      setStatFilter]      = useState('all'); // 'all' | 'on-clock' | 'pending-ot'
  const [includeInactive, setIncludeInactive] = useState(false);

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

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    const res  = await fetch('/api/admin/employees', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name, phoneNumber: form.phone, role: form.role,
        hireDate: form.hireDate, departmentId: form.departmentId || null,
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

  // ── Stats (across all employees, regardless of filters) ───────────────────
  const stats = useMemo(() => ({
    total:     employees.filter(e => e.active).length,
    onClock:   employees.filter(e => e.is_on_clock).length,
    weekHours: Math.round(employees.reduce((s, e) => s + (e.hours_this_week || 0), 0) * 10) / 10,
    pendingOT: Math.round(employees.reduce((s, e) => s + (e.pending_ot_hours || 0), 0) * 10) / 10,
  }), [employees]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(e => {
      if (!includeInactive && !e.active) return false;
      if (selectedDept !== 'all') {
        const key = e.department_id == null ? '__none__' : String(e.department_id);
        if (key !== selectedDept) return false;
      }
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (statFilter === 'on-clock'   && !e.is_on_clock)            return false;
      if (statFilter === 'pending-ot' && (e.pending_ot_hours || 0) === 0) return false;
      return true;
    });
  }, [employees, search, selectedDept, statFilter, includeInactive]);

  const maxHours = Math.max(8, ...filtered.map(e => e.hours_this_week || 0));

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
          {
            key: 'on-clock',   eyebrow: 'On the clock',
            value: loading ? '—' : stats.onClock,
            meta: stats.onClock ? 'right now' : 'no one',
            tone: stats.onClock ? 'live' : null,    clickable: true,
          },
          {
            key: 'hours',      eyebrow: 'Hours this week',
            value: loading ? '—' : stats.weekHours,
            meta: 'across all staff',  clickable: false,
          },
          {
            key: 'pending-ot', eyebrow: 'Pending OT',
            value: loading ? '—' : `${stats.pendingOT}h`,
            meta: stats.pendingOT > 0 ? 'awaiting review' : 'all approved',
            tone: stats.pendingOT > 0 ? 'warn' : null,
            clickable: stats.pendingOT > 0,
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
              {isSelected && <div className="staff-mgr-stat-arrow" aria-hidden />}
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

        <label className="staff-mgr-toggle">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={e => setIncludeInactive(e.target.checked)}
          />
          <span>Include inactive</span>
        </label>
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

      {/* Add staff tile — low-key, expands inline */}
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
                <label>Phone Number *</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g,'').slice(0,10) }))} placeholder="10 digits" required />
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

    </div>
  );
};

export default StaffManager;
