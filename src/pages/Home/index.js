import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { useAuth, apiFetch } from '../../auth';
import ClockWidget from '../../components/TimeClock/ClockWidget';
import AutoSignoutBanner from '../../components/shared/AutoSignoutBanner';
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
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState(false);
  const [elapsed,   setElapsed]   = useState(0);
  // Notif is now only used for ERRORS (the success "Clocked in!" /
  // "Clocked out!" moved into the This Week card's back face via
  // clockEvent — see Sprint 9.3 notes below).
  const [notif,     setNotif]     = useState(null);
  // Sprint 9.3: a clock event drives the bottom-card flip. When set,
  // This Week flips to show "Clocked in/out!" (replaces the old top
  // notification banner) and Recent flips to host the auto-signout
  // countdown + "Keep signed in" button. Tapping Keep signed in
  // clears clockEvent → both cards flip back.
  //   clockEvent: { type: 'in' | 'out', seconds: number } | null
  // `seconds` is the auto-signout countdown if enabled; if 0/disabled,
  // we keep the cards flipped for a short ack window then clear.
  const [clockEvent, setClockEvent] = useState(null);

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

  // Sprint 9.3: a successful clock event flips both bottom cards.
  // `seconds` carries the auto-signout duration; AutoSignoutBanner
  // mounts inside the Recent back-face only when seconds > 0. If
  // auto-signout is disabled (seconds <= 0) we still flip This Week
  // for the confirmation visual, and auto-clear after a short ack
  // window so the user gets their week summary back.
  const triggerClockEvent = (type) => {
    const seconds = data?.autoSignoutSeconds || 0;
    setClockEvent({ type, seconds });
    if (seconds <= 0) {
      setTimeout(() => setClockEvent(null), 4000);
    }
  };

  const handleKeepSignedIn = () => setClockEvent(null);

  const handleAutoSignout = async () => {
    setClockEvent(null);
    await logout();
    // Sprint 8.6.2: animate the page swap. The login page's `.login-card`
    // already has its own slide-in animation; this gives the *outer* page
    // a deliberate fade-out + scale-down via the [data-signing-out]
    // selector in AutoSignoutBanner.css. Falls back to instant nav on
    // browsers without the View Transitions API.
    if (typeof document !== 'undefined' && document.startViewTransition) {
      document.documentElement.dataset.signingOut = 'true';
      const t = document.startViewTransition(() => {
        flushSync(() => nav('/login/staff', { replace: true }));
      });
      t.finished.finally(() => {
        delete document.documentElement.dataset.signingOut;
      });
    } else {
      nav('/login/staff', { replace: true });
    }
  };

  const handleClockIn = async () => {
    setBusy(true);
    const { ok, data: res } = await apiFetch('/clock-in-self', { method: 'POST' });
    setBusy(false);
    if (ok && res?.success) {
      refresh();
      triggerClockEvent('in');
    } else {
      showNotif('error', res?.message || 'Clock in failed');
    }
  };

  const handleClockOut = async () => {
    setBusy(true);
    const { ok, data: res } = await apiFetch('/clock-out-self', { method: 'POST' });
    setBusy(false);
    if (ok && res?.success) {
      refresh();
      triggerClockEvent('out');
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

      {/* Clock In/Out — flip card. Sprint 9.3 moves the auto-signout
          countdown out of this card into the Recent card's back face,
          so the action buttons always live here (clearer affordance
          for "I want to clock the other way RIGHT NOW"). */}
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

      {/* This week — Sprint 9.3 flip card. Front = week summary.
          Back = clock-event confirmation (replaces the old top
          notification banner). Flips on successful clock-in/out;
          flips back when the user taps "Keep signed in" on the
          Recent card OR after the auto-clear window when auto-
          signout is disabled. */}
      <section className="home-flip-container">
        <div className={`home-flip-card ${clockEvent ? 'flipped' : ''}`}>
          <div className="home-flip-face home-hero">
            <div className="home-hero-eyebrow">This week</div>
            <div className="home-hero-num">{formatHours(total)}</div>
            <div className="home-hero-meta">
              {recent.length > 0
                ? `${recent.length} recent shift${recent.length === 1 ? '' : 's'} below.`
                : 'No shifts logged yet.'}
            </div>
          </div>
          <div className="home-flip-face home-flip-face-back home-hero-event">
            <div className={`home-hero-event-icon ${clockEvent?.type || ''}`}>✓</div>
            <div className="home-hero-event-title">
              {clockEvent?.type === 'out' ? 'Clocked out!' : 'Clocked in!'}
            </div>
            <div className="home-hero-event-sub">
              {clockEvent?.type === 'out' ? 'Have a good one' : 'You’re on the clock'}
            </div>
          </div>
        </div>
      </section>

      {/* Recent shifts — Sprint 9.3 flip card. Front = the last few
          shifts. Back = the auto-signout countdown (only flips when
          auto-signout is enabled). Embeds AutoSignoutBanner stripped
          of its own border via .home-recent-event-banner. */}
      <section className="home-flip-container">
        <div className={`home-flip-card ${clockEvent && clockEvent.seconds > 0 ? 'flipped' : ''}`}>
          <div className="home-flip-face home-recent">
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
          </div>
          <div className="home-flip-face home-flip-face-back home-recent-event">
            {clockEvent && clockEvent.seconds > 0 && (
              <div className="home-recent-event-banner">
                <AutoSignoutBanner
                  seconds={clockEvent.seconds}
                  onCancel={handleKeepSignedIn}
                  onSignOut={handleAutoSignout}
                />
              </div>
            )}
          </div>
        </div>
      </section>

    </div>
  );
};

export default Home;
