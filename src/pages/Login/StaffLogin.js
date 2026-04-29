import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth';
import { TENANT } from '../../config/tenant';
import './Login.css';

// Compact numeric keypad — staff sign-in is digits only (phone + optional PIN),
// so a keypad is faster than the system keyboard. Falls back to system input
// if the user types directly.

const KeypadButtons = ({ onKey }) => (
  <div className="login-keypad">
    {['1','2','3','4','5','6','7','8','9'].map(n => (
      <button key={n} type="button" className="lk-btn" onClick={() => onKey(n)}>
        {n}
      </button>
    ))}
    <button type="button" className="lk-btn lk-aux" onClick={() => onKey('clear')}>Clear</button>
    <button type="button" className="lk-btn"        onClick={() => onKey('0')}>0</button>
    <button type="button" className="lk-btn lk-aux" onClick={() => onKey('back')}>⌫</button>
  </div>
);

const StaffLogin = () => {
  const { loginStaff } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [phone,        setPhone]    = useState('');
  const [pin,          setPin]      = useState('');
  const [needsPin,     setNeedsPin] = useState(false);
  const [activeField,  setActive]   = useState('phone');
  const [err,          setErr]      = useState('');
  const [loading,      setLoading]  = useState(false);

  // Auto-advance phone → pin once phone is full and PIN is required.
  useEffect(() => {
    if (phone.length === 10 && needsPin && activeField === 'phone') {
      setActive('pin');
    }
  }, [phone, needsPin, activeField]);

  const onKey = (val) => {
    const target = activeField;
    const max    = target === 'pin' ? 4 : 10;
    const setter = target === 'pin' ? setPin : setPhone;

    if (val === 'clear') return setter('');
    if (val === 'back')  return setter(p => p.slice(0, -1));
    setter(p => p.length < max ? p + val : p);
  };

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
    if (res.pin_required) {
      setNeedsPin(true);
      setActive('pin');
    }
    setErr(res.message || 'Sign-in failed');
  };

  const canSubmit = phone.length === 10 && (!needsPin || pin.length === 4);

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
          <div className={`login-field ${activeField === 'phone' ? 'is-active' : ''}`}>
            <label htmlFor="phone">Phone number</label>
            <input
              id="phone"
              className="is-keypad"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              onFocus={() => setActive('phone')}
              placeholder="• • • • • • • • • •"
              autoFocus
            />
          </div>

          {needsPin && (
            <div className={`login-field ${activeField === 'pin' ? 'is-active' : ''}`}>
              <label htmlFor="pin">PIN</label>
              <input
                id="pin"
                className="is-keypad"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onFocus={() => setActive('pin')}
                placeholder="• • • •"
              />
            </div>
          )}

          {err && <div className="login-error">{err}</div>}

          <KeypadButtons onKey={onKey} />

          <button type="submit" className="login-submit" disabled={loading || !canSubmit}>
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
