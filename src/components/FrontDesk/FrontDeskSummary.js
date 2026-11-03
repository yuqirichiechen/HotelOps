// Sprint 24 / 24.3 — the front-desk portal's Reservations tab (was a block on Home): the five Reservations tiles (arrivals left · in-house · check-outs left ·
// left to sell · dirty rooms) and the Forecast's "Sellable vs arriving" card, for TODAY only. Both are the existing components
// (KpiCard / ForecastSummaryCard) fed by the same models, so the numbers match what managers see; the data comes from the
// `/api/frontdesk/*` routes, which strip every guest identifier server-side.
//
// Cost rules (memory: no DB-touching timers): the room/reservation payload loads on open, on tab focus and on the Refresh button
// only; the live room board (DB-free) refreshes every 2 min while the tab is visible and pauses after 30 min without activity.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../auth';
import { KpiCard, IconBriefcase, IconBed, IconExit, IconSparkle, IconBroom } from '../Forecasting';
import { ForecastSummaryCard } from '../Forecast';
import { buildRoomCondition, fraction } from '../Forecasting/roomCondition';
import { buildDayModel, DEFAULT_ALLOWANCE } from '../Forecast/forecastModel';
import SyncBadge from '../shared/SyncBadge';
import './FrontDesk.css';

const LIVE_EVERY_MS = 120 * 1000;
const IDLE_PAUSE_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

const IconRefresh = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M3 21v-5h5" />
  </svg>
);

const FrontDeskSummary = () => {
  const [snapshot, setSnapshot] = useState(null);
  const [source, setSource] = useState(null);
  const [health, setHealth] = useState(null);
  const [live, setLive] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCurrent = useCallback(async () => {
    const { ok, data } = await apiFetch('/frontdesk/forecast/current');
    if (!ok || !data?.success) { setError(data?.message || 'Could not load today’s rooms.'); setLoading(false); return; }
    setError(null);
    setSnapshot(data.snapshot || null);
    setSource(data.source || null);
    setHealth(data.sync || null);
    setLoading(false);
  }, []);

  const fetchLive = useCallback(async () => {
    const { ok, data } = await apiFetch('/frontdesk/forecast/live');
    if (ok && data?.success) setLive(data.live);
  }, []);

  useEffect(() => {
    loadCurrent();
    fetchLive();
    const onFocus = () => loadCurrent();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadCurrent, fetchLive]);

  // live board: every 2 min while visible and someone is around; paused after 30 min without interaction
  const lastActivity = useRef(Date.now());
  const paused = useRef(false);
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivity.current > IDLE_PAUSE_MS) { paused.current = true; return; }
      fetchLive();
    }, LIVE_EVERY_MS);
    const onActivity = () => { lastActivity.current = Date.now(); if (paused.current) { paused.current = false; fetchLive(); } };
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    return () => { clearInterval(tick); ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity)); };
  }, [fetchLive]);

  const refresh = async () => { setRefreshing(true); await Promise.all([loadCurrent(), fetchLive()]); setRefreshing(false); };

  const payload = snapshot && snapshot.payload;
  const today = (live && live.forecastDate) || (payload && payload.forecastDate) || null;
  const kpis = (payload && payload.kpis) || {};
  const condition = useMemo(() => (payload ? buildRoomCondition(payload) : null), [payload]);
  const model = useMemo(() => (payload && today ? buildDayModel(payload, today, live, DEFAULT_ALLOWANCE) : null), [payload, today, live]);

  const arrTotal = kpis.arrivals ?? 0, arrLeft = kpis.remainingArrivals ?? 0, arrived = Math.max(0, arrTotal - arrLeft);
  const depTotal = kpis.departures ?? 0, depLeft = kpis.remainingDepartures ?? 0, checkedOut = Math.max(0, depTotal - depLeft);
  const cc = condition ? condition.counts : null;

  return (
    <section className="fd-ops" aria-label="Front desk today">
      <header className="fd-ops-head">
        <h2>Reservations <span>today</span></h2>
        <div className="fd-ops-actions">
          <SyncBadge source={source} syncedAt={snapshot ? snapshot.scraped_at : null} health={health} label="" />
          <button type="button" className="fd-refresh" onClick={refresh} disabled={refreshing} title="Refresh the numbers" aria-label="Refresh the numbers">
            <IconRefresh />
          </button>
        </div>
      </header>

      {loading && <p className="fd-muted">Loading today&rsquo;s numbers…</p>}
      {error && <div className="fd-error" role="alert">{error}</div>}

      {payload && (
        <>
          <div className="fc-kpis fc-kpis-5 fd-tiles" aria-label="Today at a glance">
            <KpiCard accent="arrivals" icon={<IconBriefcase />} label="Arrivals left" primary={arrLeft}
              sublabel={`${arrived} arrived of ${arrTotal} today`}
              ring={fraction(arrived, arrTotal)} ringColor="#6b46c1" ringLabel={`${arrived} of ${arrTotal} arrived`} />
            <KpiCard accent="inhouse" icon={<IconBed />} label="In-house" primary={kpis.inHouse ?? 0} sublabel="guests currently staying"
              ring={fraction(kpis.inHouse ?? 0, condition ? condition.sellable : 0)} ringColor="#2b6cb0"
              ringLabel={condition ? `${kpis.inHouse ?? 0} of ${condition.sellable} rooms occupied` : undefined} />
            <KpiCard accent="departures" icon={<IconExit />} label="Check-outs left" primary={depLeft}
              sublabel={`${checkedOut} checked out of ${depTotal} today`}
              ring={fraction(checkedOut, depTotal)} ringColor="#dd6b20" ringLabel={`${checkedOut} of ${depTotal} checked out`} />
            {cc && (
              <KpiCard accent="staying" icon={<IconSparkle />} label="Left to sell" primary={cc.leftToSell}
                sublabel={`${cc.vi} inspected · ${cc.pu} pickup`}
                ring={fraction(cc.leftToSell, condition.sellable)} ringColor="#2f855a" ringLabel={`${cc.leftToSell} of ${condition.sellable} rooms left to sell`} />
            )}
            {cc && (
              <KpiCard accent="dirty" icon={<IconBroom />} label="Dirty rooms" primary={cc.dirtyTotal}
                sublabel={`${cc.dirty} dirty · ${cc.inProgress} in progress · ${cc.occupiedClean} occupied clean`}
                ring={fraction(cc.dirtyTotal, condition.total)} ringColor="#c53030" ringLabel={`${cc.dirtyTotal} of ${condition.total} rooms need cleaning`} />
            )}
          </div>
          {model && <div className="fd-sellable"><ForecastSummaryCard model={model} showChart={false} /></div>}
        </>
      )}

      {!loading && !payload && !error && <p className="fd-muted">No room data yet — it appears after the first sync.</p>}
    </section>
  );
};

export default FrontDeskSummary;
