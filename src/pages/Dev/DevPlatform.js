// Platform-wide settings (moved out of the old DevPanel page in Sprint 22.4). Currently just the tenant-logo dark-mode strategy.
import React, { useEffect, useState } from 'react';
import { authFetch } from '../../auth';

const STRATEGIES = [
  { key: 'card',        label: 'White card backdrop (default)', desc: 'Wraps colored tenant logos in a small white container. Works for any logo, doesn\'t require a dark variant.' },
  { key: 'invert',      label: 'CSS invert (monochrome only)',  desc: 'Flips light/dark via CSS filter. Only safe for monochrome / two-tone logos — colored logos look wrong.' },
  { key: 'force-light', label: 'Force light theme for tenant pages', desc: 'Keeps the login pages in light theme regardless of the user\'s preference. Use if the tenant absolutely won\'t look right in dark mode.' },
];

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
  );
};

export default DevPlatform;
