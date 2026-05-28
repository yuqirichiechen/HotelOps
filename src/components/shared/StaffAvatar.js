import React from 'react';
import './StaffAvatar.css';

// Sprint 15.7: shared initials-in-color avatar with an optional
// presence dot. Used by the Shift Sheet (desktop + mobile
// layouts). Two-letter monogram from the first + second word of
// the name; falls back to "?" when no name is available.
//
// Props:
//   - name      : full name string. Required.
//   - color     : background hex / CSS color (typically dept color).
//                 Falls back to a neutral gray when omitted.
//   - onShift   : when true, shows a green presence dot in the
//                 corner. Used to surface "currently clocked in"
//                 in any list that has access to the staff's
//                 on-clock state.
//   - size      : "sm" | "md" | "lg". Default "md".
//                 sm = 22px (mobile row), md = 28px (desktop row +
//                 mobile accordion), lg = 36px (future surfaces).
//   - title     : optional tooltip override; defaults to the name.
const initialsOf = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
};

// Light/dark contrast: pick white text for dark backgrounds, near-
// black for light. Same heuristic the sheet uses for status pills.
const fgFor = (hex) => {
  if (!hex || typeof hex !== 'string' || hex.length !== 7) return '#fff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1a202c' : '#ffffff';
};

const StaffAvatar = ({ name, color, onShift, size = 'md', title }) => {
  const bg = color || 'var(--text-muted)';
  const fg = color ? fgFor(color) : '#fff';
  const cls = `staff-avatar staff-avatar-${size}`;
  return (
    <span
      className={cls}
      style={{ background: bg, color: fg }}
      title={title || name}
      aria-label={onShift ? `${name} (on shift)` : name}
    >
      <span className="staff-avatar-initials">{initialsOf(name)}</span>
      {onShift && <span className="staff-avatar-dot" aria-hidden />}
    </span>
  );
};

export default StaffAvatar;
