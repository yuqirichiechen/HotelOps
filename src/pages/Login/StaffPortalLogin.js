import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth, setStaffEntry } from '../../auth';
import { resolveTenant, TENANT } from '../../config/tenant';
import SignInScreen, { Field } from './SignInScreen';

// Sprint 24.1: "Staff login" — the PC sign-in for the staff portal. Same staff credentials as the Clock in pad: a phone number, employee ID or
// username (whichever methods the admin enabled) plus the PIN when the person has one. It calls the existing /auth/staff/login endpoint — there is
// no separate credential path. Sprint 27.1: new Inntrio look (SignInScreen); the logic below is unchanged.

const LABELS = {
  phone:         'phone number',
  employee_code: 'employee ID',
  username:      'username',
  birthday:      'birthday (MMDDYYYY)',
};
const ORDER = ['phone', 'employee_code', 'username', 'birthday'];
const listOf = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`);

const StaffPortalLogin = ({ onBack, onChangeProperty }) => {
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
    <SignInScreen tenant={tenant} onBack={onBack} onChangeProperty={onChangeProperty} title="Staff sign-in" icon="users"
      desc="Schedules, hours, and team updates." error={err} canSubmit={!!identifier.trim()} loading={loading} onSubmit={submit}>
      <Field id="staff-identifier" label={`Your ${what}`} icon="user" value={identifier}
        onChange={e => setIdentifier(e.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 16))}
        placeholder={`Enter your ${methods.length > 1 ? 'phone, ID or username' : LABELS[methods[0]] || 'username'}`}
        autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus required />
      <Field id="staff-pin" label="PIN" optional="(if you have one)" icon="lock" secret value={pin}
        onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Enter your PIN"
        inputMode="numeric" maxLength={4} autoComplete="current-password" />
    </SignInScreen>
  );
};

export default StaffPortalLogin;
