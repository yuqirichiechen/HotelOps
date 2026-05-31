import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../auth';
import { useView } from '../../shells/ViewContext';

const ROLES = ['employee', 'front_desk', 'admin'];

const fmt     = (v) => v ?? '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—';
const fmtRate = (r) => r ? `$${parseFloat(r).toFixed(2)}/hr` : '—';

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

const fmtEntryDate = (iso) =>
  new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

// Sprint 13.6: visual overnight indicator. If clock-in and clock-out
// fall on different *local* days, render the row's date as
// "Mon, May 25 → Tue, May 26" so the operator can see at a glance
// that the entry spans midnight (image #19 only showed the
// clock-in day, which read as if the whole shift happened Monday).
const isOvernight = (inIso, outIso) => {
  if (!inIso || !outIso) return false;
  const a = new Date(inIso);
  const b = new Date(outIso);
  return a.getFullYear() !== b.getFullYear()
      || a.getMonth()    !== b.getMonth()
      || a.getDate()     !== b.getDate();
};
const fmtEntryDateRange = (inIso, outIso) => (
  isOvernight(inIso, outIso)
    ? `${fmtEntryDate(inIso)} → ${fmtEntryDate(outIso)}`
    : fmtEntryDate(inIso)
);

const hoursOf = (iso1, iso2) => {
  const start = new Date(iso1);
  const end   = iso2 ? new Date(iso2) : new Date();
  return (end - start) / 3600000;
};

const fmtHrs = (h) => {
  if (!h || isNaN(h)) return '—';
  const hours = Math.floor(h);
  const mins  = Math.round((h - hours) * 60);
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours)         return `${hours}h`;
  return `${mins}m`;
};

