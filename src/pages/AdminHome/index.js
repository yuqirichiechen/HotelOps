import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, useAuth } from '../../auth';
import './AdminHome.css';

// Manager dashboard. Single fetch to /api/admin/dashboard fills:
//   - stats banner (active staff / on clock / hours / pending approvals)
//   - On the floor now (currently clocked in, grouped by department)
//   - Today's schedule with derived status (clocked-in / late / yet / done)
//   - Pending approvals queue

const fmtSince = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
};

const fmtScheduleTime = (s) => {
  if (!s) return '';
  const [h, m] = s.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const STATUS_LABEL = {
  'clocked-in':   'On the clock',
  'late':         'Late',
  'yet-to-start': 'Yet to start',
  'finished':     'Finished',
};

const AdminHome = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { ok, data } = await apiFetch('/admin/dashboard');
    if (ok && data?.success) setData(data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // Refresh every 60s so "currently working" stays live
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, []);

  const now      = new Date();
  const adminName = user?.name || user?.username || 'admin';

  // Group currently working by department
  const workingByDept = {};
  (data?.currentlyWorking || []).forEach(w => {
    const key = w.department || 'Unassigned';
    (workingByDept[key] = workingByDept[key] || []).push(w);
  });
  const workingDepts = Object.keys(workingByDept).sort();

  return (
    <div className="adm-page">

      {/* Greeting */}
      <div className="adm-greeting">
        <div className="adm-greeting-eyebrow">
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <h1 className="adm-greeting-title">Welcome, {adminName}.</h1>
      </div>

      {/* Stats banner */}
      <div className="adm-stats">
        <div className="adm-stat-card">
          <div className="adm-stat-eyebrow">Active staff</div>
          <div className="adm-stat-num">{loading ? '—' : data?.activeStaffCount ?? 0}</div>
          <div className="adm-stat-meta">total on the roster</div>
        </div>
        <div className={`adm-stat-card ${data?.onTheClockCount ? 'is-live' : ''}`}>
          <div className="adm-stat-eyebrow">On the clock</div>
          <div className="adm-stat-num">{loading ? '—' : data?.onTheClockCount ?? 0}</div>
          <div className={`adm-stat-meta ${data?.onTheClockCount ? 'is-live' : ''}`}>
            {data?.onTheClockCount ? 'right now' : 'no one currently'}
          </div>
        </div>
        <div className="adm-stat-card">
          <div className="adm-stat-eyebrow">Hours this week</div>
          <div className="adm-stat-num">{loading ? '—' : (data?.weekHoursTotal ?? 0)}</div>
          <div className="adm-stat-meta">across all staff</div>
        </div>
        <div className={`adm-stat-card ${data?.pendingApprovalsCount ? 'is-action' : ''}`}>
          <div className="adm-stat-eyebrow">Pending approvals</div>
          <div className="adm-stat-num">{loading ? '—' : data?.pendingApprovalsCount ?? 0}</div>
          <div className="adm-stat-meta">
            {data?.pendingApprovalsCount ? 'waiting for review' : 'all caught up'}
          </div>
        </div>
      </div>

      <div className="adm-grid">

        {/* On the floor now */}
        <div className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-card-title">On the floor</h2>
            {data?.currentlyWorking?.length > 0 && (
              <span className="adm-card-count is-live">
                <span className="adm-pulse-dot" />
                {data.currentlyWorking.length} {data.currentlyWorking.length === 1 ? 'person' : 'people'}
              </span>
            )}
          </div>
          {loading && (
            <>
              <div className="adm-skel" />
              <div className="adm-skel" style={{ width: '70%' }} />
              <div className="adm-skel" />
            </>
          )}
          {!loading && (data?.currentlyWorking?.length || 0) === 0 && (
            <div className="adm-empty">No one is clocked in right now.</div>
          )}
          {!loading && workingDepts.map(dept => (
            <div key={dept} className="adm-working-group">
              <div className="adm-group-title">{dept}</div>
              <ul className="adm-working-list">
                {workingByDept[dept].map(w => (
                  <li
                    key={w.user_id}
                    className="adm-working-row"
                    onClick={() => nav(`/admin/employees/${w.user_id}`)}
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
        </div>

        {/* Today's schedule */}
        <div className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-card-title">Today's schedule</h2>
            {data?.todaySchedule?.length > 0 && (
              <span className="adm-card-count">
                {data.todaySchedule.length}
              </span>
            )}
          </div>
          {loading && (
            <>
              <div className="adm-skel" />
              <div className="adm-skel" style={{ width: '85%' }} />
              <div className="adm-skel" style={{ width: '90%' }} />
              <div className="adm-skel" />
            </>
          )}
          {!loading && (data?.todaySchedule?.length || 0) === 0 && (
            <div className="adm-empty">No shifts scheduled today.</div>
          )}
          {!loading && (data?.todaySchedule || []).map(s => (
            <ul key={s.schedule_id} className="adm-sched-list">
              <li
                className="adm-sched-row"
                onClick={() => nav(`/admin/employees/${s.user_id}`)}
              >
                <span className={`adm-sched-status status-${s.status}`} title={STATUS_LABEL[s.status]} />
                <div className="adm-sched-info">
                  <div className="adm-sched-name">{s.name}</div>
                  <div className="adm-sched-meta">
                    {fmtScheduleTime(s.start_time)} – {fmtScheduleTime(s.end_time)}
                    {s.department ? ` · ${s.department}` : ''}
                  </div>
                </div>
                <span className={`adm-sched-pill pill-${s.status}`}>
                  {STATUS_LABEL[s.status]}
                </span>
              </li>
            </ul>
          ))}
        </div>

      </div>

      {/* Pending approvals */}
      {(data?.pendingApprovalsCount || 0) > 0 && (
        <div className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-card-title">Pending approvals</h2>
            <span className="adm-card-count">{data.pendingApprovalsCount}</span>
          </div>
          <ul className="adm-appr-list">
            {(data.pendingApprovals || []).map(a => (
              <li key={a.request_id} className="adm-appr-row">
                <span className="adm-appr-name">{a.requested_by_name}</span>
                {' — manual time edit'}
                <div className="adm-appr-reason">"{a.reason}"</div>
                <div className="adm-appr-date">
                  {new Date(a.created_at).toLocaleDateString([], {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
};

export default AdminHome;
