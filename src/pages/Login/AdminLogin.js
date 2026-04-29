import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { TENANT } from '../../config/tenant';
import './Login.css';

const AdminLogin = () => {
  const { loginAdmin } = useAuth();
  const nav = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr]           = useState('');
  const [loading, setLoading]   = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const res = await loginAdmin(username, password);
    setLoading(false);

    if (res.success) {
      nav('/admin', { replace: true });
      return;
    }
    setErr(res.message || 'Sign-in failed');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">⚙️</span>
          <span className="login-brand-name">HotelOps</span>
        </div>
        <div className="login-tenant">{TENANT.name}</div>

        <h1 className="login-title">Manager sign-in</h1>
        <p className="login-sub">
          Admin access for staff management, scheduling, and operations.
        </p>

        <form onSubmit={submit} className="login-form">
          <div className="login-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {err && <div className="login-error">{err}</div>}

          <button type="submit" className="login-submit" disabled={loading || !username || !password}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-switch">
          <Link to="/login/staff">Staff sign-in →</Link>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
