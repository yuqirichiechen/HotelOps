// Sprint 27.3 / 27.6 — motion helpers for the Inntrio login.
//
// SCREEN CHANGES (forward / back) are done in plain CSS + a short delay, NOT with the View Transitions API: the current screen melts away (`data-leave` on
// `.in-layout`, 0.24 s), then the state / route change is applied and the new screen arrives with its own entrance animation (`.in-enter`, set by AuthFrame at
// mount). That works in every browser and cannot be "skipped" the way a view transition can. (27.3-27.5 used view transitions for this with selectors that
// never matched, so only the browser's default cross-fade ever ran.) `dir` ('forward' | 'back') is left on <html data-nav-dir> for the arriving screen.
//
// THEME CHANGES ('theme') use the View Transitions API for the circular reveal from the logo (`data-vt="theme"`, origin in --vt-x / --vt-y); without the API
// or with reduced motion the change is applied instantly.
import { flushSync } from 'react-dom';

export const LEAVE_MS = 240;

export const prefersReducedMotion = () => {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
};
const canAnimate = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function' && !prefersReducedMotion();

let leaving = false;

const themeTransition = (update, point) => {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc || typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) { update(); return; }
  const root = doc.documentElement;
  root.dataset.vt = 'theme';
  if (point) { root.style.setProperty('--vt-x', `${point.x}px`); root.style.setProperty('--vt-y', `${point.y}px`); }
  const clear = () => { delete root.dataset.vt; root.style.removeProperty('--vt-x'); root.style.removeProperty('--vt-y'); };
  try {
    const t = doc.startViewTransition(() => { flushSync(update); });
    t.finished.then(clear, clear);
  } catch { clear(); update(); }
};

/** @param {() => void} update  the state / navigation change   @param {'forward'|'back'|'theme'} dir   @param {{x:number,y:number}} [point] origin of the 'theme' reveal */
export const withTransition = (update, dir = 'forward', point = null) => {
  if (dir === 'theme') { themeTransition(update, point); return; }
  const doc = typeof document !== 'undefined' ? document : null;
  const layout = doc && doc.querySelector('.in-layout');
  if (!layout || !canAnimate()) { update(); return; }
  if (leaving) return;                       // a change is already on its way (double tap)
  leaving = true;
  doc.documentElement.dataset.navDir = dir;  // read once by the arriving screen (AuthFrame)
  layout.dataset.leave = dir;                // CSS: the current screen melts away
  setTimeout(() => {
    leaving = false;
    try { update(); } finally { setTimeout(() => { delete doc.documentElement.dataset.navDir; }, 120); }
  }, LEAVE_MS);
};
