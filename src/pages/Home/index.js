import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiFetch } from '../../auth';
import './Home.css';

// At-a-glance home: greeting, hours this week, clocked-in indicator, three
// recent shifts, and a Clock In/Out CTA. Detailed breakdowns (bar chart,
// week navigation, status pill, scheduled vs worked) live on the Hours
// page (Sprint 4).

const greetingFor = (h) => {
  if (h >= 5  && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  return 'Good evening';
};

const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

const formatHours = (h) => {
  if (h == null || isNaN(h) || h === 0) return '0h';
  if (h % 1 === 0)                       return `${h}h`;
  return `${h.toFixed(1)}h`;
};

const getMondayISO = (d = new Date()) => {
  const date = new Date(d);
  const dow  = date.getDay();
  const off  = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + off);
  return date.toISOString().split('T')[0];
};

const Home = () => {
  const { user } = useAuth();
  const nav      = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch(`/me/hours?weekStart=${getMondayISO()}`).then(({ data }) => {
      if (!active) return;
      if (data?.success) setData(data);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const now       = new Date();
  const greeting  = greetingFor(now.getHours());
  const firstName = (user?.name || '').split(' ')[0];
  const total     = data?.totalHours || 0;
  const onClock   = !!data?.currentlyClockedIn;
  const recent    = (data?.recentShifts || []).slice(0, 3);

  return (
    <div className="home-page">

      {/* Greeting */}
      <div className="home-greeting">
        <div className="home-greeting-eyebrow">
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <h1 className="home-greeting-title">
          {greeting}{firstName ? `, ${firstName}` : ''}.
        </h1>
      </div>

      {/* Hero card — this week + status */}
      <div className="home-hero">
        <div className="home-hero-eyebrow">This week</div>
        <div className="home-hero-num">{formatHours(total)}</div>
        <div className={`home-hero-meta ${onClock ? 'is-live' : ''}`}>
          {onClock ? (
            <>
              <span className="home-live-dot" />
              Clocked in since {formatTime(data.openClockInTime)}
            </>
          ) : (
            <>{recent.length > 0 ? 'Not on the clock right now.' : 'No shifts logged yet.'}</>
          )}
        </div>
      </div>

      {/* Recent shifts */}
      <div className="home-recent">
        <h2 className="home-recent-title">Recent</h2>
        {loading && <div className="home-empty">Loading…</div>}
        {!loading && recent.length === 0 && (
          <div className="home-empty">No shifts yet.</div>
        )}
        {!loading && recent.length > 0 && (
          <ul className="home-recent-list">
            {recent.map(s => (
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
      </div>

      {/* CTA */}
      <button
        className={`home-cta ${onClock ? 'out' : 'in'}`}
        onClick={() => nav('/timeclock')}
      >
        {onClock ? 'Clock Out →' : 'Clock In →'}
      </button>

    </div>
  );
};

export default Home;
