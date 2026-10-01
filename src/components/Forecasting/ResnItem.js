// Sprint 20.4 — dense reservation card/row. Everything the front desk needs is
// visible without a click (guest, contact, room, stay, status, money, cards,
// flags, history); the long tail expands IN PLACE. Reads only the stored
// `summary` (Sprint 20.2) — never calls rGuest to render, so a reservation that
// changed since the list scrape can't throw an error here.

import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { apiFetch } from '../../auth';
import {
  fmtStayRange, guestsLabel, asOf, ageText, telHref, mailHref, buildChips, buildSections,
} from './resnFormat';
import './ResnList.css';

// ── stored-summary data hook ────────────────────────────────────────────────
// Module-level store survives tab/page switches. We ask the server only for
// the ids on screen (≤100), refetch when `tick` changes (job progress), and
// expose a per-reservation live refresh.
const _store = new Map(); // id → { summary, remoteState, fetchedAt, failedSections, lastError }

export function useResnSummaries(ids, tick) {
  const [, bump] = useReducer(x => x + 1, 0);
  const [refreshing, setRefreshing] = React.useState({});
  const key = ids.join(',');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiFetch(`/admin/reservations/summaries?ids=${key}`);
      if (cancelled || !ok || !data?.success) return;
      Object.entries(data.summaries || {}).forEach(([id, v]) => _store.set(id, v));
      bump();
    })();
    return () => { cancelled = true; };
  }, [key, tick]);

  const get = useCallback((id) => _store.get(id) || null, []);

  const refresh = useCallback(async (id) => {
    setRefreshing(m => ({ ...m, [id]: true }));
    const { ok, data } = await apiFetch(`/admin/reservations/${id}/refresh`, { method: 'POST', body: JSON.stringify({}) });
    if (alive.current) {
      if (data && data.success) {
        const failed = Object.entries((data.meta && data.meta.sections) || {}).filter(([, v]) => v && v.ok === false).map(([k]) => k);
        _store.set(id, {
          summary: data.summary, remoteState: data.meta && data.meta.remoteState,
          fetchedAt: data.meta && data.meta.fetchedAt, failedSections: failed,
          lastError: data.refreshError || (data.meta && data.meta.lastError) || null,
        });
      } else if (!ok) {
        const prev = _store.get(id);
        _store.set(id, { ...(prev || {}), lastError: (data && data.message) || 'Refresh failed' });
      }
      setRefreshing(m => { const n = { ...m }; delete n[id]; return n; });
      bump();
    }
  }, []);

  return { get, refresh, refreshing };
}

// ── pieces ──────────────────────────────────────────────────────────────────
const Chip = ({ tone = 'muted', children }) => <span className={`rl-chip rl-chip-${tone}`}>{children}</span>;

const Section = ({ sec }) => (
  <section className={`rl-sec${sec.tone ? ` rl-sec-${sec.tone}` : ''}${sec.stack ? ' rl-sec-stack' : ''}`}>
    <h4>{sec.title}</h4>
    {sec.rows && sec.rows.length > 0 && (
      <dl>
        {sec.rows.map((row, i) => (
          <div key={`${row.label}-${i}`} className={row.tone ? `rl-tone-${row.tone}` : undefined}>
            <dt>{row.label}</dt>
            <dd>{row.href ? <a href={row.href}>{row.value}</a> : row.value}</dd>
          </div>
        ))}
      </dl>
    )}
    {sec.list && sec.list.length > 0 && (
      <ul className="rl-sec-list">{sec.list.map((t, i) => <li key={i}>{t}</li>)}</ul>
    )}
    {(!sec.rows || !sec.rows.length) && (!sec.list || !sec.list.length) && sec.emptyNote && (
      <p className="rl-sec-empty">{sec.emptyNote}</p>
    )}
  </section>
);

/**
 * @param {Object}  p.r            list-level reservation (payload.reservations[i])
 * @param {Object}  p.entry        stored summary entry from useResnSummaries (or null)
 * @param {Array}   p.flags        buildResnFlags(r)
 * @param {string}  p.statusCls    STATUS_PILL_CLASS key
 * @param {boolean} p.open         in-place details expanded
 * @param {boolean} p.jobRunning   background job still loading details
 */
