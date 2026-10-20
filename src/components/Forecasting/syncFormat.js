// Sprint 22.2 — pure helpers for the auto-sync panel + change feed (unit-tested).
export const KIND_LABEL = {
  frequent: 'Quick scan (today)', hourly: 'Hourly check', reconcile: 'Daily reconcile', backfill: 'Backfill', full: 'Full re-sync',
};
export const KIND_HELP = {
  frequent: 'Today and tomorrow’s reservations + who is in house.',
  hourly: 'Counts bookings per 30-day slice and re-reads only the slices that changed (plus the next 14 days).',
  reconcile: 'Reads every future booking and marks ones that disappeared. Catches edits the hourly check cannot see.',
  backfill: 'Continues loading history (and the year ahead) in 30-day chunks.',
  full: 'Re-reads everything from scratch (about 4 minutes, ~1,000 rGuest calls).',
};

/** "just now" / "4 min ago" / "3 h ago" / "2 d ago"; null/invalid → null. */
export function ago(iso, nowMs = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime(); if (!Number.isFinite(t)) return null;
  const s = Math.round((nowMs - t) / 1000);
  if (s < -30) return 'in ' + inFuture(-s);
  if (s < 45) return 'just now';
  if (s < 90) return '1 min ago';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
const inFuture = (s) => (s < 90 ? 'a moment' : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`);

export const fmtClock = (iso, tz = 'America/Los_Angeles') => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz }); } catch { return '—'; }
};
export const fmtDayClock = (iso, tz = 'America/Los_Angeles', nowMs = Date.now()) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso), day = (x) => new Date(x).toLocaleDateString('en-CA', { timeZone: tz });
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz });
    return day(d) === day(nowMs) ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: tz })}, ${time}`;
  } catch { return '—'; }
};

/** Flat form draft (strings, for inputs) ⇄ the nested settings object the API uses. */
export function draftFromSettings(s) {
  return {
    enabled: !!s.enabled, timezone: s.timezone,
    freqEnabled: !!s.frequent.enabled, freqFrom: s.frequent.from, freqTo: s.frequent.to, freqEvery: String(s.frequent.everyMinutes), freqDays: String(s.frequent.daysAhead),
    hourlyEvery: String(s.hourly.everyMinutes), hourlyAhead: String(s.hourly.aheadDays), hourlyNear: String(s.hourly.nearDays),
    reconcileAt: s.reconcile.at, flushEvery: String(s.flushEveryMinutes),
    bfAuto: !!s.backfill.auto, bfMonths: String(s.backfill.monthsBack), bfChunks: String(s.backfill.chunksPerTick),
    storeRaw: !!s.storeRaw, detailNew: String(s.detailForNewMax), detailChecks: String(s.maxDetailChecks),
  };
}
export function settingsFromDraft(d) {
  return {
    enabled: d.enabled, timezone: d.timezone, storeRaw: d.storeRaw,
    frequent: { enabled: d.freqEnabled, from: d.freqFrom, to: d.freqTo, everyMinutes: d.freqEvery, daysAhead: d.freqDays },
    hourly: { everyMinutes: d.hourlyEvery, aheadDays: d.hourlyAhead, nearDays: d.hourlyNear },
    reconcile: { at: d.reconcileAt }, flushEveryMinutes: d.flushEvery,
    backfill: { auto: d.bfAuto, monthsBack: d.bfMonths, chunksPerTick: d.bfChunks },
    detailForNewMax: d.detailNew, maxDetailChecks: d.detailChecks,
  };
}
export const draftChanged = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

