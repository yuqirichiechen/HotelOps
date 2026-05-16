import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { AuthProvider, RequireRole, RedirectIfAuthed } from './auth';
import Sidebar from './components/Layout/Sidebar';
import ShiftsView from './components/ShiftsView';
import ShiftNotes from './components/ShiftNotes';
import StaffLogin from './pages/Login/StaffLogin';
import AdminLogin from './pages/Login/AdminLogin';
import Home from './pages/Home';
import Timesheet from './pages/Timesheet';
import Settings from './pages/Settings';
import SetPin from './pages/SetPin';
import AdminHome from './pages/AdminHome';
import AdminReports from './pages/AdminReports';
import AdminShiftNotes from './pages/AdminShiftNotes';
import StaffManager from './components/AdminPanel/StaffManager';
import StaffDetail from './components/AdminPanel/StaffDetail';
import SchedulingManager from './components/AdminPanel/Scheduling';
import AdminSettings from './components/AdminPanel/AdminSettings';
import './App.css';
import './components/AdminPanel/AdminPanel.css';

// Tiny helper component: redirect /admin/employees/:userId → /admin/staff/:userId
// while preserving the userId param.
const NavStaff = () => {
  const { userId } = useParams();
  return <Navigate to={`/admin/staff/${userId}`} replace />;
};

const getInitialTheme = () => {
  const stored = localStorage.getItem('hotelops-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return null;
};

const AppShell = ({ theme, onToggleTheme }) => (
  <div className="app-shell">
    <Sidebar theme={theme} onToggleTheme={onToggleTheme} />
    <main className="app-main">
      <Outlet />
    </main>
  </div>
);

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
          {/* ── Public login routes ─────────────────────────────────────── */}
          {/* Sprint 9: each login route also accepts an optional /:tenant
              slug prefix (e.g. /snoqualmieinn/login/staff). The slug is
              looked up against KNOWN_TENANTS in src/config/tenant.js for
              branding — the backend is still single-tenant-per-deployment
              under one DATABASE_URL. Future tenants get a deployment of
              their own pointing at their own Postgres DB on the same
              shared server. */}
          <Route path="/login/staff" element={
            <RedirectIfAuthed><StaffLogin /></RedirectIfAuthed>
          } />
          <Route path="/:tenant/login/staff" element={
            <RedirectIfAuthed><StaffLogin /></RedirectIfAuthed>
          } />
          <Route path="/login/admin" element={
            <RedirectIfAuthed><AdminLogin /></RedirectIfAuthed>
          } />
          <Route path="/:tenant/login/admin" element={
            <RedirectIfAuthed><AdminLogin /></RedirectIfAuthed>
          } />

          {/* ── Set-PIN interstitial (auth required, no sidebar) ────────── */}
          <Route path="/set-pin" element={
            <RequireRole role="staff"><SetPin theme={theme} onToggleTheme={toggleTheme} /></RequireRole>
          } />

          {/* ── Admin (role: admin) ─────────────────────────────────────── */}
          <Route element={
            <RequireRole role="admin">
              <AppShell theme={theme} onToggleTheme={toggleTheme} />
            </RequireRole>
          }>
            <Route path="/admin"                   element={<AdminHome />} />
            <Route path="/admin/staff"             element={<StaffManager />} />
            <Route path="/admin/staff/:userId"     element={<StaffDetail />} />
            {/* Legacy /admin/employees → /admin/staff */}
            <Route path="/admin/employees"         element={<Navigate to="/admin/staff" replace />} />
            <Route path="/admin/employees/:userId" element={<NavStaff />} />
            <Route path="/admin/scheduling"        element={<SchedulingManager />} />
            <Route path="/admin/shift-notes"       element={<AdminShiftNotes />} />
            <Route path="/admin/reports"           element={<AdminReports />} />
            <Route path="/admin/settings"          element={<AdminSettings />} />
          </Route>

          {/* ── Staff (any non-admin authed) ────────────────────────────── */}
          <Route element={
            <RequireRole role="staff">
              <AppShell theme={theme} onToggleTheme={toggleTheme} />
            </RequireRole>
          }>
            <Route path="/"            element={<Home />} />
            <Route path="/timesheet"   element={<Timesheet />} />
            <Route path="/calendar"    element={<ShiftsView />} />
            <Route path="/shift-notes" element={<ShiftNotes />} />
            <Route path="/settings"    element={<Settings theme={theme} onToggleTheme={toggleTheme} />} />
            {/* Legacy redirects */}
            <Route path="/shifts"    element={<Navigate to="/calendar" replace />} />
            <Route path="/timeclock" element={<Navigate to="/" replace />} />
          </Route>

          {/* ── Catch-all ───────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