const ResnItem = ({ r, entry, flags, statusCls, open, onToggle, onRefresh, refreshing, jobRunning, rguestUrl }) => {
  const s = entry && entry.summary && Object.keys(entry.summary).length ? entry.summary : null;
  const g = (s && s.guest) || {};
  const gone = entry && entry.remoteState === 'gone';
  const stamp = entry ? asOf(entry.fetchedAt) : null;
  const failed = (entry && entry.failedSections) || [];
  const chips = buildChips(r, s);
  const sections = open ? buildSections(r, s) : [];
  const tel = telHref(g.phone), mail = mailHref(g.email);
  const range = fmtStayRange(r.arrivalDate, r.departureDate);
  const guests = s && s.stay ? guestsLabel(s.stay.adults, s.stay.children) : null;
  const channel = s && s.booking ? (s.booking.walkIn ? 'Walk-in' : (s.booking.bookingSources || []).join(' / ')) : '';
  const roomLabel = r.roomNumber ? `Room ${r.roomNumber}` : null;
  const roomStatus = r.roomNumber ? (r.hkStatusLabel || r.occupancyStatus || null) : null;
  const detailId = `rl-detail-${r.id}`;

  return (
    <li className={`rl-item${open ? ' is-open' : ''}${gone ? ' is-gone' : ''}`}>
      <div className="rl-main">
        {/* ── guest + contact ── */}
        <div className="rl-guest">
          <button type="button" className="rl-name" onClick={onToggle} aria-expanded={open} aria-controls={detailId}>
            {r.guestName || g.name || '(no name)'}
          </button>
          <div className="rl-sub">
            {r.confirmationId && <>Conf. {r.confirmationId}</>}
            {r.baseLabel && <>{r.confirmationId ? ' · ' : ''}{r.baseLabel}{r.subLabel && r.subLabel !== 'Standard' ? ` · ${r.subLabel}` : ''}</>}
          </div>
          {(tel || mail || g.address) && (
            <div className="rl-contact">
              {tel  && <a href={tel}  className="rl-link">{g.phone}</a>}
              {mail && <a href={mail} className="rl-link">{g.email}</a>}
              {!tel && g.phone && <span>{g.phone}</span>}
              {!mail && g.email && <span>{g.email}</span>}
              {g.address && <span className="rl-addr">{g.address}</span>}
            </div>
          )}
        </div>

        {/* ── stay ── */}
        <div className="rl-stay">
          <div className="rl-dates">{range || '—'}{r.nights ? <span className="rl-nights"> · {r.nights} night{r.nights === 1 ? '' : 's'}</span> : null}</div>
          {guests && <div className="rl-sub">{guests}</div>}
          {(channel || r.source) && <div className="rl-sub">{[channel, r.source].filter(Boolean).join(' · ')}</div>}
        </div>

        {/* ── status + room ── */}
        <div className="rl-status">
          <span className={`fc-pill fc-pill-status-${statusCls}`}>{r.statusLabel}</span>
          {roomLabel
            ? <span className="rl-room">{roomLabel}{roomStatus ? <small> · {roomStatus}</small> : null}</span>
            : <span className="fc-pill fc-pill-status-pending">No room assigned</span>}
          {flags.length > 0 && (
            <div className="rl-flags">{flags.map(f => <span key={f.label} className={`fc-pill fc-flag-${f.cls}`}>{f.label}</span>)}</div>
          )}
        </div>

        {/* ── money / history / notes chips ── */}
        <div className="rl-chips">
          {s ? chips.map(c => <Chip key={c.key} tone={c.tone}>{c.label}</Chip>)
            : <span className="rl-loading">{jobRunning ? 'Loading guest details…' : 'Guest details not loaded yet'}</span>}
        </div>
      </div>

      {gone && (
        <div className="rl-banner rl-banner-warn" role="status">
          No longer in rGuest (cancelled, merged or moved) — showing the last details we saved.
        </div>
      )}

      {/* ── footer: provenance + actions ── */}
      <div className="rl-foot">
        <span className={`rl-asof${stamp && stamp.stale ? ' is-stale' : ''}`}>
          {stamp
            ? <>Details as of {stamp.label}{stamp.stale ? ` · ${ageText(stamp.ageMs)} old` : ''}</>
            : 'No guest details saved yet'}
          {failed.length > 0 && <span className="rl-partial" title={failed.join(', ')}> · {failed.length} section{failed.length === 1 ? '' : 's'} couldn’t refresh</span>}
          {entry && entry.lastError && <span className="rl-partial" title={entry.lastError}> · refresh failed</span>}
        </span>
        <span className="rl-actions">
          <button type="button" className="rl-btn" onClick={onRefresh} disabled={refreshing} title="Re-fetch this reservation from rGuest now">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <a className="rl-btn" href={rguestUrl} target="_blank" rel="noopener noreferrer">rGuest ↗</a>
          <button type="button" className="rl-btn rl-btn-primary" onClick={onToggle} aria-expanded={open} aria-controls={detailId} disabled={!s}>
            {open ? 'Hide details' : 'More details'}
          </button>
        </span>
      </div>

      {open && (
        <div className="rl-detail" id={detailId}>
          {sections.length === 0
            ? <p className="rl-sec-empty">No further details saved for this reservation yet.</p>
            : sections.map(sec => <Section key={sec.title} sec={sec} />)}
        </div>
      )}
    </li>
  );
};

export default ResnItem;
