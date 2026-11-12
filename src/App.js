import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireRole, RequireDev, RedirectIfAuthed, useAuth, homePathFor } from './auth';
import { LanguageProvider } from './i18n';
import { LoginThemeContext, THEME_KEY } from './pages/Login/loginTheme';
import { DEFAULT_TENANT_SLUG } from './config/tenant';
import ShiftsView from './components/ShiftsView';
import TenantLogin from './pages/Login/TenantLogin';
import TenantPicker from './pages/Login/TenantPicker';
import SetPin from './pages/SetPin';
import ClockInShell from './shells/ClockInShell';         // Sprint 24.1: the Clock in door — only the clock (/:tenant/clockin)
import StaffPortalShell from './shells/StaffPortalShell'; // Sprint 24: staff portal (/:tenant/staff)
import AdminShell from './shells/AdminShell';
import './App.css';
import './components/AdminPanel/AdminPanel.css';

const getInitialTheme = () => {
  const stored = localStorage.getItem('hotelops-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return null;
};

// Sprint 11.2.1: `/` is the picker for unauthed visitors, and a
// redirect for authed ones — staff land on `/:slug/clockin` or `/:slug/staff` (Sprint 24), admins
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
  if (user.role === 'dev') return <Navigate to="/dev" replace />;   // Sprint 22.4
  return <Navigate to={homePathFor(user, slug)} replace />;
};

// Sprint 27.1: the old out-of-band dev sign-in URL → the property's login page, already on "Developer sign-in".
const DevLoginRedirect = () => {
  const slug = (typeof window !== 'undefined' && localStorage.getItem('hotelops-tenant-slug')) || DEFAULT_TENANT_SLUG;
  return <Navigate to={`/${slug}/login?mode=dev`} replace />;
};

// Sprint 16.2: bridges the authed user's `preferred_language`
// into the i18n LanguageProvider. Lives inside AuthProvider so
// it can `useAuth`. When no user is signed in, the provider falls
// back to localStorage / browser language so the login screen
// still translates correctly.
const I18nBridge = ({ children }) => {
  const { user } = useAuth();
  return (
    <LanguageProvider fromUser={user?.preferred_language}>
      {children}
    </LanguageProvider>
  );
};

const App = () => {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const html = document.documentElement;
    if (theme) html.setAttribute('data-theme', theme);
    else       html.removeAttribute('data-theme');
  }, [theme]);

  // Sprint 27.5: the Inntrio login picks light / dark explicitly (click the logo); same saved key as the in-app toggle
  const chooseTheme = (next) => {
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
    setTheme(next);
  };

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
        <I18nBridge>
        <LoginThemeContext.Provider value={{ theme, setTheme: chooseTheme }}>
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
          {/* Sprint 24 / 24.1: two doors for non-admin users (same staff credentials). `/:tenant/clockin` = clock in / out ONLY (the numpad
              sign-in; kiosk behaviour, short idle sign-out). `/:tenant/staff` = the staff portal for everyone (Home with hours, Timesheet,
              Calendar, Settings — no clocking) plus, for the Front Desk department, today's forecast tiles and Housekeeping. Which door
              a person gets depends on the sign-in screen they used ('Clock in' vs 'Staff login'). */}
          <Route path="/:tenant/clockin" element={
            <RequireRole role="staff">
              <ClockInShell />
            </RequireRole>
          } />
          <Route path="/:tenant/staff" element={
            <RequireRole role="staff">
              <StaffPortalShell theme={theme} onToggleTheme={toggleTheme} />
            </RequireRole>
          } />
          <Route path="/:tenant/admin" element={
            <RequireRole role="admin">
              <AdminShell theme={theme} onToggleTheme={toggleTheme} />
            </RequireRole>
          } />

          {/* ── Dev sign-in + panel (out-of-band) ───────────────────────── */}
          {/* Sprint 27.1: Developer sign-in is one of the Inntrio access choices (`/:tenant/login`); this old URL (and RequireDev's redirect) lands there. */}
          <Route path="/login/dev" element={<DevLoginRedirect />} />
          {/* Sprint 22.6: dev sign-in → choose a property → the SAME admin shell as managers, plus the Dev tools group. */}
          <Route path="/dev"       element={<RequireDev><TenantPicker kind="dev" /></RequireDev>} />

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
        </LoginThemeContext.Provider>
        </I18nBridge>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
