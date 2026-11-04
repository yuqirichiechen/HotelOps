// Sprint 23.1 — FLIP animation: after every render, elements marked data-flip="<key>" glide from where they were to where they are now
// (cards moving between columns when housekeepers are added or a card is dragged). Page coordinates are used so scrolling in between
// does not cause a false jump. Skipped for "reduce motion" and in tests (window.__HOTELOPS_NO_ANIM).
//
// Sprint 24.8 — an element may also carry data-flip-group="<owner>". When it does, it only glides if its GROUP changed (a card handed to another
// housekeeper / back to Not assigned). A card that stays in its group never glides, whatever else moved it: opening or closing a floor accordion,
// a scrollbar appearing, a pop-over, a resize. (Before this, opening one accordion could replay the glide on cards in OTHER columns: the positions
// remembered after a toggle were the START of its 350 ms transition, so the next render saw "moved" cards.) The remembered positions are also
// refreshed whenever a CSS transition ends, so they never keep a mid-transition layout.
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
        root.querySelectorAll('[data-flip]').forEach(el => { const r = el.getBoundingClientRect(); m.set(el.getAttribute('data-flip'), { x: r.left + sx, y: r.top + sy, g: el.getAttribute('data-flip-group') }); });
        prev.current = m;
      });
    };
    root.addEventListener('scroll', sync, true);
    root.addEventListener('transitionend', sync, true);
    return () => { root.removeEventListener('scroll', sync, true); root.removeEventListener('transitionend', sync, true); if (raf) cancelAnimationFrame(raf); };
  }, [rootRef]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = new Map(), sx = window.scrollX || 0, sy = window.scrollY || 0;
    const els = root.querySelectorAll('[data-flip]');
    els.forEach(el => { const r = el.getBoundingClientRect(); next.set(el.getAttribute('data-flip'), { x: r.left + sx, y: r.top + sy, g: el.getAttribute('data-flip-group'), el }); });
    const skip = !!(skipRef && skipRef.current);
    if (skipRef) skipRef.current = false;     // one render only (e.g. right after a hand drop, where the browser already showed the move)
    if (!off() && !skip) {
      next.forEach((cur, key) => {
        const was = prev.current.get(key);
        if (!was) return;
        if (cur.g != null && was.g != null && cur.g === was.g) return;     // same group: a layout shift, not a move
        const dx = was.x - cur.x, dy = was.y - cur.y;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        const el = cur.el;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.getBoundingClientRect();                                           // commit the start position
        requestAnimationFrame(() => { el.style.transition = 'transform .55s cubic-bezier(.2,.7,.2,1)'; el.style.transform = ''; });
      });
    }
    prev.current = new Map([...next].map(([k, v]) => [k, { x: v.x, y: v.y, g: v.g }]));
  });
}
