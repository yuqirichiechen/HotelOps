import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import './Sidebar.css';

const STAFF_NAV = [
  { to: '/',            label: 'Time Clock',  icon: '⏱️', live: true  },
  { to: '/shifts',      label: 'Shifts',      icon: '📋', live: true  },
  { to: '/forecasting', label: 'Forecasting', icon: '🏨', live: false },
  { to: '/shift-notes', label: 'Shift Notes', icon: '📝', live: false },
];

const ADMIN_ITEM = { to: '/admin', label: 'Admin', icon: '⚙️', live: true, admin: true };

const Sidebar = ({ theme, onToggleTheme }) => {
  const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === null && osDark);
  const { user, logout } = useAuth();
  const nav = useNavigate();

  // Show Admin tab only to admin users.
  const NAV = user?.role === 'admin' ? [...STAFF_NAV, ADMIN_ITEM] : STAFF_NAV;

  const handleSignOut = async () => {
    await logout();
    nav(user?.role === 'admin' ? '/login/admin' : '/login/staff', { replace: true });
  };

  return (
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
          <button className="theme-toggle sidebar-signout" onClick={handleSignOut} title="Sign out">
            <span className="theme-toggle-icon">↩</span>
            <span className="theme-toggle-label">Sign out</span>
          </button>
        </div>
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
};

export default Sidebar;
