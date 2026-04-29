import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../auth';
import './Timesheet.css';

// Detailed hours view. Pulls /api/me/hours which returns the week summary,
// the per-day aggregates, AND the raw entries for the week. Daily breakdown
// groups entries client-side and lets each day expand inline.

const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

const fmtHours = (h) => {
  if (h == null || isNaN(h) || h === 0) return '0h';
  if (h % 1 === 0)                       return `${h}h`;
  return `${h.toFixed(1)}h`;
};

const fmtHoursMinutes = (h) => {
  if (h == null || isNaN(h) || h === 0) return '0h 0m';
  const hours = Math.floor(h);
  const mins  = Math.round((h - hours) * 60);
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours)         return `${hours}h`;
  return `${mins}m`;
};

const getMondayISO = (d = new Date()) => {
  const date = new Date(d);
  const dow  = date.getDay();
  const off  = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + off);
  return date.toISOString().split('T')[0];
};

const computeStatus = (worked, scheduled) => {
  if (scheduled <= 0) {
    return worked > 0
      ? { label: 'Hours logged',  tone: 'neutral' }
      : { label: 'Not started',   tone: 'neutral' };
  }
  const r = worked / scheduled;
  if (r < 0.7) return { label: 'Below schedule',     tone: 'low' };
  if (r < 1.0) return { label: 'On track',           tone: 'good' };
  if (r < 1.2) return { label: 'Right on schedule',  tone: 'good' };
  return         { label: 'Approaching overtime',   tone: 'warn' };
};

