import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../auth';
import './Timesheet.css';

// Detailed hours view. Pulls /api/me/hours which returns the week summary,
// the per-day aggregates, and raw entries for the week. Daily breakdown
// groups entries client-side; overnight shifts are split at midnight so
// each calendar day reflects the hours actually worked on it.

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

const localDayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const getMondayISO = (d = new Date()) => {
  const date = new Date(d);
  const dow  = date.getDay();
  const off  = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + off);
  return localDayKey(date);
};

// Split an entry that crosses midnight into per-day segments. A same-day
// entry returns a single segment. Each segment carries its day key, its
// own start/end times (clamped at day boundaries), and its own hours.
const splitEntryByDay = (entry) => {
  const start    = new Date(entry.clock_in_time);
  const realEnd  = entry.clock_out_time ? new Date(entry.clock_out_time) : new Date();
  const isLive   = !entry.clock_out_time;
  const startKey = localDayKey(start);
  const endKey   = localDayKey(realEnd);

  if (startKey === endKey) {
    return [{
      key:        `${entry.entry_id}-${startKey}`,
      entry_id:   entry.entry_id,
      day:        startKey,
      segStart:   entry.clock_in_time,
      segEnd:     entry.clock_out_time,
      segHours:   isLive ? null : (entry.hours ?? Math.round(((realEnd - start) / 3600000) * 10) / 10),
      isPart:     false,
      isLive,
    }];
  }

  // Crosses midnight → walk day by day
  const segs = [];
  let cursor  = new Date(start);
  while (cursor < realEnd) {
    const dayKey       = localDayKey(cursor);
    const nextMidnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0, 0);
    const segEndDate   = nextMidnight < realEnd ? nextMidnight : realEnd;
    const isLastSeg    = segEndDate.getTime() === realEnd.getTime();
    const liveSeg      = isLive && isLastSeg;
    const hrs          = (segEndDate - cursor) / 3600000;
    segs.push({
      key:      `${entry.entry_id}-${dayKey}`,
      entry_id: entry.entry_id,
      day:      dayKey,
      segStart: cursor.toISOString(),
      segEnd:   liveSeg ? null : segEndDate.toISOString(),
      segHours: liveSeg ? null : Math.round(hrs * 10) / 10,
      isPart:   true,                              // every segment is part of a multi-day entry
      isLive:   liveSeg,
    });
    cursor = nextMidnight;
  }
  return segs;
};

const computeStatus = (worked, scheduled) => {
  if (scheduled <= 0) {
    return worked > 0
      ? { label: 'Hours logged', tone: 'neutral' }
      : { label: 'Not started',  tone: 'neutral' };
  }
  const r = worked / scheduled;
  if (r < 0.7) return { label: 'Below schedule',     tone: 'low' };
  if (r < 1.0) return { label: 'On track',           tone: 'good' };
  if (r < 1.2) return { label: 'Right on schedule',  tone: 'good' };
  return         { label: 'Approaching overtime',   tone: 'warn' };
};

// ── Component ────────────────────────────────────────────────────────────────

