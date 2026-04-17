import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const NAV = [
  { to: '/',            label: 'Time Clock',      icon: '⏱️', live: true  },
  { to: '/admin',       label: 'Admin',           icon: '⚙️', live: false },
  { to: '/scheduling',  label: 'Scheduling',      icon: '📅', live: false },
  { to: '/forecasting', label: 'Forecasting',     icon: '🏨', live: false },
  { to: '/shift-notes', label: 'Shift Notes',     icon: '📋', live: false },
];

const Sidebar = () => (
  <nav className="sidebar">
    <div className="sidebar-brand">
      <span className="brand-icon">🏨</span>
      <span className="brand-name">HotelOps</span>
    </div>

    <ul className="sidebar-nav">
      {NAV.map(({ to, label, icon, live }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={to === '/'}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
            {live && <span className="live-dot" title="Live" />}
          </NavLink>
        </li>
      ))}
    </ul>

    <div className="sidebar-footer">
      <span>Spring 2026</span>
    </div>
  </nav>
);

export default Sidebar;
