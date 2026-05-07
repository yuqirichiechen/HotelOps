import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth';
import { TENANT } from '../../config/tenant';
import './Login.css';

// Sprint 7: staff can sign in with phone, employee ID, or username (auto-detected
// server-side). The on-screen keypad is still useful for phone / employee-ID
// users; we hide it once the input contains a non-digit, since at that point
// they're typing a username via the system keyboard. PIN remains 4 digits and
// always uses the keypad.

// Mirrors the server's classifier (server.js: classifyIdentifier). Used here
// purely to decide whether the input is a *valid-looking* identifier so we can
// enable the submit button — final auth happens server-side.
const PHONE_RE    = /^[0-9]{10}$/;
const CODE_RE     = /^[0-9]{4,6}$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,16}$/;
const HAS_LETTER  = /[A-Za-z]/;
const isValidIdentifier = (v) => {
  if (PHONE_RE.test(v) || CODE_RE.test(v)) return true;
  if (USERNAME_RE.test(v) && HAS_LETTER.test(v)) return true;
  return false;
};

const isAllDigits = (v) => v === '' || /^[0-9]+$/.test(v);

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

  const [identifier,  setIdentifier]  = useState('');
  const [pin,         setPin]         = useState('');
  const [needsPin,    setNeedsPin]    = useState(false);
  const [activeField, setActive]      = useState('id');
  const [err,         setErr]         = useState('');
  const [loading,     setLoading]     = useState(false);

  // Auto-advance to PIN once a valid identifier is entered and the server
  // already told us PIN is required.
  useEffect(() => {
    if (isValidIdentifier(identifier) && needsPin && activeField === 'id') {
      setActive('pin');
    }
  }, [identifier, needsPin, activeField]);

  // Keypad drives whichever field is active. For the identifier field we
  // append digits as-is (covers phone + employee ID flows). The PIN field
  // is digits-only.
  const onKey = (val) => {
    if (activeField === 'pin') {
      if (val === 'clear') return setPin('');
      if (val === 'back')  return setPin(p => p.slice(0, -1));
      return setPin(p => p.length < 4 ? p + val : p);
    }
    if (val === 'clear') return setIdentifier('');
    if (val === 'back')  return setIdentifier(p => p.slice(0, -1));
    setIdentifier(p => p.length < 16 ? p + val : p);
  };

  const onIdentifierChange = (e) => {
    // Allow letters/digits/._- up to 16 chars. Server still validates;
    // this is just a typing-time filter that drops obviously-invalid chars
    // (spaces, punctuation other than . _ -) so the user can't enter them
    // and then get a server error.
    const next = e.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 16);
    setIdentifier(next);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const res = await loginStaff(identifier, pin);
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

  const canSubmit = isValidIdentifier(identifier) && (!needsPin || pin.length === 4);

  // Hide the on-screen keypad once the user starts typing letters — at that
  // point they're entering a username via the system keyboard and the keypad
  // is just visual noise. Keep it for the PIN field unconditionally.
  const showKeypad = activeField === 'pin' || isAllDigits(identifier);

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
          Sign in with your phone number, employee ID, or username.
        </p>

        <form onSubmit={submit} className="login-form">
          <div className={`login-field ${activeField === 'id' ? 'is-active' : ''}`}>
            <label htmlFor="identifier">Phone, employee ID, or username</label>
            <input
              id="identifier"
              className="is-keypad"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={16}
              value={identifier}
              onChange={onIdentifierChange}
              onFocus={() => setActive('id')}
              placeholder="10-digit phone · 4–6 digit ID · username"
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

          {showKeypad && <KeypadButtons onKey={onKey} />}

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
