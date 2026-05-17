import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { resolveTenant, TENANT } from '../../config/tenant';
import HotelOpsLogo from '../../components/shared/HotelOpsLogo';
import { TransitionLink } from './TransitionLink';
import './Login.css';
import '../../components/shared/HotelOpsLogo.css';

const AdminLogin = () => {
  const { loginAdmin } = useAuth();
  const nav = useNavigate();
  // Sprint 9: same /:tenant slug treatment as StaffLogin.
  const { tenant: tenantSlug } = useParams();
  const tenant = resolveTenant(tenantSlug) || TENANT;

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
        {/* Sprint 9.2: tenant logo + name as primary brand (same as
            staff login). HotelOps wordmark moved to the small
            attribution at the bottom of the card. */}
        <div className="login-tenant-brand">
          {tenant.logoUrl && (
            <span className="login-tenant-logo-wrap">
              <img src={tenant.logoUrl} alt="" className="login-tenant-logo" />
            </span>
          )}
          <span className="login-tenant-name">{tenant.name}</span>
        </div>

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
          <TransitionLink to={tenantSlug ? `/${tenantSlug}/login/staff` : '/login/staff'}>
            Staff sign-in →
          </TransitionLink>
        </div>

        <div className="login-attribution">
          <HotelOpsLogo size="sm" wordmark />
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
