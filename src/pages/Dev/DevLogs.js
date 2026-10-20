// Sprint 22.4 — Dev → Logs: everything that used to be scattered through the manager's pages.
//   Change feed (every event type) · Snapshot history (legacy scrapes + their logs) · Guest-detail jobs.
// (Sync runs live under Dev → Auto-sync.)
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../auth';
import RecentChanges from '../../components/Forecasting/RecentChanges';
import ForecastHistory from '../../components/Forecasting/ForecastHistory';

const ALL_EVENTS = ['new', 'cancelled', 'changed', 'moves'];
const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

const JobsLog = () => {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { (async () => { const { ok, data } = await apiFetch('/dev/jobs?limit=50'); if (ok && data?.success) setJobs(data.jobs); else setError(data?.message || 'Could not load jobs.'); })(); }, []);
  if (error) return <p className="dv-error" role="alert">{error}</p>;
  if (!jobs) return <p className="dv-muted">Loading…</p>;
  if (!jobs.length) return <p className="dv-muted">No guest-detail jobs yet.</p>;
  return (
    <div className="dv-table-wrap">
      <table className="dv-table">
        <thead><tr><th>Started</th><th>Status</th><th>Total</th><th>Done</th><th>Skipped</th><th>Failed</th><th>Gone</th><th>Finished</th><th>Error</th></tr></thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.job_id} className={j.status === 'failed' ? 'dv-row-bad' : ''}>
              <td>{fmt(j.started_at)}</td><td>{j.status}</td><td>{j.total}</td><td>{j.done}</td><td>{j.skipped}</td><td>{j.failed}</td><td>{j.gone}</td><td>{fmt(j.finished_at)}</td><td className="dv-err-cell">{j.error || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const TABS = [['feed', 'Change feed'], ['snapshots', 'Snapshots'], ['jobs', 'Guest-detail jobs']];
const DevLogs = () => {
  const [tab, setTab] = useState('feed');
  return (
    <div className="dv-page">
      <h1>Logs</h1>
      <div className="dv-tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'feed' && <RecentChanges initialOn={ALL_EVENTS} persistOpen={false} />}
      {tab === 'snapshots' && <ForecastHistory inline />}
      {tab === 'jobs' && <JobsLog />}
    </div>
  );
};

export default DevLogs;
