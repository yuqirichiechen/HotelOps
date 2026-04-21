import React from 'react';

const MODULES = [
  { key: 'employees',    label: 'Employee Management', icon: '👥', desc: 'Add, edit and manage staff',          live: true  },
  { key: 'scheduling',   label: 'Scheduling',          icon: '📅', desc: 'Assign shifts, view weekly & monthly calendar', live: true  },
  { key: 'forecasting',  label: 'Forecasting',         icon: '🏨', desc: 'Occupancy & demand forecasting',      live: false },
  { key: 'shift-notes',  label: 'Shift Notes',         icon: '📋', desc: 'Team communication & logs',          live: false },
  { key: 'reports',      label: 'Reports',             icon: '📊', desc: 'Payroll & performance reports',       live: false },
];

const AdminHome = ({ onNavigate, onLogout }) => (
  <div className="admin-home">
    <div className="admin-home-header">
      <div className="admin-home-title">
        <div className="admin-home-icon">⚙️</div>
        <div>
          <h2>Admin Panel</h2>
          <p>Snoqualmie Inn Management</p>
        </div>
      </div>
      <button className="btn-logout" onClick={onLogout}>Sign Out</button>
    </div>

    <div className="admin-modules-grid">
      {MODULES.map(m => (
        <div
          key={m.key}
          className={`admin-module-card ${m.live ? 'module-live' : 'module-soon'}`}
          onClick={m.live ? () => onNavigate(m.key) : undefined}
        >
          <div className="module-icon">{m.icon}</div>
          <div className="module-info">
            <div className="module-label">{m.label}</div>
            <div className="module-desc">{m.desc}</div>
          </div>
          {m.live
            ? <span className="module-arrow">›</span>
            : <span className="module-badge-soon">Soon</span>
          }
        </div>
      ))}
    </div>
  </div>
);

export default AdminHome;
