// Sprint 29.2 — "Change password" on the manager and developer SIGN-IN screens (before signing in). Same card, fields, gold button and back link as the sign-in itself
// (SignInScreen). It asks for the username, the current password and the new one twice, changes it on the server and sends the person back to sign in — it never signs
// them in. The same change is also available inside the app (Settings → Account).
import React, { useState } from 'react';
import { changeLoginPassword } from '../../auth';
import { newPasswordProblem, MIN_PASSWORD } from '../../components/shared/ChangePasswordCard';
import SignInScreen, { Field } from './SignInScreen';

/** @param {{kind: 'admin'|'dev', tenant: object, initialUsername?: string, onBack: (username: string) => void, onChangeProperty?: () => void, onDone: (username: string) => void}} props */
const ChangePasswordScreen = ({ kind, tenant, initialUsername = '', onBack, onChangeProperty, onDone }) => {
  const dev = kind === 'dev';
  const [username, setUsername] = useState(initialUsername);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = next || confirm ? newPasswordProblem(next, current, confirm) : null;
  const canSubmit = !!username.trim() && !!current && !newPasswordProblem(next, current, confirm);

  const submit = async (e) => {
    e.preventDefault(); if (!canSubmit) return;
    setBusy(true); setErr('');
    const r = await changeLoginPassword(kind, { username: username.trim(), currentPassword: current, newPassword: next });
    setBusy(false);
    if (r.success) onDone(username.trim()); else setErr(r.message);
  };
  const edit = (set) => (e) => { set(e.target.value); setErr(''); };

  return (
    <SignInScreen tenant={tenant} onBack={() => onBack(username.trim())} onChangeProperty={onChangeProperty} title={dev ? 'Developer password' : 'Manager password'} icon="lock"
      subtitle={`Change your sign-in password for ${tenant.name}.`} heading="Change your password" desc="Enter your current password, then choose a new one."
      error={err} canSubmit={canSubmit} loading={busy} onSubmit={submit} submitText="Change password" busyText="Saving…" backText="Back to sign in">
      <Field id="cp-username" label="Username" icon="user" value={username} onChange={edit(setUsername)} placeholder="Enter your username" autoComplete="username" autoFocus required />
      <Field id="cp-current" label="Current password" icon="lock" secret value={current} onChange={edit(setCurrent)} placeholder="Enter your current password" autoComplete="current-password" required />
      <Field id="cp-new" label="New password" icon="lock" secret value={next} onChange={edit(setNext)} placeholder={`At least ${MIN_PASSWORD} characters`} autoComplete="new-password" required />
      <Field id="cp-confirm" label="Confirm new password" icon="lock" secret value={confirm} onChange={edit(setConfirm)} placeholder="Type the new password again" autoComplete="new-password" required />
      <p className={`in-hint${problem ? ' bad' : next ? ' good' : ''}`} aria-live="polite">{problem || (next ? 'Looks good.' : 'Choose something you don’t use anywhere else.')}</p>
    </SignInScreen>
  );
};

export default ChangePasswordScreen;
