// Sprint 17.5 — Forecast Settings modal.
//
// Two panes:
//   1. Labor constants — productivity_target (rooms/attendant),
//      avg_min_per_clean per base bucket, dedup_window_minutes.
//   2. Room-type mapping editor — every typeCode the scraper has
//      ever seen, with admin overrides. Rows with base_code IS NULL
//      surface at the top with a "needs review" badge.
//
// Each form has its own Save button — no "save all" pattern.
// Cron-schedule editing is intentionally absent (cron deferred,
// decision §2.2.3 in part4.md).

import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../auth';
import './ForecastSettings.css';

const BASE_BUCKETS = ['NKRR', 'NKJZ', 'NQRR', 'NQJZ'];

const ForecastSettings = ({ onClose }) => {
  const [tab, setTab]         = useState('labor'); // 'labor' | 'mapping'
  const [config, setConfig]   = useState(null);
  const [mapping, setMapping] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [banner, setBanner]   = useState(null);

  // Per-row dirty state for the mapping editor. Map<type_code, partial>.
  const [draftRows, setDraftRows] = useState({});
  const [savingRow, setSavingRow] = useState(null);

  // Labor form draft (productivity_target, avg_min_per_clean object, dedup).
  const [laborDraft, setLaborDraft] = useState(null);
  const [savingLabor, setSavingLabor] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cfg, map] = await Promise.all([
        apiFetch('/admin/forecast/config'),
        apiFetch('/admin/forecast/mapping'),
      ]);
      if (cancelled) return;
      if (!cfg.ok || !cfg.data?.success) {
        setError(cfg.data?.message || 'Could not load config.');
      } else {
        setConfig(cfg.data.config);
        const c = cfg.data.config;
        setLaborDraft({
          productivity_target: Number(c.productivity_target),
          avg_min_per_clean: { ...(c.avg_min_per_clean || {}) },
          dedup_window_minutes: Number(c.dedup_window_minutes),
        });
      }
      if (map.ok && map.data?.success) setMapping(map.data.mapping);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveLabor = async () => {
    setSavingLabor(true);
    setError(null);
    const { ok, data } = await apiFetch('/admin/forecast/config', {
      method: 'PUT',
      body: JSON.stringify({
        productivity_target:  laborDraft.productivity_target,
        avg_min_per_clean:    laborDraft.avg_min_per_clean,
        dedup_window_minutes: laborDraft.dedup_window_minutes,
      }),
    });
    setSavingLabor(false);
    if (!ok || !data?.success) {
      setError(data?.message || 'Save failed');
      return;
    }
    setConfig(data.config);
    setBanner('Labor settings saved.');
    setTimeout(() => setBanner(null), 3000);
  };

  const editRow = (code, patch) => {
    setDraftRows(prev => ({
      ...prev,
      [code]: { ...(prev[code] || {}), ...patch },
    }));
  };

  const saveRow = async (code) => {
    const patch = draftRows[code];
    if (!patch) return;
    setSavingRow(code);
    const { ok, data } = await apiFetch(`/admin/forecast/mapping/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    setSavingRow(null);
    if (!ok || !data?.success) {
      setError(data?.message || 'Save failed');
      return;
    }
    // Replace the row in mapping[] with the server's canonical version.
    setMapping(prev => prev.map(r => r.type_code === code ? data.mapping : r));
    // Clear the draft so the row is no longer "dirty".
    setDraftRows(prev => {
      const { [code]: _drop, ...rest } = prev;
      return rest;
    });
    setBanner(`Saved ${code}.`);
    setTimeout(() => setBanner(null), 2200);
  };

  const cellValue = (row, field) => {
    const draft = draftRows[row.type_code];
    if (draft && Object.prototype.hasOwnProperty.call(draft, field)) return draft[field];
    return row[field] ?? '';
  };

  return (
    <div className="fc-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="fc-modal" onClick={(e) => e.stopPropagation()}>
        <header className="fc-modal-header">
          <h2>Forecast settings</h2>
          <button className="fc-modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="fc-modal-tabs" role="tablist">
          <button
            role="tab" aria-selected={tab === 'labor'}
            className={tab === 'labor' ? 'active' : ''}
            onClick={() => setTab('labor')}
          >Labor constants</button>
          <button
            role="tab" aria-selected={tab === 'mapping'}
            className={tab === 'mapping' ? 'active' : ''}
            onClick={() => setTab('mapping')}
          >Room-type mapping
            {mapping.some(r => r.needs_review) && (
              <span className="fc-mapping-badge">{mapping.filter(r => r.needs_review).length}</span>
            )}
          </button>
        </div>

        <div className="fc-modal-body">
          {loading && <p className="fc-modal-loading">Loading…</p>}
          {error   && <p className="fc-modal-error" role="alert">{error}</p>}
          {banner  && <p className="fc-modal-banner">{banner}</p>}

          {!loading && tab === 'labor' && laborDraft && (
            <div className="fc-labor-form">
              <section>
                <h3>Productivity</h3>
                <label className="fc-form-row">
                  <span>Rooms one attendant cleans per shift</span>
                  <input
                    type="number" min="0.5" step="0.5"
                    value={laborDraft.productivity_target}
                    onChange={e => setLaborDraft(d => ({ ...d, productivity_target: Number(e.target.value) }))}
                  />
                </label>
                <p className="fc-form-help">
                  Drives the "Housekeepers needed" KPI:
                  <code> ceil(roomsToClean / productivity_target)</code>.
                </p>
              </section>

              <section>
                <h3>Average minutes per clean</h3>
                <p className="fc-form-help">
                  Per base room type. <code>STAYOVER</code> is the touch-up time
                  used for in-house rooms; <code>DEFAULT</code> is the fallback
                  when a room type isn't listed.
                </p>
                <div className="fc-avg-grid">
                  {[...BASE_BUCKETS, 'STAYOVER', 'DEFAULT'].map(key => (
                    <label key={key} className="fc-avg-cell">
                      <span>{key}</span>
                      <input
                        type="number" min="1" step="1"
                        value={laborDraft.avg_min_per_clean[key] ?? ''}
                        onChange={e => setLaborDraft(d => ({
                          ...d,
                          avg_min_per_clean: { ...d.avg_min_per_clean, [key]: Number(e.target.value) },
                        }))}
                      />
                      <span className="fc-avg-unit">min</span>
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <h3>Scrape de-duplication</h3>
                <label className="fc-form-row">
                  <span>Skip a re-scrape if the data hasn't changed within</span>
                  <input
                    type="number" min="0" step="1"
                    value={laborDraft.dedup_window_minutes}
                    onChange={e => setLaborDraft(d => ({ ...d, dedup_window_minutes: Number(e.target.value) }))}
                  />
                  <span>minutes</span>
                </label>
                <p className="fc-form-help">
                  If you click Run Scraper twice in a row and nothing's changed at
                  the property, the second run reuses the existing snapshot instead
                  of writing a duplicate row. Set to <code>0</code> to disable.
                </p>
              </section>

              <div className="fc-modal-footer">
                <button className="fc-modal-btn fc-modal-btn-primary" onClick={saveLabor} disabled={savingLabor}>
                  {savingLabor ? 'Saving…' : 'Save labor settings'}
                </button>
              </div>
            </div>
          )}

          {!loading && tab === 'mapping' && (
            <div className="fc-mapping">
              <p className="fc-mapping-intro">
                Every Agilysys <code>typeCode</code> the scraper has seen.
                New codes auto-onboard from their 4-char prefix
                (<code>NKRR</code> → King Standard, etc.) — turn on
                <strong> Override</strong> on a row to pin your edit so
                future scrapes don't rewrite it.
              </p>
              {mapping.some(r => r.needs_review) && (
                <p className="fc-mapping-warn">
                  <strong>{mapping.filter(r => r.needs_review).length}</strong> code(s)
                  need review — their 4-char prefix didn't match a known base bucket.
                </p>
              )}
              <table className="fc-mapping-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name (from rGuest)</th>
                    <th>Base bucket</th>
                    <th>Sub label</th>
                    <th>Override</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.map(row => {
                    const dirty = !!draftRows[row.type_code];
                    return (
                      <tr key={row.type_code} className={row.needs_review ? 'fc-mapping-row-review' : ''}>
                        <td><code>{row.type_code}</code>{row.needs_review && <span className="fc-mapping-reviewdot" title="Needs review">!</span>}</td>
                        <td className="fc-mapping-name">{row.type_name}</td>
                        <td>
                          <select
                            value={cellValue(row, 'base_code') || ''}
                            onChange={e => {
                              const v = e.target.value || null;
                              editRow(row.type_code, {
                                base_code:  v,
                                base_label: v ? labelFor(v) : null,
                              });
                            }}
                          >
                            <option value="">— Other —</option>
                            {BASE_BUCKETS.map(b => (
                              <option key={b} value={b}>{b} · {labelFor(b)}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={cellValue(row, 'sub_label')}
                            onChange={e => editRow(row.type_code, { sub_label: e.target.value })}
                          />
                        </td>
                        <td className="fc-mapping-override">
                          <label>
                            <input
                              type="checkbox"
                              checked={!!cellValue(row, 'admin_override')}
                              onChange={e => editRow(row.type_code, { admin_override: e.target.checked })}
                            />
                            <span>{row.admin_override ? 'Pinned' : 'Pin'}</span>
                          </label>
                        </td>
                        <td>
                          <button
                            className="fc-modal-btn fc-modal-btn-small"
                            onClick={() => saveRow(row.type_code)}
                            disabled={!dirty || savingRow === row.type_code}
                          >
                            {savingRow === row.type_code ? '…' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function labelFor(base) {
  switch (base) {
    case 'NKRR': return 'King Standard';
    case 'NKJZ': return 'King Studio';
    case 'NQRR': return 'Double Queen Standard';
    case 'NQJZ': return 'Double Queen Studio';
    default:     return base;
  }
}

export default ForecastSettings;
