import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { resolveTenant, TENANT } from '../../config/tenant';
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
// Sprint 9: birthday (8 digits) joins phone (10), employee_code (4-6),
// username (has letter). Submit-validity is also gated by which methods
// the admin has enabled for this tenant — see isValidIdentifier(v, enabled).
const PHONE_RE    = /^[0-9]{10}$/;
const CODE_RE     = /^[0-9]{4,6}$/;
const BDAY_RE     = /^[0-9]{8}$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,16}$/;
const HAS_LETTER  = /[A-Za-z]/;
const isValidIdentifier = (v, enabled) => {
  if (enabled.has('phone')         && PHONE_RE.test(v))    return true;
  if (enabled.has('employee_code') && CODE_RE.test(v))     return true;
  if (enabled.has('birthday')      && BDAY_RE.test(v))     return true;
  if (enabled.has('username')      && USERNAME_RE.test(v) && HAS_LETTER.test(v)) return true;
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
  // Sprint 9: optional /:tenant prefix on the URL. Look up the slug in the
  // tenant registry — unknown slugs fall through to the default tenant
  // rather than 404'ing, so a typo in the URL still gives the user a way
  // in. (We could 404 instead, but on a kiosk that's strictly worse.)
  const { tenant: tenantSlug } = useParams();
  const tenant = resolveTenant(tenantSlug) || TENANT;

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
  // Sprint 9: which login-method types this tenant accepts. Drives keypad
  // adaptation (no ABC if username is off) and isValidIdentifier gating.
  const [enabledMethods, setEnabledMethods] = useState(() => new Set(['phone', 'username', 'employee_code', 'birthday']));
  const [configLoaded, setConfigLoaded] = useState(false);
  const idInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/public-config')
      .then(r => r.json())
      .then(data => {
        if (data?.success) {
          setLockKbd(!!data.config?.block_system_keyboard);
          const list = data.config?.enabled_login_methods;
          if (Array.isArray(list) && list.length > 0) setEnabledMethods(new Set(list));
        }
      })
      .catch(() => { /* fall through to default (system keyboard allowed) */ })
      .finally(() => setConfigLoaded(true));
  }, []);

  // Whether the on-screen keyboard should offer the letters mode at all.
  // If the tenant has disabled username login, there's no point in
  // showing ABC — there's nothing letters do.
  const lettersAvailable = enabledMethods.has('username');

  // Sprint 9: dynamic label + placeholder. Compose them from the enabled
  // methods so disabled options never appear in user-facing copy.
  const methodLabels = {
    phone:         { full: 'phone number',  short: '10-digit phone' },
    employee_code: { full: 'employee ID',   short: '4–6 digit ID' },
    birthday:      { full: 'birthday',      short: 'birthday MMDDYYYY' },
    username:      { full: 'username',      short: 'username' },
  };
  const orderedMethods = ['phone', 'employee_code', 'birthday', 'username']
    .filter(m => enabledMethods.has(m));
  const fieldLabel = orderedMethods.map(m => methodLabels[m].full).join(' / ');
  const fieldPlaceholder = orderedMethods.map(m => methodLabels[m].short).join(' · ');
  const subSentence = (() => {
    if (orderedMethods.length === 0) return 'Sign in to start your shift.';
    if (orderedMethods.length === 1) return `Sign in with your ${methodLabels[orderedMethods[0]].full}.`;
    const items = orderedMethods.map(m => methodLabels[m].full);
    const last = items.pop();
    return `Sign in with your ${items.join(', ')}, or ${last}.`;
  })();

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
    if (isValidIdentifier(identifier, enabledMethods) && needsPin && activeField === 'id') {
      setActive('pin');
    }
  }, [identifier, needsPin, activeField, enabledMethods]);

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

  const canSubmit = isValidIdentifier(identifier, enabledMethods) && (!needsPin || pin.length === 4);

  // PIN field always uses the numeric keypad. For the identifier field, the
  // user toggles between letters and numbers via the bottom switcher.
  // Sprint 9: only show letters if username login is enabled. If it isn't,
  // there's no value letters can express — drop ABC entirely.
  const showLetters = lettersAvailable && activeField === 'id' && kbMode === 'letters';

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">🏨</span>
          <span className="login-brand-name">HotelOps</span>
        </div>
        <div className="login-tenant">{tenant.name}</div>

        <h1 className="login-title">Welcome back</h1>
        <p className="login-sub">{subSentence}</p>

        <form onSubmit={submit} className="login-form">
          <div
            className={`login-field ${activeField === 'id' ? 'is-active' : ''} ${lockKbd ? 'is-kbd-locked' : ''}`}
            onClick={lockKbd ? () => setActive('id') : undefined}
          >
            <label htmlFor="identifier">{fieldLabel.charAt(0).toUpperCase() + fieldLabel.slice(1)}</label>
            {/* Sprint 8.7.2: when locked, swap the <input> entirely for a
                display-only <div>. No input element ⇒ no password manager,
                no autofill prompt, no system keyboard. The on-screen
                keypad still drives state via setIdentifier. */}
            {lockKbd ? (
              <div
                className={`is-keypad login-display ${/^[0-9]+$/.test(identifier) ? 'is-numeric' : ''}`}
                role="textbox"
                aria-readonly="true"
                aria-label={fieldLabel}
              >
                {identifier
                  ? identifier
                  : <span className="login-display-placeholder">{fieldPlaceholder}</span>}
              </div>
            ) : (
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
                placeholder={fieldPlaceholder}
              />
            )}
          </div>

          {needsPin && (
            <div
              className={`login-field ${activeField === 'pin' ? 'is-active' : ''} ${lockKbd ? 'is-kbd-locked' : ''}`}
              onClick={lockKbd ? () => setActive('pin') : undefined}
            >
              <label htmlFor="pin">PIN</label>
              {/* Sprint 8.7.2: same div-swap for PIN. Mask the value as
                  dots manually since we no longer have type=password. */}
              {lockKbd ? (
                <div
                  className="is-keypad is-numeric login-display"
                  role="textbox"
                  aria-readonly="true"
                  aria-label="PIN"
                >
                  {pin.length > 0
                    ? '•'.repeat(pin.length)
                    : <span className="login-display-placeholder">• • • •</span>}
                </div>
              ) : (
                <input
                  id="pin"
                  className="is-keypad is-numeric"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onFocus={() => setActive('pin')}
                  placeholder="• • • •"
                />
              )}
            </div>
          )}

          {err && <div className="login-error">{err}</div>}

          {/* Both keyboards rendered always; the inactive one is hidden via
              visibility + pointer-events, and the wrapper sizes to whichever
              is taller. This locks the form height so switching modes
              doesn't shift the page layout. The numeric keypad happens to be
              the taller of the two (5 rows vs 4), so the letters keyboard
              leaves a small bottom gap — accepted as the better tradeoff. */}
          {/* Sprint 9: letters keyboard only renders when the tenant has
              the username login method enabled. If not, the ABC/123 switcher
              on the numeric keypad is also hidden — no value letters can
              express here. The locked-height grid auto-sizes to the only
              remaining child (numbers keypad). */}
          <div className={`login-kb-area ${!lettersAvailable ? 'is-numbers-only' : ''}`}>
            <KeypadNumbers
              onKey={onKey}
              onSwitch={lettersAvailable && activeField === 'id' ? () => setKbMode('letters') : null}
              hidden={showLetters}
            />
            {lettersAvailable && (
              <KeyboardLetters
                onKey={onKey}
                caps={caps}
                onCaps={() => setCaps(c => !c)}
                onSwitch={() => setKbMode('numbers')}
                hidden={!showLetters}
              />
            )}
          </div>

          <button type="submit" className="login-submit" disabled={loading || !canSubmit}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-switch">
          <TransitionLink to={tenantSlug ? `/${tenantSlug}/login/admin` : '/login/admin'}>
            Manager sign-in →
          </TransitionLink>
        </div>
      </div>
    </div>
  );
};

export default StaffLogin;
