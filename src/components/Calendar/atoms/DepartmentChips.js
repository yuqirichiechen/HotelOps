import React from 'react';

// Sprint 10: shared department filter chips for the Calendar surface.
// Used in the HandoffsDrawer to scope listed notes to a single
// department, and reusable in Day/Week views when those land in
// 10.1+. The "All" chip is rendered first; setting `value` to null
// represents the all-departments state.
//
// Props:
//   departments — [{ department_id, name }]
//   value       — selected department_id (number), or null for "All"
//   onChange    — (next: number | null) => void
//   className   — optional extra class on the wrapper

const DepartmentChips = ({ departments = [], value, onChange, className = '' }) => (
  <div className={`calendar-dept-chips ${className}`}>
    <button
      type="button"
      className={`calendar-dept-chip ${value == null ? 'is-active' : ''}`}
      onClick={() => onChange(null)}
    >
      All
    </button>
    {departments.map(d => (
      <button
        key={d.department_id}
        type="button"
        className={`calendar-dept-chip ${value === d.department_id ? 'is-active' : ''}`}
        onClick={() => onChange(d.department_id)}
      >
        {d.name}
      </button>
    ))}
  </div>
);

export default DepartmentChips;
