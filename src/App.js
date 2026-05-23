import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireRole, RedirectIfAuthed, useAuth } from './auth';
import { DEFAULT_TENANT_SLUG } from './config/tenant';
import ShiftsView from './components/ShiftsView';
import TenantLogin from './pages/Login/TenantLogin';
import TenantPicker from './pages/Login/TenantPicker';
import DevLogin from './pages/Login/DevLogin';
import DevPanel from './pages/Dev/DevPanel';
import SetPin from './pages/SetPin';
import StaffShell from './shells/StaffShell';
import AdminShell from './shells/AdminShell';
import './App.css';
import './components/AdminPanel/AdminPanel.css';

const getInitialTheme = () => {
  const stored = localStorage.getItem('hotelops-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return null;
};

// Sprint 11.2.1: `/` is the picker for unauthed visitors, and a
// redirect for authed ones — staff land on `/:slug/staff`, admins
// on `/:slug/admin`. The slug comes from localStorage (every
// successful login persists it). Fallback to the default tenant
// slug only if localStorage has somehow been cleared — paranoid;
// the login flow always writes it.
const RootRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <TenantPicker kind="staff" />;
  const stored = typeof window !== 'undefined'
    ? localStorage.getItem('hotelops-tenant-slug')
    : null;
  const slug = stored || DEFAULT_TENANT_SLUG;
  return <Navigate to={user.role === 'admin' ? `/${slug}/admin` : `/${slug}/staff`} replace />;
};

const App = () => {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const html = document.documentElement;
    if (theme) html.setAttribute('data-theme', theme);
    else       html.removeAttribute('data-theme');
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      const osDark        = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const currentlyDark = prev === 'dark' || (prev === null && osDark);
      const next          = currentlyDark ? 'light' : 'dark';
      localStorage.setItem('hotelops-theme', next);
      return next;
    });
  };

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Root: picker or redirect to per-tenant shell ────────────── */}
          <Route path="/" element={<RootRoute />} />

          {/* ── Combined per-tenant login ───────────────────────────────── */}
          {/* Sprint 11.2.1: single URL for both staff and manager
              sign-in. TenantLogin holds the role-toggle state and
              renders StaffLogin or AdminLogin in-place; the URL
              stays at `/:tenant/login` regardless of which mode
              is on screen. */}
          <Route path="/:tenant/login" element={
            <RedirectIfAuthed><TenantLogin /></RedirectIfAuthed>
          } />

          {/* ── Per-tenant single-URL shells ────────────────────────────── */}
          {/* Sprint 11.2.1: `/:tenant/staff` and `/:tenant/admin` are
              static post-login URLs. All in-app navigation
              (Home/Timesheet/Calendar/…, or AdminHome/Staff/
              StaffDetail/Calendar/Notes/Reports/Assistant/Settings)
              happens via internal view state — the URL never changes
              after login. See `shells/{StaffShell,AdminShell}.js`. */}
          <Route path="/:tenant/staff" element={
            <RequireRole role="staff">
              <StaffShell theme={theme} onToggleTheme={toggleTheme} />
            </RequireRole>
          } />
          <Route path="/:tenant/admin" element={
            <RequireRole role="admin">
              <AdminShell theme={theme} onToggleTheme={toggleTheme} />
            </RequireRole>
          } />

          {/* ── Dev sign-in + panel (out-of-band) ───────────────────────── */}
          <Route path="/login/dev" element={<DevLogin />} />
          <Route path="/dev"       element={<DevPanel />} />

          {/* ── Set-PIN interstitial (auth required, no shell) ──────────── */}
          <Route path="/set-pin" element={
            <RequireRole role="staff"><SetPin theme={theme} onToggleTheme={toggleTheme} /></RequireRole>
          } />

          {/* ── Legacy kiosk lookup (no shell — shared-tablet view) ─────── */}
          {/* Sprint 10.1 kept this for any property that still wants a
              phone-keypad-only walk-up surface. Out of the per-tenant
              shell on purpose: it's role-free shared-device territory. */}
          <Route path="/kiosk" element={
            <RequireRole role="staff"><ShiftsView /></RequireRole>
          } />

          {/* ── Catch-all ───────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
