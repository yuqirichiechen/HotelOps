import React from 'react';

// Sprint 10 → 11: shared department filter chips for the Calendar
// surface. 11 added per-chip color (the dept's `color` hex from the
// new departments.color column). When a dept has no color, the chip
// renders neutral. Active state inverts: background = dept color,
// text = white (or near-white).
//
// `iconForDepartment` is a tiny built-in palette for known dept
// names so we get a recognizable glyph without piling another column
// on the table. New depts fall back to a generic 👥 icon.
//
// Props:
//   departments — [{ department_id, name, color }]
//   value       — selected department_id (number), or null for "All"
//   onChange    — (next: number | null) => void
//   className   — optional extra class on the wrapper

const iconForDepartment = (name) => {
  const k = String(name || '').toLowerCase();
  if (k.includes('front desk')) return '🛎';
  if (k.includes('housekeeping')) return '🧹';
  if (k.includes('maintenance')) return '🔧';
  if (k.includes('food') || k.includes('beverage') || k.includes('restaurant') || k.includes('f&b')) return '🍽';
  if (k.includes('management')) return '💼';
  if (k.includes('night')) return '🌙';
  return '👥';
};

// Picks the chip's visual style based on dept color + active state.
// When inactive, the chip background is a soft tint of the dept
// color (12% opacity via the hex+1F suffix); active flips to a
// full-strength color background with white text. Colorless depts
// render in the global neutral palette.
const chipStyle = (color, isActive) => {
  if (!color) return undefined;
  if (isActive) {
    return { background: color, borderColor: color, color: 'white' };
  }
  return { background: `${color}1F`, borderColor: `${color}33`, color };
};

const DepartmentChips = ({ departments = [], value, onChange, className = '' }) => (
  <div className={`calendar-dept-chips ${className}`}>
    <button
      type="button"
      className={`calendar-dept-chip ${value == null ? 'is-active' : ''}`}
      onClick={() => onChange(null)}
    >
      <span className="calendar-dept-chip-icon" aria-hidden>👥</span>
      All
    </button>
    {departments.map(d => {
      const isActive = value === d.department_id;
      return (
        <button
          key={d.department_id}
          type="button"
          className={`calendar-dept-chip ${isActive ? 'is-active' : ''} ${d.color ? 'has-color' : ''}`}
          style={chipStyle(d.color, isActive)}
          onClick={() => onChange(d.department_id)}
        >
          <span className="calendar-dept-chip-icon" aria-hidden>{iconForDepartment(d.name)}</span>
          {d.name}
        </button>
      );
    })}
  </div>
);

export default DepartmentChips;
