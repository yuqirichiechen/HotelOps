import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth, setStaffEntry } from '../../auth';
import { resolveTenant, TENANT } from '../../config/tenant';
import HotelOpsLogo from '../../components/shared/HotelOpsLogo';
import LoginModeSwitch from './LoginModeSwitch';
import { TransitionLink } from './TransitionLink';
import './Login.css';
import '../../components/shared/HotelOpsLogo.css';
import '../../components/shared/RoleIcon.css';

// Sprint 24.1: "Staff login" — the PC sign-in for the staff portal. Same card design as the manager sign-in (typed on a computer, no
// numpad), same staff credentials as the Clock in pad: a phone number, employee ID or username (whichever methods the admin enabled)
// plus the PIN when the person has one. It calls the existing /auth/staff/login endpoint — there is no separate credential path.

const LABELS = {
  phone:         'phone number',
  employee_code: 'employee ID',
  username:      'username',
  birthday:      'birthday (MMDDYYYY)',
};
const ORDER = ['phone', 'employee_code', 'username', 'birthday'];
const listOf = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`);

const StaffPortalLogin = ({ onSwitchMode }) => {
  const { loginStaff } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const { tenant: tenantSlug } = useParams();
  const tenant = resolveTenant(tenantSlug) || TENANT;

  const [identifier, setIdentifier] = useState('');
  const [pin, setPin]               = useState('');
  const [err, setErr]               = useState('');
  const [loading, setLoading]       = useState(false);
  const [methods, setMethods]       = useState(ORDER);

  // which sign-in methods the admin enabled — only used to word the label / placeholder (the server enforces them)
  useEffect(() => {
    fetch('/api/public-config').then(r => r.json()).then(d => {
      const list = d && d.success && d.config && d.config.enabled_login_methods;
      if (Array.isArray(list) && list.length) setMethods(ORDER.filter(m => list.includes(m)));
    }).catch(() => { /* keep the default wording */ });
  }, []);

  const what = listOf(methods.map(m => LABELS[m]));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const res = await loginStaff(identifier.trim(), pin);
    setLoading(false);
    if (res.success) {
      if (tenant?.slug) localStorage.setItem('hotelops-tenant-slug', tenant.slug);
      setStaffEntry('staff');
      const door = `/${tenant.slug}/staff`;
      const from = loc.state?.from?.pathname;
      // a deep link to the OTHER staff shell never overrides the door just chosen
      const next = res.user.pin_must_set ? '/set-pin' : (from && !/^\/[^/]+\/(staff|clockin)\/?$/.test(from) ? from : door);
      nav(next, { replace: true });
      return;
    }
    setErr(res.pin_required ? 'Enter your PIN to sign in.' : (res.message || 'Sign-in failed'));
  };

  return (
    <div className="login-page">
      <div className="login-card">
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

        <div className="login-headline-row">
          <div className="login-headline-text">
            <h1 className="login-title">Staff sign-in</h1>
            <p className="login-sub">Your timesheet, calendar and team tools.</p>
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
            <LoginModeSwitch current="staff" onSwitch={onSwitchMode} />
          </div>
        </div>

        <form onSubmit={submit} className="login-form">
          <div className="login-field">
            <label htmlFor="staff-identifier">Your {what}</label>
            <input
              id="staff-identifier"
              value={identifier}
              onChange={e => setIdentifier(e.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 16))}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="staff-pin">PIN <span className="login-optional">(if you have one)</span></label>
            <input
              id="staff-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              autoComplete="current-password"
            />
          </div>

          {err && <div className="login-error">{err}</div>}

          <button type="submit" className="login-submit" disabled={loading || !identifier.trim()}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default StaffPortalLogin;
