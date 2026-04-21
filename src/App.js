import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Layout/Sidebar';
import TimeClock from './components/TimeClock';
import AdminPanel from './components/AdminPanel';
import ShiftsView from './components/ShiftsView';
import Forecasting from './components/Forecasting';
import ShiftNotes from './components/ShiftNotes';
import './App.css';

const App = () => (
  <HashRouter>
    <div className="app-shell">
      <Sidebar />
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

export default App;
