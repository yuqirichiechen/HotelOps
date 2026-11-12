// Sprint 27.5 / 27.6 — light / dark for the Inntrio login.
//   • By default it is AUTOMATIC: dark from `darkFrom` until `darkTo` (default 18:00 → 06:00, wraps midnight), light the rest of the day, by the device's own clock;
//     the screen switches by itself when the window starts / ends (one timer to the next change — no polling).
//   • Dev can pin it ('dark' / 'light') or change the window: Dev → Platform → "Login screen — light / dark" (app_settings login_theme_mode / login_dark_from /
//     login_dark_to, served by the public /api/public-config; the last values are cached locally so the next load paints right away).
//   • Clicking the logo flips it as an override that lasts until the next change of the window, then automatic behaviour resumes.
//   The in-app theme (sidebar toggle, `hotelops-theme`) is separate; this only styles the sign-in screens.
// The flip itself is a circular reveal from the logo (View Transitions; instant without the API / with reduced motion).
import { useEffect, useReducer } from 'react';
import { withTransition } from './viewTransition';

export const CFG_KEY = 'inntrio-login-cfg';
export const OVERRIDE_KEY = 'inntrio-login-theme';
export const DEFAULT_CFG = { mode: 'auto', darkFrom: '18:00', darkTo: '06:00' };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

/** @returns {{mode:'auto'|'dark'|'light', darkFrom:string, darkTo:string}} always valid */
export const normalizeCfg = (c) => {
  const o = c && typeof c === 'object' ? c : {};
  const mode = ['auto', 'dark', 'light'].includes(o.mode) ? o.mode : DEFAULT_CFG.mode;
  let darkFrom = HHMM.test(o.darkFrom) ? o.darkFrom : DEFAULT_CFG.darkFrom;
  let darkTo = HHMM.test(o.darkTo) ? o.darkTo : DEFAULT_CFG.darkTo;
  if (darkFrom === darkTo) { darkFrom = DEFAULT_CFG.darkFrom; darkTo = DEFAULT_CFG.darkTo; }
  return { mode, darkFrom, darkTo };
};

/** is `date` inside the dark window? (the window wraps midnight when from > to) */
export const isDarkAt = (date, cfg) => {
  const { darkFrom, darkTo } = normalizeCfg(cfg); const from = toMin(darkFrom), to = toMin(darkTo); const m = date.getHours() * 60 + date.getMinutes();
  return from < to ? (m >= from && m < to) : (m >= from || m < to);
};

/** the next moment (> date) at which the automatic theme changes */
export const nextBoundary = (date, cfg) => {
  const { darkFrom, darkTo } = normalizeCfg(cfg); const out = [];
  for (const hhmm of [darkFrom, darkTo]) {
    const min = toMin(hhmm);
    for (const addDays of [0, 1]) { const d = new Date(date.getTime()); d.setDate(d.getDate() + addDays); d.setHours(Math.floor(min / 60), min % 60, 0, 0); if (d.getTime() > date.getTime()) out.push(d.getTime()); }
  }
  return Math.min(...out);
};

/** an unexpired logo-click override, else null */
const readOverride = (nowMs) => {
  try { const o = JSON.parse(store.get(OVERRIDE_KEY) || 'null'); if (o && (o.theme === 'light' || o.theme === 'dark') && Number(o.until) > nowMs) return o; } catch { /* bad value */ }
  return null;
};

/** 'light' | 'dark' now, for the config + any click override */
export const resolveTheme = (cfg, now = new Date()) => {
  const o = readOverride(now.getTime()); if (o) return o.theme;
  const c = normalizeCfg(cfg);
  if (c.mode === 'dark') return 'dark';
  if (c.mode === 'light') return 'light';
  return isDarkAt(now, c) ? 'dark' : 'light';
};

// ── config: the cached copy (read fresh each time, so there is no stale module state), refreshed once per page load from the server ──
export const getCfg = () => { try { return normalizeCfg(JSON.parse(store.get(CFG_KEY) || 'null')); } catch { return { ...DEFAULT_CFG }; } };
const listeners = new Set(); const notify = () => listeners.forEach(fn => fn());
let loading = false;
export const _resetLoginTheme = () => { loading = false; };
const loadConfig = () => {
  if (loading || typeof fetch !== 'function') return; loading = true;
  Promise.resolve().then(() => fetch('/api/public-config')).then(r => r.json()).then(d => {
    const c = d && d.success && d.config; if (!c || !['auto', 'dark', 'light'].includes(c.login_theme_mode)) return;   // an older server: keep what we have
    const next = normalizeCfg({ mode: c.login_theme_mode, darkFrom: c.login_dark_from, darkTo: c.login_dark_to });
    if (JSON.stringify(next) !== JSON.stringify(getCfg())) { store.set(CFG_KEY, JSON.stringify(next)); notify(); }
  }).catch(() => { /* offline / old server: the cached or default config stays */ });
};

export const useLoginTheme = () => {
  const [tick, bump] = useReducer(x => x + 1, 0);
  useEffect(() => { listeners.add(bump); loadConfig(); return () => { listeners.delete(bump); }; }, []);
  const theme = resolveTheme(getCfg());
  // one timer to the next change (the window's edge, or the end of a click override) — re-armed after every render that follows it
  useEffect(() => {
    const now = new Date(); const o = readOverride(now.getTime());
    const at = Math.min(nextBoundary(now, getCfg()), o ? Number(o.until) : Infinity);
    const t = setTimeout(() => { bump(); }, Math.max(1000, at - now.getTime() + 400));
    return () => clearTimeout(t);
  }, [tick]);
  const light = theme === 'light';
  /** @param {MouseEvent} [event] where the reveal starts (the logo); keyboard activation falls back to the logo's centre */
  const toggle = (event) => {
    const el = event && event.currentTarget; const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    const point = r && (r.width || r.height) ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    withTransition(() => { store.set(OVERRIDE_KEY, JSON.stringify({ theme: light ? 'dark' : 'light', until: nextBoundary(new Date(), getCfg()) })); notify(); }, 'theme', point);
  };
  return { light, toggle };
};