const Timesheet = () => {
  const [weekStart, setWeekStart] = useState(getMondayISO());
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [openDay,   setOpenDay]   = useState(null); // ISO date or null

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/me/hours?weekStart=${weekStart}`).then(({ data }) => {
      if (!active) return;
      if (data?.success) setData(data);
      setLoading(false);
    });
    return () => { active = false; };
  }, [weekStart]);

  const today      = new Date().toISOString().split('T')[0];
  const isThisWeek = weekStart === getMondayISO();

  const monday  = data ? new Date(data.weekStart + 'T00:00:00') : null;
  const sunday  = monday ? new Date(monday.getTime() + 6 * 24 * 3600 * 1000) : null;
  const weekLabel = monday
    ? `${monday.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
    : '—';

  const total     = data?.totalHours     || 0;
  const scheduled = data?.scheduledHours || 0;
  const status    = computeStatus(total, scheduled);
  const pct       = scheduled > 0 ? Math.min(100, (total / scheduled) * 100) : 0;
  const maxHours  = Math.max(8, ...(data?.days || []).map(d => d.hours || 0));

  // Group raw entries by day (YYYY-MM-DD)
  const entriesByDay = useMemo(() => {
    const map = {};
    (data?.entries || []).forEach(e => {
      const key = new Date(e.clock_in_time).toISOString().split('T')[0];
      (map[key] = map[key] || []).push(e);
    });
    // Sort each day's entries by time
    Object.values(map).forEach(arr => arr.sort(
      (a, b) => new Date(a.clock_in_time) - new Date(b.clock_in_time)
    ));
    return map;
  }, [data]);

  const goPrev = () => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    setWeekStart(d.toISOString().split('T')[0]);
    setOpenDay(null);
  };
  const goNext = () => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    setWeekStart(d.toISOString().split('T')[0]);
    setOpenDay(null);
  };
  const goThis = () => {
    setWeekStart(getMondayISO());
    setOpenDay(null);
  };

  const exportCSV = () => {
    if (!data) return;
    const rows = [['Date', 'Day', 'Clock In', 'Clock Out', 'Hours']];
    data.days.forEach(d => {
      const list = entriesByDay[d.date] || [];
      if (list.length === 0) {
        rows.push([d.date, d.dayName, '', '', '']);
      } else {
        list.forEach(e => {
          rows.push([
            d.date,
            d.dayName,
            new Date(e.clock_in_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            e.clock_out_time
              ? new Date(e.clock_out_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
              : 'In progress',
            e.clock_out_time ? e.hours.toFixed(2) : '',
          ]);
        });
      }
    });
    rows.push([]);
    rows.push(['', '', '', 'Total worked',    total.toFixed(2)]);
    rows.push(['', '', '', 'Total scheduled', scheduled.toFixed(2)]);

    const csv = rows
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `timesheet-${weekStart}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ts-page">

      {/* Header */}
      <header className="ts-header">
        <div className="ts-header-left">
          <div className="ts-eyebrow">Timesheet</div>
          <h1 className="ts-title">{weekLabel}</h1>
        </div>
        <div className="ts-actions">
          <button className="ts-nav-btn" onClick={goPrev} title="Previous week">‹</button>
          <button className="ts-nav-btn" onClick={goThis} disabled={isThisWeek}>This week</button>
          <button className="ts-nav-btn" onClick={goNext} disabled={isThisWeek} title="Next week">›</button>
          <button className="ts-csv-btn" onClick={exportCSV} disabled={!data}>↓ Export CSV</button>
        </div>
      </header>

      {/* Hero stat */}
      <section className="ts-hero">
        <div className="ts-hero-totals">
          <div className="ts-hero-eyebrow">Total worked</div>
          <div className="ts-hero-num">{fmtHours(total)}</div>
          <div className="ts-hero-meta">
            {scheduled > 0 ? `of ${fmtHours(scheduled)} scheduled` : 'No shifts scheduled this week'}
          </div>
        </div>
        <div className="ts-hero-side">
          <div className={`ts-status-pill tone-${status.tone}`}>{status.label}</div>
          {scheduled > 0 && (
            <>
              <div className="ts-progress">
                <div className="ts-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="ts-hero-pct">{Math.round(pct)}%</div>
            </>
          )}
        </div>
      </section>

      {/* Bar chart */}
      <section className="ts-chart-card">
        <h2 className="ts-card-title">Daily totals</h2>
        <div className="ts-chart">
          {(data?.days || DAY_NAMES.map((n, i) => ({ date: '', dayName: n, hours: 0 }))).map(d => {
            const h         = d.hours || 0;
            const heightPct = maxHours > 0 ? (h / maxHours) * 100 : 0;
            const isToday   = d.date === today;
            const isOpen    = openDay === d.date;
            return (
              <div
                key={d.date || d.dayName}
                className={`ts-chart-col${isToday ? ' is-today' : ''}${isOpen ? ' is-selected' : ''}`}
                onClick={() => d.date && setOpenDay(prev => prev === d.date ? null : d.date)}
              >
                <div className="ts-chart-bar-track">
                  <div
                    className="ts-chart-bar"
                    style={{ height: `${heightPct}%`, opacity: h ? 1 : 0.2 }}
                  />
                </div>
                <div className="ts-chart-hours">{h ? fmtHours(h) : ''}</div>
                <div className="ts-chart-day">{d.dayName}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Daily breakdown */}
      <section className="ts-daily-card">
        <h2 className="ts-card-title">Daily breakdown</h2>
        {loading && <div className="ts-loading">Loading…</div>}
        {!loading && (
          <ul className="ts-daily-list">
            {(data?.days || []).map(d => {
              const isOpen   = openDay === d.date;
              const isToday  = d.date === today;
              const list     = entriesByDay[d.date] || [];
              const hasWork  = list.length > 0;
              return (
                <li key={d.date} className={`ts-day${isOpen ? ' is-open' : ''}`}>
                  <button
                    className="ts-day-header"
                    onClick={() => setOpenDay(prev => prev === d.date ? null : d.date)}
                    disabled={!hasWork}
                  >
                    <span className="ts-day-chevron">{hasWork ? '›' : '·'}</span>
                    <span>
                      <span className="ts-day-name">
                        {new Date(d.date + 'T00:00:00').toLocaleDateString([], {
                          weekday: 'long', month: 'short', day: 'numeric',
                        })}
                      </span>
                      <span className="ts-day-name-meta">
                        {hasWork ? `${list.length} ${list.length === 1 ? 'entry' : 'entries'}` : 'no shifts'}
                      </span>
                    </span>
                    {isToday && <span className="ts-day-badge is-today">Today</span>}
                    <span className={`ts-day-hours${!hasWork ? ' ts-day-empty-hours' : ''}`}>
                      {hasWork ? fmtHoursMinutes(d.hours) : '—'}
                    </span>
                  </button>

                  {isOpen && hasWork && (
                    <div className="ts-day-entries">
                      {list.map(e => (
                        <div key={e.entry_id} className="ts-entry">
                          <div className="ts-entry-times">
                            {fmtTime(e.clock_in_time)} → {e.clock_out_time
                              ? fmtTime(e.clock_out_time)
                              : <span className="ts-entry-open">in progress</span>}
                          </div>
                          <div className="ts-entry-hours">
                            {e.clock_out_time ? fmtHoursMinutes(e.hours) : '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
            {!loading && (data?.days || []).length === 0 && (
              <li className="ts-loading">No data for this week.</li>
            )}
          </ul>
        )}
      </section>

    </div>
  );
};

export default Timesheet;
