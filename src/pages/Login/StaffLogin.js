import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth';
import { TENANT } from '../../config/tenant';
import './Login.css';

const StaffLogin = () => {
  const { loginStaff } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [phone, setPhone]         = useState('');
  const [pin, setPin]             = useState('');
  const [needsPin, setNeedsPin]   = useState(false);
  const [err, setErr]             = useState('');
  const [loading, setLoading]     = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const res = await loginStaff(phone, pin);
    setLoading(false);

    if (res.success) {
      const next = res.user.pin_must_set
        ? '/set-pin'
        : (loc.state?.from?.pathname || '/');
      nav(next, { replace: true });
      return;
    }
    if (res.pin_required) setNeedsPin(true);
    setErr(res.message || 'Sign-in failed');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">🏨</span>
          <span className="login-brand-name">HotelOps</span>
        </div>
        <div className="login-tenant">{TENANT.name}</div>

        <h1 className="login-title">Welcome back</h1>
        <p className="login-sub">
          Sign in with your phone number to start your shift.
        </p>

        <form onSubmit={submit} className="login-form">
          <div className="login-field">
            <label htmlFor="phone">Phone number</label>
            <input
              id="phone"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10 digits"
              autoFocus
              required
            />
          </div>

          {needsPin && (
            <div className="login-field">
              <label htmlFor="pin">PIN</label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4 digits"
                autoFocus
                required
              />
            </div>
          )}

          {err && <div className="login-error">{err}</div>}

          <button type="submit" className="login-submit" disabled={loading || phone.length !== 10}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-switch">
          <Link to="/login/admin">Manager sign-in →</Link>
        </div>
      </div>
    </div>
  );
};

export default StaffLogin;
