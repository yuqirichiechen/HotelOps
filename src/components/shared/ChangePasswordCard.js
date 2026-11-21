// Sprint 29.1 — "Change password" for a manager (admin) or dev session. Used in Settings → Account and on the dev Admins page.
// Needs the CURRENT password (the server checks it and rate-limits wrong guesses). Other sessions of the same account stay signed in until their token ends (8 h).
import React, { useState } from 'react';
import { apiFetch } from '../../auth';
import Icon from './Icon';
import './ChangePasswordCard.css';

export const MIN_PASSWORD = 8;
/** @returns {string|null} what is wrong with the new password, or null */
export const newPasswordProblem = (next, current, confirm) => {
  if (!next) return 'Choose a new password.';
  if (next.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (next !== next.trim()) return 'Remove the spaces at the start or end.';
  if (current && next === current) return 'The new password must be different from the current one.';
  if (confirm !== next) return 'The two new passwords don’t match.';
  return null;
};

const ChangePasswordCard = ({ title = 'Change password', who = '' }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);   // { ok, text }
  const problem = next || confirm ? newPasswordProblem(next, current, confirm) : null;
  const ready = !!current && !newPasswordProblem(next, current, confirm) && !busy;
  const type = show ? 'text' : 'password';

  const submit = async (e) => {
    e.preventDefault(); if (!ready) return;
    setBusy(true); setMsg(null);
    const { ok, data } = await apiFetch('/account/password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) });
    setBusy(false);
    if (ok && data && data.success) {
      setCurrent(''); setNext(''); setConfirm(''); setShow(false);
      setMsg({ ok: true, text: 'Password changed. You stay signed in here; other devices stay signed in until their session ends (up to 8 hours).' });
    } else setMsg({ ok: false, text: (data && data.message) || 'Could not change the password.' });
  };

  return (
    <section className="cpw-card" aria-label={title}>
      <div className="cpw-head"><span className="cpw-ico" aria-hidden><Icon name="key" size={20} /></span><div><h3>{title}</h3>{who && <small>{who}</small>}</div></div>
      <form className="cpw-form" onSubmit={submit} autoComplete="off">
        <label className="cpw-field"><span>Current password</span>
          <input type={type} name="current-password" autoComplete="current-password" value={current} onChange={e => { setCurrent(e.target.value); setMsg(null); }} /></label>
        <label className="cpw-field"><span>New password</span>
          <input type={type} name="new-password" autoComplete="new-password" value={next} onChange={e => { setNext(e.target.value); setMsg(null); }} aria-describedby="cpw-hint" /></label>
        <label className="cpw-field"><span>Confirm new password</span>
          <input type={type} name="confirm-password" autoComplete="new-password" value={confirm} onChange={e => { setConfirm(e.target.value); setMsg(null); }} /></label>
        <p id="cpw-hint" className={`cpw-hint${problem ? ' bad' : next ? ' good' : ''}`} aria-live="polite">{problem || (next ? 'Looks good.' : `At least ${MIN_PASSWORD} characters. Use something you don’t use anywhere else.`)}</p>
        <div className="cpw-actions">
          <button type="button" className="cpw-link" onClick={() => setShow(s => !s)} aria-pressed={show}><Icon name={show ? 'eye' : 'lock'} size={14} /> {show ? 'Hide passwords' : 'Show passwords'}</button>
          <button type="submit" className="cpw-btn" disabled={!ready}>{busy ? 'Saving…' : 'Change password'}</button>
        </div>
        {msg && <p role="status" className={`cpw-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</p>}
      </form>
    </section>
  );
};

export default ChangePasswordCard;