/** Overall health for the pill + the plain-language problems to show. */
export function healthOf(status, tickConfigured, nowMs = Date.now()) {
  const problems = [];
  if (!tickConfigured) problems.push('The scheduler secret is not set on the server (SYNC_TICK_SECRET), so no scheduler can start a sync.');
  const s = status || {};
  if (s.authFailure) problems.push('rGuest rejected the login — sync is paused. Fix the credentials in Koyeb, redeploy, then resume.');
  const last = s.lastTickAt ? new Date(s.lastTickAt).getTime() : null;
  if (tickConfigured && !s.authFailure && !(s.settings && s.settings.paused) && s.settings && s.settings.enabled) {
    const sinceBoot = s.bootedAt ? nowMs - new Date(s.bootedAt).getTime() : 0;
    if (last == null && sinceBoot > 15 * 60000) problems.push('No scheduler ping has arrived since the server started. Check the scheduler job (Cloudflare Worker cron / cron-job.org).');
    else if (last != null && nowMs - last > 15 * 60000) problems.push(`The last scheduler ping was ${ago(s.lastTickAt, nowMs)}. Check the scheduler job.`);
  }
  const recent = (s.recentRuns || []).slice(0, 3);
  if (recent.length && recent.every(r => r.status === 'failed')) problems.push(`The last ${recent.length} runs failed: ${recent[0].error || 'unknown error'}`);
  let state = 'ok', label = 'Healthy';
  if (!s.settings) { state = 'unknown'; label = 'Loading'; }
  else if (!s.settings.enabled) { state = 'off'; label = 'Disabled'; }
  else if (s.settings.paused) { state = 'paused'; label = 'Paused'; }
  else if (s.running) { state = 'running'; label = `Running ${KIND_LABEL[s.running.kind] || s.running.kind}`; }
  else if (problems.length) { state = 'warn'; label = 'Needs attention'; }
  return { state, label, problems };
}

// ── change feed ──
export const EVENT_LABEL = { new: 'New booking', changed: 'Changed', arrived: 'Arrived', departed: 'Departed', cancelled: 'Cancelled', no_show: 'No-show', moved: 'Moved', gone: 'Removed in rGuest', reappeared: 'Reappeared' };
export const FIELD_LABEL = { room_number: 'Room', type_code: 'Room type', arrival_date: 'Arrival', departure_date: 'Departure', nights: 'Nights', status: 'Status', guest_name: 'Guest', rate_plan_code: 'Rate plan', confirmation_id: 'Confirmation', vip_uuid: 'VIP', is_day_use: 'Day use', scheduled_for_room_move: 'Room move' };
const show = (v) => (v === null || v === undefined || v === '' ? '—' : v === true ? 'yes' : v === false ? 'no' : String(v));
/** [{ label, from, to }] for the fields of a 'changed' event, most useful first. */
export function describeChanges(changes) {
  const order = ['room_number', 'type_code', 'arrival_date', 'departure_date', 'nights', 'status', 'guest_name', 'rate_plan_code'];
  const keys = Object.keys(changes || {}).sort((a, b) => (order.indexOf(a) + 100) % 100 - (order.indexOf(b) + 100) % 100);
  return keys.filter(k => k !== 'nights' || !changes.departure_date).map(k => ({ key: k, label: FIELD_LABEL[k] || k, from: show(changes[k][0]), to: show(changes[k][1]) }));
}
export function stayLabel(ev) {
  const a = ev.arrival_date || (ev.info && ev.info.arrival_date), d = ev.departure_date || (ev.info && ev.info.departure_date);
  if (!a) return '';
  const md = (x) => { const [y, m, dd] = x.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' }); };
  return d ? `${md(a)} → ${md(d)}` : md(a);
}

/**
 * Plain-language "is this data fresh?" for managers and front desk (Sprint 22.4) — no technical terms.
 * @param {{source:'mirror'|'snapshot'|null, syncedAt:string|null, health:{state:string, everyMinutes?:number}|null}} d
 * @returns {{ tone:'ok'|'warn'|'bad', title:string, sub:string, hint:string }}
 */
export function freshnessOf({ source, syncedAt, health }, nowMs = Date.now(), tz = 'America/Los_Angeles') {
  const when = ago(syncedAt, nowMs), clock = fmtClock(syncedAt, tz);
  if (!syncedAt) return { tone: 'warn', title: 'Not updated yet', sub: '', hint: 'Tap refresh to load the latest reservations.' };
  if (source !== 'mirror') return { tone: 'warn', title: 'Manual update', sub: clock, hint: 'Tap refresh to get the latest reservations.' };
  const st = health && health.state;
  if (st === 'down' || st === 'off') return { tone: 'bad', title: 'Not updating', sub: `last update ${clock}`, hint: 'Automatic updates have stopped. Please tell the manager.' };
  if (st === 'stale') return { tone: 'warn', title: 'May be out of date', sub: `updated ${when}`, hint: 'Automatic updates are running late. Tap refresh to update now.' };
  return { tone: 'ok', title: 'Up to date', sub: when === 'just now' ? 'just now' : when, hint: health && health.everyMinutes ? `Updates automatically about every ${health.everyMinutes} minutes.` : 'Updates automatically.' };
}
