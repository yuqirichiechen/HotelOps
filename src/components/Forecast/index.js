// Sprint 17.11 — Admin Forecast page (room-type availability).
//
// This is the actual *forecast*: for each base room type (NKRR /
// NKJZ / NQRR / NQJZ), compare today's arrivals against the
// number of vacant-clean rooms of that type, and surface
// shortages so the FD/HK can prioritise turns.
//
// Distinct from `Reservations` (formerly the "Forecast" page,
// renamed in 17.11): that page lists who's arriving / departing /
// in-house. This page asks "do we have enough clean rooms by type
// to fulfil tonight's bookings?".
//
// Reads from the same `forecast_snapshot.payload` — specifically
// `byRoomType` (arrivals/type) + `perRoomSheet` (per-room
// occ+hk status). Reuses the shared scrape modals from
// `../Forecasting/`.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../auth';
import { useView } from '../../shells/ViewContext';
import ForecastSettings from '../Forecasting/ForecastSettings';
import ForecastHistory from '../Forecasting/ForecastHistory';
import ForecastSheet   from '../Forecasting/ForecastSheet';
import './Forecast.css';


// ── Inline SVG icons (subset of Forecasting's icons, redefined
//    here so the file's self-contained). ────────────────────────

const Icon = ({ d, size = 16, strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    {d}
  </svg>
);

const IconRefresh    = (p) => <Icon {...p} d={<><path d="M21 12a9 9 0 1 1-3.2-6.9" /><polyline points="21 4 21 10 15 10" /></>} />;
const IconSend       = (p) => <Icon {...p} d={<><path d="M22 2 11 13" /><path d="M22 2 15 22 11 13 2 9z" /></>} />;
const IconChart      = (p) => <Icon {...p} d={<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>} />;
const IconClock      = (p) => <Icon {...p} size={14} d={<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>} />;
const IconGear       = (p) => <Icon {...p} size={14} d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>} />;
const IconChevron    = (p) => <Icon {...p} size={12} d={<polyline points="9 18 15 12 9 6" />} />;
const IconBed        = (p) => <Icon {...p} d={<><path d="M2 17v-5a2 2 0 0 1 2-2h11a4 4 0 0 1 4 4v3" /><path d="M2 17h20" /></>} />;
const IconCheck      = (p) => <Icon {...p} d={<polyline points="20 6 9 17 4 12" />} />;
const IconBriefcase  = (p) => <Icon {...p} d={<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>} />;
const IconWarn       = (p) => <Icon {...p} d={<><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9"  x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></>} />;
const IconTrend      = (p) => <Icon {...p} d={<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>} />;
const IconInfo       = (p) => <Icon {...p} size={14} d={<><circle cx="12" cy="12" r="9" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8"  x2="12.01" y2="8" /></>} />;
const IconDot        = (p) => <Icon {...p} size={10} d={<circle cx="12" cy="12" r="6" />} />;


// ── Formatters ──────────────────────────────────────────────

const fmtTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};


// ── Compute helpers ─────────────────────────────────────────

// Build a grouped tree of room-type need from the snapshot payload.
//
// Sprint 17.12 — was a flat list keyed by base code (NKRR/NKJZ/etc.);
// now we surface every *specific* typeCode (NKRR, NKRRA, NKRRP, …)
// underneath its base group so the FD can see where the shortage
// actually lives.
//
// Allocation note (substitutability):
// - A reservation booked as the generic base (e.g. typeCode "NKRR")
//   can be fulfilled by any room in the base group — including
//   subtypes (NKRRA, NKRRP, etc.). A guest who didn't ask for
//   accessible can be placed in an accessible room.
// - A reservation booked as a specific subtype (typeCode "NKRRA")
//   *must* go in an NKRRA room — that's why they asked.
//
// We surface per-row balance as if each typeCode were independent
// (useful for spotting "we have 3 short of NKRRA specifically"),
// and a per-group total that reflects substitutability
// (= max(0, group demand − group supply)). The two won't always
// sum the same way; the group total is the operational truth for
// the FD's "do we have enough rooms tonight?" question.
function computeNeedTree(payload) {
  if (!payload) return [];

  // labels stays the source of truth for baseCode → baseLabel and
  // typeCode → subLabel mappings (taken from whichever object
  // surfaced the typeCode first).
  const labels = new Map();
  function recordLabels(obj) {
    const code = obj.typeCode;
    if (!code || labels.has(code)) return;
    labels.set(code, {
      baseCode:  obj.baseCode || (code.length >= 4 ? code.slice(0, 4) : '__OTHER__'),
      baseLabel: obj.baseLabel || code,
      subLabel:  obj.subLabel  || 'Standard',
      subSuffix: code.length > 4 ? code.slice(4) : '',
    });
  }

  // Per-typeCode total + vacant-clean counts, from perRoomSheet.
  //
  // Sprint 17.15:
  //   • Total = every room of that typeCode in inventory (regardless
  //     of status). Lets the FD see at a glance whether a "1 vacant
  //     clean NKRRP" stat is from a 3rd NKRRP they didn't notice in
  //     rGuest's paginated UI, or from stale data.
  //   • Vacant-clean now counts BOTH `VI` (Vacant Inspected) AND
  //     `PU` (Pickup). The user clarified PU means HK has cleaned
  //     the room and it's waiting for FD inspection — operationally
  //     ready to sell. Was excluded before in 17.7.
  const totalByType  = new Map();
  const vacantByType = new Map();
  const isVacantClean = (occ, hk) =>
    occ === 'VAC' && (hk === 'VI' || hk === 'PU');
  for (const r of payload.perRoomSheet || []) {
    recordLabels(r);
    if (!r.typeCode) continue;
    totalByType.set(r.typeCode, (totalByType.get(r.typeCode) || 0) + 1);
    if (isVacantClean(r.occupancyStatus, r.hkStatus)) {
      vacantByType.set(r.typeCode, (vacantByType.get(r.typeCode) || 0) + 1);
    }
  }

  // Per-typeCode arrival count, from reservations[].
  //
  // Sprint 17.13 — count only **remaining** arrivals (status=RES,
  // not yet checked in). Already-checked-in guests (status=INH
  // with arrival=today) have rooms — those rooms are now OCC, so
  // they're not in the VAC+VI supply pool we're comparing against.
  // Counting INH arrivals as demand was double-counting.
  //
  // Verified against the Reservations page KPI which already
  // shows "X of Y not yet arrived" using the same RES filter.
  const arrivalsByType = new Map();
  for (const r of payload.reservations || []) {
    recordLabels(r);
    if (r.typeCode && r.kind === 'arrival' && r.status === 'RES') {
      arrivalsByType.set(r.typeCode, (arrivalsByType.get(r.typeCode) || 0) + 1);
    }
  }

  // Build variant rows (one per typeCode we've seen).
  const allTypeCodes = new Set([
    ...vacantByType.keys(), ...arrivalsByType.keys(), ...labels.keys(),
  ]);
  const variants = [];
  for (const code of allTypeCodes) {
    const meta = labels.get(code) || {
      baseCode:  code.length >= 4 ? code.slice(0, 4) : '__OTHER__',
      baseLabel: code,
      subLabel:  'Standard',
      subSuffix: code.length > 4 ? code.slice(4) : '',
    };
    const vc    = vacantByType.get(code)   || 0;
    const arr   = arrivalsByType.get(code) || 0;
    const total = totalByType.get(code)    || 0;
    const net   = vc - arr;
    variants.push({
      typeCode:    code,
      baseCode:    meta.baseCode,
      baseLabel:   meta.baseLabel,
      subLabel:    meta.subLabel,
      subSuffix:   meta.subSuffix,
      totalRooms:  total,
      vacantClean: vc,
      arrivals:    arr,
      netBalance:  net,
      roomsNeeded: Math.max(0, -net),
      status:      net > 0 ? 'surplus' : net < 0 ? 'short' : 'even',
    });
  }

  // Group by baseCode.
  const groupMap = new Map();
  for (const v of variants) {
    const key = v.baseCode || '__OTHER__';
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        baseCode:  v.baseCode,
        baseLabel: v.baseLabel,
        variants:  [],
        totals:    null,
      });
    }
    groupMap.get(key).variants.push(v);
  }

  // Per-group totals + sort variants (generic first, then alpha).
  for (const g of groupMap.values()) {
    const sumTotal = g.variants.reduce((s, v) => s + v.totalRooms,  0);
    const sumVC    = g.variants.reduce((s, v) => s + v.vacantClean, 0);
    const sumArr   = g.variants.reduce((s, v) => s + v.arrivals,    0);
    const net      = sumVC - sumArr;
    g.totals = {
      totalRooms:  sumTotal,
      vacantClean: sumVC,
      arrivals:    sumArr,
      netBalance:  net,
      roomsNeeded: Math.max(0, -net),
      status:      net > 0 ? 'surplus' : net < 0 ? 'short' : 'even',
    };
    g.variants.sort((a, b) => {
      if (!a.subSuffix && b.subSuffix) return -1;
      if (a.subSuffix && !b.subSuffix) return 1;
      return a.typeCode.localeCompare(b.typeCode);
    });
  }

  // Stable group order: known 4 bases first, "Other"/unknown last.
  const KNOWN_ORDER = ['NKRR', 'NKJZ', 'NQRR', 'NQJZ'];
  return [...groupMap.values()].sort((a, b) => {
    const ai = KNOWN_ORDER.indexOf(a.baseCode);
    const bi = KNOWN_ORDER.indexOf(b.baseCode);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return (a.baseLabel || '').localeCompare(b.baseLabel || '');
  });
}

