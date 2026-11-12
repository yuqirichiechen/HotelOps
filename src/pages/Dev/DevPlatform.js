// Platform-wide settings (moved out of the old DevPanel page in Sprint 22.4): the tenant-logo dark-mode strategy and (Sprint 27.6) the Inntrio login's light / dark.
import React, { useEffect, useState } from 'react';
import { authFetch } from '../../auth';

const STRATEGIES = [
  { key: 'card',        label: 'White card backdrop (default)', desc: 'Wraps colored tenant logos in a small white container. Works for any logo, doesn\'t require a dark variant.' },
  { key: 'invert',      label: 'CSS invert (monochrome only)',  desc: 'Flips light/dark via CSS filter. Only safe for monochrome / two-tone logos — colored logos look wrong.' },
  { key: 'force-light', label: 'Force light theme for tenant pages', desc: 'Keeps the login pages in light theme regardless of the user\'s preference. Use if the tenant absolutely won\'t look right in dark mode.' },
];

const THEME_MODES = [
  { key: 'auto',  label: 'Automatic by time of day (default)', desc: 'Dark during the dark window below, light the rest of the day. Uses the device\'s own clock, so a tablet at the property follows local time. The screen switches by itself when the window starts or ends.' },
  { key: 'dark',  label: 'Always dark', desc: 'The original look, day and night.' },
  { key: 'light', label: 'Always light', desc: 'Rice white and gold, day and night.' },
];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Sprint 27.6: the Inntrio login picks light or dark by itself (dark from 6 pm to 6 am by default). Anyone can still click the logo to switch until the next
// change of the window; this card sets the default behaviour for the whole property.
export const LoginThemeCard = () => {
  const [mode, setMode] = useState('auto');
  const [from, setFrom] = useState('18:00');
  const [to, setTo] = useState('06:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/public-config').then(r => r.json()).then(data => {
      const c = data && data.success && data.config;
      if (c) { if (c.login_theme_mode) setMode(c.login_theme_mode); if (c.login_dark_from) setFrom(c.login_dark_from); if (c.login_dark_to) setTo(c.login_dark_to); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const bad = !TIME_RE.test(from) || !TIME_RE.test(to) ? 'Pick both times.' : from === to ? 'The start and end times must be different.' : '';
  const save = async () => {
    if (bad) { setErr(bad); return; }
    setSaving(true); setSaved(false); setErr('');
    try {
      const res = await authFetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login_theme_mode: mode, login_dark_from: from, login_dark_to: to }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Save failed');
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setErr(e.message || 'Save failed'); }
    setSaving(false);
  };

  if (loading) return <p className="dv-muted">Loading…</p>;
  return (
    <section className="dv-card" aria-label="Login light / dark">
      <h2>Login screen — light / dark</h2>
      <p className="dv-muted">How the Inntrio sign-in screens look by default. People can still click the logo to flip it; that choice holds until the next change of the window. Takes effect the next time a screen loads.</p>
      <div className="dv-radio-list">
        {THEME_MODES.map(m => (
          <label key={m.key} className={`dv-radio${mode === m.key ? ' on' : ''}`}>
            <input type="radio" name="login-theme-mode" checked={mode === m.key} onChange={() => { setMode(m.key); setSaved(false); setErr(''); }} />
            <span><strong>{m.label}</strong><small>{m.desc}</small></span>
          </label>
        ))}
      </div>
      <div className="dv-time-row" aria-disabled={mode !== 'auto'}>
        <label>Dark from <input type="time" value={from} disabled={mode !== 'auto'} onChange={e => { setFrom(e.target.value); setSaved(false); setErr(''); }} /></label>
        <label>until <input type="time" value={to} disabled={mode !== 'auto'} onChange={e => { setTo(e.target.value); setSaved(false); setErr(''); }} /></label>
        <span className="dv-muted">(light the rest of the day; default 18:00 → 06:00)</span>
      </div>
      {err && <p className="dv-error" role="alert">{err}</p>}
      <button type="button" className="dv-btn dv-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}</button>
    </section>
  );
};

const DevPlatform = () => {
  const [strategy, setStrategy] = useState('card');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/public-config').then(r => r.json()).then(data => {
      if (data?.success && data.config?.tenant_logo_dark_strategy) setStrategy(data.config.tenant_logo_dark_strategy);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setSaved(false); setErr('');
    try {
      const res = await authFetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant_logo_dark_strategy: strategy }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Save failed');
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setErr(e.message || 'Save failed'); }
    setSaving(false);
  };

  if (loading) return <p className="dv-muted">Loading…</p>;
  return (
    <>
    <LoginThemeCard />
    <section className="dv-card">
      <h2>Tenant logo — dark mode strategy</h2>
      <p className="dv-muted">Applies to tenant logos (e.g. Snoqualmie Inn) that don't ship a dark-mode variant. Choose how they render when the page is in dark theme.</p>
      <div className="dv-radio-list">
        {STRATEGIES.map(s => (
          <label key={s.key} className={`dv-radio${strategy === s.key ? ' on' : ''}`}>
            <input type="radio" name="strategy" checked={strategy === s.key} onChange={() => { setStrategy(s.key); setSaved(false); }} />
            <span><strong>{s.label}</strong><small>{s.desc}</small></span>
          </label>
        ))}
      </div>
      {err && <p className="dv-error" role="alert">{err}</p>}
      <button type="button" className="dv-btn dv-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}</button>
    </section>
    </>
  );
};

export default DevPlatform;
