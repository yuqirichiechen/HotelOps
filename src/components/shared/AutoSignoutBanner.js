import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import './AutoSignoutBanner.css';

// Sprint 8.6: appears after a successful clock-in/out so a shared
// kiosk/tablet doesn't keep one staff member's session open. The countdown
// shows the seconds remaining; the user can tap "Stay signed in" or
// anywhere on the banner background to cancel. Position is controlled by
// CSS — bottom banner above the bottom-nav on mobile (<720px), top-right
// toast on desktop. Both slide in.
//
// Props:
//   seconds  — total countdown in seconds (>0).
//   onCancel — called if the user keeps the session.
//   onSignOut — called when the timer reaches 0.

const AutoSignoutBanner = ({ seconds, onCancel, onSignOut }) => {
  const [remaining, setRemaining] = useState(seconds);
  const intervalRef = useRef(null);
  const t = useT();

  // Sprint 8.6.1: hold onSignOut in a ref so we can call the latest version
  // without it being a useEffect dep. The previous shape included
  // `onSignOut` in the deps; Home re-renders every 1s while clocked in
  // (live elapsed timer), so onSignOut got a new identity each time, the
  // effect re-ran, and `start = Date.now()` reset — perpetually showing
  // "3s" until the elapsed timer happened to pause and the countdown
  // finally ran uninterrupted.
  const onSignOutRef = useRef(onSignOut);
  useEffect(() => { onSignOutRef.current = onSignOut; }, [onSignOut]);

  useEffect(() => {
    // Tick every 100ms so the ring animates smoothly even at low total
    // durations (3s would be 3 ticks otherwise — we want a continuous
    // shrink). Calls onSignOut once when reaching 0.
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsedMs = Date.now() - start;
      const next = Math.max(0, seconds - elapsedMs / 1000);
      setRemaining(next);
      if (next <= 0) {
        clearInterval(intervalRef.current);
        onSignOutRef.current();
      }
    }, 100);
    return () => clearInterval(intervalRef.current);
  }, [seconds]);

  // Stop the timer + invoke the user's cancel handler.
  const cancel = () => {
    clearInterval(intervalRef.current);
    onCancel();
  };

  // Ring math — radius 18 px (44px wrapper - 4 stroke), circumference ~113.
  const RADIUS = 18;
  const CIRC = 2 * Math.PI * RADIUS;
  const dashOffset = CIRC * (1 - remaining / seconds);

  return (
    <div className="auto-signout-banner" role="alertdialog" aria-live="polite">
      <button
        type="button"
        className="auto-signout-stay"
        onClick={cancel}
        aria-label={t('auto.stay')}
      >
        {t('auto.stay')}
      </button>
      <div className="auto-signout-info" onClick={cancel}>
        <div className="auto-signout-text">
          <div className="auto-signout-title">{t('auto.now')}</div>
          <div className="auto-signout-sub">
            {t('auto.in_n', { n: Math.ceil(remaining) })}
          </div>
        </div>
        <div className="auto-signout-ring" aria-hidden>
          <svg viewBox="0 0 44 44">
            <circle className="auto-signout-ring-track" cx="22" cy="22" r={RADIUS} />
            <circle
              className="auto-signout-ring-progress"
              cx="22" cy="22" r={RADIUS}
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <span className="auto-signout-ring-num">{Math.ceil(remaining)}</span>
        </div>
      </div>
    </div>
  );
};

export default AutoSignoutBanner;