// Sprint 17.12 — operational notes generated from the grouped
// tree. Groups whose totals net short are urgent; specific
// subtypes that are short within an otherwise-fine group get
// called out too (those guests *specifically* asked for the
// subtype so substitutability doesn't help them).
function deriveOperationalNotes(groups) {
  const notes = [];
  const shortGroups   = groups.filter(g => g.totals.status === 'short')
                              .sort((a, b) => b.totals.roomsNeeded - a.totals.roomsNeeded);
  const surplusGroups = groups.filter(g => g.totals.status === 'surplus');

  if (shortGroups.length) {
    const codes = shortGroups.map(g => `${g.baseCode || '?'} (${g.totals.roomsNeeded})`).join(', ');
    notes.push({ kind: 'urgent', text: `Category-level shortages: ${codes}. Prioritize clean turns.` });
  }
  for (const g of groups) {
    if (g.totals.status === 'short') continue;
    for (const v of g.variants) {
      if (v.status !== 'short') continue;
      notes.push({
        kind: 'urgent',
        text: `${v.typeCode} (${v.subLabel}) is short ${v.roomsNeeded} — can't substitute another type.`,
      });
    }
  }
  for (const g of surplusGroups) {
    notes.push({
      kind: 'info',
      text: `${g.baseCode || '?'} has ${g.totals.netBalance} surplus vacant-clean room${g.totals.netBalance === 1 ? '' : 's'}.`,
    });
  }
  notes.push({ kind: 'neutral', text: 'Use the arrivals list below to confirm late check-ins.' });
  return notes;
}

