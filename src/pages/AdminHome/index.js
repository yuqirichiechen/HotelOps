import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useView } from '../../shells/ViewContext';
import { apiFetch, useAuth } from '../../auth';
import './AdminHome.css';

// Manager dashboard. Stats banner cards are clickable and drive a single
// detail panel below — clicking "On the clock" shows currently working,
// "Coming up today" shows scheduled-not-yet-started, "Pending OT" shows
// staff over the weekly OT threshold whose hours haven't been approved.
// "Hours this week" stays informational.
//
// Pending OT lives on Home as an hours total (operational lens — "how
// much OT do I owe this week?") and on Staff as a head count (roster
// lens — "who needs my approval?"). Same source data, different unit.

const fmtSince = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m`;
  const h  = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
};

const fmtUpdated = (date) => {
  if (!date) return '';
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 5)  return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  return m === 1 ? '1m ago' : `${m}m ago`;
};

// Sprint 16.5: 'coming-up' removed per GM — the "Past scheduled
// end" alert is the more actionable signal (and is harder to
// notice when buried under the still-coming-up list).
const VIEWS = ['on-clock', 'overdue', 'hours', 'pending-ot'];

// Sprint 16.3: pretty "Xh Ym past" format for the overdue list.
const fmtOver = (mins) => {
  if (mins < 60) return `${mins}m past`;
  const h = Math.floor(mins / 60);
  const rm = mins % 60;
  return rm ? `${h}h ${rm}m past` : `${h}h past`;
};

// Sprint 16.3: format a HH:MM:SS-or-ISO timestamp as "5:00 PM".
const fmtClock = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const AdminHome = () => {
  const { user, logout } = useAuth();
  const nav              = useNavigate();
  // Sprint 11.2.1: staff-card clicks drill into the StaffDetail
  // view inside the AdminShell; `nav` stays for the external
  // sign-in retry (the auth-error fallback below).
  const { goTo }         = useView();

  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const [view,        setView]        = useState('on-clock');
  // Sprint 16.3: separate fetch for the "Past scheduled end" list.
  // Kept out of /admin/dashboard so it can refresh on a different
  // cadence and the dashboard query doesn't grow further.
  const [overdue,        setOverdue]        = useState([]);
  const [overdueLoading, setOverdueLoading] = useState(true);
  const [overdueBusy,    setOverdueBusy]    = useState(null); // user_id being clocked out

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const { ok, status, data } = await apiFetch('/admin/dashboard');
    if (ok && data?.success) {
      setData(data);
      if (data.errors?.length) {
        setError({
          status,
          message: `Some data couldn't load:\n${data.errors.join('\n')}`,
          isAuth:  false,
          isWarn:  true,
        });
      } else {
        setError(null);
      }
      setLastUpdated(new Date());
    } else {
      setError({
        status,
        message: data?.message || `Could not load dashboard${status ? ` (HTTP ${status})` : ''}.`,
        isAuth:  status === 401 || status === 403,
        isWarn:  false,
      });
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Sprint 15.10: cost optimization. Was a hard 60s poll, forever,
  // regardless of whether the tab was visible — kept Neon's compute
  // warm the entire workday. Now: poll every 5 min AND only when
  // the tab is foregrounded. Falls back to an on-focus refresh so
  // the dashboard is fresh whenever the GM comes back to it.
  useEffect(() => {
    refresh();
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const id = setInterval(tick, 300_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  // Sprint 16.3: fetch the overdue list on the same triggers as
  // the dashboard refresh. Tz-aware so "scheduled end" lines up
  // with the admin's local clock.
  const refreshOverdue = useCallback(async () => {
    setOverdueLoading(true);
    const tz = new Date().getTimezoneOffset();
    const { ok, data } = await apiFetch(`/admin/still-clocked-in?tz_offset_minutes=${tz}`);
    if (ok && data?.success) setOverdue(data.overdue || []);
    else                     setOverdue([]);
    setOverdueLoading(false);
  }, []);
  useEffect(() => {
    refreshOverdue();
    const tick = () => {
      if (document.visibilityState === 'visible') refreshOverdue();
    };
    const id = setInterval(tick, 300_000);
    const onFocus = () => refreshOverdue();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshOverdue]);

  // Sprint 16.3: admin-initiated clock-out from the alert list.
  const clockOutStaff = useCallback(async (row) => {
    if (!window.confirm(
      `Clock out ${row.name}? Their shift will close at the current time.`
    )) return;
    setOverdueBusy(row.user_id);
    const { ok, data } = await apiFetch(`/admin/staff/${row.user_id}/clock-out`, {
      method: 'POST',
    });
    setOverdueBusy(null);
    if (!ok || !data?.success) {
      window.alert(data?.message || 'Could not clock out.');
      return;
    }
    // Refresh both lists so the row falls off + on-clock count
    // drops by one.
    refreshOverdue();
    refresh();
  }, [refresh, refreshOverdue]);

  // Tick "X ago" label every 10s without re-fetching
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  const now       = new Date();
  const adminName = user?.name || user?.username || 'admin';

  // Sprint 16.5: Coming-up-today memo + stat card + view branch
  // removed. The "Past scheduled end" alert covers the more
  // urgent failure mode (staff who forgot to clock out), and
  // "Coming up" was rarely used per GM feedback.

  // Group currently working by department
  const workingByDept = useMemo(() => {
    const map = {};
    (data?.currentlyWorking || []).forEach(w => {
      const key = w.department || 'Unassigned';
      (map[key] = map[key] || []).push(w);
    });
    return map;
  }, [data]);
  const workingDepts = Object.keys(workingByDept).sort();

  const stats = [
    {
      key:       'on-clock',
      eyebrow:   'On the clock',
      value:     loading ? '—' : (data?.onTheClockCount ?? 0),
      meta:      data?.onTheClockCount ? 'right now' : 'no one currently',
      tone:      data?.onTheClockCount ? 'live' : null,
      clickable: true,
    },
    {
      key:       'hours',
      eyebrow:   'Hours this week',
      value:     loading ? '—' : (data?.weekHoursTotal ?? 0),
      meta:      'across all staff',
      tone:      null,
      clickable: true,
    },
    {
      key:       'pending-ot',
      eyebrow:   'Pending OT',
      value:     loading ? '—' : `${data?.weekOTTotal ?? 0}h`,
      meta:      data?.weekOTTotal
        ? `${(data?.staffWithPendingOT || []).length} ${(data?.staffWithPendingOT || []).length === 1 ? 'person' : 'people'} over threshold`
        : 'no one over threshold',
      tone:      data?.weekOTTotal ? 'action' : null,
      clickable: true,
    },
    {
      // Sprint 16.3: Past-scheduled-end alert.
      key:       'overdue',
      eyebrow:   'Past scheduled end',
      value:     overdueLoading ? '—' : overdue.length,
      meta:      overdue.length
        ? 'still on the clock'
        : 'everyone is on schedule',
      tone:      overdue.length > 0 ? 'warn' : null,
      clickable: true,
    },
  ];

  // ── Detail card content (varies by selected view) ─────────────────────────
  const renderDetail = () => {
    if (loading) {
      return (
        <>
          <div className="adm-skel" />
          <div className="adm-skel" style={{ width: '70%' }} />
          <div className="adm-skel" />
        </>
      );
    }

    if (view === 'on-clock') {
      const total = data?.currentlyWorking?.length || 0;
      return (
        <>
          <div className="adm-card-head">
            <h2 className="adm-card-title">On the floor</h2>
            {total > 0 && (
              <span className="adm-card-count is-live">
                <span className="adm-pulse-dot" />
                {total} {total === 1 ? 'person' : 'people'}
              </span>
            )}
          </div>
          {total === 0 ? (
            <div className="adm-empty">
              No one is clocked in right now.
              <div className="adm-empty-sub">
                Open clock-ins (entries with no clock-out yet) appear here.
              </div>
            </div>
          ) : workingDepts.map(dept => (
            <div key={dept} className="adm-working-group">
              <div className="adm-group-title">{dept}</div>
              <ul className="adm-working-list">
                {workingByDept[dept].map(w => (
                  <li
                    key={w.user_id}
                    className="adm-working-row"
                    onClick={() => goTo('staffDetail', { userId: w.user_id })}
                  >
                    <div className="adm-working-avatar">
                      {(w.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="adm-working-info">
                      <div className="adm-working-name">{w.name}</div>
                      <div className="adm-working-meta">
                        {(w.role || '').replace('_', ' ')}
                      </div>
                    </div>
                    <div className="adm-working-since">
                      {fmtSince(w.clock_in_time)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      );
    }



    if (view === 'hours') {
      const list   = data?.staffHoursThisWeek || [];
      const maxHrs = Math.max(0, ...list.map(s => s.hours));
      return (
        <>
          <div className="adm-card-head">
            <h2 className="adm-card-title">Hours this week — by employee</h2>
            {list.length > 0 && (
              <span className="adm-card-count">
                {list.length} {list.length === 1 ? 'person' : 'people'}
              </span>
            )}
          </div>
          {list.length === 0 ? (
            <div className="adm-empty">
              No hours logged this week yet.
              <div className="adm-empty-sub">
                Each employee with at least one clock-in this week will appear here.
              </div>
            </div>
          ) : (
            <ul className="adm-hours-list">
              {list.map(s => {
                const pct = maxHrs > 0 ? (s.hours / maxHrs) * 100 : 0;
                return (
                  <li
                    key={s.user_id}
                    className="adm-hours-row"
                    onClick={() => goTo('staffDetail', { userId: s.user_id })}
                  >
                    <div className="adm-hours-info">
                      <div className="adm-hours-name">{s.name}</div>
                      <div className="adm-hours-meta">{s.department || 'Unassigned'}</div>
                    </div>
                    <div className="adm-hours-bar-wrap">
                      <div className="adm-hours-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="adm-hours-num">{s.hours}h</div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      );
    }

    if (view === 'overdue') {
      // Sprint 16.3: list staff currently clocked in past their
      // scheduled end (by ≥ admin-set threshold minutes).
      return (
        <>
          <div className="adm-card-head">
            <h2 className="adm-card-title">Past scheduled end</h2>
            {overdue.length > 0 && (
              <span className="adm-card-count adm-card-count-warn">
                {overdue.length} {overdue.length === 1 ? 'person' : 'people'}
              </span>
            )}
          </div>
          {overdueLoading ? (
            <div className="adm-empty">Checking…</div>
          ) : overdue.length === 0 ? (
            <div className="adm-empty">
              Everyone is on schedule.
              <div className="adm-empty-sub">
                Staff currently clocked in past their scheduled end appear here so you can call them or clock them out manually.
              </div>
            </div>
          ) : (
            <ul className="adm-overdue-list">
              {overdue.map(row => (
                <li key={row.entry_id} className="adm-overdue-row">
                  <div
                    className="adm-overdue-info"
                    onClick={() => goTo('staffDetail', { userId: row.user_id })}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="adm-overdue-name">{row.name}</div>
                    <div className="adm-overdue-meta">
                      {row.department || 'Unassigned'}
                      {' · '}
                      Scheduled to end {fmtClock(row.scheduled_end)}
                      {' · '}
                      <span className="adm-overdue-over">{fmtOver(row.minutes_over)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="adm-overdue-btn"
                    onClick={(e) => { e.stopPropagation(); clockOutStaff(row); }}
                    disabled={overdueBusy === row.user_id}
                  >
                    {overdueBusy === row.user_id ? '…' : 'Clock out'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }

    if (view === 'pending-ot') {
      const list = data?.staffWithPendingOT || [];
      return (
        <>
          <div className="adm-card-head">
            <h2 className="adm-card-title">Pending OT approval</h2>
            {list.length > 0 && (
              <span className="adm-card-count">
                {list.length} {list.length === 1 ? 'person' : 'people'}
              </span>
            )}
          </div>
          {list.length === 0 ? (
            <div className="adm-empty">
              No one is over the weekly OT threshold.
              <div className="adm-empty-sub">
                When staff log more than the threshold, their pending hours show here for approval.
              </div>
            </div>
          ) : (
            <ul className="adm-hours-list">
              {list.map(s => (
                <li
                  key={s.user_id}
                  className="adm-hours-row"
                  onClick={() => goTo('staffDetail', { userId: s.user_id })}
                >
                  <div className="adm-hours-info">
                    <div className="adm-hours-name">{s.name}</div>
                    <div className="adm-hours-meta">
                      {s.department || 'Unassigned'} · {s.hours}h logged
                    </div>
                  </div>
                  <div className="adm-hours-num">+{s.pending_ot_hours}h</div>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }

    return null;
  };

  return (
    <div className="adm-page">

      {/* Greeting + refresh */}
      <div className="adm-greeting-row">
        <div className="adm-greeting">
          <div className="adm-greeting-eyebrow">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="adm-greeting-title">Welcome, {adminName}.</h1>
        </div>
        <div className="adm-greeting-actions">
          {lastUpdated && (
            <span className="adm-updated" title={lastUpdated.toLocaleTimeString()}>
              Updated {fmtUpdated(lastUpdated)}
            </span>
          )}
          <button
            className="adm-refresh-btn"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh dashboard"
            title="Refresh"
          >
            {refreshing ? '…' : '↻'}
          </button>
        </div>
      </div>

      {/* Error / warning banner */}
      {error && (
        <div className={`adm-error-banner ${error.isWarn ? 'is-warn' : ''}`}>
          <div className="adm-error-icon">{error.isWarn ? 'ℹ' : '⚠'}</div>
          <div className="adm-error-msg">
            <div className="adm-error-title">
              {error.isAuth
                ? 'Your session expired'
                : error.isWarn
                  ? 'Partial dashboard load'
                  : "Couldn't refresh dashboard"}
            </div>
            <div className="adm-error-detail" style={{ whiteSpace: 'pre-line' }}>
              {error.isAuth
                ? 'Please sign in again to continue.'
                : error.message}
              {!error.isAuth && !error.isWarn && error.status ? ` (HTTP ${error.status})` : ''}
            </div>
          </div>
          {error.isAuth ? (
            <button
              className="adm-error-retry"
              onClick={async () => {
                await logout();
                nav('/', { replace: true });
              }}
            >
              Sign in
            </button>
          ) : (
            <button className="adm-error-retry" onClick={refresh} disabled={refreshing}>
              {refreshing ? '…' : 'Retry'}
            </button>
          )}
        </div>
      )}

      {/* Stats banner — clickable cards select the detail view below */}
      <div className="adm-stats">
        {stats.map(s => {
          const isSelected = s.clickable && view === s.key;
          const cls = [
            'adm-stat-card',
            s.tone === 'live'   ? 'is-live'   : '',
            s.tone === 'warn'   ? 'is-warn'   : '',
            s.tone === 'action' ? 'is-action' : '',
            s.clickable         ? 'is-clickable' : '',
            isSelected          ? 'is-selected'  : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={s.key}
              type="button"
              className={cls}
              onClick={s.clickable ? () => setView(s.key) : undefined}
              disabled={!s.clickable}
            >
              <div className="adm-stat-eyebrow">{s.eyebrow}</div>
              <div className="adm-stat-num">{s.value}</div>
              <div className={`adm-stat-meta ${s.tone === 'live' ? 'is-live' : ''}`}>
                {s.meta}
              </div>
              {VIEWS.includes(s.key) && isSelected && <div className="adm-stat-arrow" aria-hidden />}
            </button>
          );
        })}
      </div>

      {/* Detail card — content swaps based on selected stat */}
      <div className="adm-card adm-detail-card" key={view}>
        {renderDetail()}
      </div>

    </div>
  );
};

export default AdminHome;
