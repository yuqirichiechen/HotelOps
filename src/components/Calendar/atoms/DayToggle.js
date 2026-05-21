import React from 'react';

// Sprint 11: Day-view full-page Today/Tomorrow toggle (mockup #25).
// Sits above the Notes Center. Switching the toggle moves the
// page's cursor between today and tomorrow — the schedule, the
// Notes Center counts, and the drawer all re-fetch off the cursor.
//
// "Tomorrow Preview" label signals that the right-side state is a
// look-ahead — the schedule on tomorrow side is what's *currently*
// assigned for that date; the page is read-only for tomorrow if a
// future sprint wants to surface that distinction.
//
// Props:
//   today    — Date for the "Today" side (typically new Date() snapped to midnight)
//   tomorrow — Date for the "Tomorrow" side (today + 1 day)
//   value    — 'today' | 'tomorrow' (current selection)
//   onChange — (next: 'today' | 'tomorrow') => void

const fmtBlockDate = (d) => {
  // "Sat Feb 7" — short, headline-like
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

const DayToggle = ({ today, tomorrow, value, onChange }) => (
  <div className="day-toggle" role="tablist" aria-label="Day selector">
    <button
      type="button"
      role="tab"
      aria-selected={value === 'today'}
      className={`day-toggle-btn ${value === 'today' ? 'is-active' : ''}`}
      onClick={() => onChange('today')}
    >
      <span className="day-toggle-icon" aria-hidden>📅</span>
      <span className="day-toggle-text">
        <span className="day-toggle-date">{fmtBlockDate(today)}</span>
        <span className="day-toggle-label">Today</span>
      </span>
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={value === 'tomorrow'}
      className={`day-toggle-btn ${value === 'tomorrow' ? 'is-active' : ''}`}
      onClick={() => onChange('tomorrow')}
    >
      <span className="day-toggle-icon" aria-hidden>📅</span>
      <span className="day-toggle-text">
        <span className="day-toggle-date">{fmtBlockDate(tomorrow)}</span>
        <span className="day-toggle-label">Tomorrow Preview</span>
      </span>
    </button>
  </div>
);

export default DayToggle;
