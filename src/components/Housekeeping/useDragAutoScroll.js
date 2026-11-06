// Sprint 24.11 — while a room card is being dragged, the page follows the mouse: hold a card near the top / bottom edge of the window (or of the
// scrolling area the page lives in) and it scrolls that way, faster the closer to the edge, so a card picked up in "Not assigned" can be carried down
// to a housekeeper that starts below the fold without letting go. Stops on drop / drag end / Esc, and when the page unmounts.
import { useCallback, useEffect, useRef } from 'react';

const ZONE = 96, MAX_STEP = 26;   // px from the edge where scrolling starts; px per frame at the very edge

/** nearest ancestor that really scrolls vertically (the app shells scroll inside a container, not the window) */
export function scrollParent(el) {
  for (let n = el && el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const oy = window.getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

/** px to scroll this frame for a pointer at `y` inside [top, bottom] (negative = up) */
export const stepFor = (y, top, bottom) => {
  if (y < top + ZONE) return -Math.ceil(MAX_STEP * Math.min(1, (top + ZONE - y) / ZONE));
  if (y > bottom - ZONE) return Math.ceil(MAX_STEP * Math.min(1, (y - (bottom - ZONE)) / ZONE));
  return 0;
};

const raf = (fn) => (window.requestAnimationFrame ? window.requestAnimationFrame(fn) : setTimeout(fn, 16));
const caf = (id) => (window.cancelAnimationFrame ? window.cancelAnimationFrame(id) : clearTimeout(id));

export default function useDragAutoScroll() {
  const st = useRef({ on: false, y: null, el: null, id: 0 });
  const stop = useCallback(() => {
    const s = st.current; if (!s.on) return; s.on = false; s.y = null; caf(s.id);
    document.removeEventListener('dragover', s.move, true); document.removeEventListener('drop', s.stop, true); document.removeEventListener('dragend', s.stop, true); window.removeEventListener('keydown', s.key, true);
  }, []);
  const start = useCallback((fromEl) => {
    const s = st.current; if (s.on) return; s.on = true; s.el = scrollParent(fromEl);
    s.move = (e) => { s.y = e.clientY; };
    s.stop = () => stop();
    s.key = (e) => { if (e.key === 'Escape') stop(); };
    document.addEventListener('dragover', s.move, true); document.addEventListener('drop', s.stop, true); document.addEventListener('dragend', s.stop, true); window.addEventListener('keydown', s.key, true);
    const tick = () => {
      if (!s.on) return;
      if (s.y != null) {
        const box = s.el ? s.el.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        const d = stepFor(s.y, Math.max(0, box.top), Math.min(window.innerHeight, box.bottom));
        if (d) { if (s.el) s.el.scrollTop += d; else window.scrollBy(0, d); }
      }
      s.id = raf(tick);
    };
    s.id = raf(tick);
  }, [stop]);
  useEffect(() => stop, [stop]);
  return { start, stop };
}
