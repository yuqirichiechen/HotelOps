import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HotelOpsLogo from '../../components/shared/HotelOpsLogo';
import { TransitionLink } from './TransitionLink';
import { useAuth } from '../../auth';
import './Login.css';
import '../../components/shared/HotelOpsLogo.css';

// Sprint 22.4: server-verified dev sign-in. The old client-side dev/dev gate is gone — the server checks DEV_USERNAME / DEV_PASSWORD_HASH
// (Koyeb environment), rate-limits failures, and issues a `dev` role token. With no hash configured, sign-in is disabled (no default password).

const DevLogin = () => {
  const nav = useNavigate();
  const { loginDev } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr]           = useState('');
  const [busy, setBusy]         = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await loginDev(username.trim(), password);
    setBusy(false);
    if (r.success) { nav('/dev', { replace: true }); return; }
    setErr(r.status === 503 ? 'Dev sign-in is not set up on the server yet (DEV_PASSWORD_HASH).'
      : r.status === 429 ? 'Too many attempts. Wait a few minutes and try again.'
      : 'Invalid credentials.');
  };

  return (
    <div className="login-page login-layout-hardcode">
      <div className="login-card">
        <div className="login-tenant-brand">
          <HotelOpsLogo size="lg" />
        </div>

        <h1 className="login-title">Dev sign-in</h1>
        <p className="login-sub">
          Platform maintenance only: sync, logs and settings. Managers use their own sign-in.
        </p>

        <form onSubmit={submit} className="login-form">
          <div className="login-field">
            <label htmlFor="dev-username">Username</label>
            <input id="dev-username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </div>
          <div className="login-field">
            <label htmlFor="dev-password">Password</label>
            <input id="dev-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          {err && <div className="login-error" role="alert">{err}</div>}
          <button type="submit" className="login-submit" disabled={!username || !password || busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-switch">
          <TransitionLink to="/">Back to property select →</TransitionLink>
        </div>
      </div>
    </div>
  );
};

export default DevLogin;
