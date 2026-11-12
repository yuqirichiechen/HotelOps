import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { resolveTenant, TENANT } from '../../config/tenant';
import SignInScreen, { Field } from './SignInScreen';

// Manager sign-in (username + password → the manager shell). Sprint 27.1: new Inntrio look; the logic is unchanged.
const AdminLogin = ({ onBack, onChangeProperty }) => {
  const { loginAdmin } = useAuth();
  const nav = useNavigate();
  const { tenant: tenantSlug } = useParams();
  const tenant = resolveTenant(tenantSlug) || TENANT;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr]           = useState('');
  const [loading, setLoading]   = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const res = await loginAdmin(username, password);
    setLoading(false);
    if (res.success) {
      // Sprint 9.3.2: persist the tenant slug so sign-out returns to this property's login page, not the picker.
      if (tenant?.slug) localStorage.setItem('hotelops-tenant-slug', tenant.slug);
      nav(`/${tenant.slug}/admin`, { replace: true });
      return;
    }
    setErr(res.message || 'Sign-in failed');
  };

  return (
    <SignInScreen tenant={tenant} onBack={onBack} onChangeProperty={onChangeProperty} title="Manager sign-in" icon="shield"
      desc="Manage staff, scheduling, and operations." error={err} canSubmit={!!username && !!password} loading={loading} onSubmit={submit}>
      <Field id="username" label="Username" icon="user" value={username} onChange={e => setUsername(e.target.value)}
        placeholder="Enter your username" autoComplete="username" autoFocus required />
      <Field id="password" label="Password" icon="lock" secret value={password} onChange={e => setPassword(e.target.value)}
        placeholder="Enter your password" autoComplete="current-password" required />
    </SignInScreen>
  );
};

export default AdminLogin;
