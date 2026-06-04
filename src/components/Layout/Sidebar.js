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

// Sprint 17.4: 3-dots SVG for the mobile "More" tab. Inline so we
// don't need a new PNG in /public/logo. Stroke uses currentColor so
// the active/inactive color of the tab applies automatically.
const MoreIcon = () => (
  <svg
    width="22" height="22" viewBox="0 0 24 24" fill="none"
    aria-hidden="true" focusable="false"
  >
    <circle cx="5"  cy="12" r="1.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" />
  </svg>
);

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
  // Sprint 17.4: mobile "More" sheet open/closed state.
  const [moreOpen, setMoreOpen] = useState(false);
  // Sprint 15.10: cost optimization. Was a hard 60s poll, which
  // (combined with AdminHome's 60s refresh) kept the DB compute
  // alive all day on what's essentially a notification badge.
  // Refresh on mount + on window focus instead — the unread count
  // doesn't need to update while the GM has the tab in the
  // background or is on another device.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refetch = () => {
      apiFetch('/handoff-notes/unread-count').then(({ data }) => {
        if (cancelled) return;
        if (data?.success) setUnread(data.count || 0);
      }).catch(() => { /* ignore — keep last value */ });
    };
    refetch();
    window.addEventListener('focus', refetch);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refetch);
    };
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

  // Sprint 11.6.2: icons are theme-agnostic now — single white-on-
  // transparent PNG per nav item, no `_dark` / `_light` suffix. The
  // sidebar bg is dark in both themes so a single light icon set is
  // legible everywhere. Files live in `/public/logo/<base>.png`,
  // pre-trimmed so each icon's content fills the canvas (the GM's
  // AI-generated source had inconsistent inner padding — see
  // Sprint 11.6.2 log).
  const iconSrc = (base) => `/logo/${base}.png`;

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

      {/* Mobile bottom tab bar.
          Sprint 17.4: only items flagged `mobilePrimary` render
          inline; everything else collapses into a "More" tab that
          opens a bottom sheet. Avoids the 7-icon overflow that
          happened after Sprint 17.3 added the Forecast nav item. */}
      {(() => {
        const primary    = navItems.filter(i => i.mobilePrimary);
        const moreItems  = navItems.filter(i => !i.mobilePrimary);
        const moreActive = moreItems.some(i => i.view === currentView);
        const calendarInMore = moreItems.some(i => i.view === 'calendar');

        const closeMoreThen = (fn) => (...args) => {
          setMoreOpen(false);
          if (typeof fn === 'function') fn(...args);
        };

        return (
          <>
            <nav className="bottom-nav">
              {primary.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  onClick={closeMoreThen(handleClick(item.view))}
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
              {moreItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMoreOpen(prev => !prev)}
                  className={`bottom-nav-item bottom-nav-more${(moreActive || moreOpen) ? ' active' : ''}`}
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  aria-label="More navigation"
                >
                  <span className="bottom-nav-icon">
                    <MoreIcon />
                    {/* Surface the calendar unread badge on More
                        when Calendar lives inside it — keeps the
                        unread cue visible even when the tab is
                        collapsed. */}
                    {calendarInMore && unread > 0 && (
                      <span className="bottom-nav-unread-dot" aria-label={`${unread} unread`} />
                    )}
                  </span>
                  <span className="bottom-nav-label">More</span>
                </button>
              )}
            </nav>

            {moreOpen && (
              <>
                <div
                  className="more-sheet-backdrop"
                  onClick={() => setMoreOpen(false)}
                  aria-hidden="true"
                />
                <div className="more-sheet" role="menu" aria-label="More navigation">
                  <div className="more-sheet-handle" aria-hidden="true" />
                  <ul className="more-sheet-list">
                    {moreItems.map((item) => (
                      <li key={item.view} role="none">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={closeMoreThen(handleClick(item.view))}
                          className={`more-sheet-item${isActive(item) ? ' active' : ''}`}
                        >
                          <span className="more-sheet-icon">
                            <img
                              src={iconSrc(item.icon)}
                              alt=""
                              aria-hidden="true"
                            />
                            {item.view === 'calendar' && unread > 0 && (
                              <span className="more-sheet-unread-dot" aria-label={`${unread} unread`} />
                            )}
                          </span>
                          <span className="more-sheet-label">{item.label}</span>
                          {item.live && <span className="more-sheet-livedot" title="Live" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <hr className="more-sheet-divider" />
                  <div className="more-sheet-actions">
                    <button
                      className="more-sheet-action"
                      onClick={() => { setMoreOpen(false); onToggleTheme && onToggleTheme(); }}
                      role="menuitem"
                    >
                      <span className="more-sheet-action-icon">{isDark ? '☀️' : '🌙'}</span>
                      <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
                    </button>
                    <button
                      className="more-sheet-action more-sheet-signout"
                      onClick={() => { setMoreOpen(false); handleSignOut(); }}
                      role="menuitem"
                    >
                      <span className="more-sheet-action-icon" aria-hidden>↩</span>
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        );
      })()}
    </>
  );
};

export default Sidebar;
