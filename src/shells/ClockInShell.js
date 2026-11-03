import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { apiFetch, useAuth } from '../auth';
import Home from '../pages/Home';

// Sprint 24.1: the CLOCK IN door (`/:tenant/clockin`) — what the numpad sign-in opens. It is only the clock: no sidebar, no timesheet /
// calendar / settings (those moved to the staff portal, `/:tenant/staff`, which every employee reaches with "Staff login"). The old
// multi-page staff shell (StaffShell) is gone; its pages are served by StaffPortalShell. The kiosk behaviour is unchanged: the
// focused-action screen, the auto-signout countdown after clocking, and the shell-level idle sign-out below.

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

const ClockInShell = () => {
  useShellIdleLogout();
  return (
    <div className="clockin-shell">
      <main className="clockin-main">
        <Home />
      </main>
    </div>
  );
};

export default ClockInShell;
