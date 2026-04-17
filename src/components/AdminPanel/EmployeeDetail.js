import React, { useState, useEffect } from 'react';

const ROLES = ['employee', 'front_desk', 'admin'];

const fmt = (val) => val ?? '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—';
const fmtRate = (r) => r ? `$${parseFloat(r).toFixed(2)}/hr` : '—';

const EmployeeDetail = ({ employee, onBack, onLogout }) => {
  const [emp,           setEmp]           = useState(employee);
  const [departments,   setDepartments]   = useState([]);
  const [editing,       setEditing]       = useState(false);
  const [form,          setForm]          = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [toggling,      setToggling]      = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error,         setError]         = useState('');

  useEffect(() => {
    fetch('/api/admin/departments').then(r => r.json()).then(data => {
      if (data.success) setDepartments(data.departments);
    });
  }, []);

  const startEdit = () => {
    setForm({
      name:          emp.name,
      phone:         emp.phone_number,
      role:          emp.role,
      departmentId:  emp.department_id || '',
      hireDate:      emp.hire_date ? emp.hire_date.split('T')[0] : '',
      baseHourlyRate: emp.base_hourly_rate || '',
    });
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setError(''); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res  = await fetch(`/api/admin/employees/${emp.user_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name, phoneNumber: form.phone, role: form.role,
        hireDate: form.hireDate, departmentId: form.departmentId || null,
        baseHourlyRate: form.baseHourlyRate || null,
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
      method: 'PATCH',
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
    if (data.success) {
      onBack();
    } else {
      setError(data.message);
    }
  };

  const deptName = () =>
    departments.find(d => d.department_id === emp.department_id)?.name || emp.department || '—';

  return (
    <div className="emp-detail">
      {/* Header */}
      <div className="emp-detail-topbar">
        <button className="btn-back" onClick={onBack}>‹ Employees</button>
        {!editing && (
          <button className="btn-edit" onClick={startEdit}>Edit</button>
        )}
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

      {/* Edit form */}
      {editing ? (
        <form className="add-form" onSubmit={handleSave}>
          <div className="add-form-grid">
            <div className="admin-field">
              <label>Full Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="admin-field">
              <label>Phone Number *</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g,'').slice(0,10) }))} required />
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
          <div className="add-form-actions" style={{ gap: '10px' }}>
            <button type="button" className="btn-logout" onClick={cancelEdit}>Cancel</button>
            <button type="submit" className="btn-save" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      ) : (
        <div className="emp-detail-info-grid">
          <div className="detail-info-row"><span className="detail-info-lbl">Phone</span><span className="detail-info-val">{fmt(emp.phone_number)}</span></div>
          <div className="detail-info-row"><span className="detail-info-lbl">Role</span><span className="detail-info-val" style={{ textTransform: 'capitalize' }}>{emp.role.replace('_',' ')}</span></div>
          <div className="detail-info-row"><span className="detail-info-lbl">Department</span><span className="detail-info-val">{deptName()}</span></div>
          <div className="detail-info-row"><span className="detail-info-lbl">Hire Date</span><span className="detail-info-val">{fmtDate(emp.hire_date)}</span></div>
          <div className="detail-info-row"><span className="detail-info-lbl">Hourly Rate</span><span className="detail-info-val">{fmtRate(emp.base_hourly_rate)}</span></div>
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
    </div>
  );
};

export default EmployeeDetail;
