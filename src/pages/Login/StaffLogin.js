import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth';
import { TENANT } from '../../config/tenant';
import './Login.css';

// Sprint 7.1: built-in QWERTY keyboard alongside the existing numeric
// keypad. Tablet/kiosk deployments can't always rely on the OS keyboard
// being available or appropriate, so we render our own. The two keyboards
// swap via the bottom 123 / ABC button — same pattern as the iOS keyboard.
//
// PIN field always uses the numeric keypad regardless of mode, since the
// PIN is a 4-digit code.
//
// Caps is purely an HCI nicety — the server compares usernames
// case-insensitively (LOWER(username) = LOWER($1)), so caps state doesn't
// affect login outcome. We still render it so the keyboard "feels right."

// Mirrors the server's classifier (server.js: classifyIdentifier). Used here
// to gate the submit button — final auth happens server-side.
const PHONE_RE    = /^[0-9]{10}$/;
const CODE_RE     = /^[0-9]{4,6}$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,16}$/;
const HAS_LETTER  = /[A-Za-z]/;
const isValidIdentifier = (v) => {
  if (PHONE_RE.test(v) || CODE_RE.test(v)) return true;
  if (USERNAME_RE.test(v) && HAS_LETTER.test(v)) return true;
  return false;
};

const ROW_1 = ['q','w','e','r','t','y','u','i','o','p'];
const ROW_2 = ['a','s','d','f','g','h','j','k','l'];
const ROW_3 = ['z','x','c','v','b','n','m'];

const KeypadNumbers = ({ onKey, onSwitch }) => (
  <div className="login-keypad">
    {['1','2','3','4','5','6','7','8','9'].map(n => (
      <button key={n} type="button" className="lk-btn" onClick={() => onKey(n)}>
        {n}
      </button>
    ))}
    <button type="button" className="lk-btn lk-aux" onClick={() => onKey('clear')}>Clear</button>
    <button type="button" className="lk-btn"        onClick={() => onKey('0')}>0</button>
    <button type="button" className="lk-btn lk-aux" onClick={() => onKey('back')}>⌫</button>
    {onSwitch && (
      <button type="button" className="lk-btn lk-aux lk-kb-switch" onClick={onSwitch}>
        ABC
      </button>
    )}
  </div>
);

const KeyboardLetters = ({ onKey, caps, onCaps, onSwitch }) => {
  const xform = (l) => caps ? l.toUpperCase() : l;
  const renderLetter = (l) => (
    <button key={l} type="button" className="lk-btn lk-letter" onClick={() => onKey(xform(l))}>
      {xform(l)}
    </button>
  );
  return (
    <div className="login-kb-letters">
      <div className="login-kb-row login-kb-row-1">{ROW_1.map(renderLetter)}</div>
      <div className="login-kb-row login-kb-row-2">{ROW_2.map(renderLetter)}</div>
      <div className="login-kb-row login-kb-row-3">
        <button
          type="button"
          className={`lk-btn lk-aux lk-mod ${caps ? 'is-active' : ''}`}
          onClick={onCaps}
          aria-pressed={caps}
          aria-label="Caps lock"
        >⇧</button>
        {ROW_3.map(renderLetter)}
        <button
          type="button"
          className="lk-btn lk-aux lk-mod"
          onClick={() => onKey('back')}
          aria-label="Backspace"
        >⌫</button>
      </div>
      {/* Bottom row: Clear, 123 switcher, then the three legal punctuation
          chars usernames may contain (._- per the regex). Equal widths so
          the row reads as a balanced control band rather than one floater
          in the corner. */}
      <div className="login-kb-row login-kb-row-4">
        <button type="button" className="lk-btn lk-aux"            onClick={() => onKey('clear')}>Clear</button>
        <button type="button" className="lk-btn lk-aux lk-kb-switch" onClick={onSwitch}>123</button>
        <button type="button" className="lk-btn lk-sym"            onClick={() => onKey('_')}>_</button>
        <button type="button" className="lk-btn lk-sym"            onClick={() => onKey('-')}>-</button>
        <button type="button" className="lk-btn lk-sym"            onClick={() => onKey('.')}>.</button>
      </div>
    </div>
  );
};

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
  const [kbMode,      setKbMode]      = useState('numbers'); // 'numbers' | 'letters'
  const [caps,        setCaps]        = useState(false);

  // Auto-advance to PIN once a valid identifier is entered and the server
  // already told us PIN is required.
  useEffect(() => {
    if (isValidIdentifier(identifier) && needsPin && activeField === 'id') {
      setActive('pin');
    }
  }, [identifier, needsPin, activeField]);

  // Append a key to whichever field is active. Numbers keypad emits digits
  // and the special tokens 'clear' / 'back'. Letters keyboard emits a single
  // letter (already cased per `caps`) or 'back'.
  const onKey = (val) => {
    if (activeField === 'pin') {
      if (val === 'clear') return setPin('');
      if (val === 'back')  return setPin(p => p.slice(0, -1));
      // PIN ignores letters even if the letters keyboard is somehow active.
      if (!/^[0-9]$/.test(val)) return;
      return setPin(p => p.length < 4 ? p + val : p);
    }
    if (val === 'clear') return setIdentifier('');
    if (val === 'back')  return setIdentifier(p => p.slice(0, -1));
    setIdentifier(p => p.length < 16 ? p + val : p);
  };

  const onIdentifierChange = (e) => {
    // Hand-typing via system keyboard still works; filter to the same
    // chars the on-screen keyboard can produce.
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

  // PIN field always uses the numeric keypad. For the identifier field, the
  // user toggles between letters and numbers via the bottom switcher.
  const showLetters = activeField === 'id' && kbMode === 'letters';

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

          {showLetters ? (
            <KeyboardLetters
              onKey={onKey}
              caps={caps}
              onCaps={() => setCaps(c => !c)}
              onSwitch={() => setKbMode('numbers')}
            />
          ) : (
            <KeypadNumbers
              onKey={onKey}
              onSwitch={activeField === 'id' ? () => setKbMode('letters') : null}
            />
          )}

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
