import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { AuthProvider, RequireRole, RedirectIfAuthed } from './auth';
import Sidebar from './components/Layout/Sidebar';
import ShiftsView from './components/ShiftsView';
import StaffCalendar from './pages/StaffCalendar';
// Sprint 10: ShiftNotes / AdminShiftNotes no longer rendered — both
// routes now <Navigate>-redirect into the Calendar surface. The
// components themselves are kept on disk for one cycle (10.3 deletes
// them along with this comment) so any unmerged branch with deep
// imports doesn't break.
// import ShiftNotes from './components/ShiftNotes';
import StaffLogin from './pages/Login/StaffLogin';
import AdminLogin from './pages/Login/AdminLogin';
import TenantPicker from './pages/Login/TenantPicker';
import DevLogin from './pages/Login/DevLogin';
import DevPanel from './pages/Dev/DevPanel';
import Home from './pages/Home';
import Timesheet from './pages/Timesheet';
import Settings from './pages/Settings';
import SetPin from './pages/SetPin';
import AdminHome from './pages/AdminHome';
import AdminReports from './pages/AdminReports';
// import AdminShiftNotes from './pages/AdminShiftNotes';  // Sprint 10: folded into Calendar; see ShiftNotes import note above.
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
          {/* Sprint 9 / 9.1.1: bare /login/* hits the TenantPicker (a list
              of registered properties). Only /:tenant/login/* shows the
              actual branded login. This prevents the bare URL from
              auto-branding as the first/default tenant, which surprised
              the GM ("why does this hotel's URL show our name without
              the slug?"). Single-property deploys can short-circuit the
              picker via DNS/Nginx redirecting bare /login/* to their
              slug. */}
          <Route path="/login/staff" element={
            <RedirectIfAuthed><TenantPicker kind="staff" /></RedirectIfAuthed>
          } />
          <Route path="/login/admin" element={
            <RedirectIfAuthed><TenantPicker kind="admin" /></RedirectIfAuthed>
          } />
          <Route path="/:tenant/login/staff" element={
            <RedirectIfAuthed><StaffLogin /></RedirectIfAuthed>
          } />
          <Route path="/:tenant/login/admin" element={
            <RedirectIfAuthed><AdminLogin /></RedirectIfAuthed>
          } />

          {/* Sprint 9.2: Dev sign-in + panel. Dev auth is client-side
              (hardcoded dev/dev), not server-backed for this sprint. */}
          <Route path="/login/dev" element={<DevLogin />} />
          <Route path="/dev"       element={<DevPanel />} />

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
            {/* Sprint 10: "Scheduling" surface renamed to "Calendar"
                in the nav. Old /admin/scheduling URL kept as a
                redirect for one cycle (any stale bookmark or hand-
                typed URL still lands somewhere useful). */}
            <Route path="/admin/calendar"          element={<SchedulingManager />} />
            <Route path="/admin/scheduling"        element={<Navigate to="/admin/calendar" replace />} />
            {/* Sprint 10: Shift Notes folded into Calendar. Old route
                redirects to Calendar where the handoffs drawer lives. */}
            <Route path="/admin/shift-notes"       element={<Navigate to="/admin/calendar" replace />} />
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
            {/* Sprint 10.1: /calendar now serves the new authed
                StaffCalendar (Week + Day, with handoffs drawer).
                The legacy kiosk ShiftsView (phone-keypad flow) is
                moved to /kiosk for any property that still wants a
                shared-tablet lookup; everyday authed staff land on
                /calendar. */}
            <Route path="/calendar"    element={<StaffCalendar />} />
            <Route path="/kiosk"       element={<ShiftsView />} />
            {/* Sprint 10: /shift-notes is folded into Calendar. The
                legacy ShiftNotes page still renders for one cycle in
                case any in-app deep link points here; 10.3 deletes
                the component entirely and turns this into a redirect.
                For now route to /calendar so new clicks land on the
                merged surface. */}
            <Route path="/shift-notes" element={<Navigate to="/calendar" replace />} />
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
