// Sprint 29.1 — Dev → Admins: the manager (admin) sign-in accounts, and the dev's own password.
// Dev can add a manager, switch one off / on, rename, RESET a password, and SHOW the current one (decrypted from the vault copy, server/pinvault.js — only the dev role can,
// and every show / reset / add is written to the audit log, never the password itself). Without PIN_VIEW_KEY on the server nothing viewable is stored: Reset still works.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../auth';
import Icon from '../../components/shared/Icon';
import ChangePasswordCard from '../../components/shared/ChangePasswordCard';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';   // no 0 O 1 l I — easy to read aloud
export const generatePassword = (len = 14) => {
  const c = typeof window !== 'undefined' ? window.crypto : null; const out = [];
  if (c && c.getRandomValues) { const r = new Uint32Array(len); c.getRandomValues(r); for (let i = 0; i < len; i += 1) out.push(ALPHABET[r[i] % ALPHABET.length]); }
  else for (let i = 0; i < len; i += 1) out.push(ALPHABET[Math.floor(Math.random() * ALPHABET.length)]);
  return out.join('');
};
const when = (iso) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
const REASONS = { not_configured: 'The server has no PIN_VIEW_KEY, so passwords can’t be shown. Use Reset to set a new one.', not_stored: 'No viewable copy of this password is stored. Use Reset to set a new one.' };
const SHOW_FOR_MS = 20000;

const AdminRow = ({ account, onChanged }) => {
  const a = account;
  const [shown, setShown] = useState(null);       // the revealed password (auto-hides)
  const [note, setNote] = useState(null);         // { ok, text }
  const [resetting, setResetting] = useState(false);
  const [pw, setPw] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(a.name);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const call = async (method, path, body) => { setBusy(true); setNote(null); const r = await apiFetch(`/dev/admin-accounts/${a.account_id}${path}`, { method, body: body ? JSON.stringify(body) : undefined }); setBusy(false); return r; };
  const hide = () => { clearTimeout(timer.current); setShown(null); };
  const reveal = async () => {
    const { ok, data } = await call('POST', '/reveal');
    if (!(ok && data && data.success)) return setNote({ ok: false, text: (data && data.message) || 'Could not show the password.' });
    if (!data.password) return setNote({ ok: false, text: REASONS[data.reason] || 'No password to show.' });
    setShown(data.password); clearTimeout(timer.current); timer.current = setTimeout(() => setShown(null), SHOW_FOR_MS);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(shown); setNote({ ok: true, text: 'Copied.' }); } catch { setNote({ ok: false, text: 'Copy is blocked here — select the password and copy it.' }); } };
  const reset = async () => {
    const { ok, data } = await call('POST', '/password', { password: pw });
    if (ok && data && data.success) { hide(); setResetting(false); setNote({ ok: true, text: 'New password saved — it works the next time they sign in. Their other sessions end within 8 hours.' }); setPw(''); onChanged(); }
    else setNote({ ok: false, text: (data && data.message) || 'Could not reset the password.' });
  };
  const toggle = async () => { const { ok, data } = await call('PATCH', '', { active: !a.active }); if (ok && data && data.success) onChanged(); else setNote({ ok: false, text: (data && data.message) || 'Could not change that.' }); };
  const rename = async () => { const { ok, data } = await call('PATCH', '', { name }); if (ok && data && data.success) { setRenaming(false); onChanged(); } else setNote({ ok: false, text: (data && data.message) || 'Could not rename.' }); };

  return (
    <li className={`dva-row${a.active ? '' : ' off'}`} data-admin={a.username}>
      <div className="dva-main">
        <div className="dva-who">
          {renaming
            ? <span className="dva-edit"><input className="dv-input" value={name} onChange={e => setName(e.target.value)} aria-label={`Name for ${a.username}`} maxLength={100} /><button type="button" className="dv-btn dv-btn-primary" onClick={rename} disabled={busy || !name.trim()}>Save</button><button type="button" className="dv-btn" onClick={() => { setRenaming(false); setName(a.name); }}>Cancel</button></span>
            : <><strong>{a.name}</strong><span className="dva-user">@{a.username}</span><span className={`dva-pill ${a.active ? 'on' : 'off'}`}>{a.active ? 'Active' : 'Switched off'}</span></>}
        </div>
        <small className="dv-muted">{a.password_changed_at ? `Password last set ${when(a.password_changed_at)}` : 'Password never changed from the app'}{a.created_by ? ` · added by ${a.created_by}` : ''}</small>
      </div>
      <div className="dva-actions">
        <button type="button" className="dv-btn" onClick={shown ? hide : reveal} disabled={busy} aria-label={`${shown ? 'Hide' : 'Show'} password for ${a.username}`}><Icon name={shown ? 'lock' : 'eye'} size={14} /> {shown ? 'Hide' : 'Show password'}</button>
        <button type="button" className="dv-btn" onClick={() => { setResetting(r => !r); setPw(''); setNote(null); }} disabled={busy} aria-label={`Reset password for ${a.username}`}><Icon name="key" size={14} /> Reset</button>
        <button type="button" className="dv-btn" onClick={() => { setRenaming(true); setNote(null); }} disabled={busy || renaming} aria-label={`Rename ${a.username}`}>Rename</button>
        <button type="button" className="dv-btn" onClick={toggle} disabled={busy} aria-label={`${a.active ? 'Switch off' : 'Switch on'} ${a.username}`}>{a.active ? 'Switch off' : 'Switch on'}</button>
      </div>
      {shown && <div className="dva-shown" role="status"><code aria-label={`Password for ${a.username}`}>{shown}</code><button type="button" className="dv-btn" onClick={copy}><Icon name="copy" size={14} /> Copy</button><small className="dv-muted">Hides itself in 20 seconds. This view was logged.</small></div>}
      {resetting && (
        <div className="dva-reset">
          <input className="dv-input" value={pw} onChange={e => setPw(e.target.value)} placeholder="New password (8+ characters)" aria-label={`New password for ${a.username}`} autoComplete="off" />
          <button type="button" className="dv-btn" onClick={() => setPw(generatePassword())}><Icon name="sparkles" size={14} /> Generate</button>
          <button type="button" className="dv-btn dv-btn-primary" onClick={reset} disabled={busy || pw.length < 8}>Save new password</button>
        </div>
      )}
      {note && <small role="status" className={note.ok ? 'dv-ok' : 'dv-error'}>{note.text}</small>}
    </li>
  );
};

