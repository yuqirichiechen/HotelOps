import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Layout/Sidebar';
import TimeClock from './components/TimeClock';
import AdminDashboard from './components/AdminDashboard';
import Scheduling from './components/Scheduling';
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
          <Route path="/admin"       element={<AdminDashboard />} />
          <Route path="/scheduling"  element={<Scheduling />} />
          <Route path="/forecasting" element={<Forecasting />} />
          <Route path="/shift-notes" element={<ShiftNotes />} />
          <Route path="*"            element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  </HashRouter>
);

export default App;
