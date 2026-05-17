import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import HotelOpsLogo from '../../components/shared/HotelOpsLogo';
import { isDevAuthed, clearDevAuth } from '../Login/DevLogin';
import '../Login/Login.css';
import '../../components/shared/HotelOpsLogo.css';

// Sprint 9.2: minimal dev panel. Just one knob for now —
// tenant_logo_dark_strategy. Future sprints add more platform-wide
// settings (add/remove tenants, edit slugs, etc.).

const STRATEGIES = [
  {
    key:   'card',
    label: 'White card backdrop (default)',
    desc:  'Wraps colored tenant logos in a small white container. Works for any logo, doesn\'t require a dark variant.',
  },
  {
    key:   'invert',
    label: 'CSS invert (monochrome only)',
    desc:  'Flips light/dark via CSS filter. Only safe for monochrome / two-tone logos — colored logos look wrong.',
  },
  {
    key:   'force-light',
    label: 'Force light theme for tenant pages',
    desc:  'Keeps the login pages in light theme regardless of the user\'s preference. Use if the tenant absolutely won\'t look right in dark mode.',
  },
];

const DevPanel = () => {
  const nav = useNavigate();
  const [strategy, setStrategy] = useState('card');
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [saved,   setSaved]     = useState(false);
  const [err,     setErr]       = useState('');

  useEffect(() => {
    fetch('/api/public-config')
      .then(r => r.json())
      .then(data => {
        if (data?.success && data.config?.tenant_logo_dark_strategy) {
          setStrategy(data.config.tenant_logo_dark_strategy);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErr('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_logo_dark_strategy: strategy }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e.message || 'Save failed');
    }
    setSaving(false);
  };

  const handleSignOut = () => {
    clearDevAuth();
    nav('/login/dev', { replace: true });
  };

  if (!isDevAuthed()) return <Navigate to="/login/dev" replace />;

  return (
    <div className="login-page login-layout-hardcode">
      <div className="login-card">
        <div className="login-tenant-brand">
          <HotelOpsLogo size="lg" />
        </div>

        <h1 className="login-title">Dev panel</h1>
        <p className="login-sub">
          Platform-wide settings. Property admins handle their own settings inside the admin panel.
        </p>

        {loading ? (
          <div className="login-sub">Loading…</div>
        ) : (
          <form className="login-form" onSubmit={e => { e.preventDefault(); handleSave(); }}>
            <div className="dev-section">
              <div className="dev-section-title">Tenant logo — dark mode strategy</div>
              <div className="dev-section-desc">
                Applies to tenant logos (e.g. Snoqualmie Inn) that don't ship a dark-mode variant.
                Choose how they render when the page is in dark theme.
              </div>
              <div className="dev-strategy-list">
                {STRATEGIES.map(s => (
                  <label key={s.key} className={`dev-strategy-row ${strategy === s.key ? 'is-active' : ''}`}>
                    <input
                      type="radio"
                      className="hop-radio"
                      name="strategy"
                      checked={strategy === s.key}
                      onChange={() => { setStrategy(s.key); setSaved(false); }}
                    />
                    <div className="dev-strategy-text">
                      <div className="dev-strategy-label">{s.label}</div>
                      <div className="dev-strategy-desc">{s.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {err && <div className="login-error">{err}</div>}

            <button type="submit" className="login-submit" disabled={saving}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
            </button>
          </form>
        )}

        <div className="login-switch">
          <button type="button" className="dev-signout" onClick={handleSignOut}>Sign out of Dev →</button>
        </div>

        <div className="login-attribution">
          <HotelOpsLogo size="sm" />
        </div>
      </div>
    </div>
  );
};

export default DevPanel;
