import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth, setStaffEntry } from '../../auth';
import { resolveTenant, TENANT } from '../../config/tenant';
import { useT } from '../../i18n';
import LangCycleHeadline from '../../components/shared/LangCycleHeadline';
import AuthFrame, { PropertyBar, usePTClock } from './InntrioFrame';
import Icon from './InntrioIcons';

// Sprint 11.3: small media-query hook used twice below — once for
// touch detection (governs whether to lock the numeric input against
// the OS keyboard), once for the desktop two-column layout breakpoint
// (governs whether the keypad renders inside the form or in a sibling
// right-hand column). Initial value is read synchronously so first
// paint matches the viewport.
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e) => setMatches(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, [query]);
  return matches;
};

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

// Sprint 27.1: Inntrio keypad — 1-9, Clear, 0, ⌫ (the design's 3×4 pad). The ABC / 123 switch sits under it when usernames are allowed.
const KeypadNumbers = ({ onKey }) => (
  <div className="in-keypad-grid">
    {['1','2','3','4','5','6','7','8','9'].map(n => (
      <button key={n} type="button" className="in-key" aria-label={n} onClick={() => onKey(n)}>{n}</button>
    ))}
    <button type="button" className="in-key special" onClick={() => onKey('clear')}>Clear</button>
    <button type="button" className="in-key" aria-label="0" onClick={() => onKey('0')}>0</button>
    <button type="button" className="in-key special" aria-label="Backspace" onClick={() => onKey('back')}><Icon name="backspace" size={24} /></button>
  </div>
);

const KeyboardLetters = ({ onKey, caps, onCaps }) => {
  const xform = (l) => (caps ? l.toUpperCase() : l);
  const letter = (l) => <button key={l} type="button" className="in-key" onClick={() => onKey(xform(l))}>{xform(l)}</button>;
  return (
    <div className="in-letters">
      <div className="in-letters-row in-letters-row-1">{ROW_1.map(letter)}</div>
      <div className="in-letters-row in-letters-row-2">{ROW_2.map(letter)}</div>
      <div className="in-letters-row in-letters-row-3">
        <button type="button" className={`in-key special${caps ? ' is-active' : ''}`} onClick={onCaps} aria-pressed={caps} aria-label="Caps lock">⇧</button>
        {ROW_3.map(letter)}
        <button type="button" className="in-key special" onClick={() => onKey('back')} aria-label="Backspace"><Icon name="backspace" size={20} /></button>
      </div>
      {/* Clear + the three legal punctuation chars usernames may contain (._- per the regex) */}
      <div className="in-letters-row in-letters-row-4">
        <button type="button" className="in-key special" onClick={() => onKey('clear')}>Clear</button>
        {['_', '-', '.'].map(c => <button key={c} type="button" className="in-key" onClick={() => onKey(c)}>{c}</button>)}
      </div>
    </div>
  );
};

