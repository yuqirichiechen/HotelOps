import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Layout/Sidebar';
import TimeClock from './components/TimeClock';
import AdminPanel from './components/AdminPanel';
import ShiftsView from './components/ShiftsView';
import Forecasting from './components/Forecasting';
import ShiftNotes from './components/ShiftNotes';
import './App.css';

const getInitialTheme = () => {
  const stored = localStorage.getItem('hotelops-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return null; // null = follow OS
};

const App = () => {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const html = document.documentElement;
    if (theme) {
      html.setAttribute('data-theme', theme);
    } else {
      html.removeAttribute('data-theme');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      // If no explicit preference, detect OS to know what we're toggling away from
      const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const currentlyDark = prev === 'dark' || (prev === null && osDark);
      const next = currentlyDark ? 'light' : 'dark';
      localStorage.setItem('hotelops-theme', next);
      return next;
    });
  };

  return (
    <HashRouter>
      <div className="app-shell">
        <Sidebar theme={theme} onToggleTheme={toggleTheme} />
        <main className="app-main">
          <Routes>
            <Route path="/"            element={<TimeClock />} />
            <Route path="/shifts"      element={<ShiftsView />} />
            <Route path="/admin"       element={<AdminPanel />} />
            <Route path="/forecasting" element={<Forecasting />} />
            <Route path="/shift-notes" element={<ShiftNotes />} />
            <Route path="*"            element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;
