import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiFetch } from '../../auth';
import './Home.css';

// ── helpers ─────────────────────────────────────────────────────────────────

const greetingFor = (hour) => {
  if (hour >= 5  && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatHours = (h) => {
  if (h == null || isNaN(h) || h === 0) return '0h';
  if (h % 1 === 0) return `${h}h`;
  return `${h.toFixed(1)}h`;
};

// Returns YYYY-MM-DD of the Monday of `date`'s week.
const getMondayISO = (date = new Date()) => {
  const d   = new Date(date);
  const day = d.getDay();              // 0=Sun, 1=Mon, ...
  const off = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + off);
  return d.toISOString().split('T')[0];
};

const computeStatus = (totalHours, scheduledHours) => {
  if (scheduledHours <= 0) {
    if (totalHours > 0) return { label: 'Hours logged', tone: 'neutral' };
    return { label: 'Not started', tone: 'neutral' };
  }
  const r = totalHours / scheduledHours;
  if (r < 0.7) return { label: 'Below schedule',       tone: 'low' };
  if (r < 1.0) return { label: 'On track',             tone: 'good' };
  if (r < 1.2) return { label: 'Right on schedule',    tone: 'good' };
  return         { label: 'Approaching overtime',     tone: 'warn' };
};

// ── component ───────────────────────────────────────────────────────────────

const Home = () => {
  const { user } = useAuth();
  const nav      = useNavigate();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [weekStart, setWeekStart] = useState(getMondayISO());

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

  const now       = new Date();
  const greeting  = greetingFor(now.getHours());
  const firstName = (user?.name || '').split(' ')[0];
  const today     = now.toISOString().split('T')[0];

  const total       = data?.totalHours     || 0;
  const scheduled   = data?.scheduledHours || 0;
  const status      = computeStatus(total, scheduled);
  const maxHours    = Math.max(8, ...(data?.days || []).map(d => d.hours || 0));
  const isThisWeek  = weekStart === getMondayISO();

  const monday = data ? new Date(data.weekStart + 'T00:00:00') : null;
  const sunday = monday ? new Date(monday.getTime() + 6 * 24 * 3600 * 1000) : null;
  const weekLabel = monday
    ? `${monday.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
    : '';

  const goPrev = () => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    setWeekStart(d.toISOString().split('T')[0]);
  };
  const goNext = () => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    setWeekStart(d.toISOString().split('T')[0]);
  };

  return (
    <div className="home-page">

      {/* Greeting */}
      <header className="home-greeting">
        <div>
          <div className="home-greeting-eyebrow">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="home-greeting-title">
            {greeting}{firstName ? `, ${firstName}` : ''}.
          </h1>
          <p className="home-greeting-sub">
            {data?.currentlyClockedIn ? (
              <>
                <span className="clocked-in-dot" />
                Clocked in since {formatTime(data.openClockInTime)}.
              </>
            ) : 'Have a great shift.'}
          </p>
        </div>
        <button className="home-clock-btn" onClick={() => nav('/timeclock')}>
          {data?.currentlyClockedIn ? 'Clock out →' : 'Clock in →'}
        </button>
      </header>

      {/* Hero / hours */}
      <section className="home-hero-card">
        <div className="home-hero-head">
          <div>
            <div className="home-hero-eyebrow">This week</div>
            <div className="home-hero-week">{weekLabel || '—'}</div>
          </div>
          <div className="home-hero-nav">
            <button className="home-hero-nav-btn" onClick={goPrev} title="Previous week">‹</button>
            <button
              className="home-hero-nav-btn"
              onClick={() => setWeekStart(getMondayISO())}
              disabled={isThisWeek}
            >
              This week
            </button>
            <button
              className="home-hero-nav-btn"
              onClick={goNext}
              title="Next week"
              disabled={isThisWeek}
            >›</button>
          </div>
        </div>

        <div className="home-hero-stats">
          <div>
            <div className="home-hero-total-num">{formatHours(total)}</div>
            <div className="home-hero-total-meta">
              {scheduled > 0 ? `of ${formatHours(scheduled)} scheduled` : 'No shifts scheduled'}
            </div>
          </div>
          <div className={`home-status-pill tone-${status.tone}`}>{status.label}</div>
        </div>

        {scheduled > 0 && (
          <div className="home-progress">
            <div
              className="home-progress-fill"
              style={{ width: `${Math.min(100, (total / scheduled) * 100)}%` }}
            />
          </div>
        )}

        {/* Day bar chart */}
        <div className="home-chart">
          {(data?.days || Array.from({ length: 7 }, (_, i) => ({ date: '', dayName: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i], hours: 0 }))).map(d => {
            const h         = d.hours || 0;
            const heightPct = maxHours > 0 ? (h / maxHours) * 100 : 0;
            const isToday   = d.date === today;
            return (
              <div key={d.date || d.dayName} className={`home-chart-col${isToday ? ' is-today' : ''}`}>
                <div className="home-chart-bar-track">
                  <div
                    className="home-chart-bar"
                    style={{ height: `${heightPct}%`, opacity: h ? 1 : 0.2 }}
                  />
                </div>
                <div className="home-chart-hours">{h ? formatHours(h) : ''}</div>
                <div className="home-chart-day">{d.dayName}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent shifts */}
      <section className="home-recent-card">
        <h2 className="home-card-title">Recent shifts</h2>
        {loading && <div className="home-empty">Loading…</div>}
        {!loading && (!data?.recentShifts || data.recentShifts.length === 0) && (
          <div className="home-empty">No shifts yet — clock in to get started.</div>
        )}
        {!loading && data?.recentShifts?.length > 0 && (
          <ul className="home-recent-list">
            {data.recentShifts.map(s => (
              <li key={s.entry_id} className="home-recent-row">
                <div className="home-recent-date">
                  {new Date(s.clock_in_time).toLocaleDateString([], {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                </div>
                <div className="home-recent-times">
                  {formatTime(s.clock_in_time)} – {s.clock_out_time
                    ? formatTime(s.clock_out_time)
                    : <span className="home-recent-open">in progress</span>}
                </div>
                <div className="home-recent-hours">
                  {s.clock_out_time ? formatHours(s.hours) : '—'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default Home;
