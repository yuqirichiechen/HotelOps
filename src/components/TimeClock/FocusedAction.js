import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import './FocusedAction.css';

// Sprint 16.1: the focused-action screen the GM asked for. Staff
// who log in to clock in/out land here first — one giant button
// is the only thing on screen, no other UI to misread or
// accidentally tap. Replaces the previous behavior where the Home
// page surfaced timesheet + recent + clock card all at once
// (staff sometimes thought entering their PIN = clocked in).
//
// Mode is derived from `onClock` (currently clocked-in?). When
// false → big green CLOCK IN; when true → big red CLOCK OUT.
// A small "Just checking, skip" link drops to the full Home
// dashboard for the unusual case where the staff member wants
// to see their hours / schedule without clocking.
//
// Two timers run on this screen:
//   - autoLogoutSeconds: fires logout if the staff doesn't tap
//     anything. Resets on any interaction (tap, key, touch).
//     The last 5 s of the countdown surface as a visible badge
//     so the staff has a chance to keep their session.
//   - tap animation: very short, just to acknowledge the tap
//     before the parent handler runs.
const FocusedAction = ({
  mode,                  // 'in' | 'out'
  staffName,
  greetingKey,           // 'greeting.morning' | '.afternoon' | '.evening'
  idleSeconds = 15,
  busy = false,
  onAction,
  onSkip,
  onIdleLogout,
}) => {
  // Sprint 16.2: every staff-facing string flows through the i18n
  // dict. Defaults to English when the user's preferred_language
  // is unset or unknown.
  const t = useT();
  const [remaining, setRemaining] = useState(idleSeconds);
  const [tapped, setTapped] = useState(false);
  const [exiting, setExiting] = useState(false);
  const startedAtRef = useRef(Date.now());
  const idleSecondsRef = useRef(idleSeconds);
  idleSecondsRef.current = idleSeconds;

  // Reset the idle timer on any user interaction. We rebuild a
  // pure-function tick on every interaction by simply restarting
  // the `startedAt` baseline — the interval below reads from the
  // ref, so no need to clear/recreate the interval itself.
  useEffect(() => {
    const reset = () => { startedAtRef.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'touchstart', 'mousemove'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, reset));
  }, []);

  // One interval drives the visible countdown + the auto-logout
  // trigger. Tick at 250 ms so the badge updates smoothly without
  // flicker.
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      const left = Math.max(0, idleSecondsRef.current - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        if (onIdleLogout) onIdleLogout();
      }
    }, 250);
    return () => clearInterval(id);
  }, [onIdleLogout]);

  const handleTap = () => {
    if (busy || tapped) return;
    setTapped(true);
    // Short delay so the tap animation reads, then run the parent
    // handler. The parent owns the actual API call + post-action
    // navigation; we just play the visual.
    setTimeout(() => {
      if (onAction) onAction();
    }, 280);
  };

  const handleSkip = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => { if (onSkip) onSkip(); }, 200);
  };

  const showCountdown = remaining <= 5;
  const isIn = mode === 'in';
  const label   = isIn ? t('focused.clock_in') : t('focused.clock_out');
  const subline = isIn ? t('focused.sub_in')   : t('focused.sub_out');
  const greetingStr = greetingKey ? t(greetingKey) : '';
  const firstName   = staffName ? staffName.split(' ')[0] : '';

  return (
    <div className={`focused-action${exiting ? ' is-exiting' : ''}`}>
      {showCountdown && (
        <div className="focused-action-countdown" role="status" aria-live="polite">
          {t('focused.countdown', { n: Math.ceil(remaining) })}
        </div>
      )}
      <div className="focused-action-inner">
        <div className="focused-action-greeting">
          {greetingStr}{firstName ? `, ${firstName}` : ''}.
        </div>
        <div className="focused-action-subline">{subline}</div>

        <button
          type="button"
          className={`focused-action-btn ${isIn ? 'is-in' : 'is-out'}${tapped ? ' is-tapped' : ''}`}
          onClick={handleTap}
          disabled={busy || tapped}
          aria-label={label}
        >
          {tapped
            ? <span className="focused-action-btn-check" aria-hidden>✓</span>
            : <span className="focused-action-btn-label">{label}</span>}
        </button>

        <button
          type="button"
          className="focused-action-skip"
          onClick={handleSkip}
          disabled={busy || tapped}
        >{t('focused.skip')}</button>
      </div>
    </div>
  );
};

export default FocusedAction;
