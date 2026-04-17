import React, { useState, useEffect } from 'react';

const ROLES = ['employee', 'front_desk', 'admin'];
const today = () => new Date().toISOString().split('T')[0];

const emptyForm = () => ({
  name: '', phone: '', role: 'employee',
  departmentId: '', hireDate: today(), baseHourlyRate: '',
});

const EmployeeManager = ({ onLogout }) => {
  const [employees,   setEmployees]   = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showAdd,     setShowAdd]     = useState(false);
  const [form,        setForm]        = useState(emptyForm());
  const [formError,   setFormError]   = useState('');
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/employees').then(r => r.json()),
      fetch('/api/admin/departments').then(r => r.json()),
    ]).then(([emp, dept]) => {
      if (emp.success)  setEmployees(emp.employees);
      if (dept.success) setDepartments(dept.departments);
      setLoading(false);
    });
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    const res  = await fetch('/api/admin/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:           form.name,
        phoneNumber:    form.phone,
        role:           form.role,
        hireDate:       form.hireDate,
        departmentId:   form.departmentId   || null,
        baseHourlyRate: form.baseHourlyRate || null,
      }),
    });
    const data = await res.json();
    setFormLoading(false);
    if (data.success) {
      setEmployees(prev => [...prev, data.employee]);
      setShowAdd(false);
      setForm(emptyForm());
    } else {
      setFormError(data.message);
    }
  };

  const toggleStatus = async (emp) => {
    const res  = await fetch(`/api/admin/employees/${emp.user_id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !emp.active }),
    });
    const data = await res.json();
    if (data.success) {
      setEmployees(prev =>
        prev.map(e => e.user_id === emp.user_id ? { ...e, active: !e.active } : e)
      );
    }
  };

  const deptName = (id) =>
    departments.find(d => d.department_id === id)?.name || '—';

  return (
    <div className="emp-manager">
      {/* Header */}
      <div className="emp-header">
        <div className="emp-header-left">
          <h2>Employee Management</h2>
          <span className="emp-count">{employees.length} employees</span>
        </div>
        <div className="emp-header-right">
          <button className="btn-add" onClick={() => { setShowAdd(s => !s); setFormError(''); }}>
            {showAdd ? '✕ Cancel' : '+ Add Employee'}
          </button>
          <button className="btn-logout" onClick={onLogout}>Sign Out</button>
        </div>
      </div>

      {/* Add employee form */}
      {showAdd && (
        <form className="add-form" onSubmit={handleAdd}>
          <div className="add-form-grid">
            <div className="admin-field">
              <label>Full Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Jane Smith"
                required
              />
            </div>
            <div className="admin-field">
              <label>Phone Number *</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g,'').slice(0,10) }))}
                placeholder="10 digits"
                required
              />
            </div>
            <div className="admin-field">
              <label>Role *</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => (
                  <option key={r} value={r}>{r.replace('_',' ')}</option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label>Department</label>
              <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}>
                <option value="">— None —</option>
                {departments.map(d => (
                  <option key={d.department_id} value={d.department_id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label>Hire Date *</label>
              <input
                type="date"
                value={form.hireDate}
                onChange={e => setForm(f => ({ ...f, hireDate: e.target.value }))}
                required
              />
            </div>
            <div className="admin-field">
              <label>Hourly Rate ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.baseHourlyRate}
                onChange={e => setForm(f => ({ ...f, baseHourlyRate: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>
          {formError && <div className="admin-error">{formError}</div>}
          <div className="add-form-actions">
            <button type="submit" className="btn-save" disabled={formLoading}>
              {formLoading ? 'Saving…' : 'Save Employee'}
            </button>
          </div>
        </form>
      )}

      {/* Employee list */}
      {loading ? (
        <div className="emp-loading">Loading employees…</div>
      ) : employees.length === 0 ? (
        <div className="emp-empty">No employees yet. Add one above.</div>
      ) : (
        <div className="emp-list">
          {employees.map(emp => (
            <div key={emp.user_id} className={`emp-card ${emp.active ? '' : 'emp-inactive'}`}>
              <div className="emp-card-main">
                <div className="emp-avatar">
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div className="emp-info">
                  <div className="emp-name">{emp.name}</div>
                  <div className="emp-meta">
                    {emp.phone_number} · {emp.role.replace('_',' ')} · {emp.department || deptName(emp.department_id)}
                  </div>
                </div>
              </div>
              <div className="emp-card-actions">
                <span className={`emp-badge ${emp.active ? 'badge-active' : 'badge-inactive'}`}>
                  {emp.active ? 'Active' : 'Inactive'}
                </span>
                <button
                  className={`btn-toggle ${emp.active ? 'btn-deactivate' : 'btn-activate'}`}
                  onClick={() => toggleStatus(emp)}
                >
                  {emp.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmployeeManager;
