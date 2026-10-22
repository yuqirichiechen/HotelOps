// Sprint 23.1 — FLIP animation: after every render, elements marked data-flip="<key>" glide from where they were to where they are now
// (cards moving between columns when housekeepers are added or a card is dragged). Page coordinates are used so scrolling in between
// does not cause a false jump. Skipped for "reduce motion" and in tests (window.__HOTELOPS_NO_ANIM).
import { useEffect, useLayoutEffect, useRef } from 'react';

const off = () => { try { return !!(window.__HOTELOPS_NO_ANIM || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)); } catch { return false; } };

export default function useFlip(rootRef, skipRef) {
  const prev = useRef(new Map());
  // scrolling INSIDE the board (a column's own list, the housekeeper carousel) moves cards without a render — keep the remembered positions in step,
  // otherwise the next render would animate every card from a stale place.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let raf = 0;
    const sync = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const m = new Map(), sx = window.scrollX || 0, sy = window.scrollY || 0;
        root.querySelectorAll('[data-flip]').forEach(el => { const r = el.getBoundingClientRect(); m.set(el.getAttribute('data-flip'), { x: r.left + sx, y: r.top + sy }); });
        prev.current = m;
      });
    };
    root.addEventListener('scroll', sync, true);
    return () => { root.removeEventListener('scroll', sync, true); if (raf) cancelAnimationFrame(raf); };
  }, [rootRef]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = new Map(), sx = window.scrollX || 0, sy = window.scrollY || 0;
    const els = root.querySelectorAll('[data-flip]');
    els.forEach(el => { const r = el.getBoundingClientRect(); next.set(el.getAttribute('data-flip'), { x: r.left + sx, y: r.top + sy, el }); });
    const skip = !!(skipRef && skipRef.current);
    if (skipRef) skipRef.current = false;     // one render only (e.g. right after a hand drop, where the browser already showed the move)
    if (!off() && !skip) {
      next.forEach((cur, key) => {
        const was = prev.current.get(key);
        if (!was) return;
        const dx = was.x - cur.x, dy = was.y - cur.y;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        const el = cur.el;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.getBoundingClientRect();                                           // commit the start position
        requestAnimationFrame(() => { el.style.transition = 'transform .55s cubic-bezier(.2,.7,.2,1)'; el.style.transform = ''; });
      });
    }
    prev.current = new Map([...next].map(([k, v]) => [k, { x: v.x, y: v.y }]));
  });
}
