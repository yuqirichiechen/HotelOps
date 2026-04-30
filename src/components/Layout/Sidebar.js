import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth';
import './Sidebar.css';

// Two NAV sets: admins get an admin-focused sidebar (Home → Employees → ...)
// when their role is 'admin'. Staff get the worker sidebar otherwise.
// Sign-out lives in /settings (staff) and /admin/settings (admin) — not here.

const STAFF_NAV = [
  { to: '/',            label: 'Home',        icon: '🏠', live: true,  end: true },
  { to: '/timesheet',   label: 'Timesheet',   icon: '⏱️', live: true  },
  { to: '/calendar',    label: 'Calendar',    icon: '📅', live: true  },
  { to: '/shift-notes', label: 'Shift Notes', icon: '📝', live: false },
  { to: '/settings',    label: 'Settings',    icon: '⚙️', live: false },
];

const ADMIN_NAV = [
  { to: '/admin',             label: 'Home',        icon: '🏠', live: true,  end: true },
  { to: '/admin/staff',       label: 'Staff',       icon: '👥', live: true  },
  { to: '/admin/scheduling',  label: 'Scheduling',  icon: '📅', live: true  },
  { to: '/admin/shift-notes', label: 'Shift Notes', icon: '📝', live: false },
  { to: '/admin/reports',     label: 'Reports',     icon: '📊', live: false },
  { to: '/admin/settings',    label: 'Settings',    icon: '⚙️', live: true  },
];

const Sidebar = ({ theme, onToggleTheme }) => {
  const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === null && osDark);
  const { user } = useAuth();

  const NAV = user?.role === 'admin' ? ADMIN_NAV : STAFF_NAV;

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">🏨</span>
          <span className="brand-name">HotelOps</span>
        </div>
        <ul className="sidebar-nav">
          {NAV.map(({ to, label, icon, live, end }) => (
            <li key={to}>
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
