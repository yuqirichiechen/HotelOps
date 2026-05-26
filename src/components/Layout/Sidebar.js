import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, useAuth } from '../../auth';
import { KNOWN_TENANTS, DEFAULT_TENANT_SLUG } from '../../config/tenant';
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

  // Sprint 11.6: nav icons are theme-aware PNGs in `/public/logo/`.
  // Filename pattern: `<base>_<dark|light>.png` — the suffix names
  // the *target theme*, not the icon's content color (mirrors the
  // existing HotelOps logo convention). The sidebar bg is dark in
  // both themes, but we still swap per theme so designers can tweak
  // per-mode strokes/contrast without code changes.
  const iconSrc = (base) =>
    `/logo/${base}_${isDark ? 'dark' : 'light'}.png`;

  // Sprint 11.6: desktop brand block now shows the tenant logo (the
  // property the user is signed into) with a small "powered by
  // HotelOps" tagline beneath. Tenant resolved from the same
  // localStorage slug the rest of the app uses; fall through to the
  // default tenant if the slug is missing.
  const slug = (typeof window !== 'undefined'
    && localStorage.getItem('hotelops-tenant-slug'))
    || DEFAULT_TENANT_SLUG;
  const tenant = KNOWN_TENANTS[slug] || KNOWN_TENANTS[DEFAULT_TENANT_SLUG];

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          {tenant?.logoUrl ? (
            <span className="sidebar-brand-logo-wrap">
              <img
                src={tenant.logoUrl}
                alt={tenant.name}
                className="sidebar-brand-logo"
              />
            </span>
          ) : (
            <span className="sidebar-brand-name">{tenant?.name || 'HotelOps'}</span>
          )}
          <div className="sidebar-brand-powered">powered by HotelOps</div>
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
                <img
                  className="nav-icon-img"
                  src={iconSrc(item.icon)}
                  alt=""
                  aria-hidden="true"
                />
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
              <img
                className="bottom-nav-icon-img"
                src={iconSrc(item.icon)}
                alt=""
                aria-hidden="true"
              />
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
