import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, RequireRole, RedirectIfAuthed } from './auth';
import Sidebar from './components/Layout/Sidebar';
import TimeClock from './components/TimeClock';
import AdminPanel from './components/AdminPanel';
import ShiftsView from './components/ShiftsView';
import Forecasting from './components/Forecasting';
import ShiftNotes from './components/ShiftNotes';
import StaffLogin from './pages/Login/StaffLogin';
import AdminLogin from './pages/Login/AdminLogin';
import './App.css';

const getInitialTheme = () => {
  const stored = localStorage.getItem('hotelops-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return null; // null = follow OS
};

// Layout wrapper used by every route that should show the sidebar.
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
    <HashRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public login routes ─────────────────────────────────────── */}
          <Route path="/login/staff" element={
            <RedirectIfAuthed><StaffLogin /></RedirectIfAuthed>
          } />
          <Route path="/login/admin" element={
            <RedirectIfAuthed><AdminLogin /></RedirectIfAuthed>
          } />

          {/* ── Admin (role: admin) ─────────────────────────────────────── */}
          <Route element={
            <RequireRole role="admin">
              <AppShell theme={theme} onToggleTheme={toggleTheme} />
            </RequireRole>
          }>
            <Route path="/admin/*" element={<AdminPanel />} />
          </Route>

          {/* ── Staff (any non-admin authed) ────────────────────────────── */}
          <Route element={
            <RequireRole role="staff">
              <AppShell theme={theme} onToggleTheme={toggleTheme} />
            </RequireRole>
          }>
            <Route path="/"            element={<TimeClock />} />
            <Route path="/shifts"      element={<ShiftsView />} />
            <Route path="/forecasting" element={<Forecasting />} />
            <Route path="/shift-notes" element={<ShiftNotes />} />
          </Route>

          {/* ── Catch-all ───────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
};

export default App;