// Sprint 24.1: this numpad screen is the CLOCK IN door only (kiosk: clock in / out on a pad, then sign out). Staff who want their
// timesheet / calendar / settings (and the front desk's forecast + housekeeping) use "Staff login" — the PC form, StaffPortalLogin.
const StaffLogin = ({ onBack, onChangeProperty }) => {
  const { loginStaff } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // Sprint 16.2 / 16.5: i18n. Pre-login the language comes from
  // localStorage (set by LanguageSwap) or the browser default;
  // post-login the bridge in App.js swaps to the user's
  // preferred_language.
  const t = useT();
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
  // Sprint 9: which login-method types this tenant accepts. Drives keypad
  // adaptation and isValidIdentifier gating.
  const [enabledMethods, setEnabledMethods] = useState(() => new Set(['phone', 'username', 'employee_code', 'birthday']));
  // Sprint 9.1: replaces Sprint 8.7's block_system_keyboard (which iOS
  // Safari ignored via password autofill — see 8.7.2 log for the saga).
  // When true, the ABC switcher + letters keyboard are hidden on the
  // staff login. Independent toggle from the username login-method
  // setting so admins can still allow username login but force a
  // numeric-only on-screen keypad (relying on the system keyboard for
  // the username input).
  const [hideAbc,        setHideAbc]        = useState(false);
  // Sprint 11.3: touch-only restrictions on the numeric input.
  // `(pointer: coarse) and (hover: none)` is true on phones/tablets
  // and *false* on touch-screen laptops (those still have a mouse,
  // so `hover: hover`). On desktop / laptop we lift the lock so
  // users can just type — the on-screen keypad still works for
  // mouse clicks if they prefer it.
  const isTouchDevice = useMediaQuery('(pointer: coarse) and (hover: none)');
  const lockNumeric = isTouchDevice && kbMode === 'numbers';

  useEffect(() => {
    fetch('/api/public-config')
      .then(r => r.json())
      .then(data => {
        if (data?.success) {
          setHideAbc(!!data.config?.hide_abc_keyboard);
          const list = data.config?.enabled_login_methods;
          if (Array.isArray(list) && list.length > 0) setEnabledMethods(new Set(list));
        }
      })
      .catch(() => { /* fall through to defaults */ });
  }, []);

  // Letters are available iff username login is enabled AND the admin
  // didn't explicitly hide ABC. Disabling username already implies "no
  // letters" since there's nothing for them to type; the explicit toggle
  // covers the case where username stays enabled but the admin wants a
  // cleaner numeric-only on-screen keypad.
  const lettersAvailable = enabledMethods.has('username') && !hideAbc;

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
      // Sprint 9.3.2: persist the tenant slug so post-session
      // navigation (auto-signout from Home, manual sign-out from
      // Settings) can route back to this property's login page
      // instead of the bare /login/staff picker. `tenant.slug` is
      // always present (resolveTenant falls back to the default
      // tenant when the URL slug is missing or unknown). Logout
      // only clears `hotelops-token`, so this value survives across
      // sessions and acts as a "last property used" hint.
      if (tenant?.slug) {
        localStorage.setItem('hotelops-tenant-slug', tenant.slug);
      }
      // Sprint 11.2.1: post-login lands on the per-tenant staff shell.
      // The pre-redirect `from` (set by RequireRole when the user
      // tried to deep-link into a protected URL while unauthed) is
      // still honored — it'll resolve to `/:slug/staff` in the
      // common case, or whatever the user originally typed.
      // Sprint 24: remember which door was used (the post-login redirects read it), and don't let a stale deep link to the OTHER staff
      // shell override the door the person just chose.
      setStaffEntry('clockin');
      const door = `/${tenant.slug}/clockin`;
      const from = loc.state?.from?.pathname;
      const next = res.user.pin_must_set
        ? '/set-pin'
        : (from && !/^\/[^/]+\/(staff|clockin)\/?$/.test(from) ? from : door);
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
  const now = usePTClock();

  return (
    <AuthFrame step="clock">
      <PropertyBar tenant={tenant} onChange={onChangeProperty} />
      <h1 className="in-h1">Clock in / out</h1>
      <p className="in-subtitle">A fast, familiar time clock for your shift.</p>
      <div className="in-gap-md" />
      {/* the whole card is the form (Enter submits); every keypad key is type="button" */}
      <form className="in-surface in-clock-card" onSubmit={submit}>
        <div className="in-clock-detail">
          {/* Sprint 16.6: the headline fade-cycles through the supported languages; tap to lock. */}
          <LangCycleHeadline titleKey="login.title" subtitleKey="login.subtitle" />
          {!t('login.subtitle') && <p className="in-subtitle">{subSentence}</p>}

          <label className="in-field-label" htmlFor="identifier">{fieldLabel}</label>
          {/* Sprint 11.1.3 + 11.3: on a touch device the input is locked (readOnly + inputMode none) so the OS keyboard / autofill bar stays away —
              the on-screen keypad is the only input path. With a physical keyboard `lockNumeric` is false and typing works. */}
          <div className={`in-field ${activeField === 'id' ? 'is-active' : ''}`}>
            <Icon name="user" size={22} />
            <input
              id="identifier"
                            type="text"
              autoComplete={lockNumeric ? 'off' : 'username'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={16}
              value={identifier}
              onChange={onIdentifierChange}
              onFocus={() => setActive('id')}
              placeholder={fieldPlaceholder}
              aria-label={fieldLabel}
              autoFocus
              readOnly={lockNumeric}
              inputMode={lockNumeric ? 'none' : 'text'}
            />
          </div>

          {needsPin && (
            <>
              <label className="in-field-label" htmlFor="pin">PIN</label>
              <div className={`in-field ${activeField === 'pin' ? 'is-active' : ''}`}>
                <Icon name="lock" size={22} />
                <input
                  id="pin"
                                    type="password"
                  inputMode={isTouchDevice ? 'none' : 'numeric'}
                  maxLength={4}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onFocus={() => setActive('pin')}
                  placeholder="• • • •"
                  aria-label="PIN"
                  readOnly={isTouchDevice}
                  autoComplete="off"
                />
              </div>
            </>
          )}

          {err && <div className="in-error" role="alert">{err}</div>}

          <div className="in-clock-meta">
            <Icon name="clock" size={16} /> <span>{now}</span><span aria-hidden="true">•</span><Icon name="hotel" size={16} /> {tenant.name}
          </div>
        </div>

        <div className="in-keypad-panel">
          {showLetters ? <KeyboardLetters onKey={onKey} caps={caps} onCaps={() => setCaps(c => !c)} /> : <KeypadNumbers onKey={onKey} />}
          {lettersAvailable && activeField === 'id' && (
            <button type="button" className="in-key special in-kb-switch" onClick={() => setKbMode(showLetters ? 'numbers' : 'letters')}>{showLetters ? '123' : 'ABC'}</button>
          )}
        </div>

        <div className="in-action-row">
          <button type="submit" className="in-primary" disabled={loading || !canSubmit}>
            {loading ? 'Signing in…' : <>Continue <Icon name="arrow" size={19} /></>}
          </button>
        </div>
      </form>
      <button className="in-back" type="button" onClick={onBack}><Icon name="left" size={16} /> Back to access options</button>
    </AuthFrame>
  );
};

export default StaffLogin;
