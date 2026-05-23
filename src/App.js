import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { AuthProvider, RequireRole, RedirectIfAuthed, useAuth } from './auth';
import Sidebar from './components/Layout/Sidebar';
import ShiftsView from './components/ShiftsView';
import StaffCalendar from './pages/StaffCalendar';
import NotesPage from './pages/NotesPage';
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
import Assistant from './pages/Assistant';
import StaffManager from './components/AdminPanel/StaffManager';
import StaffDetail from './components/AdminPanel/StaffDetail';
// Sprint 10.3: folder rename Scheduling/ → Calendar/ for consistency
// with the user-facing /admin/calendar route. Component name kept as
// SchedulingManager (the export's identifier hasn't been renamed
// yet — that's a separate touch-the-world rename worth deferring
// until the file's other refactor work lands).
import SchedulingManager from './components/AdminPanel/Calendar';
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

const AppShell = ({ theme, onToggleTheme, children }) => (
  <div className="app-shell">
    <Sidebar theme={theme} onToggleTheme={onToggleTheme} />
    <main className="app-main">
      {children ?? <Outlet />}
    </main>
  </div>
);

// Sprint 11.2: `/` is now the property picker for unauthed visitors
// and the staff Home for authed staff. Admins hitting `/` get bounced
// to `/admin` (their proper landing). This collapses the two old
// no-slug picker URLs (`/login/staff`, `/login/admin`) into one
// canonical entry point — the URL the kiosk loads on boot is also
// the URL the picker lives on.
const RootRoute = ({ theme, onToggleTheme }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <TenantPicker kind="staff" />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  return (
    <AppShell theme={theme} onToggleTheme={onToggleTheme}>
      <Home />
    </AppShell>
  );
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
          {/* ── Public root + per-tenant login ──────────────────────────── */}
          {/* Sprint 11.2: collapsed the old `/login/staff` + `/login/admin`
              no-slug picker routes into a single canonical `/`. RootRoute
              picks between picker / Home / admin redirect based on auth
              state. Per-tenant logins still live at `/:tenant/login/*`. */}
          <Route path="/" element={<RootRoute theme={theme} onToggleTheme={toggleTheme} />} />
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
            <Route path="/admin/calendar/notes"    element={<NotesPage />} />
            <Route path="/admin/scheduling"        element={<Navigate to="/admin/calendar" replace />} />
            {/* Sprint 10 → 10.3: admin Shift Notes folded into the
                Calendar's handoffs drawer; original page deleted.
                Redirect kept for stale bookmarks. */}
            <Route path="/admin/shift-notes"       element={<Navigate to="/admin/calendar" replace />} />
            <Route path="/admin/reports"           element={<AdminReports />} />
            {/* Sprint 10.3: Assistant placeholder route. Real
                surface (local LLM + RAG) lands in Sprint 11+. */}
            <Route path="/admin/assistant"         element={<Assistant />} />
            <Route path="/admin/settings"          element={<AdminSettings />} />
          </Route>

          {/* ── Staff (any non-admin authed) ────────────────────────────── */}
          {/* Sprint 11.2: `/` is no longer in this wrapper — RootRoute
              above owns the root and renders Home directly when staff
              are authed (or the picker when they're not). */}
          <Route element={
            <RequireRole role="staff">
              <AppShell theme={theme} onToggleTheme={toggleTheme} />
            </RequireRole>
          }>
            <Route path="/timesheet"   element={<Timesheet />} />
            {/* Sprint 10.1: /calendar now serves the new authed
                StaffCalendar (Week + Day, with handoffs drawer).
                The legacy kiosk ShiftsView (phone-keypad flow) is
                moved to /kiosk for any property that still wants a
                shared-tablet lookup; everyday authed staff land on
                /calendar. */}
            <Route path="/calendar"       element={<StaffCalendar />} />
            <Route path="/calendar/notes" element={<NotesPage />} />
            <Route path="/kiosk"       element={<ShiftsView />} />
            {/* Sprint 10 → 10.3: /shift-notes was folded into the
                Calendar's handoffs drawer; the original page is
                deleted. Redirect kept for stale bookmarks. */}
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
