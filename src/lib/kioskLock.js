// Sprint 29.3 — the Clock in & out door runs on a shared tablet, so two things are kept out of reach of an accidental touch:
//   • useKioskLock   — the browser's Back button / swipe-back gesture does nothing on the keypad and on the clock screen (a history barrier that is put back after every
//                      Back), and overscroll gestures (pull-to-refresh, edge swipes) are switched off while a kiosk screen is open.
//   • useHoldToExit  — the ONE way out of the keypad: hold the Clear key for 10 seconds. It is deliberately invisible: no hint, no label, no visual change; a normal tap still just clears.
import { useCallback, useEffect, useRef } from 'react';

export const HOLD_EXIT_MS = 10000;

/** While mounted: Back / swipe-back is swallowed (the page stays) and overscroll navigation is off. */
export const useKioskLock = (active = true) => {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;
    const h = window.history, root = document.documentElement;
    // a barrier entry with the SAME url on top of the current one: Back lands on the same page, and we put the barrier back at once, so the next Back does the same
    const barrier = () => { try { h.pushState({ ...(h.state || {}), kioskLock: true }, '', window.location.href); } catch (_e) { /* history unavailable */ } };
    barrier(); root.classList.add('kiosk-lock');
    window.addEventListener('popstate', barrier);
    return () => { window.removeEventListener('popstate', barrier); root.classList.remove('kiosk-lock'); };
  }, [active]);
};

/**
 * Props to spread on a key: holding it for `holdMs` calls `onExit` (once). Releasing / losing the touch earlier cancels it; a short tap is untouched (the key's own onClick still runs).
 * The long press must stay silent — no context menu / text-selection callout, no pan that would cancel it.
 */
export const useHoldToExit = (onExit, holdMs = HOLD_EXIT_MS) => {
  const timer = useRef(null);
  const exitRef = useRef(onExit); exitRef.current = onExit;
  const cancel = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);
  useEffect(() => cancel, [cancel]);
  const start = useCallback((e) => {
    if (e && e.button) return;   // only the primary button / a touch
    cancel();
    timer.current = setTimeout(() => { timer.current = null; if (typeof exitRef.current === 'function') exitRef.current(); }, holdMs);
  }, [cancel, holdMs]);
  return {
    onPointerDown: start, onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
    style: { touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' },
  };
};
