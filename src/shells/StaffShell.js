import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ViewProvider, useView } from './ViewContext';
import { apiFetch, useAuth } from '../auth';
import Sidebar from '../components/Layout/Sidebar';
import Home from '../pages/Home';
import Timesheet from '../pages/Timesheet';
import StaffCalendar from '../pages/StaffCalendar';
import NotesPage from '../pages/NotesPage';
import Settings from '../pages/Settings';

// Sprint 11.2.1: the staff side of the app is a single URL
// (`/:tenant/staff`). Sidebar clicks set view state instead of
// navigating; the URL never changes after login.

// Sprint 11.6: nav `icon` is now an icon *base name* — Sidebar
// resolves it to `/logo/<base>_<dark|light>.png` based on the
// active theme. PNGs live in /public/logo/.
const NAV = [
  { view: 'home',      label: 'Home',      icon: 'home',      live: true },
  { view: 'timesheet', label: 'Timesheet', icon: 'timesheet', live: true },
  { view: 'calendar',  label: 'Calendar',  icon: 'calendar',  live: true },
  { view: 'settings',  label: 'Settings',  icon: 'settings' },
];

const VIEWS = {
  home:      Home,
  timesheet: Timesheet,
  calendar:  StaffCalendar,
  notes:     NotesPage,
  settings:  Settings,
};

// Sub-views map to which sidebar item should appear "active" while
// they're on screen — e.g. NotesPage is reached from Calendar, so
// the Calendar nav stays highlighted while you're reading notes.
const ACTIVE_PARENT = {
  notes: 'calendar',
};

// Sprint 16.7: shell-level idle auto-logout. Was only firing on
// FocusedAction; the GM reported staff who navigated to
// Timesheet / Calendar / Settings could leave their session
// open indefinitely. This hook listens to pointer/key/touch/
// scroll events at the document level — any of them resets a
// baseline timestamp. A 500ms tick reads the latest baseline
// + idle setting from refs and fires logout once
// (now - baseline) >= idleSeconds.
//
// idleSeconds is fetched from /api/me on mount. Falls back to
// 15 s if the request fails so the safety net still applies.
const useShellIdleLogout = () => {
  const { logout } = useAuth();
  const nav = useNavigate();
  const [idleSeconds, setIdleSeconds] = useState(15);
  const baselineRef     = useRef(Date.now());
  const idleSecondsRef  = useRef(15);
  idleSecondsRef.current = idleSeconds;
  const firedRef        = useRef(false);

  // Pull the setting from /api/me once on mount.
  useEffect(() => {
    apiFetch('/me').then(({ ok, data }) => {
      if (ok && data?.success && Number.isFinite(data.idleLogoutSeconds)) {
        setIdleSeconds(data.idleLogoutSeconds);
      }
    }).catch(() => { /* keep the 15 s default */ });
  }, []);

  // Reset baseline on any user activity. Passive listeners +
  // window-level so it catches events even when child surfaces
  // don't propagate.
  useEffect(() => {
    const reset = () => { baselineRef.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'touchstart', 'mousemove', 'scroll'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true, capture: true }));
    return () => events.forEach(e => window.removeEventListener(e, reset, { capture: true }));
  }, []);

  // Sign-out flow matches Home's handleAutoSignout — slug
  // lookup, View-Transitions fade, fallback to instant nav.
  const fireLogout = useCallback(async () => {
    if (firedRef.current) return;
    firedRef.current = true;
    const slug = localStorage.getItem('hotelops-tenant-slug');
    const loginPath = slug ? `/${slug}/login` : '/';
    await logout();
    if (typeof document !== 'undefined' && document.startViewTransition) {
      document.documentElement.dataset.signingOut = 'true';
      const t = document.startViewTransition(() => {
        flushSync(() => nav(loginPath, { replace: true }));
      });
      t.finished.finally(() => { delete document.documentElement.dataset.signingOut; });
    } else {
      nav(loginPath, { replace: true });
    }
  }, [logout, nav]);

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = (Date.now() - baselineRef.current) / 1000;
      if (elapsed >= idleSecondsRef.current) {
        clearInterval(id);
        fireLogout();
      }
    }, 500);
    return () => clearInterval(id);
  }, [fireLogout]);
};

const Body = ({ theme, onToggleTheme }) => {
  const { view, goTo } = useView();
  // Sprint 16.7: shell-level idle auto-logout fires regardless of
  // which staff view is on screen.
  useShellIdleLogout();
  const Component = VIEWS[view.name] || VIEWS.home;
  const activeNav = ACTIVE_PARENT[view.name] || view.name;
  return (
    <div className="app-shell">
      <Sidebar
        navItems={NAV}
        currentView={activeNav}
        onNavigate={goTo}
        role="staff"
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <main className="app-main">
        <Component theme={theme} onToggleTheme={onToggleTheme} role="staff" {...view.params} />
      </main>
    </div>
  );
};

const StaffShell = ({ theme, onToggleTheme }) => (
  <ViewProvider initialView="home">
    <Body theme={theme} onToggleTheme={onToggleTheme} />
  </ViewProvider>
);

export default StaffShell;
