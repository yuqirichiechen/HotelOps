import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const ROLES       = ['employee', 'front_desk', 'admin'];
const UNASSIGNED  = { department_id: '__none__', name: 'Unassigned' };
const today       = () => new Date().toISOString().split('T')[0];
const emptyForm   = () => ({ name: '', phone: '', role: 'employee', departmentId: '', hireDate: today(), baseHourlyRate: '' });

const StaffManager = () => {
  const nav = useNavigate();
  const [employees,   setEmployees]   = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showAdd,     setShowAdd]     = useState(false);
  const [expanded,    setExpanded]    = useState(new Set());
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
        name: form.name, phoneNumber: form.phone, role: form.role,
        hireDate: form.hireDate, departmentId: form.departmentId || null,
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

  const toggleDept = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Group employees by department; unassigned bucket at the end
  const groups = useMemo(() => {
    const map = new Map();
    [...departments, UNASSIGNED].forEach(d => map.set(d.department_id, { dept: d, emps: [] }));

    employees.forEach(emp => {
      const key = emp.department_id || '__none__';
      if (map.has(key)) map.get(key).emps.push(emp);
      else              map.get('__none__').emps.push(emp);
    });

    return [...map.values()].filter(g => g.emps.length > 0);
  }, [employees, departments]);

  const active   = employees.filter(e => e.active).length;
  const inactive = employees.length - active;

  return (
    <div className="emp-manager">

      {/* Header */}
      <div className="emp-header">
        <div className="emp-header-left">
          <button className="btn-back" onClick={() => nav('/admin')}>‹ Home</button>
          <h2>Staff</h2>
        </div>
        <div className="emp-header-right">
          <button className="btn-add" onClick={() => { setShowAdd(s => !s); setFormError(''); }}>
            {showAdd ? '✕ Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="emp-stats">
        <div className="emp-stat">
          <span className="stat-num">{employees.length}</span>
          <span className="stat-lbl">Total</span>
        </div>
        <div className="emp-stat">
          <span className="stat-num stat-active">{active}</span>
          <span className="stat-lbl">Active</span>
        </div>
        <div className="emp-stat">
          <span className="stat-num stat-inactive">{inactive}</span>
          <span className="stat-lbl">Inactive</span>
        </div>
      </div>

      {/* Add employee form */}
      {showAdd && (
        <form className="add-form" onSubmit={handleAdd}>
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
              {formLoading ? 'Saving…' : 'Save Employee'}
            </button>
          </div>
        </form>
      )}

      {/* Department accordion groups */}
      {loading ? (
        <div className="emp-loading">Loading employees…</div>
      ) : groups.length === 0 ? (
        <div className="emp-empty">No employees yet. Add one above.</div>
      ) : (
        <div className="dept-groups">
          {groups.map(({ dept, emps }) => {
            const isOpen     = expanded.has(dept.department_id);
            const activeN    = emps.filter(e => e.active).length;
            const inactiveN  = emps.length - activeN;

            return (
              <div key={dept.department_id} className={`dept-group ${isOpen ? 'dept-open' : ''}`}>

                {/* Accordion header — full-width tap target */}
                <button className="dept-header" onClick={() => toggleDept(dept.department_id)}>
                  <div className="dept-avatar">
                    {dept.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="dept-info">
                    <span className="dept-name">{dept.name}</span>
                    <div className="dept-badges">
                      {activeN > 0 && (
                        <span className="dept-badge badge-active">{activeN} active</span>
                      )}
                      {inactiveN > 0 && (
                        <span className="dept-badge badge-inactive">{inactiveN} inactive</span>
                      )}
                    </div>
                  </div>
                  <span className={`dept-chevron ${isOpen ? 'chevron-open' : ''}`}>›</span>
                </button>

                {/* Collapsible employee list — CSS grid trick for smooth animation */}
                <div className={`dept-employees ${isOpen ? 'dept-employees-open' : ''}`}>
                  <div className="dept-employees-inner">
                    {emps.map(emp => (
                      <div
                        key={emp.user_id}
                        className={`emp-card emp-card-clickable ${emp.active ? '' : 'emp-inactive'}`}
                        onClick={() => nav(`/admin/staff/${emp.user_id}`)}
                      >
                        <div className="emp-card-main">
                          <div className="emp-avatar">{emp.name.charAt(0).toUpperCase()}</div>
                          <div className="emp-info">
                            <div className="emp-name">{emp.name}</div>
                            <div className="emp-meta">{emp.role.replace('_', ' ')}</div>
                          </div>
                        </div>
                        <div className="emp-card-actions">
                          <span className={`emp-badge ${emp.active ? 'badge-active' : 'badge-inactive'}`}>
                            {emp.active ? 'Active' : 'Inactive'}
                          </span>
                          <span className="emp-chevron">›</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StaffManager;
