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
  const [otHours,    setOtHours]    = useState('40');
  const [otMins,     setOtMins]     = useState('10');
  const [baseline,   setBaseline]   = useState('self');
  const [autoSign,   setAutoSign]   = useState('3'); // Sprint 8.6: auto sign-out seconds
  const [payStartDay, setPayStartDay] = useState('0'); // Sprint 9.4: 0=Sun .. 6=Sat
  const [hideAbc,    setHideAbc]    = useState(false); // Sprint 9.1: numbers-only keypad on staff login
  const [loginLayout, setLoginLayout] = useState('hardcode'); // Sprint 9.1.3
  // Sprint 9: which staff login methods are enabled. Stored as a CSV in
  // app_settings; treated as a Set in the UI for cheap toggle handling.
  const [loginMethods, setLoginMethods] = useState(() => new Set(['phone', 'username', 'employee_code', 'birthday']));
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setVisibility(data.settings.schedule_visibility       || 'all');
          setOtHours   (data.settings.overtime_threshold_hours  || '40');
          setOtMins    (data.settings.on_time_tolerance_minutes || '10');
          setBaseline  (data.settings.compare_baseline          || 'self');
          setAutoSign  (data.settings.auto_signout_seconds      || '3');
          if (/^[0-6]$/.test(String(data.settings.pay_period_start_day))) {
            setPayStartDay(String(data.settings.pay_period_start_day));
          }
          setHideAbc   (data.settings.hide_abc_keyboard === 'true');
          if (data.settings.staff_login_layout === 'fluid' || data.settings.staff_login_layout === 'hardcode') {
            setLoginLayout(data.settings.staff_login_layout);
          }
          if (data.settings.enabled_login_methods) {
            const parts = String(data.settings.enabled_login_methods).split(',').map(s => s.trim()).filter(Boolean);
            if (parts.length > 0) setLoginMethods(new Set(parts));
          }
        }
        setLoading(false);
      });
  }, []);

  const toggleLoginMethod = (method) => {
    setSaved(false);
    setLoginMethods(prev => {
      const next = new Set(prev);
      if (next.has(method)) {
        if (next.size === 1) return prev; // never let the last method get disabled
        next.delete(method);
      } else {
        next.add(method);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    const res  = await fetch('/api/admin/settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        schedule_visibility:       visibility,
        overtime_threshold_hours:  otHours,
        on_time_tolerance_minutes: otMins,
        compare_baseline:          baseline,
        auto_signout_seconds:      autoSign,
        hide_abc_keyboard:         hideAbc  ? 'true' : 'false',
        staff_login_layout:        loginLayout,
        enabled_login_methods:     [...loginMethods].join(','),
        pay_period_start_day:      payStartDay,
      }),
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
    // Sprint 9.3.2: route back to the user's tenant login (not the
    // bare picker). Mirrors Staff Settings + Home auto-signout.
    const slug = typeof window !== 'undefined'
      ? localStorage.getItem('hotelops-tenant-slug')
      : null;
    const loginPath = slug ? `/${slug}/login/admin` : '/login/admin';
    await logout();
    nav(loginPath, { replace: true });
  };

  return (
    <div className="admin-settings-page">
      <div className="settings-topbar">
        <div className="settings-topbar-left">
          <button className="btn-back" onClick={() => nav('/admin')}>← Home</button>
          <h2>Settings</h2>
        </div>
        {/* Sprint 9.1.2: save button moved to the topbar as the
            top-level commit action. Previously sat inside the Shifts
            Board Visibility section, which read as "save just this
            section" — admins saved other settings, walked away thinking
            they'd persisted, and on return everything was reverted. */}
        <div className="settings-topbar-actions">
          {error && <span className="settings-topbar-error">{error}</span>}
          <button
            className={`settings-save-top${saved ? ' is-saved' : ''}`}
            onClick={handleSave}
            disabled={saving || loading}
            aria-label="Save settings"
            title="Save settings"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save settings'}
          </button>
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

          </div>

          {/* Performance section (Sprint 6B) */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon">📈</div>
              <div>
                <div className="settings-section-title">Performance Thresholds</div>
                <div className="settings-section-desc">
                  Drives the staff performance dashboard and the dashboard "Coming up" / overtime metrics.
                </div>
              </div>
            </div>

            <div className="settings-perf-grid">
              <label className="settings-perf-field">
                <span className="settings-perf-label">Overtime threshold</span>
                <span className="settings-perf-input-wrap">
                  <input
                    type="number"
                    min="1"
                    max="168"
                    step="0.5"
                    value={otHours}
                    onChange={e => { setOtHours(e.target.value); setSaved(false); }}
                  />
                  <span className="settings-perf-unit">hours / week</span>
                </span>
                <span className="settings-perf-help">
                  Hours past this counts as overtime. Federal default: 40h.
                </span>
              </label>

              <label className="settings-perf-field">
                <span className="settings-perf-label">On-time tolerance</span>
                <span className="settings-perf-input-wrap">
                  <input
                    type="number"
                    min="0"
                    max="240"
                    step="1"
                    value={otMins}
                    onChange={e => { setOtMins(e.target.value); setSaved(false); }}
                  />
                  <span className="settings-perf-unit">minutes</span>
                </span>
                <span className="settings-perf-help">
                  Clock-ins within this window of scheduled start count as on-time.
                </span>
              </label>

              <div className="settings-perf-field">
                <span className="settings-perf-label">Compare baseline</span>
                <div className="settings-perf-radio-group">
                  {[
                    { v: 'self',       label: 'Self (previous period)' },
                    { v: 'department', label: 'Department average (coming soon)' },
                    { v: 'all',        label: 'All staff (coming soon)' },
                  ].map(opt => (
                    <label key={opt.v} className="settings-perf-radio">
                      <input
                        type="radio"
                        name="baseline"
                        value={opt.v}
                        checked={baseline === opt.v}
                        onChange={() => { setBaseline(opt.v); setSaved(false); }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                <span className="settings-perf-help">
                  What the percentage delta on each performance card compares against.
                </span>
              </div>
            </div>
          </div>

          {/* Sprint 9.4: Payroll — pay-period start day. Drives the
              biweekly range in the staff CSV/XLSX export and the
              workweek boundary used for OT calculations. */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon">💵</div>
              <div>
                <div className="settings-section-title">Payroll</div>
                <div className="settings-section-desc">
                  Day your biweekly pay period starts. Used by the Staff list export ("Biweekly" range) and to define the workweek boundary that drives overtime in payroll exports.
                </div>
              </div>
            </div>

            <div className="settings-perf-grid">
              <div className="settings-perf-field">
                <span className="settings-perf-label">Pay period starts on</span>
                <div className="settings-perf-radio-group settings-pay-day-row">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, i) => (
                    <label key={i} className="settings-perf-radio">
                      <input
                        type="radio"
                        name="pay-period-start-day"
                        value={String(i)}
                        checked={String(i) === payStartDay}
                        onChange={() => { setPayStartDay(String(i)); setSaved(false); }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <span className="settings-perf-help">
                  Each biweekly cycle is 14 days starting on this weekday. "Biweekly" exports return the most recently completed cycle.
                </span>
              </div>
            </div>
          </div>

          {/* Sprint 8.6: Staff auto sign-out section */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon">⏱️</div>
              <div>
                <div className="settings-section-title">Staff auto sign-out</div>
                <div className="settings-section-desc">
                  How many seconds after a successful clock-in or clock-out before staff are automatically signed out.
                  A "Stay signed in" button gives them a chance to cancel. Set to 0 to disable.
                </div>
              </div>
            </div>

            <div className="settings-perf-grid">
              <label className="settings-perf-field">
                <span className="settings-perf-label">Timer</span>
                <span className="settings-perf-input-wrap">
                  <input
                    type="number"
                    min="0"
                    max="60"
                    step="1"
                    value={autoSign}
                    onChange={e => { setAutoSign(e.target.value); setSaved(false); }}
                  />
                  <span className="settings-perf-unit">seconds</span>
                </span>
                <span className="settings-perf-help">
                  Default 3s. Useful on shared kiosk/tablet setups so the next staff member doesn't inherit the previous session.
                </span>
              </label>
            </div>
          </div>

          {/* Sprint 9: which login methods staff can use */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon">🔑</div>
              <div>
                <div className="settings-section-title">Staff login methods</div>
                <div className="settings-section-desc">
                  Which identifier types your staff can use to sign in. Hidden methods are also dropped from the on-screen keypad,
                  so disabling Username (for example) hides the ABC keyboard entirely and makes the number buttons bigger.
                  At least one method must stay enabled.
                </div>
              </div>
            </div>

            <div className="settings-method-grid">
              {[
                { key: 'phone',         label: 'Phone number',  hint: '10 digits' },
                { key: 'employee_code', label: 'Employee ID',   hint: '4–6 digits' },
                { key: 'birthday',      label: 'Birthday',      hint: '8 digits — MMDDYYYY' },
                { key: 'username',      label: 'Username',      hint: '3–16 chars, has a letter' },
              ].map(m => {
                const on = loginMethods.has(m.key);
                return (
                  <label key={m.key} className={`settings-method-row ${on ? 'is-on' : ''}`}>
                    <input
                      type="checkbox"
                      className="hop-check"
                      checked={on}
                      onChange={() => toggleLoginMethod(m.key)}
                    />
                    <div className="settings-method-text">
                      <div className="settings-method-label">{m.label}</div>
                      <div className="settings-method-hint">{m.hint}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Sprint 9.1: hide ABC keyboard. Replaces Sprint 8.7's
              block_system_keyboard, which iOS Safari ignored anyway via
              password autofill. New toggle controls only the in-app
              ABC switcher + letters keyboard — useful when staff
              identifiers are all digits (phone, ID, birthday) and the
              letters keyboard is just visual noise. */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon">⌨️</div>
              <div>
                <div className="settings-section-title">Hide ABC keyboard on staff login</div>
                <div className="settings-section-desc">
                  Removes the ABC switcher button and the letters keyboard from the staff sign-in page.
                  The numeric keypad fills the freed-up space with bigger buttons — easier to hit on shared tablets/kiosks.
                  If username login is also enabled, staff would type usernames via the device's own keyboard (we can't block that reliably).
                </div>
              </div>
            </div>

            <label className="settings-toggle-row">
              <input
                type="checkbox"
                className="hop-check"
                checked={hideAbc}
                onChange={e => { setHideAbc(e.target.checked); setSaved(false); }}
              />
              <div className="settings-toggle-text">
                <div className="settings-toggle-label">{hideAbc ? 'On — only the numeric keypad shows on staff login' : 'Off — staff can switch between number / ABC keyboards'}</div>
                <div className="settings-toggle-help">
                  Independent of the Staff Login Methods toggles above — but they interact:
                  disabling Username already hides ABC, so this toggle only adds value when Username stays on.
                </div>
              </div>
            </label>

            {/* Sprint 9.1.3: layout mode for staff login. Hardcode = fixed
                breakpoints (current default). Fluid = clamp()-based sizing
                that scales continuously with both viewport dimensions. */}
            <div className="settings-perf-field" style={{ marginTop: 16 }}>
              <span className="settings-perf-label">Staff login layout</span>
              <div className="settings-mode-toggle">
                {[
                  { v: 'hardcode', label: 'Hardcode',  desc: 'Buttons step at fixed breakpoints. Predictable, easier to test.' },
                  { v: 'fluid',    label: 'Fluid',     desc: 'Buttons scale continuously with viewport width and height. Better on irregular screens.' },
                ].map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    className={`settings-mode-btn ${loginLayout === opt.v ? 'is-active' : ''}`}
                    onClick={() => { setLoginLayout(opt.v); setSaved(false); }}
                  >
                    <div className="settings-mode-btn-label">{opt.label}</div>
                    <div className="settings-mode-btn-desc">{opt.desc}</div>
                  </button>
                ))}
              </div>
              <span className="settings-perf-help">
                Hardcode is the safer default. Switch to Fluid if your kiosk has an unusual aspect ratio or you're seeing buttons jump in size at certain widths.
              </span>
            </div>
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
