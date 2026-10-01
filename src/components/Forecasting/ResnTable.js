// Sprint 20.5 — the Reservations list: status tabs, search, sort, attention
// filters, dense cards, print sheet, CSV export. (Moved out of index.js; the
// card itself is ResnItem.js, the pure logic is resnTabs / resnSearch / resnFormat.)

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../auth';
import ResnItem, { useResnSummaries } from './ResnItem';
import { PrintSheet, downloadCsv } from './ResnPrint';
import { RESN_TABS, DEFAULT_RESN_TAB, tabPredicate, computeTabCounts, sortForTab, EMPTY_COPY } from './resnTabs';
import {
  matchesList, attentionOf, ATTENTION_DEFS, SORT_OPTIONS, applySort, attentionCounts, filterByAttention, toCsv,
} from './resnSearch';
import { fmtMD } from './resnFormat';

// ── helpers moved from index.js ────────────────────────────────────────────
const STATUS_PILL_CLASS = {
  'Confirmed': 'confirmed',
  'Pending':   'pending',
  'In house':  'inhouse',
  'Departed':  'departed',
  'Cancelled': 'cancelled',
};

// Sprint 18.3 — derive the Notes/Flags pill row for a reservation.
// Order matters: VIP first (highest signal), then arrival timing,
// then logistics. Returns an array of `{label, cls}` ready to map
// into the existing `.fc-flag-*` pill classes.
function buildResnFlags(r) {
  const flags = [];
  if (r.vipLabel)              flags.push({ label: r.vipLabel,      cls: 'vip' });
  if (r.isEarlyArrival)        flags.push({ label: 'Early arrival', cls: 'early' });
  if (r.isRedEye)              flags.push({ label: 'Late arrival',  cls: 'late' });
  if (r.scheduledForRoomMove)  flags.push({ label: 'Room move',     cls: 'move' });
  if (r.isDayUse)              flags.push({ label: 'Day use',       cls: 'day' });
  if (r.isHighFloor)           flags.push({ label: 'High floor',    cls: 'high' });
  if (r.isPetFriendly)         flags.push({ label: 'Pet friendly',  cls: 'pet' });
  if (r.isGroupBooking)        flags.push({ label: 'Group',         cls: 'group' });
  return flags;
}

// Sprint 18.2 — deep-link URL pattern for an individual reservation
// in rGuest Stay. Confirmed via user-supplied URL on 2026-06-09;
// tenantId / propertyId are Snoqualmie's. If/when we add a second
// hotel these should move into a per-property config row.
const RGUEST_RESERVATION_URL = (id) =>
  `https://stay.rguest.com/v2/reservation/${encodeURIComponent(id)}?tenantId=1566&propertyId=481`;

// Sprint 18.1 — predicate per filter chip. Composes with the
// Room Type + Source dropdowns inside the table.
// Sprint 20.3: predicates come from tabPredicate() in ./resnTabs.js.


// Sprint 18.6 — page-size options + pagination control.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const Pagination = ({ page, totalPages, onPage, pageSize, onPageSize }) => {
  if (totalPages <= 1) {
    return (
      <div className="fc-pager">
        <label className="fc-pager-size">
          <span>Per page</span>
          <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    );
  }
  // Build a windowed page-number list: always show 1, current ± 1,
  // and totalPages, with ellipses bridging gaps.
  const set = new Set([1, totalPages, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach(n => set.add(n));
  if (page >= totalPages - 2) [totalPages - 1, totalPages - 2, totalPages - 3].forEach(n => set.add(n));
  const pages = [...set].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const withGaps = [];
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1] > 1) withGaps.push('…');
    withGaps.push(n);
  });
  return (
    <div className="fc-pager">
      <div className="fc-pager-nav">
        <button
          type="button" className="fc-pager-btn"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >‹</button>
        {withGaps.map((n, i) => n === '…' ? (
          <span key={`gap-${i}`} className="fc-pager-gap">…</span>
        ) : (
          <button
            key={n}
            type="button"
            className={`fc-pager-btn${n === page ? ' active' : ''}`}
            onClick={() => onPage(n)}
            aria-current={n === page ? 'page' : undefined}
          >{n}</button>
        ))}
        <button
          type="button" className="fc-pager-btn"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
        >›</button>
      </div>
      <label className="fc-pager-size">
        <span>Per page</span>
        <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
};


