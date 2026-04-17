import React, { useState, useEffect, useCallback } from 'react';

// ── Date helpers ──────────────────────────────────────────────────────────────

const localKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

const entryKey = (isoStr) => localKey(new Date(isoStr));

const getWeekDays = (offset) => {
  const now = new Date();
  const dow  = now.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  const mon  = new Date(now);
  mon.setDate(now.getDate() - diff + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
};

const fmtHHMMSS = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

const fmtDuration = (mins) => {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h)      return `${h}h`;
  return `${m}m`;
};

const fmtTime = (isoStr) =>
  new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

const DAY_LETTERS = ['M','T','W','T','F','S','S'];

// ── LiveDuration (ticks every minute in day sheet) ────────────────────────────

const LiveDuration = ({ startTime }) => {
  const calc = useCallback(
    () => Math.floor((Date.now() - new Date(startTime).getTime()) / 60000),
    [startTime]
  );
  const [mins, setMins] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setMins(calc()), 30000);
    return () => clearInterval(id);
  }, [calc]);
  return <span className="entry-live">{fmtDuration(mins) || '0m'} <span className="live-dot">●</span></span>;
};

// ── DaySheet ─────────────────────────────────────────────────────────────────

const DaySheet = ({ day, entries, clockedIn, clockInTime, onClose }) => {
  const key    = localKey(day);
  const isToday = key === localKey(new Date());

  const dayEntries = entries.filter(e => entryKey(e.clock_in_time) === key);

  const allEntries = [...dayEntries];
  if (isToday && clockedIn && clockInTime && !dayEntries.some(e => !e.clock_out_time)) {
    allEntries.unshift({ clock_in_time: clockInTime, clock_out_time: null, total_minutes: null, _live: true });
  }

  const totalMins = allEntries.reduce((sum, e) => {
    if (e.total_minutes) return sum + Number(e.total_minutes);
    if (!e.clock_out_time && e.clock_in_time)
      return sum + Math.floor((Date.now() - new Date(e.clock_in_time).getTime()) / 60000);
    return sum;
  }, 0);

  return (
    <>
      <div className="daysheet-backdrop" onClick={onClose} />
      <div className="daysheet">
        <div className="daysheet-handle" onClick={onClose} />
        <div className="daysheet-header">
          <div className="daysheet-date">
            {day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div className="daysheet-total">
            {fmtDuration(totalMins) || '—'}
          </div>
        </div>

        {allEntries.length === 0 ? (
          <div className="daysheet-empty">No entries for this day</div>
        ) : (
          <div className="daysheet-entries">
            {allEntries.map((e, i) => (
              <div key={i} className={`daysheet-entry ${e._live ? 'entry-open' : ''}`}>
                <div className="entry-times">
                  <span className="entry-time">{fmtTime(e.clock_in_time)}</span>
                  <span className="entry-arrow">→</span>
                  <span className="entry-time">{e.clock_out_time ? fmtTime(e.clock_out_time) : 'Now'}</span>
                </div>
                <div className="entry-duration">
                  {e.clock_out_time
                    ? fmtDuration(Number(e.total_minutes)) || '—'
                    : <LiveDuration startTime={e.clock_in_time} />
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

// ── WeekStrip ─────────────────────────────────────────────────────────────────

const WeekStrip = ({ entries, loading, weekOffset, onWeekChange, onSelectDay, clockedIn, clockInTime }) => {
  const days   = getWeekDays(weekOffset);
  const todayK = localKey(new Date());

  const getDayMins = (date) => {
    const key = localKey(date);
    let mins = entries
      .filter(e => entryKey(e.clock_in_time) === key)
      .reduce((sum, e) => sum + (e.total_minutes ? Number(e.total_minutes) : 0), 0);
    if (key === todayK && clockedIn && clockInTime) {
      mins += Math.floor((Date.now() - new Date(clockInTime).getTime()) / 60000);
    }
    return mins;
  };

  const weekLabel = weekOffset === 0
    ? 'This week'
    : weekOffset === -1
    ? 'Last week'
    : `${Math.abs(weekOffset)} weeks ago`;

  const weekTotal = days.reduce((sum, d) => sum + getDayMins(d), 0);

  return (
    <div className="week-strip">
      <div className="week-nav">
        <button className="week-nav-btn" onClick={() => onWeekChange(w => w - 1)}>‹</button>
        <div className="week-nav-center">
          <span className="week-label">{weekLabel}</span>
          {weekTotal > 0 && (
            <span className="week-total">{fmtDuration(weekTotal)}</span>
          )}
        </div>
        <button
          className="week-nav-btn"
          onClick={() => onWeekChange(w => w + 1)}
          disabled={weekOffset >= 0}
        >›</button>
      </div>

      <div className="week-days">
        {days.map((day, i) => {
          const key    = localKey(day);
          const isToday  = key === todayK;
          const isFuture = day > new Date() && !isToday;
          const mins   = getDayMins(day);
          const hasWork = mins > 0;

          return (
            <button
              key={i}
              className={`week-day ${isToday ? 'day-today' : ''} ${hasWork ? 'day-worked' : ''} ${isFuture ? 'day-future' : ''}`}
              onClick={() => !isFuture && onSelectDay(day)}
              disabled={isFuture}
            >
              <span className="wday-letter">{DAY_LETTERS[i]}</span>
              <span className="wday-num">{day.getDate()}</span>
              <span className="wday-bar">
                {loading
                  ? <span className="wday-loading" />
                  : hasWork
                  ? <span className="wday-hours">{fmtDuration(mins)}</span>
                  : <span className="wday-dot" />
                }
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── DashboardFace ─────────────────────────────────────────────────────────────

const DashboardFace = ({ employee, entries, histLoading, loading, onClockIn, onClockOut, onBack }) => {
  const [elapsed,     setElapsed]     = useState(0);
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    if (!employee.clocked_in || !employee.clock_in_time) return;
    const base = new Date(employee.clock_in_time).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - base) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [employee.clocked_in, employee.clock_in_time]);

  return (
    <div className="dashboard-face">

      {/* Header */}
      <div className="dash-header">
        <button className="dash-back" onClick={onBack}>‹</button>
        <div className="dash-emp-info">
          <div className="dash-emp-avatar">{employee.name.charAt(0).toUpperCase()}</div>
          <div>
            <div className="dash-emp-name">{employee.name}</div>
            <div className="dash-emp-role">{employee.role.replace('_',' ')}</div>
          </div>
        </div>
      </div>

      {/* Clock section */}
      <div className={`dash-clock-card ${employee.clocked_in ? 'dash-active' : 'dash-idle'}`}>
        {employee.clocked_in ? (
          <>
            <div className="dash-timer">{fmtHHMMSS(elapsed)}</div>
            <div className="dash-timer-label">Current shift</div>
            <button className="dash-action-btn dash-btn-out" onClick={onClockOut} disabled={loading}>
              {loading ? '…' : 'Clock Out'}
            </button>
          </>
        ) : (
          <>
            <div className="dash-status-icon">⏸</div>
            <div className="dash-timer-label">Not clocked in</div>
            <button className="dash-action-btn dash-btn-in" onClick={onClockIn} disabled={loading}>
              {loading ? '…' : 'Clock In'}
            </button>
          </>
        )}
      </div>

      {/* Week strip */}
      <WeekStrip
        entries={entries}
        loading={histLoading}
        weekOffset={weekOffset}
        onWeekChange={setWeekOffset}
        onSelectDay={setSelectedDay}
        clockedIn={employee.clocked_in}
        clockInTime={employee.clock_in_time}
      />

      {/* Day detail sheet */}
      {selectedDay && (
        <DaySheet
          day={selectedDay}
          entries={entries}
          clockedIn={employee.clocked_in}
          clockInTime={employee.clock_in_time}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
};

export default DashboardFace;
