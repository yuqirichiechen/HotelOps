// Sprint 22.2 — "Recent changes" feed for the Reservations page: new bookings, cancellations, edits… as the sync saw them.
// One GET when the page opens / the tab regains focus (no polling → no database wake-ups). Admin-only endpoint.
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../auth';
import { EVENT_LABEL, describeChanges, stayLabel, ago, fmtDayClock } from './syncFormat';
import './RecentChanges.css';

const FILTERS = [
  { key: 'new', label: 'New', types: ['new'] },
  { key: 'cancelled', label: 'Cancelled', types: ['cancelled', 'no_show', 'moved', 'gone'] },
  { key: 'changed', label: 'Changed', types: ['changed', 'reappeared'] },
  { key: 'moves', label: 'Arrived / departed', types: ['arrived', 'departed'] },
];
const DEFAULT_ON = ['new', 'cancelled', 'changed'];
const PAGE = 15;

// `initialOn` lets the Dev logs show every kind of event; managers see new / cancelled / changed by default.
const RecentChanges = ({ initialOn = DEFAULT_ON, persistOpen = true }) => {
  const [open, setOpen] = useState(() => { if (!persistOpen) return true; try { return sessionStorage.getItem('hotelops-changes-open') !== '0'; } catch { return true; } });
  const [on, setOn] = useState(initialOn);
  const [events, setEvents] = useState(null);
  const [summary, setSummary] = useState({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const types = FILTERS.filter(f => on.includes(f.key)).flatMap(f => f.types).join(',');

  const load = useCallback(async (before) => {
    if (!types) { setEvents([]); setHasMore(false); return; }
    setLoading(true);
    const qs = `limit=${PAGE}&types=${types}${before ? `&before=${before}` : ''}`;
    const { ok, data } = await apiFetch(`/admin/sync/events?${qs}`);
    setLoading(false);
    if (!ok || !data?.success) { setError(data?.message || 'Could not load recent changes.'); return; }
    setError(null); setSummary(data.summary || {}); setHasMore(!!data.hasMore);
    setEvents(prev => (before && prev ? [...prev, ...data.events] : data.events));
  }, [types]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);
  const toggleOpen = () => setOpen(o => { const n = !o; try { sessionStorage.setItem('hotelops-changes-open', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const toggle = (k) => setOn(cur => (cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]));

  const sum = (...t) => t.reduce((n, k) => n + (summary[k] || 0), 0);
  const chips = [['New', sum('new'), 'new'], ['Cancelled', sum('cancelled', 'no_show', 'moved', 'gone'), 'cxl'], ['Changed', sum('changed', 'reappeared'), 'chg']].filter(c => c[1] > 0);

  return (
    <section className="rc" aria-label="Recent changes">
      <button type="button" className="rc-head" onClick={toggleOpen} aria-expanded={open}>
        <span className="rc-title">Recent changes</span>
        <span className="rc-sub">last 24 h</span>
        {chips.length === 0 && <span className="rc-chip rc-chip-none">none yet</span>}
        {chips.map(([label, n, cls]) => <span key={label} className={`rc-chip rc-chip-${cls}`}>{n} {label.toLowerCase()}</span>)}
        <span className="rc-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="rc-body">
          <div className="rc-filters" role="group" aria-label="Show">
            {FILTERS.map(f => <button key={f.key} type="button" className={`rc-filter${on.includes(f.key) ? ' on' : ''}`} aria-pressed={on.includes(f.key)} onClick={() => toggle(f.key)}>{f.label}</button>)}
          </div>
          {error && <p className="rc-error" role="alert">{error}</p>}
          {events && events.length === 0 && !error && <p className="rc-empty">{loading ? 'Loading…' : 'Nothing here yet. Changes appear once auto-sync has seen them (it saves what it finds every few minutes).'}</p>}
          <ul className="rc-list">
            {(events || []).map(ev => {
              const ch = ev.event_type === 'changed' ? describeChanges(ev.changes) : [];
              const stay = stayLabel(ev);
              return (
                <li key={ev.event_id} className={`rc-item rc-${ev.event_type}`}>
                  <span className="rc-when" title={new Date(ev.occurred_at).toLocaleString()}>{fmtDayClock(ev.occurred_at)}<small>{ago(ev.occurred_at)}</small></span>
                  <span className={`rc-type rc-type-${ev.event_type}`}>{EVENT_LABEL[ev.event_type] || ev.event_type}</span>
                  <span className="rc-main">
                    <strong>{ev.guest_name || 'Guest'}</strong>
                    <span className="rc-meta">
                      {ev.type_code && <code>{ev.type_code}</code>}{stay && <span>{stay}</span>}{ev.room_number && <span>Room {ev.room_number}</span>}
                      {ev.confirmation_id && <span className="rc-conf">#{ev.confirmation_id}</span>}
                      {ev.event_type === 'new' && (ev.booked_by || ev.source) && <span>via {ev.booked_by || ev.source}</span>}
                    </span>
                    {ch.length > 0 && <span className="rc-changes">{ch.map(c => <span key={c.key} className="rc-change"><em>{c.label}</em> {c.from} → <b>{c.to}</b></span>)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {hasMore && <button type="button" className="rc-more" disabled={loading} onClick={() => load(events[events.length - 1].event_id)}>{loading ? 'Loading…' : 'Show older'}</button>}
        </div>
      )}
    </section>
  );
};

export default RecentChanges;
