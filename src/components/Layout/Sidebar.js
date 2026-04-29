import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth';
import './Sidebar.css';

// Final order: Home → Time Clock → Calendar → Shift Notes → Settings.
// Forecasting moved under /admin. Sign out lives in /settings now, not the
// sidebar footer. Admin tab is appended for admin users only.

const STAFF_NAV = [
  { to: '/',            label: 'Home',        icon: '🏠', live: true,  end: true },
  { to: '/timeclock',   label: 'Time Clock',  icon: '⏱️', live: true  },
  { to: '/calendar',    label: 'Calendar',    icon: '📅', live: true  },
  { to: '/shift-notes', label: 'Shift Notes', icon: '📝', live: false },
  { to: '/settings',    label: 'Settings',    icon: '⚙️', live: false },
];

const ADMIN_ITEM = {
  to: '/admin', label: 'Admin', icon: '🛠️', live: true, admin: true,
};

const Sidebar = ({ theme, onToggleTheme }) => {
  const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === null && osDark);
  const { user } = useAuth();

  const NAV = user?.role === 'admin' ? [...STAFF_NAV, ADMIN_ITEM] : STAFF_NAV;

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">🏨</span>
          <span className="brand-name">HotelOps</span>
        </div>
        <ul className="sidebar-nav">
          {NAV.map(({ to, label, icon, live, admin, end }) => (
            <li key={to} className={admin ? 'sidebar-admin-item' : ''}>
              <NavLink
                to={to}
                end={end || to === '/'}
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              >
                <span className="nav-icon">{icon}</span>
                <span className="sidebar-nav-label">{label}</span>
                {live && <span className="live-dot" title="Live" />}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={onToggleTheme} title="Toggle theme">
            <span className="theme-toggle-icon">{isDark ? '☀️' : '🌙'}</span>
            <span className="theme-toggle-label">{isDark ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="bottom-nav">
        {NAV.map(({ to, label, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end || to === '/'}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <span className="bottom-nav-icon">{icon}</span>
            <span className="bottom-nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
};

export default Sidebar;
