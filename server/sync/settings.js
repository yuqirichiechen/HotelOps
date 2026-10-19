// Sprint 22 — sync settings (dev settings): defaults, validation, local-clock helpers. PURE except load/save.
// Stored as ONE JSON string in app_settings.key = 'sync_settings'; the engine caches it in memory so a tick that has
// nothing to do never touches the database (Neon bills awake time — see memory: no DB-touching timers).
'use strict';

const SETTINGS_KEY = 'sync_settings';

const DEFAULTS = Object.freeze({
  enabled: true,                    // master switch (the tick endpoint also needs SYNC_TICK_SECRET to be set)
  paused: false,                    // kill switch — set automatically after an rGuest auth failure
  timezone: 'America/Los_Angeles',
  frequent: { enabled: true, from: '12:00', to: '24:00', everyMinutes: 5, daysAhead: 1 },   // today (+N days) scan inside the window
  hourly:   { everyMinutes: 60, aheadDays: 400, nearDays: 14 },                             // count-gate over 30-day slices + an exact re-fetch of the next nearDays (catches edits the count can't see)
  reconcile: { at: '04:30' },                                                                // once a day after rGuest's day roll
  flushEveryMinutes: 15,            // write-behind: how often scan results are written to the database (cost lever)
  backfill: { monthsBack: 12, chunksPerTick: 2, auto: true },
  storeRaw: true,                   // keep the last raw rGuest list row per reservation
  detailForNewMax: 25,              // per run: fetch details (created time, booked by) for at most N new reservations
  maxDetailChecks: 80,              // per run: "vanished" reservations looked up individually
});

const isHHMM = (v, allow24) => typeof v === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v) || (allow24 && v === '24:00');
const toMinutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const int = (v) => (typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN);

/**
 * Validate a (possibly partial) settings object on top of the current/default ones.
 * @returns {{ settings: object, errors: string[] }}  settings = merged + clamped-valid values; errors = what was rejected
 */
function validateSettings(input, base = DEFAULTS) {
  const errors = [];
  const out = JSON.parse(JSON.stringify(base));
  const inp = input && typeof input === 'object' ? input : {};
  const bool = (path, v, set) => { if (v === undefined) return; if (typeof v !== 'boolean') errors.push(`${path} must be true/false`); else set(v); };
  const rng = (path, v, lo, hi, set) => { if (v === undefined) return; const n = int(v); if (!(n >= lo && n <= hi)) errors.push(`${path} must be a whole number ${lo}–${hi}`); else set(n); };
  const hhmm = (path, v, allow24, set) => { if (v === undefined) return; if (!isHHMM(v, allow24)) errors.push(`${path} must be HH:MM${allow24 ? ' (or 24:00)' : ''}`); else set(v); };

  bool('enabled', inp.enabled, v => { out.enabled = v; });
  bool('paused', inp.paused, v => { out.paused = v; });
  bool('storeRaw', inp.storeRaw, v => { out.storeRaw = v; });
  if (inp.timezone !== undefined) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: inp.timezone }); out.timezone = inp.timezone; } catch { errors.push('timezone is not a valid IANA zone'); }
  }
  const f = inp.frequent || {};
  bool('frequent.enabled', f.enabled, v => { out.frequent.enabled = v; });
  hhmm('frequent.from', f.from, false, v => { out.frequent.from = v; });
  hhmm('frequent.to', f.to, true, v => { out.frequent.to = v; });
  rng('frequent.everyMinutes', f.everyMinutes, 1, 120, v => { out.frequent.everyMinutes = v; });
  rng('frequent.daysAhead', f.daysAhead, 0, 7, v => { out.frequent.daysAhead = v; });
  const h = inp.hourly || {};
  rng('hourly.everyMinutes', h.everyMinutes, 5, 1440, v => { out.hourly.everyMinutes = v; });
  rng('hourly.aheadDays', h.aheadDays, 30, 800, v => { out.hourly.aheadDays = v; });
  rng('hourly.nearDays', h.nearDays, 0, 60, v => { out.hourly.nearDays = v; });
  hhmm('reconcile.at', (inp.reconcile || {}).at, false, v => { out.reconcile.at = v; });
  rng('flushEveryMinutes', inp.flushEveryMinutes, 1, 240, v => { out.flushEveryMinutes = v; });
  const b = inp.backfill || {};
  rng('backfill.monthsBack', b.monthsBack, 0, 36, v => { out.backfill.monthsBack = v; });
  rng('backfill.chunksPerTick', b.chunksPerTick, 1, 12, v => { out.backfill.chunksPerTick = v; });
  bool('backfill.auto', b.auto, v => { out.backfill.auto = v; });
  rng('detailForNewMax', inp.detailForNewMax, 0, 200, v => { out.detailForNewMax = v; });
  rng('maxDetailChecks', inp.maxDetailChecks, 0, 500, v => { out.maxDetailChecks = v; });
  return { settings: out, errors };
}

/** Parse the stored JSON (anything invalid falls back to defaults field by field). */
function parseStored(text) {
  let raw = null;
  try { raw = text ? JSON.parse(text) : null; } catch { raw = null; }
  return validateSettings(raw || {}, DEFAULTS).settings;
}

const _fmtCache = new Map();
function _fmt(tz) {
  if (!_fmtCache.has(tz)) _fmtCache.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  return _fmtCache.get(tz);
}
/** { ymd, minutes } for an instant in a time zone (minutes since local midnight). */
function localClock(date, tz) {
  const p = Object.fromEntries(_fmt(tz).formatToParts(date).map(x => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, minutes: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10) };
}
/** Is `minutes` inside [from, to)? Supports windows that wrap midnight and to = '24:00'. from === to → empty. */
function inWindow(minutes, from, to) {
  const a = toMinutes(from), b = toMinutes(to);
  if (a === b) return false;
  return a < b ? (minutes >= a && minutes < b) : (minutes >= a || minutes < b);
}

async function loadSettings(pool) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [SETTINGS_KEY]);
  return parseStored(rows[0] && rows[0].value);
}
async function saveSettings(pool, settings) {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [SETTINGS_KEY, JSON.stringify(settings)]);
}

module.exports = { SETTINGS_KEY, DEFAULTS, validateSettings, parseStored, localClock, inWindow, toMinutes, loadSettings, saveSettings };
