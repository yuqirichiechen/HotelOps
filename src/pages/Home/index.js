import React, { useCallback, useEffect, useState } from 'react';
import { useAuth, apiFetch } from '../../auth';
import ClockWidget from '../../components/TimeClock/ClockWidget';
import '../../components/TimeClock/TimeClock.css'; // for .clock-widget styles
import './Home.css';

// Home is the staff dashboard. Top section is a flip card that handles the
// entire clock-in/out flow — front = analog clock + Clock In; back = active
// timer + Clock Out. The rest of the page surfaces this-week hours and a
// short recent-shifts list. Detailed breakdowns live on /timesheet.

const greetingFor = (h) => {
  if (h >= 5  && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  return 'Good evening';
};

const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

const formatHours = (h) => {
  if (h == null || isNaN(h) || h === 0) return '0h';
  if (h % 1 === 0)                       return `${h}h`;
  return `${h.toFixed(1)}h`;
};

const fmtElapsed = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

const getMondayISO = (d = new Date()) => {
  const date = new Date(d);
  const dow  = date.getDay();
  const off  = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + off);
  return date.toISOString().split('T')[0];
};

const Home = () => {
  const { user } = useAuth();

  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState(false);
  const [elapsed,   setElapsed]   = useState(0);
  const [notif,     setNotif]     = useState(null);

  const refresh = useCallback(async () => {
    const { data } = await apiFetch(`/me/hours?weekStart=${getMondayISO()}`);
    if (data?.success) setData(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onClock     = !!data?.currentlyClockedIn;
  const clockInTime = data?.openClockInTime;

  // Live elapsed timer for the back face
  useEffect(() => {
    if (!onClock || !clockInTime) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(clockInTime).getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [onClock, clockInTime]);

  const showNotif = (type, text) => {
    setNotif({ type, text });
    setTimeout(() => setNotif(null), 2200);
  };

  const handleClockIn = async () => {
    setBusy(true);
    const { ok, data: res } = await apiFetch('/clock-in-self', { method: 'POST' });
    setBusy(false);
    if (ok && res?.success) {
      showNotif('success', 'Clocked in!');
      refresh();
    } else {
      showNotif('error', res?.message || 'Clock in failed');
    }
  };

  const handleClockOut = async () => {
    setBusy(true);
    const { ok, data: res } = await apiFetch('/clock-out-self', { method: 'POST' });
    setBusy(false);
    if (ok && res?.success) {
      showNotif('success', 'Clocked out!');
      refresh();
    } else {
      showNotif('error', res?.message || 'Clock out failed');
    }
  };

  const now       = new Date();
  const greeting  = greetingFor(now.getHours());
  const firstName = (user?.name || '').split(' ')[0];
  const total     = data?.totalHours || 0;
  const recent    = (data?.recentShifts || []).slice(0, 3);

  return (
    <div className="home-page">

      {notif && (
        <div className={`home-notif ${notif.type}`}>
          <div className="home-notif-icon">{notif.type === 'success' ? '✓' : '✕'}</div>
          <div className="home-notif-text">{notif.text}</div>
        </div>
      )}

      {/* Greeting */}
      <div className="home-greeting">
        <div className="home-greeting-eyebrow">
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <h1 className="home-greeting-title">
          {greeting}{firstName ? `, ${firstName}` : ''}.
        </h1>
      </div>

      {/* Clock In/Out — flip card */}
      <section className="home-clock-section">
        <h2 className="home-section-title">Clock</h2>
        <div className="home-clock-flip-container">
          <div className={`home-clock-flip-card ${onClock ? 'flipped' : ''}`}>

            {/* Front — ready to clock in */}
            <div className="home-clock-face">
              <ClockWidget />
              <button
                className="home-clock-action in"
                onClick={handleClockIn}
                disabled={busy || loading}
              >
                {busy ? '…' : 'Clock In'}
              </button>
            </div>

            {/* Back — clocked in */}
            <div className="home-clock-face home-clock-face-back">
              <div className="home-active">
                <div className="home-active-eyebrow">
                  <span className="home-live-dot" /> On the clock
                </div>
                <div className="home-active-elapsed">{fmtElapsed(elapsed)}</div>
                <div className="home-active-since">
                  Started at {clockInTime ? formatTime(clockInTime) : '—'}
                </div>
              </div>
              <button
                className="home-clock-action out"
                onClick={handleClockOut}
                disabled={busy}
              >
                {busy ? '…' : 'Clock Out'}
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* This week */}
      <section className="home-hero">
        <div className="home-hero-eyebrow">This week</div>
        <div className="home-hero-num">{formatHours(total)}</div>
        <div className="home-hero-meta">
          {recent.length > 0
            ? `${recent.length} recent shift${recent.length === 1 ? '' : 's'} below.`
            : 'No shifts logged yet.'}
        </div>
      </section>

      {/* Recent shifts */}
      <section className="home-recent">
        <h2 className="home-recent-title">Recent</h2>
        {loading && <div className="home-empty">Loading…</div>}
        {!loading && recent.length === 0 && (
          <div className="home-empty">No shifts yet.</div>
        )}
        {!loading && recent.length > 0 && (
          <ul className="home-recent-list">
            {recent.map(s => (
              <li key={s.entry_id} className="home-recent-row">
                <div className="home-recent-date">
                  {new Date(s.clock_in_time).toLocaleDateString([], {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                </div>
                <div className="home-recent-times">
                  {formatTime(s.clock_in_time)} – {s.clock_out_time
                    ? formatTime(s.clock_out_time)
                    : <span className="home-recent-open">in progress</span>}
                </div>
                <div className="home-recent-hours">
                  {s.clock_out_time ? formatHours(s.hours) : '—'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
};

export default Home;
