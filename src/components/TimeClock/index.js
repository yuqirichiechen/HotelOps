import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiFetch } from '../../auth';
import './TimeClock.css';

// Two-face flip card. Front = ready to clock in; back = active timer + clock
// out. Page strictly handles clocking in/out — week strip, history, and
// scheduling details belong on the upcoming Hours page (Sprint 4).

const greetingFor = (h) => {
  if (h >= 5  && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  return 'Good evening';
};

const fmtClock = (date) =>
  date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const fmtElapsed = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

const TimeClock = () => {
  const { user } = useAuth();
  const nav = useNavigate();

  const [clockedIn,   setClockedIn]   = useState(false);
  const [clockInTime, setClockInTime] = useState(null);
  const [busy,        setBusy]        = useState(false);
  const [notif,       setNotif]       = useState(null);
  const [now,         setNow]         = useState(new Date());
  const [elapsed,     setElapsed]     = useState(0);

  const refresh = useCallback(async () => {
    const { data } = await apiFetch('/me/history');
    if (data?.success) {
      const open = (data.entries || []).find(e => !e.clock_out_time);
      setClockedIn(!!open);
      setClockInTime(open ? open.clock_in_time : null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Wall-clock tick (front face display)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Elapsed tick (back face display) — only runs while clocked in
  useEffect(() => {
    if (!clockedIn || !clockInTime) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(clockInTime).getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [clockedIn, clockInTime]);

  const showNotif = (type, text) => {
    setNotif({ type, text });
    setTimeout(() => setNotif(null), 2000);
  };

  const handleClockIn = async () => {
    setBusy(true);
    const { ok, data } = await apiFetch('/clock-in-self', { method: 'POST' });
    setBusy(false);
    if (ok && data?.success) {
      showNotif('success', 'Clocked in!');
      setClockedIn(true);
      setClockInTime(data.entry.clock_in_time);
    } else {
      showNotif('error', data?.message || 'Clock in failed');
    }
  };

  const handleClockOut = async () => {
    setBusy(true);
    const { ok, data } = await apiFetch('/clock-out-self', { method: 'POST' });
    setBusy(false);
    if (ok && data?.success) {
      showNotif('success', 'Clocked out!');
      setClockedIn(false);
      setClockInTime(null);
    } else {
      showNotif('error', data?.message || 'Clock out failed');
    }
  };

  const greeting  = greetingFor(now.getHours());
  const firstName = (user?.name || '').split(' ')[0];

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

      <div className="tc-flip-container">
        <div className={`tc-flip-card ${clockedIn ? 'flipped' : ''}`}>

          {/* Front — not clocked in */}
          <div className="tc-face tc-face-front">
            <div className="tc-simple">
              <div className="tc-eyebrow">
                {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              <h2 className="tc-title">
                {greeting}{firstName ? `, ${firstName}` : ''}.
              </h2>
              <p className="tc-sub">Ready when you are.</p>
              <div className="tc-clock-display">{fmtClock(now)}</div>
              <button className="tc-action tc-action-in" onClick={handleClockIn} disabled={busy}>
                {busy ? '…' : 'Clock In'}
              </button>
              <button className="tc-back-link" onClick={() => nav('/')}>← Home</button>
            </div>
          </div>

          {/* Back — clocked in */}
          <div className="tc-face tc-face-back">
            <div className="tc-simple">
              <div className="tc-eyebrow tc-live">
                <span className="tc-live-dot" /> On the clock
              </div>
              <h2 className="tc-title">Shift in progress</h2>
              <p className="tc-sub">
                Started at {clockInTime ? fmtClock(new Date(clockInTime)) : '—'}.
              </p>
              <div className="tc-elapsed">{fmtElapsed(elapsed)}</div>
              <button className="tc-action tc-action-out" onClick={handleClockOut} disabled={busy}>
                {busy ? '…' : 'Clock Out'}
              </button>
              <button className="tc-back-link" onClick={() => nav('/')}>← Home</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TimeClock;
