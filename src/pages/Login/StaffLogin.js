import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth';
import { TENANT } from '../../config/tenant';
import { TransitionLink } from './TransitionLink';
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

const KeypadNumbers = ({ onKey, onSwitch, hidden }) => (
  <div className={`login-keypad ${hidden ? 'is-hidden' : ''}`} aria-hidden={hidden || undefined}>
    {['1','2','3','4','5','6','7','8','9'].map(n => (
      <button key={n} type="button" className="lk-btn" tabIndex={hidden ? -1 : 0} onClick={() => onKey(n)}>
        {n}
      </button>
    ))}
    <button type="button" className="lk-btn lk-aux" tabIndex={hidden ? -1 : 0} onClick={() => onKey('clear')}>Clear</button>
    <button type="button" className="lk-btn"        tabIndex={hidden ? -1 : 0} onClick={() => onKey('0')}>0</button>
    <button type="button" className="lk-btn lk-aux" tabIndex={hidden ? -1 : 0} onClick={() => onKey('back')}>⌫</button>
    {onSwitch && (
      <button type="button" className="lk-btn lk-aux lk-kb-switch" tabIndex={hidden ? -1 : 0} onClick={onSwitch}>
        ABC
      </button>
    )}
  </div>
);

const KeyboardLetters = ({ onKey, caps, onCaps, onSwitch, hidden }) => {
  const xform = (l) => caps ? l.toUpperCase() : l;
  const tabIdx = hidden ? -1 : 0;
  const renderLetter = (l) => (
    <button key={l} type="button" className="lk-btn lk-letter" tabIndex={tabIdx} onClick={() => onKey(xform(l))}>
      {xform(l)}
    </button>
  );
  return (
    <div className={`login-kb-letters ${hidden ? 'is-hidden' : ''}`} aria-hidden={hidden || undefined}>
      <div className="login-kb-row login-kb-row-1">{ROW_1.map(renderLetter)}</div>
      <div className="login-kb-row login-kb-row-2">{ROW_2.map(renderLetter)}</div>
      <div className="login-kb-row login-kb-row-3">
        <button
          type="button"
          className={`lk-btn lk-aux lk-mod ${caps ? 'is-active' : ''}`}
          tabIndex={tabIdx}
          onClick={onCaps}
          aria-pressed={caps}
          aria-label="Caps lock"
        >⇧</button>
        {ROW_3.map(renderLetter)}
        <button
          type="button"
          className="lk-btn lk-aux lk-mod"
          tabIndex={tabIdx}
          onClick={() => onKey('back')}
          aria-label="Backspace"
        >⌫</button>
      </div>
      {/* Bottom row: Clear, 123 switcher, then the three legal punctuation
          chars usernames may contain (._- per the regex). Equal widths so
          the row reads as a balanced control band rather than one floater
          in the corner. */}
      <div className="login-kb-row login-kb-row-4">
        <button type="button" className="lk-btn lk-aux"            tabIndex={tabIdx} onClick={() => onKey('clear')}>Clear</button>
        <button type="button" className="lk-btn lk-aux lk-kb-switch" tabIndex={tabIdx} onClick={onSwitch}>123</button>
        <button type="button" className="lk-btn lk-sym"            tabIndex={tabIdx} onClick={() => onKey('_')}>_</button>
        <button type="button" className="lk-btn lk-sym"            tabIndex={tabIdx} onClick={() => onKey('-')}>-</button>
        <button type="button" className="lk-btn lk-sym"            tabIndex={tabIdx} onClick={() => onKey('.')}>.</button>
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
  // Sprint 8.7 / 8.7.1: when admin enables `block_system_keyboard`, the
  // inputs become non-interactive (pointer-events:none, tabIndex=-1) and
  // the wrapping `.login-field` captures the tap to set activeField
  // instead. The input never receives focus, so iOS Safari / Android
  // Chrome don't get the chance to pop the system keyboard.
  // (8.7's readOnly + inputMode="none" wasn't enough — both browsers
  // still focused the input on tap and showed their default keyboard.)
  const [lockKbd,      setLockKbd]      = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const idInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/public-config')
      .then(r => r.json())
      .then(data => {
        if (data?.success) setLockKbd(!!data.config?.block_system_keyboard);
      })
      .catch(() => { /* fall through to default (system keyboard allowed) */ })
      .finally(() => setConfigLoaded(true));
  }, []);

  // Programmatic auto-focus: only fires when config is loaded AND lock is
  // off. With autoFocus on the JSX, the input would focus on first render
  // (before the fetch completes) and the system keyboard could appear
  // before lockKbd flips true.
  useEffect(() => {
    if (configLoaded && !lockKbd && idInputRef.current) {
      idInputRef.current.focus();
    }
  }, [configLoaded, lockKbd]);

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
          <div
            className={`login-field ${activeField === 'id' ? 'is-active' : ''} ${lockKbd ? 'is-kbd-locked' : ''}`}
            onClick={lockKbd ? () => setActive('id') : undefined}
          >
            <label htmlFor="identifier">Phone, employee ID, or username</label>
            <input
              id="identifier"
              ref={idInputRef}
              className={`is-keypad ${/^[0-9]+$/.test(identifier) ? 'is-numeric' : ''}`}
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
              readOnly={lockKbd}
              inputMode={lockKbd ? 'none' : 'text'}
              tabIndex={lockKbd ? -1 : 0}
              aria-readonly={lockKbd || undefined}
            />
          </div>

          {needsPin && (
            <div
              className={`login-field ${activeField === 'pin' ? 'is-active' : ''} ${lockKbd ? 'is-kbd-locked' : ''}`}
              onClick={lockKbd ? () => setActive('pin') : undefined}
            >
              <label htmlFor="pin">PIN</label>
              <input
                id="pin"
                className="is-keypad is-numeric"
                type="password"
                inputMode={lockKbd ? 'none' : 'numeric'}
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onFocus={() => setActive('pin')}
                placeholder="• • • •"
                readOnly={lockKbd}
                tabIndex={lockKbd ? -1 : 0}
                aria-readonly={lockKbd || undefined}
              />
            </div>
          )}

          {err && <div className="login-error">{err}</div>}

          {/* Both keyboards rendered always; the inactive one is hidden via
              visibility + pointer-events, and the wrapper sizes to whichever
              is taller. This locks the form height so switching modes
              doesn't shift the page layout. The numeric keypad happens to be
              the taller of the two (5 rows vs 4), so the letters keyboard
              leaves a small bottom gap — accepted as the better tradeoff. */}
          <div className="login-kb-area">
            <KeypadNumbers
              onKey={onKey}
              onSwitch={activeField === 'id' ? () => setKbMode('letters') : null}
              hidden={showLetters}
            />
            <KeyboardLetters
              onKey={onKey}
              caps={caps}
              onCaps={() => setCaps(c => !c)}
              onSwitch={() => setKbMode('numbers')}
              hidden={!showLetters}
            />
          </div>

          <button type="submit" className="login-submit" disabled={loading || !canSubmit}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-switch">
          <TransitionLink to="/login/admin">Manager sign-in →</TransitionLink>
        </div>
      </div>
    </div>
  );
};

export default StaffLogin;
