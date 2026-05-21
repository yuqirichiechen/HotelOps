import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import './Sidebar.css';

// Two NAV sets: admins get an admin-focused sidebar (Home → Employees → ...)
// when their role is 'admin'. Staff get the worker sidebar otherwise.
// Sprint 9.3.3: sign-out moved into the sidebar footer (under the theme
// toggle) so it's reachable from every authed page without a detour to
// Settings. Settings still hosts its own sign-out for redundancy. The
// route lands on the user's *tenant*'s login (not the picker) via the
// `hotelops-tenant-slug` localStorage hint from 9.3.2.

// Sprint 10: "Shift Notes" entry removed from both nav arrays —
// handoff notes now live in the Calendar surface's bottom drawer.
// Old URLs (/shift-notes, /admin/shift-notes) redirect to the
// corresponding Calendar route via <Navigate> in App.js for one
// cycle. "Scheduling" relabelled "Calendar" on the admin side; the
// staff side already had "Calendar."
const STAFF_NAV = [
  { to: '/',            label: 'Home',        icon: '🏠', live: true,  end: true },
  { to: '/timesheet',   label: 'Timesheet',   icon: '⏱️', live: true  },
  { to: '/calendar',    label: 'Calendar',    icon: '📅', live: true  },
  { to: '/settings',    label: 'Settings',    icon: '⚙️', live: false },
];

const ADMIN_NAV = [
  { to: '/admin',             label: 'Home',        icon: '🏠', live: true,  end: true },
  { to: '/admin/staff',       label: 'Staff',       icon: '👥', live: true  },
  { to: '/admin/calendar',    label: 'Calendar',    icon: '📅', live: true  },
  { to: '/admin/reports',     label: 'Reports',     icon: '📊', live: false },
  { to: '/admin/settings',    label: 'Settings',    icon: '⚙️', live: true  },
];

const Sidebar = ({ theme, onToggleTheme }) => {
  const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === null && osDark);
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const NAV = user?.role === 'admin' ? ADMIN_NAV : STAFF_NAV;
  const role = user?.role === 'admin' ? 'admin' : 'staff';

  const handleSignOut = async () => {
    // Read tenant slug BEFORE logout, then route to the per-tenant
    // login page (or fall back to the picker if no slug is stored).
    const slug = typeof window !== 'undefined'
      ? localStorage.getItem('hotelops-tenant-slug')
      : null;
    const loginPath = slug ? `/${slug}/login/${role}` : `/login/${role}`;
    await logout();
    nav(loginPath, { replace: true });
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
          <button className="sidebar-signout" onClick={handleSignOut} title="Sign out">
            <span className="sidebar-signout-icon" aria-hidden>↩</span>
            <span className="sidebar-signout-label">Sign out</span>
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