const DevAdmins = () => {
  const [state, setState] = useState({ loading: true, accounts: [], vaultConfigured: true, error: '' });
  const [form, setForm] = useState({ username: '', name: '', password: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { ok, data } = await apiFetch('/dev/admin-accounts');
    if (ok && data && data.success) setState({ loading: false, accounts: data.accounts || [], vaultConfigured: !!data.vaultConfigured, error: '' });
    else setState(s => ({ ...s, loading: false, error: (data && data.message) || 'Could not load the manager accounts.' }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { ok, data } = await apiFetch('/dev/admin-accounts', { method: 'POST', body: JSON.stringify(form) }); setBusy(false);
    if (ok && data && data.success) { setForm({ username: '', name: '', password: '' }); setMsg({ ok: true, text: `Added ${data.account.username}. They can sign in on the manager sign-in screen now.` }); load(); }
    else setMsg({ ok: false, text: (data && data.message) || 'Could not add the manager.' });
  };
  const canCreate = form.username.trim().length >= 3 && form.password.length >= 8 && !busy;

  return (
    <>
      <section className="dv-card" aria-label="Manager accounts">
        <h2>Manager accounts</h2>
        <p className="dv-muted">The people who sign in on the manager screen. You can add one, reset a password, switch an account off, or show the password it has now. Showing a password is logged (who and when — never the password) — prefer Reset when you can. A password change reaches their other sessions within 8 hours.</p>
        {!state.vaultConfigured && <p className="dv-error" role="alert">The server has no <code>PIN_VIEW_KEY</code>, so passwords can’t be shown (they aren’t stored in a readable form). Reset still works.</p>}
        {state.error && <p className="dv-error" role="alert">{state.error}</p>}
        {state.loading ? <p className="dv-muted">Loading…</p> : (
          <ul className="dva-list">
            {state.accounts.length === 0 && <li className="dv-muted">No manager accounts yet.</li>}
            {state.accounts.map(a => <AdminRow key={a.account_id} account={a} onChanged={load} />)}
          </ul>
        )}
        <form className="dva-add" onSubmit={create} aria-label="Add a manager" autoComplete="off">
          <h3>Add a manager</h3>
          <div className="dva-addgrid">
            <input className="dv-input" placeholder="Username (3–40 letters / numbers)" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} aria-label="New manager username" autoComplete="off" />
            <input className="dv-input" placeholder="Name shown in the app" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} aria-label="New manager name" autoComplete="off" />
            <input className="dv-input" placeholder="Password (8+ characters)" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} aria-label="New manager password" autoComplete="off" />
            <button type="button" className="dv-btn" onClick={() => setForm(f => ({ ...f, password: generatePassword() }))}><Icon name="sparkles" size={14} /> Generate</button>
          </div>
          <div className="dva-addactions"><button type="submit" className="dv-btn dv-btn-primary" disabled={!canCreate}>Add manager</button>{msg && <small role="status" className={msg.ok ? 'dv-ok' : 'dv-error'}>{msg.text}</small>}</div>
        </form>
      </section>
      <section className="dv-card" aria-label="Dev password">
        <h2>Your dev password</h2>
        <p className="dv-muted">Until you change it here, dev signs in with the password set on the server (DEV_PASSWORD_HASH). After the first change, only the new one works. If you ever lose it: <code>DELETE FROM login_accounts WHERE kind = 'dev';</code> brings the server password back.</p>
        <ChangePasswordCard title="Change dev password" who="Your dev sign-in" />
      </section>
    </>
  );
};

export default DevAdmins;
