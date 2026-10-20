// Sprint 22.3 — forecast accuracy: compare "booked N days ahead" with guests that actually arrived (server: daily_rollups ⋈ daily_actuals)
// and suggest a scale for the late-booking allowance. PURE.
import { lateAllowanceRatio, DEFAULT_ALLOWANCE } from './forecastModel';

const dow = (ymd) => new Date(String(ymd).slice(0, 10) + 'T12:00:00Z').getUTCDay();
const sum = (list, k) => list.reduce((s, r) => s + (Number(r[k]) || 0), 0);
export const MIN_DAYS = 7;

/** What the model would have predicted for one room-type group on one day (allowance only; no capacity cap). */
export function predictedArrivals(booked, horizon, targetDate, allowance) {
  const a = { ...DEFAULT_ALLOWANCE, ...(allowance || {}) };
  let extra = Math.round(booked * lateAllowanceRatio(horizon, dow(targetDate), a));
  if (a.enabled && booked >= 4) extra = Math.max(extra, Number(a.minExtra) || 0);
  return booked + (a.enabled ? extra : 0);
}

/** Least-squares scale (percent of the calibrated table) that best explains actual − booked at the given horizons. */
export function bestScale(rows, horizons) {
  let num = 0, den = 0;
  for (const r of rows) {
    if (!horizons.includes(r.horizon_days) || r.actual == null) continue;
    const m = lateAllowanceRatio(r.horizon_days, dow(r.target_date), { ...DEFAULT_ALLOWANCE, enabled: true, scalePct: 100 }) * r.booked;
    num += m * (r.actual - r.booked); den += m * m;
  }
  if (!(den > 0)) return null;
  return Math.max(25, Math.min(300, Math.round((num / den) * 100 / 5) * 5));
}

/**
 * @param {Array} rows       [{ target_date, base_code, horizon_days, booked, actual }]
 * @param {Object} allowance current settings { enabled, scalePct, minExtra }
 */
export function summarizeAccuracy(rows, allowance, horizons = [1, 2, 3, 5, 7]) {
  const clean = (rows || []).filter(r => r && r.actual != null);
  const dayCount = new Set(clean.map(r => r.target_date)).size;
  const perHorizon = horizons.map(k => {
    const rs = clean.filter(r => r.horizon_days === k);
    const booked = sum(rs, 'booked'), actual = sum(rs, 'actual');
    let modelExtra = 0, errModel = 0, errNone = 0;
    for (const r of rs) {
      const expected = predictedArrivals(r.booked, k, r.target_date, allowance);
      modelExtra += expected - r.booked; errModel += Math.abs(r.actual - expected); errNone += Math.abs(r.actual - r.booked);
    }
    return { horizon: k, days: new Set(rs.map(r => r.target_date)).size, observations: rs.length, booked, actual,
      measuredPct: booked ? (actual - booked) / booked : null, modelPct: booked ? modelExtra / booked : null,
      maeModel: rs.length ? errModel / rs.length : null, maeNone: rs.length ? errNone / rs.length : null };
  });
  const ready = dayCount >= MIN_DAYS;
  return { days: dayCount, ready, perHorizon, suggestedScale: ready ? bestScale(clean, [1, 2, 3]) : null };
}
