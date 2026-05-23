import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, useAuth } from '../../auth';
import './Sidebar.css';

// Sprint 11.2.1: sidebar is now props-driven. The owning shell
// (StaffShell or AdminShell) passes the nav list, the current view
// name, and an onNavigate(viewName) callback that flips internal
// view state — no URL changes inside the app. The sidebar no longer
// knows or cares about routes; the URL stays put at
// `/:tenant/{staff,admin}` while staff move between Home, Timesheet,
// Calendar, Settings (and admins between Home, Staff, Calendar,
// Reports, Assistant, Settings).
//
// Sprint 9.3.3: sign-out moved into the sidebar footer so it's
// reachable from every authed page without a detour to Settings.
// 11.2.1 simplifies the logout target — single `/:slug/login`
// (combined staff + manager login) instead of the per-role variants.
//
// Sprint 10.2: unread handoff-notes badge on the Calendar item.
// Polled every 60s while the sidebar is mounted; light enough not
// to need WebSocket plumbing for the capstone surface.

const Sidebar = ({
  navItems = [],
  currentView,
  onNavigate,
  role = 'staff',
  theme,
  onToggleTheme,
}) => {
  const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === null && osDark);
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const tick = () => {
      apiFetch('/handoff-notes/unread-count').then(({ data }) => {
        if (cancelled) return;
        if (data?.success) setUnread(data.count || 0);
      }).catch(() => { /* ignore — keep last value */ });
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user]);

  const handleSignOut = async () => {
    // Sprint 11.2.1: route to the per-tenant combined login. If the
    // slug is missing (cleared localStorage), fall through to the
    // picker at `/`.
    const slug = typeof window !== 'undefined'
      ? localStorage.getItem('hotelops-tenant-slug')
      : null;
    const loginPath = slug ? `/${slug}/login` : '/';
    await logout();
    nav(loginPath, { replace: true });
  };

  const handleClick = (viewName) => () => {
    if (typeof onNavigate === 'function') onNavigate(viewName);
  };

  const isActive = (item) => currentView === item.view;

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">🏨</span>
          <span className="brand-name">HotelOps</span>
        </div>
        <ul className="sidebar-nav">
          {navItems.map((item) => (
            <li key={item.view}>
              <button
                type="button"
                onClick={handleClick(item.view)}
                className={`sidebar-link${isActive(item) ? ' active' : ''}`}
                aria-current={isActive(item) ? 'page' : undefined}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="sidebar-nav-label">{item.label}</span>
                {item.view === 'calendar' && unread > 0 && (
                  <span
                    className="sidebar-unread-badge"
                    title={`${unread} unread handoff${unread === 1 ? '' : 's'}`}
                  >
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
                {item.live && <span className="live-dot" title="Live" />}
              </button>
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
        {navItems.map((item) => (
          <button
            key={item.view}
            type="button"
            onClick={handleClick(item.view)}
            className={`bottom-nav-item${isActive(item) ? ' active' : ''}`}
            aria-current={isActive(item) ? 'page' : undefined}
          >
            <span className="bottom-nav-icon">
              {item.icon}
              {item.view === 'calendar' && unread > 0 && (
                <span className="bottom-nav-unread-dot" aria-label={`${unread} unread`} />
              )}
            </span>
            <span className="bottom-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
};

export default Sidebar;
