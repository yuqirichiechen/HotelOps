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

module.exports = { decideRuns, SLACK_MS };
