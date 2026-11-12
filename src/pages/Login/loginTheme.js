// Sprint 27.5 — light / dark for the Inntrio login. Click the logo (top-left) to switch. The choice is the app's own saved theme (`hotelops-theme`, owned by
// App.js and provided here through a context), so it carries into the app after signing in. With nothing saved the login is dark (the brand default).
// The switch is a circular reveal from the logo (View Transitions); without the API / with reduced motion it just switches.
import { createContext, useContext, useState } from 'react';
import { withTransition } from './viewTransition';

export const THEME_KEY = 'hotelops-theme';
export const LoginThemeContext = createContext(null);   // { theme: 'light' | 'dark' | null, setTheme(next) } — provided by App

const readStored = () => { try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; } };

export const useLoginTheme = () => {
  const ctx = useContext(LoginThemeContext);
  const [local, setLocal] = useState(readStored);   // fallback when no provider is mounted (tests, isolated use)
  const theme = ctx ? ctx.theme : local;
  const set = ctx ? ctx.setTheme : (next) => { try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ } setLocal(next); };
  const light = theme === 'light';
  /** @param {MouseEvent} [event] where the reveal starts (the logo); keyboard activation falls back to the logo's centre */
  const toggle = (event) => {
    const el = event && event.currentTarget;
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    const point = r && (r.width || r.height) ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    withTransition(() => set(light ? 'dark' : 'light'), 'theme', point);
  };
  return { light, toggle };
};
