import React from 'react';

// Sprint 10: shared Mon..Sun pill row used at the top of the Day
// view (and elsewhere in 10.1+ Week view). Each pill shows the day
// name + day-of-month number; the selected pill is highlighted.
//
// Pre-built but not wired into the Day view shell in Sprint 10
// itself — the existing scheduling shells already host their own
// week-bar UI. Sprint 10.1 swaps them over.
//
// Props:
//   weekStart — Date (start of the week to render)
//   value     — currently selected YYYY-MM-DD string
//   onChange  — (next: 'YYYY-MM-DD') => void
//   getCount  — optional (dateIso) => { shifts: N, notes: N }; render badges

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isoDay = (d) => {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const DayPickerPills = ({ weekStart, value, onChange, getCount }) => {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  return (
    <div className="calendar-day-pills">
      {days.map(d => {
        const iso = isoDay(d);
        const dow = d.getDay();
        const counts = getCount ? getCount(iso) : null;
        return (
          <button
            key={iso}
            type="button"
            className={`calendar-day-pill ${value === iso ? 'is-active' : ''}`}
            onClick={() => onChange(iso)}
          >
            <span className="calendar-day-pill-name">{DAY_NAMES[dow]}</span>
            <span className="calendar-day-pill-num">{d.getDate()}</span>
            {counts && counts.notes > 0 && (
              <span className="calendar-day-pill-badge">💬 {counts.notes}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default DayPickerPills;
