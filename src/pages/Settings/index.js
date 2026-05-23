import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import './Settings.css';

const ROLE_LABELS = {
  employee:   'Employee',
  front_desk: 'Front Desk',
  admin:      'Admin',
};

const formatPhone = (p) =>
  p && p.length === 10
    ? `(${p.slice(0,3)}) ${p.slice(3,6)}-${p.slice(6)}`
    : (p || '—');

const Settings = ({ theme, onToggleTheme }) => {
  const { user, logout, changePin, setPin } = useAuth();
  const nav = useNavigate();

  const osDark      = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark      = theme === 'dark' || (theme === null && osDark);
  const themeSource = theme === null ? 'follows your OS' : (theme === 'dark' ? 'dark mode' : 'light mode');

  const [showPinForm, setShowPinForm] = useState(false);
  const [currentPin,  setCurrentPin]  = useState('');
  const [newPin,      setNewPin]      = useState('');
  const [confirmPin,  setConfirmPin]  = useState('');
  const [pinErr,      setPinErr]      = useState('');
  const [pinOk,       setPinOk]       = useState('');
  const [pinBusy,     setPinBusy]     = useState(false);

  const hasPin       = !!user?.has_pin;
  const pinRequired  = !!user?.pin_required;

  const submitChangePin = async (e) => {
    e.preventDefault();
    setPinErr('');
    setPinOk('');
    if (!/^\d{4}$/.test(newPin))         { setPinErr('New PIN must be 4 digits'); return; }
    if (newPin !== confirmPin)           { setPinErr('PINs do not match');       return; }
    if (hasPin && !/^\d{4}$/.test(currentPin)) { setPinErr('Enter your current PIN'); return; }

    setPinBusy(true);
    const fn  = hasPin ? changePin : setPin;
    const res = hasPin ? await fn(currentPin, newPin) : await fn(newPin);
    setPinBusy(false);

    if (res.success) {
      setPinOk(hasPin ? 'PIN updated.' : 'PIN set.');
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
      setShowPinForm(false);
    } else {
      setPinErr(res.message || 'Could not save PIN');
    }
  };

  const handleSignOut = async () => {
    // Sprint 9.3.2: route back to the user's tenant login (not the
    // bare picker) using the slug persisted by StaffLogin on the
    // last successful sign-in. Mirrors Home's auto-signout flow.
    const slug = typeof window !== 'undefined'
      ? localStorage.getItem('hotelops-tenant-slug')
      : null;
    // Sprint 11.2: picker URL is `/` now (was `/login/staff`).
    const loginPath = slug ? `/${slug}/login/staff` : '/';
    await logout();
    nav(loginPath, { replace: true });
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Manage your appearance, profile, and security.</p>
      </div>

      <div className="settings-grid">

        {/* Appearance */}
        <section className="settings-card">
          <h2 className="settings-card-title">Appearance</h2>
          <div className="settings-theme-row">
            <div className="settings-theme-info">
              <span className="theme-icon">{isDark ? '🌙' : '☀️'}</span>
              <div>
                <div className="settings-theme-label">{isDark ? 'Dark mode' : 'Light mode'}</div>
                <div className="settings-theme-meta">Currently {themeSource}.</div>
              </div>
            </div>
            <button
              className={`settings-toggle ${isDark ? 'is-on' : ''}`}
              onClick={onToggleTheme}
              aria-label="Toggle dark mode"
            />
          </div>
        </section>

        {/* Profile */}
        <section className="settings-card">
          <h2 className="settings-card-title">Profile</h2>
          <div className="settings-profile">
            <div className="settings-field">
              <span className="settings-field-label">Name</span>
              <span className="settings-field-value">{user?.name || '—'}</span>
            </div>
            <div className="settings-field">
              <span className="settings-field-label">Phone</span>
              <span className="settings-field-value">{formatPhone(user?.phone_number)}</span>
            </div>
            <div className="settings-field">
              <span className="settings-field-label">Username</span>
              <span className="settings-field-value">{user?.username || '—'}</span>
            </div>
            <div className="settings-field">
              <span className="settings-field-label">Employee ID</span>
              <span className="settings-field-value">{user?.employee_code || '—'}</span>
            </div>
            <div className="settings-field">
              <span className="settings-field-label">Role</span>
              <span className="settings-field-value">{ROLE_LABELS[user?.role] || user?.role || '—'}</span>
            </div>
            <div className="settings-field">
              <span className="settings-field-label">Department</span>
              <span className="settings-field-value">{user?.department || '—'}</span>
            </div>
          </div>
          <p className="settings-field-hint">
            Profile updates are managed by an admin. Reach out to your manager to change anything.
          </p>
        </section>

        {/* Security / PIN */}
        <section className="settings-card">
          <h2 className="settings-card-title">Security</h2>

          <div className="settings-pin-status">
            <div className="settings-pin-state">
              PIN at sign-in
              <span className={`settings-pin-badge ${pinRequired ? 'pin-on' : 'pin-off'}`}>
                {pinRequired ? 'Required' : 'Not required'}
              </span>
            </div>
            <button
              className="settings-btn"
              onClick={() => { setShowPinForm(s => !s); setPinErr(''); setPinOk(''); }}
            >
              {showPinForm ? 'Cancel' : (hasPin ? 'Change PIN' : 'Set a PIN')}
            </button>
          </div>

          {!pinRequired && (
            <p className="settings-field-hint" style={{ marginTop: 0 }}>
              Your manager hasn't required a PIN, but you can still set one for an extra check.
            </p>
          )}

          {showPinForm && (
            <form className="settings-pin-form" onSubmit={submitChangePin}>
              {hasPin && (
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Current PIN"
                  value={currentPin}
                  onChange={e => setCurrentPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                  autoFocus
                />
              )}
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="New 4-digit PIN"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                autoFocus={!hasPin}
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="Confirm new PIN"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))}
              />
              {pinErr && <div className="settings-error">{pinErr}</div>}
              <div className="settings-pin-actions">
                <button type="submit" className="settings-btn settings-btn-primary" disabled={pinBusy}>
                  {pinBusy ? 'Saving…' : (hasPin ? 'Update PIN' : 'Set PIN')}
                </button>
              </div>
            </form>
          )}

          {pinOk && !showPinForm && <div className="settings-success">{pinOk}</div>}
        </section>

        {/* Account */}
        <section className="settings-card">
          <h2 className="settings-card-title">Account</h2>
          <div className="settings-signout-row">
            <div className="settings-signout-info">
              Signed in as <strong>{user?.name}</strong>.
            </div>
            <button className="settings-btn settings-btn-danger" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </section>

      </div>
    </div>
  );
};

export default Settings;
