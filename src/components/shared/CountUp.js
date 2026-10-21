/* global globalThis */
// Sprint 22.7 — count-up number + status ring used by the Reservations tiles. Every time `animKey` changes (a click on the tile; also the first
// appearance) the number runs from 0 to its value and the ring fills from empty. Honors "reduce motion" (no animation, final value at once).
import React, { useEffect, useRef, useState } from 'react';
import './CountUp.css';

const reduced = () => { try { if (globalThis.__HOTELOPS_NO_ANIM) return true; return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };
const raf = (cb) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(() => cb(nowMs()), 16));
const caf = (id) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const ease = (x) => 1 - Math.pow(1 - x, 3);

/** The number to display now: 0 → target over `duration` ms, restarted whenever `animKey` changes. */
export function useCountUp(target, animKey, duration = 1600) {
  const isNum = typeof target === 'number' && Number.isFinite(target);
  const [val, setVal] = useState(isNum ? 0 : target);
  const handle = useRef(0);
  useEffect(() => {
    if (!isNum) { setVal(target); return undefined; }
    if (reduced() || target === 0) { setVal(target); return undefined; }
    const t0 = nowMs();
    setVal(0);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      setVal(Math.round(target * ease(p)));
      if (p < 1) handle.current = raf(step); else setVal(target);
    };
    handle.current = raf(step);
    return () => caf(handle.current);
  }, [target, animKey, duration, isNum]);
  return val;
}

export const CountUp = ({ value, animKey, duration }) => <>{useCountUp(value, animKey, duration)}</>;

const R = 19, CIRC = 2 * Math.PI * R;
/** Circle showing a 0..1 status around an icon. `fraction` is the filled share. */
export const StatusRing = ({ fraction = 0, animKey = 0, color = '#3182ce', label, children }) => {
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <span className="sr-ring" role="img" aria-label={label || `${Math.round(f * 100)}%`} title={label || `${Math.round(f * 100)}%`}>
      <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
        <circle className="sr-ring-track" cx="22" cy="22" r={R} />
        <circle key={animKey} className="sr-ring-arc" cx="22" cy="22" r={R} stroke={color}
          style={{ '--circ': CIRC, '--target': CIRC * (1 - f) }} transform="rotate(-90 22 22)" data-fraction={f.toFixed(3)} />
      </svg>
      <span className="sr-ring-icon">{children}</span>
    </span>
  );
};

/** Sprint 22.10 — false for a moment, then true: lets a bar start at 0 and grow to its width (CSS transition). Restarts whenever `animKey` changes. */
export function useGrow(animKey) {
  const [grown, setGrown] = useState(reduced());
  useEffect(() => {
    if (reduced()) { setGrown(true); return undefined; }
    setGrown(false);
    const id = setTimeout(() => setGrown(true), 80);
    return () => clearTimeout(id);
  }, [animKey]);
  return grown;
}

/** A horizontal bar that grows from 0 to `pct` % whenever `animKey` changes. */
export const GrowBar = ({ pct, animKey, className, style }) => {
  const grown = useGrow(animKey);
  return <div className={className} style={{ ...style, width: `${grown ? pct : 0}%`, transition: grown ? 'width 1.6s cubic-bezier(.2,.7,.2,1)' : 'none' }} />;
};