// Sprint 17.12 — buildHkMessage removed with the HK Message
// Preview card. If we resurrect it later, the implementation
// (in git history at this commit) can come back as-is.


// ── Sub-components ──────────────────────────────────────────

const StatBar = ({ label, value, accent, icon }) => (
  <div className={`fb-stat fb-stat-${accent || 'default'}`}>
    <div className="fb-stat-icon">{icon}</div>
    <div className="fb-stat-body">
      <div className="fb-stat-label">{label}</div>
      <div className="fb-stat-value">{value ?? '—'}</div>
    </div>
  </div>
);

const StatusPill = ({ status }) => {
  const labels = { short: 'Short', surplus: 'Surplus', even: 'Even' };
  return <span className={`fb-pill fb-pill-${status}`}>{labels[status]}</span>;
};

// Sprint 17.12 — grouped tree render. Each group has a header row
// showing the substitutability-aware totals; below it, one row
// per specific subtype (NKRRA / NKRRP / etc.) with its own
// independent balance.
const NeedTable = ({ groups }) => (
  <div className="fb-card">
    <div className="fb-card-head">
      <h2>Need by Room Type</h2>
      <div className="fb-formula" title="Vacant Clean − Remaining Arrivals = Net Balance. Negative means rooms are needed. Already-checked-in guests are excluded — they're already in their rooms (those rooms are OCC, not in the VAC+VI pool).">
        <IconInfo />
        <div>
          <div><strong>Formula:</strong> Vacant Clean − Remaining Arrivals = Net Balance</div>
          <div className="fb-formula-sub">Counts only guests still to arrive. Group totals roll up subtypes — accessible/pet/etc. rooms can fulfil generic bookings.</div>
        </div>
      </div>
    </div>
    <div className="fb-table-wrap">
      <table className="fb-table fb-need-table">
        <thead>
          <tr>
            <th>Room Type Code</th>
            <th>Room Type</th>
            <th title="Total physical rooms of this type in inventory">Total Rooms</th>
            <th title="Vacant + (VI Vacant Inspected OR PU Pickup awaiting FD inspection)">Vacant Clean</th>
            <th title="Guests not yet checked in">Remaining Arrivals</th>
            <th>Net Balance</th>
            <th>Rooms Needed</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && (
            <tr><td colSpan={8} className="fb-table-empty">No room types in the snapshot yet.</td></tr>
          )}
          {groups.map(g => (
            <React.Fragment key={g.baseCode || g.baseLabel}>
              <tr className="fb-group-row">
                <td><code className="fb-group-code">{g.baseCode || '—'}</code></td>
                <td><strong>{g.baseLabel}</strong> <span className="fb-group-sub">· all subtypes</span></td>
                <td className="fb-cell-total">{g.totals.totalRooms}</td>
                <td>{g.totals.vacantClean}</td>
                <td>{g.totals.arrivals}</td>
                <td className={`fb-balance fb-balance-${g.totals.status}`}>
                  {g.totals.netBalance > 0 ? `+${g.totals.netBalance}` : g.totals.netBalance}
                </td>
                <td className={g.totals.roomsNeeded > 0 ? 'fb-emph-warn' : ''}>{g.totals.roomsNeeded}</td>
                <td><StatusPill status={g.totals.status} /></td>
              </tr>
              {g.variants.map(v => (
                <tr key={v.typeCode} className="fb-variant-row">
                  <td>
                    <span className="fb-variant-tree" aria-hidden>└</span>
                    <code>{v.typeCode}</code>
                  </td>
                  <td className="fb-variant-label">{v.subLabel || 'Standard'}</td>
                  <td className="fb-cell-total">{v.totalRooms}</td>
                  <td>{v.vacantClean}</td>
                  <td>{v.arrivals}</td>
                  <td className={`fb-balance fb-balance-${v.status}`}>
                    {v.netBalance > 0 ? `+${v.netBalance}` : v.netBalance}
                  </td>
                  <td className={v.roomsNeeded > 0 ? 'fb-emph-warn' : ''}>{v.roomsNeeded}</td>
                  <td><StatusPill status={v.status} /></td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const ArrivalDetailTable = ({ rows }) => {
  // Limit to today's arrivals only (the page's purpose), sort by
  // guest name for readability.
  const arrivals = rows
    .filter(r => r.kind === 'arrival')
    .slice()
    .sort((a, b) => (a.guestName || '').localeCompare(b.guestName || ''));
  return (
    <div className="fb-card">
      <div className="fb-card-head">
        <h2>Arrival Detail Reference</h2>
        <span className="fb-card-sub">{arrivals.length} arriving today</span>
      </div>
      <div className="fb-table-wrap">
        <table className="fb-table fb-detail-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Room Type</th>
              <th>Arrival Date</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {arrivals.length === 0 && (
              <tr><td colSpan={5} className="fb-table-empty">No arrivals in this snapshot.</td></tr>
            )}
            {arrivals.slice(0, 30).map(r => (
              <tr key={r.id}>
                <td className="fb-cell-name">{r.guestName || '(no name)'}</td>
                <td><code>{r.baseCode || '—'}</code></td>
                <td>{r.arrivalDate || '—'}</td>
                <td>{r.source || '—'}</td>
                <td><span className={`fb-pill fb-pill-status-${(r.statusLabel || '').toLowerCase().replace(/[^a-z]/g, '')}`}>{r.statusLabel || '—'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {arrivals.length > 30 && (
          <p className="fb-table-footnote">Showing first 30 of {arrivals.length}. Full list lives on the Reservations page.</p>
        )}
      </div>
    </div>
  );
};

// Right-rail summary card. Sprint 17.12 — takes the grouped tree
// directly. Per-group totals on the left; SVG bar chart on the
// right comparing each group's Vacant Clean vs Arrivals.
const ForecastSummaryCard = ({ groups }) => {
  const maxVal = Math.max(1, ...groups.flatMap(g => [g.totals.vacantClean, g.totals.arrivals]));
  const total  = groups.reduce((s, g) => s + g.totals.roomsNeeded, 0);
  return (
    <div className="fb-card">
      <h2>Forecast Summary</h2>
      <div className="fb-summary-grid">
        <ul className="fb-summary-list">
          {groups.map(g => (
            <li key={g.baseCode || g.baseLabel}>
              <span>{g.baseCode || '—'} needed</span>
              <strong className={g.totals.roomsNeeded > 0 ? 'fb-emph-warn' : 'fb-emph-ok'}>
                {g.totals.roomsNeeded}
              </strong>
            </li>
          ))}
          <li className="fb-summary-total">
            <span>Total needed</span>
            <strong>{total} rooms</strong>
          </li>
        </ul>

        <div className="fb-chart">
          <div className="fb-chart-title">Vacant Clean vs Remaining Arrivals</div>
          <div className="fb-chart-legend">
            <span className="fb-chart-key fb-chart-key-vc">Vacant Clean</span>
            <span className="fb-chart-key fb-chart-key-ar">Remaining Arrivals</span>
          </div>
          {groups.map(g => {
            const vcW = (g.totals.vacantClean / maxVal) * 100;
            const arW = (g.totals.arrivals    / maxVal) * 100;
            return (
              <div className="fb-bar-group" key={`bar-${g.baseCode || g.baseLabel}`}>
                <div className="fb-bar-label">{g.baseCode || '—'}</div>
                <div className="fb-bars">
                  <div className="fb-bar-row">
                    <div className="fb-bar fb-bar-vc" style={{ width: `${vcW}%` }} />
                    <span className="fb-bar-val">{g.totals.vacantClean}</span>
                  </div>
                  <div className="fb-bar-row">
                    <div className="fb-bar fb-bar-ar" style={{ width: `${arW}%` }} />
                    <span className="fb-bar-val">{g.totals.arrivals}</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="fb-chart-axis">
            <span>0</span><span>{Math.round(maxVal / 4)}</span><span>{Math.round(maxVal / 2)}</span><span>{Math.round(3 * maxVal / 4)}</span><span>{maxVal}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const OperationalNotes = ({ notes }) => (
  <div className="fb-card">
    <h2>Operational Notes</h2>
    <ul className="fb-notes">
      {notes.map((n, i) => (
        <li key={i} className={`fb-note fb-note-${n.kind}`}>
          <span className="fb-note-dot" aria-hidden="true"><IconDot /></span>
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  </div>
);

// Sprint 17.12 — HK Message Preview + Send to housekeeping
// removed from the Forecast page per user direction. Those belong
// to the Reservations / handoff workflow, not the room-availability
// projection. Component definition removed entirely.


// ── Page ────────────────────────────────────────────────────

const Forecast = () => {
  const { goTo } = useView();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading]   = useState(true);
  // Sprint 17.12: "syncing" replaces "scraping" — this page no
  // longer triggers a fresh scrape, it just re-reads the latest
  // snapshot from the DB. The Reservations page is where new
  // scrapes are kicked off; once that lands, sync here pulls the
  // updated payload.
  const [syncing, setSyncing]   = useState(false);
  const [error, setError]       = useState(null);
  const [historyOpen, setHistoryOpen]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetOpen, setSheetOpen]       = useState(false); // 17.12 — Generate Forecast modal

  const loadLatest = useCallback(async () => {
    setError(null);
    const { ok, data } = await apiFetch('/admin/forecast/snapshots/latest');
    if (!ok || !data?.success) {
      setError(data?.message || 'Could not load latest forecast.');
      setLoading(false);
      return;
    }
    setSnapshot(data.snapshot || null);
    setLoading(false);
  }, []);
  useEffect(() => { loadLatest(); }, [loadLatest]);

  // Sprint 17.12 — "Sync arrivals" on this page just re-reads the
  // latest snapshot. The actual rGuest scrape lives on the
  // Reservations page so the two pages always show the same
  // underlying data. (No POST /scrape from here.)
  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    const { ok, data } = await apiFetch('/admin/forecast/snapshots/latest');
    setSyncing(false);
    if (!ok || !data?.success) {
      setError(data?.message || 'Could not refresh from the latest snapshot.');
      return;
    }
    setSnapshot(data.snapshot || null);
  };

  const needGroups = useMemo(() => computeNeedTree(snapshot?.payload), [snapshot]);
  const notes      = useMemo(() => deriveOperationalNotes(needGroups), [needGroups]);

  const totals = useMemo(() => {
    // Sums roll up the group totals (substitutability already
    // baked in). Deficit/surplus type counts use group status —
    // we don't separately ding each subtype since the user's
    // dashboard view is category-level.
    const totalRoomsNeeded = needGroups.reduce((s, g) => s + g.totals.roomsNeeded, 0);
    const totalVacantClean = needGroups.reduce((s, g) => s + g.totals.vacantClean, 0);
    const derivedArrivals  = needGroups.reduce((s, g) => s + g.totals.arrivals,    0);
    const deficitTypes     = needGroups.filter(g => g.totals.status === 'short').length;
    const surplusTypes     = needGroups.filter(g => g.totals.status === 'surplus').length;
    // Sprint 17.15 — for the top "Remaining arrivals" stat use
    // rGuest's authoritative number when available so the
    // Forecast page matches the Reservations page's headline. If
    // the metrics endpoint didn't respond, fall back to our
    // derived sum. `derivedArrivals` is exposed separately so
    // the UI can show a small note when the two disagree.
    const metricRemaining = snapshot?.payload?.metricsSnapshot?.remainingArrivals?.remaining;
    const totalArrivals   = Number.isFinite(metricRemaining) ? metricRemaining : derivedArrivals;
    return {
      totalRoomsNeeded,
      totalVacantClean,
      totalArrivals,
      derivedArrivals,
      metricRemaining: Number.isFinite(metricRemaining) ? metricRemaining : null,
      deficitTypes,
      surplusTypes,
    };
  }, [needGroups, snapshot]);

  const lastSync = snapshot ? fmtTime(snapshot.scraped_at) : '—';

  return (
    <div className="fb-page">
      <header className="fb-header">
        <div className="fb-header-left">
          <div className="fb-breadcrumb">
            <button onClick={() => goTo('home')}>Home</button>
            <IconChevron />
            <span>Forecast</span>
          </div>
          <h1>Room Forecast</h1>
          <p className="fb-subtitle">
            Room-type availability forecast from Agilysys rGuest Stay and housekeeping room conditions.
          </p>
          <div className="fb-meta-actions">
            <button className="fb-meta-link" onClick={() => setHistoryOpen(true)}>
              <IconClock /> <span>Snapshot history</span>
            </button>
            <button className="fb-meta-link" onClick={() => setSettingsOpen(true)}>
              <IconGear /> <span>Forecast settings</span>
            </button>
            <button className="fb-meta-link" onClick={() => goTo('reservations')}>
              <IconBriefcase /> <span>Reservations detail</span>
            </button>
          </div>
        </div>

        <div className="fb-header-actions">
          <button
            className="fb-btn fb-btn-secondary"
            onClick={handleSync}
            disabled={syncing}
            title="Re-read the latest snapshot — does NOT trigger a new rGuest scrape (use Reservations for that)"
          >
            <IconRefresh /> <span>{syncing ? 'Syncing…' : 'Sync arrivals'}</span>
          </button>
          <button
            className="fb-btn fb-btn-primary"
            onClick={() => setSheetOpen(true)}
            disabled={!snapshot}
            title={!snapshot ? 'Sync first' : 'Open a printable forecast sheet'}
          >
            <IconChart /> <span>Generate forecast</span>
          </button>
          <div className="fb-sync-badge">
            <span className="fb-sync-dot" />
            <span>Last sync</span>
            <strong>{lastSync}</strong>
          </div>
        </div>
      </header>

      {loading && <div className="fb-loading">Loading latest forecast…</div>}
      {error && (
        <div className="fb-error" role="alert"><strong>Something went wrong.</strong> {error}</div>
      )}
      {!loading && !snapshot && !error && (
        <div className="fb-empty">
          <h2>No forecast yet</h2>
          <p>
            Run the scraper on the <button className="fb-empty-link" onClick={() => goTo('reservations')}>Reservations</button> page first.
            Once a snapshot exists, click <strong>Sync arrivals</strong> here to pull it in.
          </p>
        </div>
      )}

      {snapshot && (
        <>
          <section className="fb-stats" aria-label="Top stats">
            <StatBar label="Total rooms needed today" value={totals.totalRoomsNeeded} accent="warn"    icon={<IconBed />} />
            <StatBar label="Total vacant clean"       value={totals.totalVacantClean} accent="success" icon={<IconCheck />} />
            <StatBar label="Remaining arrivals"       value={totals.totalArrivals}    accent="info"    icon={<IconBriefcase />} />
            <StatBar label="Deficit room types"       value={totals.deficitTypes}     accent="warn"    icon={<IconWarn />} />
            <StatBar label="Surplus room types"       value={totals.surplusTypes}     accent="success" icon={<IconTrend />} />
          </section>

          {/* Sprint 17.15 — surface the gap when rGuest's total
              disagrees with our per-type breakdown. Helps the user
              spot when arrivals are slipping through unmapped room
              types (or rGuest is counting something we don't). */}
          {totals.metricRemaining != null && totals.metricRemaining !== totals.derivedArrivals && (
            <div className="fb-mismatch-note" role="note">
              <IconInfo />
              <span>
                rGuest reports <strong>{totals.metricRemaining}</strong> remaining arrivals across the property, but our per-type breakdown sums to <strong>{totals.derivedArrivals}</strong>.
                {' '}Gap of <strong>{Math.abs(totals.metricRemaining - totals.derivedArrivals)}</strong> may be walk-ins, reservations with unmapped/unknown room types, or status codes we haven't seen before.
              </span>
            </div>
          )}

          <div className="fb-body">
            <main className="fb-main">
              <NeedTable groups={needGroups} />
              <ArrivalDetailTable rows={snapshot.payload.reservations || []} />
            </main>
            <aside className="fb-rail">
              <ForecastSummaryCard groups={needGroups} />
              <OperationalNotes notes={notes} />
            </aside>
          </div>

        </>
      )}

      {historyOpen  && <ForecastHistory  onClose={() => setHistoryOpen(false)} />}
      {settingsOpen && <ForecastSettings onClose={() => setSettingsOpen(false)} />}
      {sheetOpen    && <ForecastSheet    onClose={() => setSheetOpen(false)} snapshot={snapshot} />}
    </div>
  );
};

export default Forecast;
