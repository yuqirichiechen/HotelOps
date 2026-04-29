import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';

const VISIBILITY_OPTIONS = [
  {
    value: 'all',
    label: 'All Departments',
    desc:  'Every employee sees the full shift board — all departments',
    icon:  '👥',
  },
  {
    value: 'department',
    label: 'Own Department Only',
    desc:  'Each employee only sees shifts for their own department',
    icon:  '🏷️',
  },
  {
    value: 'none',
    label: 'Hidden',
    desc:  'The Shifts board shows nothing — schedule is not visible to employees',
    icon:  '🔒',
  },
];

const AdminSettings = () => {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const [visibility, setVisibility] = useState('all');
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => {
        if (data.success) setVisibility(data.settings.schedule_visibility || 'all');
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    const res  = await fetch('/api/admin/settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ schedule_visibility: visibility }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError(data.message || 'Failed to save');
    }
  };

  const handleSignOut = async () => {
    await logout();
    nav('/login/admin', { replace: true });
  };

  return (
    <div className="admin-settings-page">
      <div className="settings-topbar">
        <div className="settings-topbar-left">
          <button className="btn-back" onClick={() => nav('/admin')}>← Home</button>
          <h2>Settings</h2>
        </div>
      </div>

      {loading ? (
        <div className="settings-loading">Loading…</div>
      ) : (
        <div className="settings-body">

          {/* Shifts board section */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon">📋</div>
              <div>
                <div className="settings-section-title">Shifts Board Visibility</div>
                <div className="settings-section-desc">
                  Controls what employees see on the Shifts board after logging in
                </div>
              </div>
            </div>

            <div className="settings-options">
              {VISIBILITY_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`settings-option${visibility === opt.value ? ' settings-option-active' : ''}`}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={opt.value}
                    checked={visibility === opt.value}
                    onChange={() => { setVisibility(opt.value); setSaved(false); }}
                    className="settings-radio"
                  />
                  <span className="settings-opt-icon">{opt.icon}</span>
                  <div className="settings-opt-body">
                    <div className="settings-opt-label">{opt.label}</div>
                    <div className="settings-opt-desc">{opt.desc}</div>
                  </div>
                  {visibility === opt.value && <span className="settings-check">✓</span>}
                </label>
              ))}
            </div>

            {error && <div className="admin-error" style={{ marginTop: 12 }}>{error}</div>}

            <button
              className={`settings-save-btn${saved ? ' settings-save-btn-saved' : ''}`}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
            </button>
          </div>

          {/* Account / Sign out section */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon">🔐</div>
              <div>
                <div className="settings-section-title">Account</div>
                <div className="settings-section-desc">
                  Signed in as <strong>{user?.username || user?.name || 'admin'}</strong>.
                </div>
              </div>
            </div>
            <button className="settings-signout-btn" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>

        </div>
      )}
    </div>
  );
};

export default AdminSettings;
