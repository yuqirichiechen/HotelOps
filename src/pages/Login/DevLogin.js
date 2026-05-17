import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HotelOpsLogo from '../../components/shared/HotelOpsLogo';
import { TransitionLink } from './TransitionLink';
import './Login.css';
import '../../components/shared/HotelOpsLogo.css';

// Sprint 9.2: minimal dev sign-in. Hardcoded dev/dev credentials —
// intentionally not server-backed for this sprint. The dev panel lives
// behind this gate and only exposes platform-wide settings the
// admin-of-a-property shouldn't be flipping (currently just the
// tenant logo dark-mode strategy). Future sprint can move to a real
// server-backed dev role.
//
// localStorage key 'hotelops-dev-auth' is the gate; cleared on logout.

const DEV_AUTH_KEY = 'hotelops-dev-auth';

export const isDevAuthed = () =>
  typeof window !== 'undefined' && localStorage.getItem(DEV_AUTH_KEY) === 'true';

export const clearDevAuth = () => {
  if (typeof window !== 'undefined') localStorage.removeItem(DEV_AUTH_KEY);
};

const DevLogin = () => {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr]           = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (username === 'dev' && password === 'dev') {
      localStorage.setItem(DEV_AUTH_KEY, 'true');
      nav('/dev', { replace: true });
      return;
    }
    setErr('Invalid credentials.');
  };

  return (
    <div className="login-page login-layout-hardcode">
      <div className="login-card">
        <div className="login-tenant-brand">
          <HotelOpsLogo size="lg" wordmark />
        </div>

        <h1 className="login-title">Dev sign-in</h1>
        <p className="login-sub">
          Platform maintenance only. Property-level settings live in the
          admin panel.
        </p>

        <form onSubmit={submit} className="login-form">
          <div className="login-field">
            <label htmlFor="dev-username">Username</label>
            <input
              id="dev-username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className="login-field">
            <label htmlFor="dev-password">Password</label>
            <input
              id="dev-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {err && <div className="login-error">{err}</div>}
          <button type="submit" className="login-submit" disabled={!username || !password}>
            Sign in
          </button>
        </form>

        <div className="login-switch">
          <TransitionLink to="/login/staff">Back to property select →</TransitionLink>
        </div>
      </div>
    </div>
  );
};

export default DevLogin;
