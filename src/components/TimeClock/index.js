import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiFetch } from '../../auth';
import DashboardFace from './DashboardFace';
import './TimeClock.css';

// Post-auth TimeClock: no keypad. The user is already known via the auth
// context; we render DashboardFace directly with their data and use the
// auth-based clock-in/out endpoints.

const TimeClock = () => {
  const { user } = useAuth();
  const nav      = useNavigate();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [notif,   setNotif]   = useState(null);

  const showNotif = (type, text) => {
    setNotif({ type, text });
    setTimeout(() => setNotif(null), 2200);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await apiFetch('/me/history');
    if (data?.success) setEntries(data.entries || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const openEntry   = entries.find(e => !e.clock_out_time);
  const clockedIn   = !!openEntry;
  const clockInTime = openEntry?.clock_in_time;

  const handleClockIn = async () => {
    setBusy(true);
    const { ok, data } = await apiFetch('/clock-in-self', { method: 'POST' });
    setBusy(false);
    if (ok && data?.success) {
      showNotif('success', 'Clocked In!');
      refresh();
    } else {
      showNotif('error', data?.message || 'Clock in failed');
    }
  };

  const handleClockOut = async () => {
    setBusy(true);
    const { ok, data } = await apiFetch('/clock-out-self', { method: 'POST' });
    setBusy(false);
    if (ok && data?.success) {
      showNotif('success', 'Clocked Out!');
      refresh();
    } else {
      showNotif('error', data?.message || 'Clock out failed');
    }
  };

  // DashboardFace expects an `employee` shape — adapt the authed user into it.
  const employee = {
    name:          user?.name || '',
    role:          user?.role || 'employee',
    clocked_in:    clockedIn,
    clock_in_time: clockInTime,
  };

  return (
    <div className="timeclock-page">
      {notif && (
        <div className="notif-overlay" onClick={() => setNotif(null)}>
          <div className={`notif-card notif-${notif.type}`}>
            <div className="notif-icon">{notif.type === 'success' ? '✓' : '✕'}</div>
            <div className="notif-message">{notif.text}</div>
          </div>
        </div>
      )}

      <DashboardFace
        employee={employee}
        entries={entries}
        histLoading={loading}
        loading={busy}
        onClockIn={handleClockIn}
        onClockOut={handleClockOut}
        onBack={() => nav('/')}
      />
    </div>
  );
};

export default TimeClock;