// ── view state remembered for the browser session (not the search text) ─────
const VIEW_KEY = 'hotelops-resn-view';
const loadView = () => { try { return JSON.parse(sessionStorage.getItem(VIEW_KEY)) || {}; } catch { return {}; } };
const saveView = (v) => { try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } };

const SCAN_LIMIT = 200;   // attention filters / summary-based sorts need every row's summary
const PRINT_LIMIT = 500;

const ReservationDetailsTable = ({
  rows, filter, onFilter, sources = [], roomTypes = [],
  sourceFilter, onSourceFilter, typeFilter, onTypeFilter,
  jobTick, jobRunning, todayYmd,
}) => {
  const saved = useRef(loadView()).current;
  const [query, setQuery]       = useState('');
  const [serverIds, setServerIds] = useState(null);
  const [sortMode, setSortMode] = useState(SORT_OPTIONS.some(o => o.key === saved.sort) ? saved.sort : 'default');
  const [attnSel, setAttnSel]   = useState(saved.attn && typeof saved.attn === 'object' ? saved.attn : {});
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openIds, setOpenIds]   = useState({});
  const [printJob, setPrintJob] = useState(0);
  const [busy, setBusy]         = useState(null);   // 'print' | 'csv'
  const searchRef = useRef(null);

  useEffect(() => { saveView({ sort: sortMode, attn: attnSel }); }, [sortMode, attnSel]);

  // ── server-side search: contact / notes / preferences / group (debounced) ──
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setServerIds(null); return undefined; }
    let cancelled = false;
    const id = setTimeout(async () => {
      const { ok, data } = await apiFetch(`/admin/reservations/search?q=${encodeURIComponent(q)}`);
      if (!cancelled) setServerIds(ok && data?.success ? new Set(data.ids) : null);
    }, 300);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query]);

  // ── "/" focuses search (when not already typing) ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target; const tag = (t && t.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || (t && t.isContentEditable)) return;
      e.preventDefault();
      if (searchRef.current) searchRef.current.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── what is on screen ──
  const counts = useMemo(() => computeTabCounts(rows), [rows]);        // always over ALL rows
  const searching = query.trim().length > 0;
  const effectiveTab = searching ? 'all' : filter;                      // a search looks everywhere
  const baseRows = useMemo(() => {
    const pred = tabPredicate(effectiveTab);
    return rows.filter(r => {
      if (!pred(r)) return false;
      if (sourceFilter && r.source !== sourceFilter) return false;
      if (typeFilter   && r.baseLabel !== typeFilter) return false;
      if (searching && !(matchesList(r, query) || (serverIds && serverIds.has(r.id)))) return false;
      return true;
    });
  }, [rows, effectiveTab, sourceFilter, typeFilter, searching, query, serverIds]);

  const big = baseRows.length > SCAN_LIMIT;
  const tabSorted = useMemo(() => sortForTab(effectiveTab, baseRows), [effectiveTab, baseRows]);
  const needsSummarySort = sortMode === 'attention' || sortMode === 'balance';
  const noSummary = { entryOf: () => null, attentionOfRow: () => ({ score: 0, reasons: [] }) };
  const ordered0 = useMemo(
    () => (sortMode === 'name' || sortMode === 'arrival') ? applySort(sortMode, tabSorted, noSummary) : tabSorted,
    [sortMode, tabSorted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which summaries to fetch: the whole view when it's ≤ 200 rows (enables attention
  // filters/sorts), otherwise just the visible page.
  const pageA = Math.min(page, Math.max(1, Math.ceil(ordered0.length / pageSize)));
  const idsToLoad = big
    ? ordered0.slice((pageA - 1) * pageSize, pageA * pageSize).map(r => r.id)
    : baseRows.map(r => r.id);
  const { get: getSummary, refresh: refreshOne, refreshing, forget, ensure } = useResnSummaries(idsToLoad, jobTick);

  const attnOfRow = (r) => attentionOf(r, getSummary(r.id), todayYmd);
  const attnCnt = big ? {} : attentionCounts(baseRows, attnOfRow);
  const attnActive = Object.keys(attnSel).filter(k => attnSel[k]);
  const afterAttn = big ? ordered0 : filterByAttention(ordered0, attnSel, attnOfRow);
  const filtered = (needsSummarySort && !big)
    ? applySort(sortMode, afterAttn, { entryOf: getSummary, attentionOfRow: attnOfRow })
    : afterAttn;

  useEffect(() => { setPage(1); }, [filter, sourceFilter, typeFilter, query, sortMode, attnSel]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const pageStart = (effectivePage - 1) * pageSize;
  const pageEnd   = Math.min(pageStart + pageSize, filtered.length);
  const paged     = filtered.slice(pageStart, pageEnd);
  const toggleOpen = (id) => setOpenIds(m => ({ ...m, [id]: !m[id] }));
  const allOpen   = paged.length > 0 && paged.every(r => openIds[r.id]);
  const setAllOpen = (open) => setOpenIds(m => { const n = { ...m }; paged.forEach(r => { n[r.id] = open; }); return n; });

  const tabLabel = (RESN_TABS.find(t => t.key === effectiveTab) || {}).label || 'Reservations';
  const viewTitle = searching ? `Search: “${query.trim()}”` : tabLabel;
  const dateLabel = fmtMD(todayYmd) || '';

  const onPrint = async () => {
    setBusy('print');
    await ensure(filtered.slice(0, PRINT_LIMIT).map(r => r.id));
    setBusy(null);
    setPrintJob(n => n + 1);
  };
  const onCsv = async () => {
    setBusy('csv');
    await ensure(filtered.map(r => r.id));
    setBusy(null);
    const slug = viewTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'reservations';
    downloadCsv(toCsv(filtered, getSummary), `reservations-${slug}-${todayYmd || 'today'}.csv`);
  };

  // ── empty state ──
  const narrowed = !!(sourceFilter || typeFilter);
  const emptyCopy = EMPTY_COPY[effectiveTab] || EMPTY_COPY.all;
  const clearAll = () => { setQuery(''); setAttnSel({}); onSourceFilter(null); onTypeFilter(null); };
  const emptyEl = (
    <div className="fc-resn-emptybox">
      {searching ? (
        <>
          <div>No reservations match “{query.trim()}”.</div>
          <button type="button" className="fc-chip" onClick={() => setQuery('')}>Clear search</button>
        </>
      ) : attnActive.length > 0 || (narrowed && counts[filter] > 0) ? (
        <>
          <div>No reservations match the current filters.</div>
          <button type="button" className="fc-chip" onClick={clearAll}>Clear filters</button>
        </>
      ) : (
        <>
          <div>{emptyCopy.text}</div>
          {emptyCopy.goto && <button type="button" className="fc-chip" onClick={() => onFilter(emptyCopy.goto)}>{emptyCopy.gotoLabel}</button>}
        </>
      )}
    </div>
  );

  return (
    <div className="fc-detail-wrap">
      <div className="fc-detail-controls">
        {/* Status tabs with live counts (rGuest-style). */}
        <div className="fc-tabs" role="tablist" aria-label="Reservation status">
          {RESN_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={!searching && filter === t.key}
              className={`fc-tab${!searching && filter === t.key ? ' active' : ''}${counts[t.key] === 0 ? ' is-zero' : ''}`}
              onClick={() => { setQuery(''); onFilter(t.key); }}
            >
              <span className="fc-tab-label">{t.label}</span>
              <span className="fc-tab-count">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="fc-detail-selects">
          <label>
            <span>Room type</span>
            <select value={typeFilter || ''} onChange={e => onTypeFilter(e.target.value || null)}>
              <option value="">All</option>
              {roomTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            <span>Source</span>
            <select value={sourceFilter || ''} onChange={e => onSourceFilter(e.target.value || null)}>
              <option value="">All</option>
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* ── search / sort / print / export ── */}
      <div className="rl-tools">
        <div className="rl-search">
          <span className="rl-search-icon" aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
            placeholder="Search guests, rooms, phones, notes…  ( / )"
            aria-label="Search reservations"
            autoComplete="off"
          />
          {query && <button type="button" className="rl-search-clear" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
        </div>
        <select className="rl-select" value={sortMode} onChange={e => setSortMode(e.target.value)} aria-label="Sort by">
          {SORT_OPTIONS.map(o => (
            <option key={o.key} value={o.key} disabled={big && (o.key === 'attention' || o.key === 'balance')}>
              Sort: {o.label}
            </option>
          ))}
        </select>
        <button type="button" className="rl-tool-btn" onClick={onPrint} disabled={!filtered.length || !!busy} title="Print this list for the desk">
          {busy === 'print' ? 'Preparing…' : 'Print'}
        </button>
        <button type="button" className="rl-tool-btn" onClick={onCsv} disabled={!filtered.length || !!busy} title="Download this list as a spreadsheet (CSV)">
          {busy === 'csv' ? 'Preparing…' : 'Export CSV'}
        </button>
      </div>

      {searching && (
        <div className="rl-notice" role="status">
          <span>Showing matches across <strong>all reservations</strong>{serverIds === null && query.trim().length >= 2 ? ' (checking contact details & notes…)' : ''}.</span>
          <button type="button" onClick={() => setQuery('')}>Back to {(RESN_TABS.find(t => t.key === filter) || {}).label}</button>
        </div>
      )}

      {/* ── needs-attention filters (counts from the stored guest details) ── */}
      {!big && baseRows.length > 0 && (
        <div className="rl-attn" role="group" aria-label="Needs attention">
          <span className="rl-attn-label">Needs attention</span>
          {ATTENTION_DEFS.filter(d => d.key !== 'stale' && (attnCnt[d.key] || attnSel[d.key])).map(d => (
            <button
              key={d.key}
              type="button"
              className={`rl-attn-chip is-${d.tone}${attnSel[d.key] ? ' on' : ''}`}
              aria-pressed={!!attnSel[d.key]}
              onClick={() => setAttnSel(m => ({ ...m, [d.key]: !m[d.key] }))}
            >
              {d.label} <b>{attnCnt[d.key] || 0}</b>
            </button>
          ))}
          {attnActive.length > 0 && <button type="button" className="rl-attn-clear" onClick={() => setAttnSel({})}>Clear</button>}
          {Object.keys(attnCnt).length === 0 && attnActive.length === 0 && (
            <span className="rl-sub">{jobRunning ? 'Loading guest details…' : 'Nothing flagged here — all clear.'}</span>
          )}
        </div>
      )}
      {big && (
        <div className="rl-notice">Attention filters and “Needs attention / Balance” sorting are available on views of up to {SCAN_LIMIT} reservations (this one has {baseRows.length}). Pick a tab or search to narrow it.</div>
      )}

      {filtered.length > 0 && (
        <div className="rl-toolbar">
          <span>{filtered.length} reservation{filtered.length === 1 ? '' : 's'}</span>
          <button type="button" onClick={() => setAllOpen(!allOpen)}>{allOpen ? 'Collapse all' : 'Expand all on this page'}</button>
        </div>
      )}
      <div className="rl-head" aria-hidden="true">
        <span>Guest</span><span>Stay</span><span>Status &amp; room</span><span>Charges &amp; notes</span>
      </div>
      <ul className="rl-list">
        {filtered.length === 0 && <li className="fc-resn-empty">{emptyEl}</li>}
        {paged.map(r => {
          const a = attnOfRow(r);
          return (
            <ResnItem
              key={r.id}
              r={r}
              entry={getSummary(r.id)}
              flags={buildResnFlags(r)}
              statusCls={STATUS_PILL_CLASS[r.statusLabel] || 'inhouse'}
              open={!!openIds[r.id]}
              onToggle={() => toggleOpen(r.id)}
              onRefresh={() => refreshOne(r.id)}
              onForget={() => forget(r.id)}
              refreshing={!!refreshing[r.id]}
              jobRunning={!!jobRunning}
              rguestUrl={RGUEST_RESERVATION_URL(r.id)}
              attention={a.reasons}
            />
          );
        })}
      </ul>
      <div className="fc-detail-footer">
        <div className="fc-detail-footer-text">
          {filtered.length === 0
            ? 'No reservations match the current filters.'
            : <>Showing <strong>{pageStart + 1}–{pageEnd}</strong> of <strong>{filtered.length}</strong>{filtered.length !== rows.length && !searching && <> (filtered from {rows.length})</>}</>
          }
        </div>
        <Pagination
          page={effectivePage}
          totalPages={totalPages}
          onPage={setPage}
          pageSize={pageSize}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      </div>

      {printJob > 0 && (
        <PrintSheet
          key={printJob}
          title={viewTitle}
          dateLabel={dateLabel}
          rows={filtered.slice(0, PRINT_LIMIT)}
          entryOf={getSummary}
          truncated={filtered.length > PRINT_LIMIT}
        />
      )}
    </div>
  );
};

export default ReservationDetailsTable;
