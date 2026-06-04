// Sprint 17.5 — Snapshot history + per-run logs viewer.
//
// Master-detail modal. Left pane lists snapshots (paged). Selecting
// one fetches the full row (including the structured logs JSONB)
// into the right pane. Delete confirmation uses the shared
// ConfirmModal pattern.

import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../auth';
import ConfirmModal from '../shared/ConfirmModal';
import './ForecastHistory.css';

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

const fmtFullTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  });
};

const LEVEL_RANK = { error: 4, warn: 3, info: 2, debug: 1 };

const LogEntry = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const hasContext = entry.context && Object.keys(entry.context).length > 0;
  return (
    <li className={`fc-log-entry fc-log-${entry.level || 'info'}`}>
      <div className="fc-log-head" onClick={() => hasContext && setExpanded(v => !v)}>
        <span className="fc-log-time">{fmtTime(entry.at)}</span>
        <span className={`fc-log-level fc-log-level-${entry.level}`}>{entry.level || 'info'}</span>
        <span className="fc-log-msg">{entry.message}</span>
        {hasContext && (
          <span className="fc-log-caret">{expanded ? '▾' : '▸'}</span>
        )}
      </div>
      {expanded && hasContext && (
        <pre className="fc-log-context">{JSON.stringify(entry.context, null, 2)}</pre>
      )}
    </li>
  );
};

