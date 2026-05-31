import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { resolveTenant, TENANT } from '../../config/tenant';
import HotelOpsLogo from '../../components/shared/HotelOpsLogo';
import RoleIcon from '../../components/shared/RoleIcon';
import { TransitionLink } from './TransitionLink';
import { useT } from '../../i18n';
import LanguageSwap from '../../components/shared/LanguageSwap';
import './Login.css';
import '../../components/shared/HotelOpsLogo.css';
import '../../components/shared/RoleIcon.css';

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

const StaffLogin = ({ onRoleSwitch }) => {
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
  // Sprint 9.1.3: layout sizing strategy — 'hardcode' (breakpoint steps,
  // default) or 'fluid' (clamp()-based continuous scaling). Admin
  // configures via Settings. Class on .login-page drives CSS selection.
  const [layoutMode,     setLayoutMode]     = useState('hardcode');
  // Sprint 11.3: touch-only restrictions on the numeric input.
  // `(pointer: coarse) and (hover: none)` is true on phones/tablets
  // and *false* on touch-screen laptops (those still have a mouse,
  // so `hover: hover`). On desktop / laptop we lift the lock so
  // users can just type — the on-screen keypad still works for
  // mouse clicks if they prefer it.
  const isTouchDevice = useMediaQuery('(pointer: coarse) and (hover: none)');
  const lockNumeric = isTouchDevice && kbMode === 'numbers';
  // Sprint 11.3: 1024px is the same breakpoint the CSS uses for the
  // two-column shape. We render the keypad inside the form on mobile
  // (between the error and the Sign-in button — kept close to the
  // identifier input where the user is looking), and in a sibling
  // right-hand column on desktop.
  const isDesktopLayout = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    fetch('/api/public-config')
      .then(r => r.json())
      .then(data => {
        if (data?.success) {
          setHideAbc(!!data.config?.hide_abc_keyboard);
          const list = data.config?.enabled_login_methods;
          if (Array.isArray(list) && list.length > 0) setEnabledMethods(new Set(list));
          if (data.config?.staff_login_layout === 'fluid' || data.config?.staff_login_layout === 'hardcode') {
            setLayoutMode(data.config.staff_login_layout);
          }
          // Sprint 9.2: apply the dev-chosen tenant-logo dark-mode strategy.
          // 'card' (default) — CSS handles it via the .login-tenant-logo-wrap
          // white background. 'invert' — set data attr so the invert filter
          // rule kicks in. 'force-light' — pin the page's theme to light
          // so the tenant logo never has to deal with dark mode at all.
          const strat = data.config?.tenant_logo_dark_strategy;
          if (strat === 'invert' || strat === 'force-light' || strat === 'card') {
            document.documentElement.dataset.tenantLogoStrategy = strat;
            if (strat === 'force-light') document.documentElement.dataset.theme = 'light';
          }
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
      const next = res.user.pin_must_set
        ? '/set-pin'
        : (loc.state?.from?.pathname || `/${tenant.slug}/staff`);
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

  // Sprint 11.3: keypad markup factored out so we can render it in
  // either the in-form mobile slot or the right-column desktop slot
  // without duplicating the prop wiring. The keypad's `onKey`
  // mutates the shared `identifier` / `pin` state, so it works the
  // same wherever it sits in the DOM.
  const renderKeypads = () => (
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
  );

  return (
    <div className={`login-page login-layout-${layoutMode}`}>
      {/* Sprint 11.3: explicit two-column shape on desktop —
          `.login-card-left` holds the brand + headline + form,
          `.login-card-right` holds the keypad. Mobile (<1024px) the
          two columns stack naturally. The keypad lives outside the
          <form> so the form's submit semantics aren't affected by
          the column wrappers; `onKey` is just a closure that mutates
          shared state — works the same wherever the keypad sits. */}
      <div className="login-card login-card-staff">
        <div className="login-card-left">
          {/* Sprint 9.2.x: tenant logo as banner-style brand. The
              `viewTransitionName` on the img matches the picker
              thumbnail so the picker→login morph still works. */}
          <div className="login-tenant-brand">
            {tenant.logoUrl ? (
              <span className="login-tenant-logo-wrap">
                <img
                  src={tenant.logoUrl}
                  alt={tenant.name}
                  className="login-tenant-logo"
                  style={{ viewTransitionName: `tenant-brand-${tenant.slug}` }}
                />
              </span>
            ) : (
              <span className="login-tenant-name">{tenant.name}</span>
            )}
          </div>

          {/* Sprint 16.5: iPhone-setup-style language cycler.
              Replaces the 3-button picker — fades through EN /
              ES / 中文 every ~2.4 s; tap locks the displayed
              language. Same persistence (writes to localStorage
              so the choice survives across kiosk sessions). */}
          <LanguageSwap />

          <div className="login-headline-row">
            <div className="login-headline-text">
              <h1 className="login-title">{t('login.title')}</h1>
              {/* Sprint 16.5: subtitle is now a single i18n key,
                  not the dynamic "Sign in with your <methods>"
                  sentence. The dynamic sentence varies per login
                  config and translating its method-list slot
                  would 3x the dict for a marginal benefit; one
                  general subtitle covers every config. The
                  literal `subSentence` value is preserved as the
                  English fallback should the key go missing. */}
              <p className="login-sub">{t('login.subtitle') || subSentence}</p>
            </div>
            <div className="login-headline-actions">
              <TransitionLink
                to="/"
                className="login-topbar-brand"
                aria-label="HotelOps — back to property selection"
                title="Back to property selection"
              >
                <HotelOpsLogo size="lg" />
              </TransitionLink>
              {/* Sprint 11.2.1: in-page role switch — flips the
                  TenantLogin parent's `mode` state. URL stays put. */}
              <button
                type="button"
                onClick={onRoleSwitch}
                className="login-role-switch"
                aria-label="Manager sign-in"
                title="Manager sign-in"
              >
                <RoleIcon role="manager" alt="Manager sign-in" />
              </button>
            </div>
          </div>

          <form onSubmit={submit} className="login-form">
            {/* Sprint 11.1.3 + 11.3: on a touch device, lock the
                numeric input (readOnly + inputMode="none" +
                autoComplete="off") to suppress the OS keyboard /
                autofill bar — the on-screen keypad is the only
                input path. On a desktop with a physical keyboard,
                `lockNumeric` is false so the user can just type. */}
            <div className={`login-field ${activeField === 'id' ? 'is-active' : ''}`}>
              <input
                id="identifier"
                className={`is-keypad ${/^[0-9]+$/.test(identifier) ? 'is-numeric' : ''}`}
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
              <div className={`login-field ${activeField === 'pin' ? 'is-active' : ''}`}>
                <input
                  id="pin"
                  className="is-keypad is-numeric"
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
            )}

            {err && <div className="login-error">{err}</div>}

            {/* Mobile: keypad sits between error and submit (close to
                the identifier input the user is editing). On desktop
                this slot stays empty — see `.login-card-right` below. */}
            {!isDesktopLayout && renderKeypads()}

            <button type="submit" className="login-submit" disabled={loading || !canSubmit}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        {isDesktopLayout && (
          <div className="login-card-right">
            {renderKeypads()}
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffLogin;