// Convert ISO timestamp to value usable by datetime-local input (YYYY-MM-DDTHH:MM)
// in the user's local timezone.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Sprint 11.2.1: `userId` comes from view params (set by StaffManager
// when an admin clicks a row), not from the URL. Back goes through
// the AdminShell's `goTo('staff')` instead of a URL navigation.
const StaffDetail = ({ userId }) => {
  const { goTo } = useView();

  const [emp,           setEmp]           = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [departments,   setDepartments]   = useState([]);
  const [editing,       setEditing]       = useState(false);
  const [form,          setForm]          = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [toggling,      setToggling]      = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error,         setError]         = useState('');
  const [pinBusy,       setPinBusy]       = useState(false);
  const [pinErr,        setPinErr]        = useState('');

  // Time entries (Sprint 5D)
  const [entries,    setEntries]    = useState([]);
  const [entryLoad,  setEntryLoad]  = useState(true);
  const [editEntry,  setEditEntry]  = useState(null);   // entry object being edited
  const [entryForm,  setEntryForm]  = useState({ in: '', out: '' });
  const [entrySave,  setEntrySave]  = useState(false);
  const [entryErr,   setEntryErr]   = useState('');

  // Performance dashboard (Sprint 6D)
  const [perf,       setPerf]       = useState(null);
  const [perfLoad,   setPerfLoad]   = useState(true);
  const [perfErr,    setPerfErr]    = useState('');
  const [period,     setPeriod]     = useState('week'); // 'week' | 'month' | 'year'

  // OT bulk approve (Sprint 6.2D)
  const [otBusy,     setOtBusy]     = useState(false);
  const [otMsg,      setOtMsg]      = useState('');

  const reloadEmployee = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch(`/admin/employees/${userId}`);
    if (ok && data?.success) setEmp(data.employee);
    setLoading(false);
  }, [userId]);

  const reloadEntries = useCallback(async () => {
    setEntryLoad(true);
    const res  = await fetch(`/api/admin/employees/${userId}/time-entries`);
    const data = await res.json();
    if (data.success) setEntries(data.timeEntries);
    setEntryLoad(false);
  }, [userId]);

  useEffect(() => {
    reloadEmployee();
    reloadEntries();
    fetch('/api/admin/departments').then(r => r.json()).then(d => {
      if (d.success) setDepartments(d.departments);
    });
  }, [reloadEmployee, reloadEntries]);

  // Performance fetch (re-runs when period changes)
  const reloadPerf = useCallback(async () => {
    setPerfLoad(true);
    setPerfErr('');
    // Sprint 13.6: pass the operator's local TZ offset so the
    // performance window aligns to the *operator's* week/month/year.
    const tzOff = new Date().getTimezoneOffset();
    const { ok, status, data } = await apiFetch(`/admin/staff/${userId}/performance?period=${period}&tz_offset_minutes=${tzOff}`);
    if (ok && data?.success) {
      setPerf(data);
    } else {
      setPerfErr(data?.message || `Could not load performance${status ? ` (HTTP ${status})` : ''}.`);
    }
    setPerfLoad(false);
  }, [userId, period]);

  useEffect(() => {
    let active = true;
    reloadPerf().then(() => { if (!active) return; });
    return () => { active = false; };
  }, [reloadPerf]);

  // Bulk-approve all OT in the displayed period.
  const approveOT = async () => {
    setOtBusy(true);
    setOtMsg('');
    // Sprint 13.6: same TZ alignment as performance fetch above.
    const tzOff = new Date().getTimezoneOffset();
    const { ok, data } = await apiFetch(`/admin/staff/${userId}/approve-ot?period=${period}&tz_offset_minutes=${tzOff}`, {
      method: 'POST',
    });
    setOtBusy(false);
    if (ok && data?.success) {
      setOtMsg(`Approved ${data.approvedCount} ${data.approvedCount === 1 ? 'entry' : 'entries'}.`);
      setTimeout(() => setOtMsg(''), 3000);
      reloadPerf();
    } else {
      setOtMsg(data?.message || 'Could not approve');
    }
  };

  // ── profile edit ──────────────────────────────────────────────────────────
  const startEdit = () => {
    setForm({
      name:           emp.name,
      phone:          emp.phone_number  || '',
      username:       emp.username      || '',
      employeeCode:   emp.employee_code || '',
      birthday:       emp.birthday ? emp.birthday.split('T')[0] : '',
      role:           emp.role,
      departmentId:   emp.department_id || '',
      hireDate:       emp.hire_date ? emp.hire_date.split('T')[0] : '',
      baseHourlyRate: emp.base_hourly_rate || '',
      preferredLanguage: emp.preferred_language || 'en',
    });
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setError(''); };

  const handleSave = async (e) => {
    e.preventDefault();
    // Sprint 9.1: birthday counts as a first-class identifier here too.
    if (!form.phone && !form.username && !form.employeeCode && !form.birthday) {
      setError('Provide at least one of phone, username, employee ID, or birthday');
      return;
    }
    setSaving(true);
    setError('');
    const res  = await fetch(`/api/admin/employees/${emp.user_id}`, {
      method:  'PUT',
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
        preferredLanguage: form.preferredLanguage || 'en',
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setEmp(prev => ({ ...prev, ...data.employee }));
      setEditing(false);
    } else {
      setError(data.message);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    setError('');
    const res  = await fetch(`/api/admin/employees/${emp.user_id}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !emp.active }),
    });
    const data = await res.json();
    setToggling(false);
    if (data.success) {
      setEmp(prev => ({ ...prev, active: !prev.active }));
      setConfirmDelete(false);
    } else {
      setError(data.message);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    const res  = await fetch(`/api/admin/employees/${emp.user_id}`, { method: 'DELETE' });
    const data = await res.json();
    setDeleting(false);
    if (data.success) goTo('staff');
    else              setError(data.message);
  };

  // ── PIN ───────────────────────────────────────────────────────────────────
  const togglePinRequired = async () => {
    setPinBusy(true);
    setPinErr('');
    const { ok, data } = await apiFetch(`/admin/employees/${emp.user_id}/pin`, {
      method: 'PATCH',
      body:   JSON.stringify({ pin_required: !emp.pin_required }),
    });
    setPinBusy(false);
    if (ok && data?.success) setEmp(prev => ({ ...prev, ...data.employee }));
    else                     setPinErr(data?.message || 'Could not update PIN setting');
  };

  const resetPin = async () => {
    if (!window.confirm(`Reset PIN for ${emp.name}? They'll be prompted to set a new one on their next login.`)) return;
    setPinBusy(true);
    setPinErr('');
    const { ok, data } = await apiFetch(`/admin/employees/${emp.user_id}/pin/reset`, {
      method: 'POST',
    });
    setPinBusy(false);
    if (ok && data?.success) setEmp(prev => ({ ...prev, ...data.employee }));
    else                     setPinErr(data?.message || 'Could not reset PIN');
  };

  // ── Hour override ─────────────────────────────────────────────────────────
  const openEntryEdit = (entry) => {
    setEditEntry(entry);
    setEntryForm({
      in:  toLocalInput(entry.clock_in_time),
      out: toLocalInput(entry.clock_out_time),
    });
    setEntryErr('');
  };

  const closeEntryEdit = () => {
    setEditEntry(null);
    setEntryErr('');
  };

  const saveEntryEdit = async (e) => {
    e.preventDefault();
    setEntrySave(true);
    setEntryErr('');
    // datetime-local gives a string like "2026-04-29T08:30" interpreted as
    // local time. Build a Date from it and send ISO (UTC) to the server.
    const inDate  = entryForm.in ? new Date(entryForm.in) : null;
    const outDate = entryForm.out ? new Date(entryForm.out) : null;
    if (!inDate || isNaN(inDate)) {
      setEntrySave(false);
      setEntryErr('Clock-in is required');
      return;
    }
    if (outDate && outDate <= inDate) {
      setEntrySave(false);
      setEntryErr('Clock-out must be after clock-in');
      return;
    }

    const { ok, data } = await apiFetch(`/admin/time-entries/${editEntry.entry_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        clock_in_time:  inDate.toISOString(),
        clock_out_time: outDate ? outDate.toISOString() : null,
      }),
    });
    setEntrySave(false);
    if (ok && data?.success) {
      closeEntryEdit();
      reloadEntries();
    } else {
      setEntryErr(data?.message || 'Could not save');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div className="emp-detail"><div className="emp-loading">Loading…</div></div>;
  if (!emp)    return (
    <div className="emp-detail">
      <div className="emp-detail-topbar">
        <button className="btn-back" onClick={() => goTo('staff')}>‹ Staff</button>
      </div>
      <div className="emp-empty">Staff not found.</div>
    </div>
  );

  const deptName = () =>
    departments.find(d => d.department_id === emp.department_id)?.name || emp.department || '—';

  // Recent entries (last 30, latest first)
  const recentEntries = entries.slice(0, 30);

  return (
    <div className="emp-detail">
      {/* Header */}
      <div className="emp-detail-topbar">
        <button className="btn-back" onClick={() => goTo('staff')}>‹ Staff</button>
        {!editing && <button className="btn-edit" onClick={startEdit}>Edit</button>}
      </div>

      {/* Profile card */}
      <div className="emp-detail-profile">
        <div className="emp-detail-avatar">{emp.name.charAt(0).toUpperCase()}</div>
        <div className="emp-detail-name">{emp.name}</div>
        <span className={`emp-badge ${emp.active ? 'badge-active' : 'badge-inactive'}`}>
          {emp.active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {error && <div className="admin-error" style={{ margin: '0 0 16px' }}>{error}</div>}

      {/* ── Performance dashboard (Sprint 6D) ─────────────────────────────── */}
      {!editing && (
        <section className="staff-perf">
          <div className="staff-perf-head">
            <h3 className="staff-perf-title">Performance</h3>
            <div className="staff-perf-tabs">
              {['week', 'month', 'year'].map(p => (
                <button
                  key={p}
                  type="button"
                  className={`staff-perf-tab${period === p ? ' is-active' : ''}`}
                  onClick={() => setPeriod(p)}
                >
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {perfErr && <div className="admin-error" style={{ margin: '0 0 12px' }}>{perfErr}</div>}

          <div className="staff-perf-stats">
            {/* Hours worked */}
            <div className="staff-perf-card">
              <div className="staff-perf-eyebrow">Hours worked</div>
              <div className="staff-perf-num">
                {perfLoad ? '—' : `${perf?.hoursWorked ?? 0}h`}
              </div>
              {perf?.comparison?.deltaPct != null ? (
                <div className={`staff-perf-delta ${perf.comparison.deltaPct >= 0 ? 'is-up' : 'is-down'}`}>
                  {perf.comparison.deltaPct >= 0 ? '↑' : '↓'} {Math.abs(Math.round(perf.comparison.deltaPct * 100))}%
                  <span className="staff-perf-delta-label">{perf.comparison.label}</span>
                </div>
              ) : (
                <div className="staff-perf-meta">
                  {perf?.comparison?.previousValue
                    ? `${perf.comparison.previousValue}h previous period`
                    : 'no prior data'}
                </div>
              )}
            </div>

            {/* On-time rate */}
            <div className="staff-perf-card">
              <div className="staff-perf-eyebrow">On-time rate</div>
              <div className="staff-perf-num">
                {perfLoad ? '—' : (perf?.onTimeRate != null ? `${Math.round(perf.onTimeRate * 100)}%` : '—')}
              </div>
              <div className="staff-perf-meta">
                {perf?.shiftsWorked
                  ? `${perf.shiftsOnTime || 0} of ${perf.shiftsWorked} on time`
                  : 'no shifts worked'}
              </div>
            </div>

            {/* Overtime */}
            <div className="staff-perf-card">
              <div className="staff-perf-eyebrow">Overtime</div>
              <div className={`staff-perf-num ${(perf?.hoursOvertimePending || 0) > 0 ? 'is-warn' : ''}`}>
                {perfLoad ? '—' : `${perf?.hoursOvertime ?? 0}h`}
              </div>
              <div className="staff-perf-meta">
                past {perf?.config?.overtime_threshold_hours ?? 40}h/wk
              </div>
              {(perf?.hoursOvertime ?? 0) > 0 && (
                <div className="staff-perf-ot-split">
                  <span className="staff-perf-ot-pending">
                    {perf.hoursOvertimePending}h pending
                  </span>
                  <span className="staff-perf-ot-dot">·</span>
                  <span className="staff-perf-ot-approved">
                    {perf.hoursOvertimeApproved}h approved
                  </span>
                </div>
              )}
              {(perf?.hoursOvertimePending ?? 0) > 0 && (
                <button
                  type="button"
                  className="staff-perf-ot-btn"
                  onClick={approveOT}
                  disabled={otBusy}
                >
                  {otBusy ? 'Approving…' : 'Approve OT'}
                </button>
              )}
              {otMsg && <div className="staff-perf-ot-msg">{otMsg}</div>}
            </div>

            {/* Shifts */}
            <div className="staff-perf-card">
              <div className="staff-perf-eyebrow">Shifts</div>
              <div className="staff-perf-num">
                {perfLoad ? '—' : (perf?.shiftsWorked ?? 0)}
              </div>
              <div className="staff-perf-meta">
                {perf
                  ? `${perf.shiftsMissed || 0} missed · ${perf.shiftsLate || 0} late`
                  : '—'}
              </div>
            </div>
          </div>

          {/* 8-week trend chart */}
          <div className="staff-perf-trend">
            <div className="staff-perf-trend-head">
              <span className="staff-perf-trend-title">Last 8 weeks</span>
              <span className="staff-perf-trend-sub">weekly hours</span>
            </div>
            <div className="staff-perf-bars">
              {(perf?.trend || Array.from({ length: 8 }, () => ({ hours: 0 }))).map((t, i) => {
                const max = Math.max(8, ...((perf?.trend || []).map(x => x.hours)));
                const pct = max > 0 ? (t.hours / max) * 100 : 0;
                const isOT = t.hours > (perf?.config?.overtime_threshold_hours || 40);
                return (
                  <div key={t.weekStart || i} className="staff-perf-bar-col">
                    <div className="staff-perf-bar-track">
                      <div
                        className={`staff-perf-bar-fill${isOT ? ' is-overtime' : ''}`}
                        style={{ height: `${pct}%`, opacity: t.hours ? 1 : 0.2 }}
                      />
                    </div>
                    <div className="staff-perf-bar-hours">{t.hours ? `${t.hours}h` : ''}</div>
                    <div className="staff-perf-bar-label">
                      {t.weekStart
                        ? new Date(t.weekStart + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })
                        : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Edit form */}
      {editing ? (
        <form className="add-form" onSubmit={handleSave}>
          <div className="add-form-grid">
            <div className="admin-field">
              <label>Full Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
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
            {/* Sprint 16.2: per-staff UI language. Drives every
                staff-facing screen post-login. */}
            <div className="admin-field">
              <label>Preferred language</label>
              <select
                value={form.preferredLanguage || 'en'}
                onChange={e => setForm(f => ({ ...f, preferredLanguage: e.target.value }))}
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="zh">中文</option>
              </select>
            </div>
            <div className="admin-field add-form-section">
              <div className="add-form-section-label">Login identifiers — at least one required</div>
              <div className="add-form-section-sub">Clear a field to remove that login method.</div>
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
              <span className="admin-field-hint">
                Optional. Staff can sign in by entering MMDDYYYY at the keypad if the property allows the birthday login method.
              </span>
            </div>
          </div>
          <div className="add-form-actions" style={{ gap: '10px' }}>
            <button type="button" className="btn-logout" onClick={cancelEdit}>Cancel</button>
            <button type="submit" className="btn-save" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      ) : (
        <div className="emp-detail-info-grid">
          <div className="detail-info-row"><span className="detail-info-lbl">Phone</span><span className="detail-info-val">{fmt(emp.phone_number)}</span></div>
          <div className="detail-info-row"><span className="detail-info-lbl">Username</span><span className="detail-info-val">{fmt(emp.username)}</span></div>
          <div className="detail-info-row"><span className="detail-info-lbl">Employee ID</span><span className="detail-info-val">{fmt(emp.employee_code)}</span></div>
          <div className="detail-info-row"><span className="detail-info-lbl">Birthday</span><span className="detail-info-val">{emp.birthday ? new Date(emp.birthday).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
          <div className="detail-info-row"><span className="detail-info-lbl">Role</span><span className="detail-info-val" style={{ textTransform: 'capitalize' }}>{emp.role.replace('_',' ')}</span></div>
          <div className="detail-info-row"><span className="detail-info-lbl">Department</span><span className="detail-info-val">{deptName()}</span></div>
          <div className="detail-info-row"><span className="detail-info-lbl">Hire Date</span><span className="detail-info-val">{fmtDate(emp.hire_date)}</span></div>
          <div className="detail-info-row"><span className="detail-info-lbl">Hourly Rate</span><span className="detail-info-val">{fmtRate(emp.base_hourly_rate)}</span></div>
        </div>
      )}

      {/* PIN management */}
      {!editing && (
        <div className="emp-pin-section">
          <h3 className="emp-pin-title">PIN Access</h3>

          <div className="emp-pin-row">
            <div className="emp-pin-info">
              <div className="emp-pin-label">Require PIN at sign-in</div>
              <div className="emp-pin-meta">
                {emp.pin_required
                  ? 'Employee must enter their PIN to log in.'
                  : 'Employee can log in with their identifier alone.'}
              </div>
            </div>
            <button
              className={`emp-pin-toggle ${emp.pin_required ? 'is-on' : ''}`}
              onClick={togglePinRequired}
              disabled={pinBusy}
              aria-label="Toggle PIN required"
            />
          </div>

          <div className="emp-pin-row">
            <div className="emp-pin-info">
              <div className="emp-pin-label">PIN status</div>
              <div className="emp-pin-meta">
                {emp.pin_must_set
                  ? 'Reset pending — employee will set a new PIN at next login.'
                  : emp.has_pin
                    ? 'PIN is set. You can reset it but cannot view it.'
                    : 'No PIN set yet.'}
              </div>
            </div>
            <button className="btn-pin-reset" onClick={resetPin} disabled={pinBusy}>
              {pinBusy ? '…' : 'Reset PIN'}
            </button>
          </div>

          {pinErr && <div className="admin-error" style={{ marginTop: 8 }}>{pinErr}</div>}
        </div>
      )}

      {/* Time entries — Sprint 5D */}
      {!editing && (
        <div className="emp-pin-section">
          <h3 className="emp-pin-title">Time Entries</h3>

          {entryLoad && <div className="emp-pin-meta">Loading…</div>}
          {!entryLoad && recentEntries.length === 0 && (
            <div className="emp-pin-meta">No time entries yet.</div>
          )}

          {!entryLoad && recentEntries.length > 0 && (
            <ul className="emp-entries-list">
              {recentEntries.map(e => {
                const hrs = e.clock_out_time ? hoursOf(e.clock_in_time, e.clock_out_time) : null;
                return (
                  <li key={e.entry_id} className="emp-entry-row">
                    <div className="emp-entry-main">
                      <div className="emp-entry-date">
                        {fmtEntryDateRange(e.clock_in_time, e.clock_out_time)}
                      </div>
                      <div className="emp-entry-times">
                        {fmtTime(e.clock_in_time)} → {e.clock_out_time
                          ? fmtTime(e.clock_out_time)
                          : <span className="emp-entry-open">in progress</span>}
                      </div>
                    </div>
                    <div className="emp-entry-hours">{e.clock_out_time ? fmtHrs(hrs) : '—'}</div>
                    <button
                      className="emp-entry-edit"
                      onClick={() => openEntryEdit(e)}
                      title="Override hours"
                    >
                      Edit
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Status + Delete actions */}
      {!editing && (
        <div className="emp-detail-actions">
          <button
            className={`btn-toggle-full ${emp.active ? 'btn-deactivate' : 'btn-activate'}`}
            onClick={handleToggle}
            disabled={toggling}
          >
            {toggling ? '…' : emp.active ? 'Deactivate Employee' : 'Activate Employee'}
          </button>

          {!emp.active && (
            confirmDelete ? (
              <div className="delete-confirm">
                <span>Permanently delete <strong>{emp.name}</strong>?</span>
                <div className="delete-confirm-btns">
                  <button className="btn-logout" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  <button className="btn-delete-confirm" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Yes, Delete'}
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-delete" onClick={() => setConfirmDelete(true)}>
                Delete Employee
              </button>
            )
          )}
        </div>
      )}

      {/* Entry edit modal */}
      {editEntry && (
        <div className="entry-edit-overlay" onClick={closeEntryEdit}>
          <form className="entry-edit-modal" onClick={e => e.stopPropagation()} onSubmit={saveEntryEdit}>
            <div className="entry-edit-header">
              <h3>Override Hours</h3>
              <button type="button" className="entry-edit-close" onClick={closeEntryEdit}>✕</button>
            </div>
            <p className="entry-edit-sub">
              Edit clock-in / clock-out for this shift. The change is logged to the audit trail.
            </p>
            <div className="entry-edit-fields">
              <label>
                <span>Clock In</span>
                <input
                  type="datetime-local"
                  value={entryForm.in}
                  onChange={e => setEntryForm(f => ({ ...f, in: e.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Clock Out</span>
                <input
                  type="datetime-local"
                  value={entryForm.out}
                  onChange={e => setEntryForm(f => ({ ...f, out: e.target.value }))}
                />
                <small>Leave blank to keep "in progress"</small>
              </label>
            </div>
            {entryErr && <div className="admin-error">{entryErr}</div>}
            <div className="entry-edit-actions">
              <button type="button" className="btn-logout" onClick={closeEntryEdit}>Cancel</button>
              <button type="submit" className="btn-save" disabled={entrySave}>
                {entrySave ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default StaffDetail;