const ForecastHistory = ({ onClose }) => {
  const [snapshots, setSnapshots]   = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError]           = useState(null);
  const [confirm, setConfirm]       = useState(null);
  const [logFilter, setLogFilter]   = useState('all'); // 'all' | 'error' | 'warn'

  // Initial list load.
  const loadList = async () => {
    setError(null);
    const { ok, data } = await apiFetch('/admin/forecast/snapshots?limit=50');
    if (!ok || !data?.success) {
      setError(data?.message || 'Could not load history.');
    } else {
      setSnapshots(data.snapshots);
      // Auto-select the first row if nothing's selected.
      if (!selectedId && data.snapshots.length > 0) {
        setSelectedId(data.snapshots[0].snapshot_id);
      }
    }
    setLoading(false);
  };

  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !confirm) onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirm]);

  // Fetch detail when selection changes.
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setLoadingDetail(true);
    apiFetch(`/admin/forecast/snapshots/${selectedId}`).then(({ ok, data }) => {
      if (cancelled) return;
      setLoadingDetail(false);
      if (!ok || !data?.success) { setDetail(null); return; }
      setDetail(data.snapshot);
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  const handleDelete = (snapshotId) => {
    setConfirm({
      title:        'Delete snapshot?',
      message:      'This permanently removes the row from forecast_snapshot. Use this to clear duplicates or test runs.',
      confirmLabel: 'Delete',
      tone:         'danger',
      onConfirm: async () => {
        const { ok, data } = await apiFetch(`/admin/forecast/snapshots/${snapshotId}`, { method: 'DELETE' });
        if (!ok || !data?.success) {
          setError(data?.message || 'Delete failed');
          return;
        }
        setSnapshots(prev => prev.filter(s => s.snapshot_id !== snapshotId));
        if (selectedId === snapshotId) {
          setSelectedId(null);
          setDetail(null);
        }
      },
    });
  };

  const filteredLogs = (logs) => {
    if (!Array.isArray(logs)) return [];
    if (logFilter === 'all') return logs;
    const min = LEVEL_RANK[logFilter] || 0;
    return logs.filter(l => (LEVEL_RANK[l.level] || 0) >= min);
  };

  return (
    <div className="fc-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="fc-modal fc-modal-wide" onClick={(e) => e.stopPropagation()}>
        <header className="fc-modal-header">
          <h2>Snapshot history</h2>
          <div className="fc-modal-header-actions">
            <button className="fc-modal-btn fc-modal-btn-small" onClick={loadList}>⟳ Refresh</button>
            <button className="fc-modal-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </header>

        {error && <p className="fc-modal-error" role="alert">{error}</p>}

        <div className="fc-history-body">
          <aside className="fc-history-list">
            {loading && <p className="fc-modal-loading">Loading…</p>}
            {!loading && snapshots.length === 0 && (
              <p className="fc-modal-empty">No snapshots yet.</p>
            )}
            <ul>
              {snapshots.map(s => (
                <li key={s.snapshot_id}>
                  <button
                    type="button"
                    className={`fc-history-row${selectedId === s.snapshot_id ? ' active' : ''}`}
                    onClick={() => setSelectedId(s.snapshot_id)}
                  >
                    <span className={`fc-history-status fc-history-status-${s.status}`}>
                      {s.status === 'success' ? '✓' : '!'}
                    </span>
                    <span className="fc-history-row-main">
                      <span className="fc-history-row-time">{fmtTime(s.scraped_at)}</span>
                      <span className="fc-history-row-meta">
                        {s.source}
                        {s.kpis && (
                          <> · {s.kpis.arrivals ?? 0}A · {s.kpis.departures ?? 0}D · {s.kpis.stayovers ?? 0}S</>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <main className="fc-history-detail">
            {!selectedId && !loading && (
              <p className="fc-history-detail-empty">Pick a snapshot to see its details.</p>
            )}
            {loadingDetail && <p className="fc-modal-loading">Loading detail…</p>}
            {detail && (
              <>
                <div className="fc-history-detail-head">
                  <div>
                    <h3>Snapshot</h3>
                    <code className="fc-history-id">{detail.snapshot_id}</code>
                  </div>
                  <button
                    className="fc-modal-btn fc-modal-btn-danger fc-modal-btn-small"
                    onClick={() => handleDelete(detail.snapshot_id)}
                  >Delete</button>
                </div>

                <dl className="fc-history-meta">
                  <div><dt>Scraped at</dt><dd>{fmtFullTime(detail.scraped_at)}</dd></div>
                  <div><dt>Forecast date</dt><dd>{detail.forecast_date}</dd></div>
                  <div><dt>Source</dt><dd>{detail.source}</dd></div>
                  <div><dt>Status</dt>
                    <dd>
                      <span className={`fc-pill fc-pill-${detail.status}`}>{detail.status}</span>
                    </dd>
                  </div>
                  <div><dt>Records processed</dt><dd>{detail.records_processed}</dd></div>
                  {detail.error_message && (
                    <div className="fc-history-meta-error">
                      <dt>Error</dt>
                      <dd>{detail.error_message}</dd>
                    </div>
                  )}
                </dl>

                {detail.payload?.kpis && (
                  <div className="fc-history-kpis">
                    {Object.entries(detail.payload.kpis).map(([k, v]) => (
                      <div key={k}>
                        <span>{k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</span>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </div>
                )}

                <section className="fc-history-logs">
                  <div className="fc-history-logs-head">
                    <h4>Run logs ({(detail.logs || []).length})</h4>
                    <div className="fc-history-logs-filter" role="tablist">
                      <button onClick={() => setLogFilter('all')}   className={logFilter === 'all'   ? 'active' : ''}>All</button>
                      <button onClick={() => setLogFilter('warn')}  className={logFilter === 'warn'  ? 'active' : ''}>Warn+</button>
                      <button onClick={() => setLogFilter('error')} className={logFilter === 'error' ? 'active' : ''}>Errors</button>
                    </div>
                  </div>
                  {filteredLogs(detail.logs).length === 0 ? (
                    <p className="fc-history-logs-empty">No log entries match this filter.</p>
                  ) : (
                    <ul className="fc-log-list">
                      {filteredLogs(detail.logs).map((e, i) => (
                        <LogEntry entry={e} key={i} />
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </main>
        </div>

        {confirm && (
          <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />
        )}
      </div>
    </div>
  );
};

export default ForecastHistory;
