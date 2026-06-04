import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { useAuth, apiFetch } from '../../auth';
import ClockWidget from '../../components/TimeClock/ClockWidget';
import AutoSignoutBanner from '../../components/shared/AutoSignoutBanner';
import FocusedAction from '../../components/TimeClock/FocusedAction';
import { useT } from '../../i18n';
import '../../components/TimeClock/TimeClock.css'; // for .clock-widget styles
import './Home.css';

// Sprint 16.1: a single sessionStorage key remembers that the
// staff member has already engaged with the focused-action screen
// this login session. Keyed by user_id so a fresh login (different
// staff at the same kiosk) re-shows the focused screen.
const FOCUSED_DISMISS_KEY = 'hotelops-staff-focused-dismissed';

// Home is the staff dashboard. Top section is a flip card that handles the
// entire clock-in/out flow — front = analog clock + Clock In; back = active
// timer + Clock Out. The rest of the page surfaces this-week hours and a
// short recent-shifts list. Detailed breakdowns live on /timesheet.

// Sprint 16.2: greeting now returns an i18n *key* rather than the
// rendered string. The display layer (FocusedAction, the inline
// greeting block) resolves it through useT() so the same key
// translates per the staff member's preferred_language.
const greetingFor = (h) => {
  if (h >= 5  && h < 12) return 'greeting.morning';
  if (h >= 12 && h < 18) return 'greeting.afternoon';
  return 'greeting.evening';
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
  const t = useT();

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

  // Sprint 16.1: focused-action overlay state. Mounts on first
  // landing post-login; tapping the big button OR "Just checking,
  // skip" dismisses it; tapping nothing for `idleLogoutSeconds`
  // signs the staff out.
  const [focusedDismissed, setFocusedDismissed] = useState(() => {
    try { return sessionStorage.getItem(FOCUSED_DISMISS_KEY) === (user?.user_id || ''); }
    catch { return false; }
  });
  // If the active user changes (logout → relogin same tab), re-show
  // the focused screen.
  useEffect(() => {
    try {
      setFocusedDismissed(sessionStorage.getItem(FOCUSED_DISMISS_KEY) === (user?.user_id || ''));
    } catch { /* sessionStorage unavailable — fail open */ }
  }, [user?.user_id]);
  const dismissFocused = () => {
    // Sprint 16.8: defensive guard. If the user object is still
    // loading (auth context fetch in flight) when the staff taps,
    // writing `''` to sessionStorage would later mismatch against
    // the loaded user_id and the focused screen would re-render
    // — the "appears, taps, reappears" stutter the GM reported
    // alongside the disappearing bug. Skipping the write entirely
    // here means the next render compares against `null` (no key),
    // which behaves correctly.
    if (!user?.user_id) {
      setFocusedDismissed(true);
      return;
    }
    try { sessionStorage.setItem(FOCUSED_DISMISS_KEY, user.user_id); }
    catch { /* ignore */ }
    setFocusedDismissed(true);
  };

  const refresh = useCallback(async () => {
    // Sprint 13.6: pass the local TZ offset (signed minutes, matching
    // `new Date().getTimezoneOffset()`) so the server can split
    // overnight entries into the *user's* local days instead of UTC.
    const tzOff = new Date().getTimezoneOffset();
    const { data } = await apiFetch(`/me/hours?weekStart=${getMondayISO()}&tz_offset_minutes=${tzOff}`);
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
  //
  // Sprint 11.5: the grace-window lock duration binds to the auto-
  // signout setting. When auto-signout is enabled, the lock holds
  // for the full countdown (matching the banner). When disabled,
  // we still apply a short floor (DEFAULT_LOCK_SECONDS) so a high-
  // CPS / spam-tap user can't instantly reverse their clock event.
  const DEFAULT_LOCK_SECONDS = 3;
  const triggerClockEvent = (type) => {
    const seconds = data?.autoSignoutSeconds || 0;
    setClockEvent({ type, seconds });
    if (seconds <= 0) {
      setTimeout(() => setClockEvent(null), DEFAULT_LOCK_SECONDS * 1000);
    }
  };

  const handleKeepSignedIn = () => setClockEvent(null);

  const handleAutoSignout = async () => {
    // Sprint 11.5: keep both clock buttons disabled through the
    // entire async logout + nav. Previously this function started
    // with `setClockEvent(null)`, which re-enabled the opposite-
    // action button for the ~half-second between state-flush and
    // navigation — long enough for a spam-tap to squeak a reverse
    // clock-out/in past the lock. Now we set busy=true (both
    // Clock In + Clock Out have `disabled={busy || …}` so this
    // covers them both) and leave clockEvent set; the page unmounts
    // a moment later so its visual state doesn't matter.
    setBusy(true);
    // Sprint 16.1: drop the focused-dismiss marker so the next
    // login (this user or any other on the same kiosk) gets a
    // fresh focused-action screen.
    try { sessionStorage.removeItem(FOCUSED_DISMISS_KEY); } catch { /* ignore */ }
    // Sprint 9.3.2: read the persisted tenant slug *before* logout
    // (logout shouldn't touch this key today, but reading early is
    // robust to future logout flows that clear more state). If the
    // slug is missing for any reason — old session, fresh install —
    // fall back to `/` (the picker) so the user can pick again
    // instead of hitting a broken URL. (Sprint 11.2: picker URL was
    // `/login/staff` pre-launch; now it's `/`.)
    // Sprint 11.2.1: combined login at `/:slug/login` (no role suffix).
    const slug = localStorage.getItem('hotelops-tenant-slug');
    const loginPath = slug ? `/${slug}/login` : '/';
    await logout();
    // Sprint 8.6.2: animate the page swap. The login page's `.login-card`
    // already has its own slide-in animation; this gives the *outer* page
    // a deliberate fade-out + scale-down via the [data-signing-out]
    // selector in AutoSignoutBanner.css. Falls back to instant nav on
    // browsers without the View Transitions API.
    if (typeof document !== 'undefined' && document.startViewTransition) {
      document.documentElement.dataset.signingOut = 'true';
      const t = document.startViewTransition(() => {
        flushSync(() => nav(loginPath, { replace: true }));
      });
      t.finished.finally(() => {
        delete document.documentElement.dataset.signingOut;
      });
    } else {
      nav(loginPath, { replace: true });
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

  // Sprint 16.1 / 16.6: focused-action screen is the landing
  // experience post-login. 16.6 removed the `!loading && !!data`
  // gate that used to wait for /me/hours before showing — staff
  // would otherwise see a flash of Home before the focused screen
  // mounted. Now it mounts immediately; the inner button is
  // disabled (shows "…") until data resolves so the wrong mode
  // never gets tapped. clockEvent still suppresses it so the
  // existing flip-card flow takes over after a clock action.
  const showFocused = !focusedDismissed && !clockEvent;
  const focusedMode = onClock ? 'out' : 'in';

  return (
    <div className="home-page">

      {showFocused && (
        <FocusedAction
          mode={focusedMode}
          staffName={user?.name}
          greetingKey={greeting}
          busy={busy || loading || !data}
          loading={loading || !data}
          idleSeconds={data?.idleLogoutSeconds || 15}
          onAction={() => {
            // Don't dismiss yet — let the existing clock handler
            // run the clock-in/out + flip the bottom cards. The
            // focused overlay will hide once `clockEvent` is set
            // (showFocused becomes false), and then the post-
            // signout flow takes over from there.
            // Sprint 16.9: `onSkip` prop removed alongside the
            // skip link in FocusedAction.
            dismissFocused();
            if (focusedMode === 'in') handleClockIn();
            else                      handleClockOut();
          }}
          onIdleLogout={handleAutoSignout}
        />
      )}

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
          {t(greeting)}{firstName ? `, ${firstName}` : ''}.
        </h1>
      </div>

      {/* Clock In/Out — flip card. Sprint 9.3 moves the auto-signout
          countdown out of this card into the Recent card's back face,
          so the action buttons always live here (clearer affordance
          for "I want to clock the other way RIGHT NOW"). */}
      <section className="home-clock-section">
        <h2 className="home-section-title">{t('home.clock')}</h2>
        <div className="home-clock-flip-container">
          <div className={`home-clock-flip-card ${onClock ? 'flipped' : ''}`}>

            {/*
              Sprint 11.1.2: lock the opposite-action button while
              the post-clock-event grace window (countdown to auto-
              signout) is active. clockEvent.type='out' just clocked
              out → "Clock In" disabled until grace window closes.
              clockEvent.type='in' just clocked in → "Clock Out"
              disabled. Prevents the accidental immediate-reverse tap
              that staff could otherwise pull off in the 3 seconds
              before auto-signout fires.
            */}
            {/* Front — ready to clock in */}
            <div className="home-clock-face">
              <ClockWidget />
              <button
                className="home-clock-action in"
                onClick={handleClockIn}
                disabled={busy || loading || clockEvent?.type === 'out'}
              >
                {busy ? '…' : (clockEvent?.type === 'out' ? t('home.just_out') : t('home.clock_in'))}
              </button>
            </div>

            {/* Back — clocked in */}
            <div className="home-clock-face home-clock-face-back">
              <div className="home-active">
                <div className="home-active-eyebrow">
                  <span className="home-live-dot" /> {t('home.on_clock')}
                </div>
                <div className="home-active-elapsed">{fmtElapsed(elapsed)}</div>
                <div className="home-active-since">
                  {clockInTime ? formatTime(clockInTime) : '—'}
                </div>
              </div>
              <button
                className="home-clock-action out"
                onClick={handleClockOut}
                disabled={busy || clockEvent?.type === 'in'}
              >
                {busy ? '…' : (clockEvent?.type === 'in' ? t('home.just_in') : t('home.clock_out'))}
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
            <div className="home-hero-eyebrow">{t('home.this_week')}</div>
            <div className="home-hero-num">{formatHours(total)}</div>
            <div className="home-hero-meta">
              {recent.length > 0
                ? t(recent.length === 1 ? 'home.recent_below_one' : 'home.recent_below_many', { n: recent.length })
                : t('home.no_shifts')}
            </div>
          </div>
          <div className="home-flip-face home-flip-face-back home-hero-event">
            <div className={`home-hero-event-icon ${clockEvent?.type || ''}`}>✓</div>
            <div className="home-hero-event-title">
              {clockEvent?.type === 'out' ? t('notif.clocked_out') : t('notif.clocked_in')}
            </div>
            <div className="home-hero-event-sub">
              {clockEvent?.type === 'out' ? '' : t('home.on_clock')}
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
            <h2 className="home-recent-title">{t('home.recent')}</h2>
            {loading && <div className="home-empty">{t('home.loading')}</div>}
            {!loading && recent.length === 0 && (
              <div className="home-empty">{t('home.no_shifts_short')}</div>
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
