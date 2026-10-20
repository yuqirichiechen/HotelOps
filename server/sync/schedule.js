// Sprint 22 — "what is due right now?" PURE function. The external scheduler pings every ~5 minutes; this decides
// (in memory, no database) which sync kinds should run. Kinds, in the order they run:
//   frequent   — today (+N days) RES + in-house, inside the configured window (default 12:00–24:00 PT, every 5 min)
//   hourly     — count-gate over 30-day slices; re-fetches only slices whose count changed
//   reconcile  — once a day after the day roll: exact fetch of every future RES + vanish detection
//   backfill   — resumable first full load / history, a few chunks per tick until done
'use strict';
const { localClock, inWindow, toMinutes } = require('./settings');

const SLACK_MS = 45 * 1000;   // pings arrive with jitter: a 4:15 gap still counts as "5 minutes"

/**
 * @param {Date}   now
 * @param {object} settings  validated settings
 * @param {object} state     { lastFrequentAt, lastHourlyAt, lastReconcileAt, backfillDone, initialized } (Date|null)
 * @returns {{ kinds: string[], reason: string|null }}
 */
function decideRuns(now, settings, state) {
  if (!settings.enabled) return { kinds: [], reason: 'disabled' };
  if (settings.paused) return { kinds: [], reason: 'paused' };
  const clock = localClock(now, settings.timezone);
  const age = (d) => (d ? now.getTime() - new Date(d).getTime() : Infinity);
  const kinds = [];

  const f = settings.frequent;
  if (f.enabled && inWindow(clock.minutes, f.from, f.to) && age(state.lastFrequentAt) >= f.everyMinutes * 60000 - SLACK_MS) kinds.push('frequent');
  if (age(state.lastHourlyAt) >= settings.hourly.everyMinutes * 60000 - SLACK_MS) kinds.push('hourly');
  // reconcile: once per local day, after the configured time
  const lastRecDay = state.lastReconcileAt ? localClock(new Date(state.lastReconcileAt), settings.timezone).ymd : null;
  if (clock.minutes >= toMinutes(settings.reconcile.at) && lastRecDay !== clock.ymd) kinds.push('reconcile');
  if (settings.backfill.auto && !state.backfillDone) kinds.push('backfill');
  return { kinds, reason: kinds.length ? null : 'nothing due' };
}

/**
 * When will each kind next be due (given pings every `pingMinutes`)? Pure; for the dev-settings panel ("next: 4:35 PM").
 * @returns {{ frequent: string|null, hourly: string|null, reconcile: string|null, reason: string|null }} ISO instants
 */
function nextDue(now, settings, state, pingMinutes = 5) {
  if (!settings.enabled) return { frequent: null, hourly: null, reconcile: null, reason: 'disabled' };
  if (settings.paused) return { frequent: null, hourly: null, reconcile: null, reason: 'paused' };
  const t0 = now.getTime(), step = 60000;
  const scan = (fromMs, pred) => { for (let t = fromMs, i = 0; i < 2 * 1440 + 1; t += step, i++) if (pred(new Date(t))) return new Date(t).toISOString(); return null; };
  const roundUp = (ms) => Math.ceil(ms / (pingMinutes * 60000)) * pingMinutes * 60000;      // runs only happen when a ping arrives
  const f = settings.frequent;
  const frequent = !f.enabled ? null : scan(Math.max(t0, state.lastFrequentAt ? new Date(state.lastFrequentAt).getTime() + f.everyMinutes * 60000 - SLACK_MS : t0),
    (d) => inWindow(localClock(d, settings.timezone).minutes, f.from, f.to));
  const hourly = new Date(Math.max(t0, state.lastHourlyAt ? new Date(state.lastHourlyAt).getTime() + settings.hourly.everyMinutes * 60000 - SLACK_MS : t0)).toISOString();
  const lastRecDay = state.lastReconcileAt ? localClock(new Date(state.lastReconcileAt), settings.timezone).ymd : null;
  const reconcile = scan(t0, (d) => { const c = localClock(d, settings.timezone); return c.minutes >= toMinutes(settings.reconcile.at) && c.ymd !== lastRecDay; });
  const r = (iso) => (iso ? new Date(roundUp(new Date(iso).getTime())).toISOString() : null);
  return { frequent: r(frequent), hourly: r(hourly), reconcile: r(reconcile), reason: null };
}

module.exports = { decideRuns, nextDue, SLACK_MS };
