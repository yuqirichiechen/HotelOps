// Sprint 23.1 — FLIP animation: after every render, elements marked data-flip="<key>" glide from where they were to where they are now
// (cards moving between columns when housekeepers are added or a card is dragged). Page coordinates are used so scrolling in between
// does not cause a false jump. Skipped for "reduce motion" and in tests (window.__HOTELOPS_NO_ANIM).
import { useLayoutEffect, useRef } from 'react';

const off = () => { try { return !!(window.__HOTELOPS_NO_ANIM || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)); } catch { return false; } };

export default function useFlip(rootRef) {
  const prev = useRef(new Map());
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = new Map(), sx = window.scrollX || 0, sy = window.scrollY || 0;
    const els = root.querySelectorAll('[data-flip]');
    els.forEach(el => { const r = el.getBoundingClientRect(); next.set(el.getAttribute('data-flip'), { x: r.left + sx, y: r.top + sy, el }); });
    if (!off()) {
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