const Timesheet = () => {
  const [weekStart, setWeekStart] = useState(getMondayISO());
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [openDay,   setOpenDay]   = useState(null);
  const [csvOpen,   setCsvOpen]   = useState(false);
  const [csvBusy,   setCsvBusy]   = useState(false);
  const csvWrapRef = useRef(null);

  // Fetch this-week data
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

  // Click-outside closes the CSV menu
  useEffect(() => {
    if (!csvOpen) return;
    const onClick = (e) => {
      if (csvWrapRef.current && !csvWrapRef.current.contains(e.target)) {
        setCsvOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [csvOpen]);

  const today      = localDayKey(new Date());
  const isThisWeek = weekStart === getMondayISO();

  const monday = data ? new Date(data.weekStart + 'T00:00:00') : null;
  const sunday = monday ? new Date(monday.getTime() + 6 * 24 * 3600 * 1000) : null;
  const weekLabel = monday
    ? `${monday.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
    : '—';

  // Group entries → segments by day. Recompute per-day totals from segments
  // so overnight shifts contribute their actual per-day hours.
  const { entriesByDay, dayTotals, weekTotal } = useMemo(() => {
    const map      = {};
    const totals   = {};
    (data?.entries || []).forEach(e => {
      splitEntryByDay(e).forEach(seg => {
        (map[seg.day] = map[seg.day] || []).push(seg);
        if (seg.segHours != null) totals[seg.day] = (totals[seg.day] || 0) + seg.segHours;
      });
    });
    Object.values(map).forEach(arr => arr.sort(
      (a, b) => new Date(a.segStart) - new Date(b.segStart)
    ));
    Object.keys(totals).forEach(k => { totals[k] = Math.round(totals[k] * 10) / 10; });
    const week = Object.values(totals).reduce((s, n) => s + n, 0);
    return { entriesByDay: map, dayTotals: totals, weekTotal: Math.round(week * 10) / 10 };
  }, [data]);

  const total     = weekTotal || 0;
  const scheduled = data?.scheduledHours || 0;
  const status    = computeStatus(total, scheduled);
  const pct       = scheduled > 0 ? Math.min(100, (total / scheduled) * 100) : 0;
  const maxHours  = Math.max(8, ...Object.values(dayTotals));

  const goPrev = () => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    setWeekStart(localDayKey(d));
    setOpenDay(null);
  };
  const goNext = () => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    setWeekStart(localDayKey(d));
    setOpenDay(null);
  };
  const goThis = () => {
    setWeekStart(getMondayISO());
    setOpenDay(null);
  };

  // ── CSV export ─────────────────────────────────────────────────────────────
  const downloadCSV = (rows, filename) => {
    const csv = rows
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const buildRowsFromEntries = (entries) => {
    const rows = [['Date', 'Day', 'Clock In', 'Clock Out', 'Hours']];
    entries
      .slice()
      .sort((a, b) => new Date(a.clock_in_time) - new Date(b.clock_in_time))
      .forEach(e => {
        // Split overnights into per-day rows for export too
        splitEntryByDay(e).forEach(seg => {
          const date = new Date(seg.segStart);
          rows.push([
            seg.day,
            date.toLocaleDateString([], { weekday: 'short' }),
            new Date(seg.segStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            seg.isLive
              ? 'In progress'
              : new Date(seg.segEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            seg.segHours != null ? seg.segHours.toFixed(2) : '',
          ]);
        });
      });
    return rows;
  };

  const exportCSV = async (range) => {
    setCsvOpen(false);
    setCsvBusy(true);
    try {
      let rows;
      let filename;

      if (range === 'week') {
        rows = buildRowsFromEntries(data?.entries || []);
        rows.push([]);
        rows.push(['', '', '', 'Total worked',    total.toFixed(2)]);
        if (scheduled > 0) rows.push(['', '', '', 'Total scheduled', scheduled.toFixed(2)]);
        filename = `timesheet-week-${weekStart}.csv`;
      } else if (range === 'month') {
        const now = new Date();
        const y   = now.getFullYear();
        const m   = now.getMonth();
        const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m + 1, 0).getDate();
        const to   = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const { ok, data: r } = await apiFetch(`/me/entries?from=${from}&to=${to}`);
        if (!ok || !r?.success) throw new Error(r?.message || 'Could not fetch month');
        rows = buildRowsFromEntries(r.entries);
        const totalMonth = (r.entries || [])
          .filter(e => e.clock_out_time)
          .reduce((s, e) => s + e.hours, 0);
        rows.push([]);
        rows.push(['', '', '', 'Total worked', totalMonth.toFixed(2)]);
        filename = `timesheet-${y}-${String(m + 1).padStart(2, '0')}.csv`;
      } else if (range === 'year') {
        const now = new Date();
        const y   = now.getFullYear();
        const { ok, data: r } = await apiFetch(`/me/entries?from=${y}-01-01&to=${y}-12-31`);
        if (!ok || !r?.success) throw new Error(r?.message || 'Could not fetch year');
        rows = buildRowsFromEntries(r.entries);
        const totalYear = (r.entries || [])
          .filter(e => e.clock_out_time)
          .reduce((s, e) => s + e.hours, 0);
        rows.push([]);
        rows.push(['', '', '', 'Total worked', totalYear.toFixed(2)]);
        filename = `timesheet-${y}.csv`;
      }

      downloadCSV(rows, filename);
    } catch (err) {
      console.error('CSV export failed:', err);
      alert('Could not export. Please try again.');
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <div className="ts-page">

      {/* Header */}
      <header className="ts-header">
        <div className="ts-eyebrow">Timesheet</div>
        <div className="ts-controls">
          <div className="ts-week-nav">
            <button className="ts-chev-btn" onClick={goPrev} title="Previous week" aria-label="Previous week">‹</button>
            <h1 className="ts-title">{weekLabel}</h1>
            <button className="ts-chev-btn" onClick={goNext} disabled={isThisWeek} title="Next week" aria-label="Next week">›</button>
          </div>
          <button
            className="ts-this-week-btn"
            onClick={goThis}
            disabled={isThisWeek}
          >
            This week
          </button>
          <div className="ts-controls-spacer" />
          <div className={`ts-csv-wrap ${csvOpen ? 'is-open' : ''}`} ref={csvWrapRef}>
            <button
              className="ts-csv-btn"
              onClick={() => setCsvOpen(o => !o)}
              disabled={csvBusy || !data}
            >
              {csvBusy ? 'Exporting…' : '↓ Export CSV'}
              <span className="ts-csv-caret">▾</span>
            </button>
            {csvOpen && (
              <div className="ts-csv-menu" role="menu">
                <button onClick={() => exportCSV('week')}>
                  This week<span className="ts-csv-menu-meta">{weekLabel}</span>
                </button>
                <button onClick={() => exportCSV('month')}>
                  This month<span className="ts-csv-menu-meta">
                    {new Date().toLocaleDateString([], { month: 'long', year: 'numeric' })}
                  </span>
                </button>
                <button onClick={() => exportCSV('year')}>
                  This year<span className="ts-csv-menu-meta">{new Date().getFullYear()}</span>
                </button>
              </div>
            )}
          </div>
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
          {(data?.days || DAY_NAMES.map((n) => ({ date: '', dayName: n }))).map(d => {
            const h         = dayTotals[d.date] || 0;
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
              const isOpen  = openDay === d.date;
              const isToday = d.date === today;
              const list    = entriesByDay[d.date] || [];
              const hasWork = list.length > 0;
              const dayHrs  = dayTotals[d.date] || 0;
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
                      {hasWork ? fmtHoursMinutes(dayHrs) : '—'}
                    </span>
                  </button>

                  {isOpen && hasWork && (
                    <div className="ts-day-entries">
                      {list.map(seg => (
                        <div key={seg.key} className="ts-entry">
                          <div className="ts-entry-times">
                            {fmtTime(seg.segStart)} → {seg.isLive
                              ? <span className="ts-entry-open">in progress</span>
                              : fmtTime(seg.segEnd)}
                            {seg.isPart && <span className="ts-entry-cont">spans days</span>}
                          </div>
                          <div className="ts-entry-hours">
                            {seg.isLive ? '—' : fmtHoursMinutes(seg.segHours)}
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
