import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { resolveTenant, TENANT } from '../../config/tenant';
import SignInScreen, { Field } from './SignInScreen';

// Sprint 22.4: server-verified dev sign-in. The old client-side dev/dev gate is gone — the server checks DEV_USERNAME / DEV_PASSWORD_HASH
// (Koyeb environment), rate-limits failures, and issues a `dev` role token. With no hash configured, sign-in is disabled (no default password).
// Sprint 27.1: it is the "Developer sign-in" of the Inntrio access chooser, so the property is already chosen — after signing in the dev goes
// straight into that property's manager shell (with the Dev tools), instead of picking a property a second time.

const DevLogin = ({ onBack, onChangeProperty }) => {
  const nav = useNavigate();
  const { loginDev } = useAuth();
  const { tenant: tenantSlug } = useParams();
  const tenant = resolveTenant(tenantSlug) || TENANT;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr]           = useState('');
  const [busy, setBusy]         = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await loginDev(username.trim(), password);
    setBusy(false);
    if (r.success) {
      try { localStorage.setItem('hotelops-tenant-slug', tenant.slug); } catch { /* ignore */ }
      nav(`/${tenant.slug}/admin`, { replace: true });
      return;
    }
    setErr(r.status === 503 ? 'Dev sign-in is not set up on the server yet (DEV_PASSWORD_HASH).'
      : r.status === 429 ? 'Too many attempts. Wait a few minutes and try again.'
      : 'Invalid credentials.');
  };

  return (
    <SignInScreen tenant={tenant} onBack={onBack || (() => nav('/'))} onChangeProperty={onChangeProperty || (() => nav('/'))} title="Developer sign-in" icon="code"
      desc="Authorized developer tools and integrations." error={err} canSubmit={!!username && !!password} loading={busy} onSubmit={submit}>
      <Field id="dev-username" label="Username" icon="user" value={username} onChange={e => setUsername(e.target.value)}
        placeholder="Enter your username" autoComplete="username" autoFocus required />
      <Field id="dev-password" label="Password" icon="lock" secret value={password} onChange={e => setPassword(e.target.value)}
        placeholder="Enter your password" autoComplete="current-password" required />
    </SignInScreen>
  );
};

export default DevLogin;
