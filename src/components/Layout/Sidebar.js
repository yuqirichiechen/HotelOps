import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const NAV = [
  { to: '/',            label: 'Time Clock',  icon: '⏱️', live: true  },
  { to: '/scheduling',  label: 'Scheduling',  icon: '📅', live: false },
  { to: '/forecasting', label: 'Forecasting', icon: '🏨', live: false },
  { to: '/shift-notes', label: 'Shift Notes', icon: '📋', live: false },
  { to: '/admin',       label: 'Admin',       icon: '⚙️', live: false, admin: true },
];

const Sidebar = () => (
  <>
    {/* Desktop sidebar */}
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-icon">🏨</span>
        <span className="brand-name">HotelOps</span>
      </div>
      <ul className="sidebar-nav">
        {NAV.map(({ to, label, icon, live, admin }) => (
          <li key={to} className={admin ? 'sidebar-admin-item' : ''}>
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
    </nav>

    {/* Mobile bottom tab bar */}
    <nav className="bottom-nav">
      {NAV.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
        >
          <span className="bottom-nav-icon">{icon}</span>
          <span className="bottom-nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  </>
);

export default Sidebar;
