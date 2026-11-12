// Sprint 27.3 — screen-to-screen motion for the Inntrio login. Wraps a state / route change in the View Transitions API when the browser has it (the
// old login did the same with TransitionLink): `data-vt` on <html> carries the direction ('forward' | 'back') for the CSS in Inntrio.css, and the update is
// flushed synchronously so the browser snapshots the new screen. Browsers without the API (or users who prefer reduced motion) just apply the update; the
// screens then fade up on their own (CSS entrance animation).
import { flushSync } from 'react-dom';

export const prefersReducedMotion = () => {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
};

/** @param {() => void} update  the state / navigation change   @param {'forward'|'back'} dir */
export const withTransition = (update, dir = 'forward') => {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc || typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) { update(); return; }
  const root = doc.documentElement;
  root.dataset.vt = dir;
  const clear = () => { delete root.dataset.vt; };
  try {
    const t = doc.startViewTransition(() => { flushSync(update); });
    t.finished.then(clear, clear);
  } catch { clear(); update(); }
};
