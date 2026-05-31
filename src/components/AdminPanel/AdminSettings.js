import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, useAuth } from '../../auth';
import { useView } from '../../shells/ViewContext';

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

// Sprint 15.0: preset color palette for status code swatches. Picked
// to span the existing dept palette (green/amber/yellow/gray) plus
// brand accents so codes read distinct from each other on the sheet.
const STATUS_COLOR_PALETTE = [
  '#38a169', // green     — HELP default
  '#dd6b20', // amber     — BRK default
  '#d69e2e', // yellow    — DEEP CLEAN default
  '#4a5568', // slate     — H.M default
  '#a0aec0', // gray      — OFF default
  '#3182ce', // blue
  '#805ad5', // purple
  '#e53e3e', // red
];

const StatusCodesSection = () => {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  // Drafts cover both edit-in-place and the "Add code" form. label /
  // abbreviation / color; sort_order is server-managed for now.
  const blankDraft = { label: '', abbreviation: '', color: STATUS_COLOR_PALETTE[0] };
  const [editDraft, setEditDraft] = useState(blankDraft);
  const [addDraft,  setAddDraft]  = useState(blankDraft);
  const [addOpen,   setAddOpen]   = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { ok, data } = await apiFetch('/admin/status-codes');
    if (ok && data?.success) setCodes(data.codes || []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const startEdit = (c) => {
    setEditingId(c.code_id);
    setEditDraft({ label: c.label, abbreviation: c.abbreviation, color: c.color });
    setErr(null);
  };
  const cancelEdit = () => { setEditingId(null); setEditDraft(blankDraft); setErr(null); };

  const saveEdit = async () => {
    if (!editDraft.label.trim() || !editDraft.abbreviation.trim()) return;
    setBusy(true); setErr(null);
    const { ok, data } = await apiFetch(`/admin/status-codes/${editingId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        label:        editDraft.label.trim(),
        abbreviation: editDraft.abbreviation.trim().toUpperCase(),
        color:        editDraft.color.toLowerCase(),
      }),
    });
    setBusy(false);
    if (!ok || !data?.success) { setErr(data?.message || 'Could not save.'); return; }
    setCodes(prev => prev.map(c => c.code_id === editingId ? data.code : c));
    cancelEdit();
  };

  const handleDelete = async (c) => {
    if (c.is_system) return;
    if (!window.confirm(`Delete status code "${c.label}"? Cells using "${c.abbreviation}" will fall back to plain text.`)) return;
    setBusy(true); setErr(null);
    const { ok, data } = await apiFetch(`/admin/status-codes/${c.code_id}`, { method: 'DELETE' });
    setBusy(false);
    if (!ok || !data?.success) { setErr(data?.message || 'Could not delete.'); return; }
    setCodes(prev => prev.filter(x => x.code_id !== c.code_id));
  };

  const handleAdd = async () => {
    if (!addDraft.label.trim() || !addDraft.abbreviation.trim()) return;
    setBusy(true); setErr(null);
    const { ok, data } = await apiFetch('/admin/status-codes', {
      method: 'POST',
      body: JSON.stringify({
        label:        addDraft.label.trim(),
        abbreviation: addDraft.abbreviation.trim().toUpperCase(),
        color:        addDraft.color.toLowerCase(),
      }),
    });
    setBusy(false);
    if (!ok || !data?.success) { setErr(data?.message || 'Could not add.'); return; }
    setCodes(prev => [...prev, data.code]);
    setAddDraft(blankDraft);
    setAddOpen(false);
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div className="settings-section-icon">🏷️</div>
        <div>
          <div className="settings-section-title">Status Codes</div>
          <div className="settings-section-desc">
            Short labels the Shift Sheet renders as colored pills instead of plain text (e.g. HELP, BRK, DEEP CLEAN). System codes can be renamed and re-colored but not removed.
          </div>
        </div>
      </div>

      {loading ? (
        <div className="settings-perf-help">Loading…</div>
      ) : (
        <div className="settings-status-list">
          {codes.map(c => (
            <div key={c.code_id} className="settings-status-row">
              {editingId === c.code_id ? (
                <ColorAndTextEditor
                  draft={editDraft}
                  setDraft={setEditDraft}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                  busy={busy}
                />
              ) : (
                <>
                  <span
                    className="settings-status-swatch"
                    style={{ background: c.color }}
                    aria-hidden
                  />
                  <span className="settings-status-abbr" style={{ background: c.color }}>
                    {c.abbreviation}
                  </span>
                  <span className="settings-status-label">{c.label}</span>
                  {c.is_system && (
                    <span className="settings-status-system-pill" title="System code — can be renamed but not removed">SYSTEM</span>
                  )}
                  <button
                    type="button"
                    className="settings-dept-btn"
                    onClick={() => startEdit(c)}
                    disabled={busy}
                  >Edit</button>
                  <button
                    type="button"
                    className="settings-dept-btn settings-dept-btn-danger"
                    onClick={() => handleDelete(c)}
                    disabled={busy || c.is_system}
                    title={c.is_system ? 'System codes cannot be deleted.' : 'Delete this code'}
                  >Delete</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && (
        addOpen ? (
          <div className="settings-status-add">
            <ColorAndTextEditor
              draft={addDraft}
              setDraft={setAddDraft}
              onSave={handleAdd}
              onCancel={() => { setAddOpen(false); setAddDraft(blankDraft); setErr(null); }}
              busy={busy}
              addMode
            />
          </div>
        ) : (
          <button
            type="button"
            className="settings-dept-btn settings-dept-btn-save"
            onClick={() => setAddOpen(true)}
            disabled={busy}
            style={{ marginTop: 12 }}
          >+ Add status code</button>
        )
      )}

      {err && (
        <div className="settings-perf-help" style={{ color: 'var(--danger-text)' }}>
          {err}
        </div>
      )}
    </div>
  );
};

// Sprint 15.0: shared inline editor used for both "add new" and
// "edit existing" status codes. Preset color palette + custom hex
// fallback (text input validated `^#[0-9a-f]{6}$`).
const ColorAndTextEditor = ({ draft, setDraft, onSave, onCancel, busy, addMode }) => {
  const [customOpen, setCustomOpen] = useState(false);
  const setColor = (color) => setDraft(s => ({ ...s, color }));
  const setLabel = (label) => setDraft(s => ({ ...s, label }));
  const setAbbr  = (abbreviation) => setDraft(s => ({ ...s, abbreviation }));
  const hexOk = /^#[0-9a-fA-F]{6}$/.test(draft.color);
  return (
    <div className="settings-status-edit">
      <div className="settings-status-palette" role="radiogroup" aria-label="Pick color">
        {STATUS_COLOR_PALETTE.map(c => (
          <button
            key={c}
            type="button"
            className={`settings-status-palette-swatch${draft.color === c ? ' is-active' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            aria-pressed={draft.color === c}
          />
        ))}
        <button
          type="button"
          className={`settings-status-palette-swatch settings-status-palette-custom${customOpen ? ' is-active' : ''}`}
          onClick={() => setCustomOpen(v => !v)}
          title="Custom hex"
        >#</button>
      </div>
      {customOpen && (
        <input
          type="text"
          className="settings-status-hex-input"
          value={draft.color}
          onChange={e => setColor(e.target.value)}
          placeholder="#RRGGBB"
          aria-label="Custom hex color"
          style={{ borderColor: hexOk ? undefined : 'var(--danger-text)' }}
        />
      )}
      <input
        type="text"
        className="settings-status-input"
        value={draft.label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Label (e.g. Help / Extra Shift)"
      />
      <input
        type="text"
        className="settings-status-input settings-status-input-abbr"
        value={draft.abbreviation}
        onChange={e => setAbbr(e.target.value)}
        placeholder="ABBR"
        maxLength={16}
      />
      <button
        type="button"
        className="settings-dept-btn settings-dept-btn-save"
        onClick={onSave}
        disabled={busy || !draft.label.trim() || !draft.abbreviation.trim() || !hexOk}
      >{addMode ? 'Add' : 'Save'}</button>
      <button
        type="button"
        className="settings-dept-btn"
        onClick={onCancel}
        disabled={busy}
      >Cancel</button>
    </div>
  );
};

const AdminSettings = () => {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  // Sprint 11.2.1: back-to-Home is a view flip, not a URL change.
  const { goTo } = useView();

  const [visibility, setVisibility] = useState('all');
  const [otHours,    setOtHours]    = useState('40');
  const [otMins,     setOtMins]     = useState('10');
  const [baseline,   setBaseline]   = useState('self');
  const [autoSign,   setAutoSign]   = useState('3'); // Sprint 8.6: auto sign-out seconds
  // Sprint 16.1: separate from autoSign. autoSign fires *after* a
  // clock-in/out succeeds (to free the kiosk for the next staff).
  // idleSign fires after login if the staff member sits on the
  // focused-action screen without tapping anything — they probably
  // walked away or got distracted; cycle the session.
  const [idleSign,   setIdleSign]   = useState('15');
  const [payStartDay, setPayStartDay] = useState('0'); // Sprint 9.4: 0=Sun .. 6=Sat
  const [hideAbc,    setHideAbc]    = useState(false); // Sprint 9.1: numbers-only keypad on staff login
  const [loginLayout, setLoginLayout] = useState('hardcode'); // Sprint 9.1.3
  // Sprint 14.1: when ON, the Calendar header shows a small "Legacy
  // panel" button next to the primary Assign pill, re-exposing the
  // pre-Sprint-14 AssignPanel + AssignModal flow.
  const [legacyAssign, setLegacyAssign] = useState(false);
  // Sprint 15.0: coverage-history lookback (weeks). Stored as a
  // string for app_settings compat (the server validator requires
  // an integer 2..52). Default 8 — applied client-side when the
  // backing setting is missing.
  const [coverageWeeks, setCoverageWeeks] = useState('8');
  // Sprint 9: which staff login methods are enabled. Stored as a CSV in
  // app_settings; treated as a Set in the UI for cheap toggle handling.
  const [loginMethods, setLoginMethods] = useState(() => new Set(['phone', 'username', 'employee_code', 'birthday']));
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState('');

  // Sprint 11: Departments management — load, add, edit name/color,
  // delete. Refetches on every mutation since the dataset is tiny
  // (5-10 rows typical) and freshness > round-trip cost.
  const [depts,         setDepts]         = useState([]);
  const [deptDraft,     setDeptDraft]     = useState({ name: '', color: '#3182ce' });
  const [deptBusy,      setDeptBusy]      = useState(false);
  const [deptError,     setDeptError]     = useState('');
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [editingDeptDraft, setEditingDeptDraft] = useState({ name: '', color: '' });

  const refreshDepts = async () => {
    const res = await fetch('/api/admin/departments').then(r => r.json()).catch(() => null);
    if (res?.success) setDepts(res.departments || []);
  };
  useEffect(() => { refreshDepts(); }, []);

  const addDept = async () => {
    if (!deptDraft.name.trim()) return;
    setDeptBusy(true);
    setDeptError('');
    const { ok, data } = await apiFetch('/admin/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: deptDraft.name.trim(), color: deptDraft.color || null }),
    });
    setDeptBusy(false);
    if (!ok || !data?.success) {
      setDeptError(data?.message || 'Could not add department.');
      return;
    }
    setDeptDraft({ name: '', color: '#3182ce' });
    refreshDepts();
  };

  const startDeptEdit = (d) => {
    setEditingDeptId(d.department_id);
    setEditingDeptDraft({ name: d.name, color: d.color || '#3182ce' });
    setDeptError('');
  };
  const cancelDeptEdit = () => {
    setEditingDeptId(null);
    setEditingDeptDraft({ name: '', color: '' });
  };
  const saveDeptEdit = async () => {
    if (!editingDeptDraft.name.trim()) return;
    setDeptBusy(true);
    setDeptError('');
    const { ok, data } = await apiFetch(`/admin/departments/${editingDeptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:  editingDeptDraft.name.trim(),
        color: editingDeptDraft.color || null,
      }),
    });
    setDeptBusy(false);
    if (!ok || !data?.success) {
      setDeptError(data?.message || 'Could not save department.');
      return;
    }
    setEditingDeptId(null);
    setEditingDeptDraft({ name: '', color: '' });
    refreshDepts();
  };
  const deleteDept = async (d) => {
    // Skip a confirm dialog — backend already refuses if staff
    // reference the dept, so the user gets useful feedback in the
    // error path. If they truly intend to delete an empty dept,
    // one click is enough.
    setDeptBusy(true);
    setDeptError('');
    const { ok, data } = await apiFetch(`/admin/departments/${d.department_id}`, { method: 'DELETE' });
    setDeptBusy(false);
    if (!ok || !data?.success) {
      setDeptError(data?.message || 'Could not delete department.');
      return;
    }
    refreshDepts();
  };

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
          setIdleSign  (data.settings.staff_idle_logout_seconds || '15');
          if (/^[0-6]$/.test(String(data.settings.pay_period_start_day))) {
            setPayStartDay(String(data.settings.pay_period_start_day));
          }
          setHideAbc   (data.settings.hide_abc_keyboard === 'true');
          setLegacyAssign(data.settings.enable_legacy_assign_panel === 'true');
          if (data.settings.coverage_history_weeks) {
            setCoverageWeeks(String(data.settings.coverage_history_weeks));
          }
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
        staff_idle_logout_seconds: String(parseInt(idleSign, 10) || 15),
        hide_abc_keyboard:         hideAbc  ? 'true' : 'false',
        enable_legacy_assign_panel: legacyAssign ? 'true' : 'false',
        coverage_history_weeks:     String(parseInt(coverageWeeks, 10) || 8),
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
    // Sprint 11.2.1: per-tenant combined login at `/:slug/login`.
    // (Was `/:slug/login/admin` in 11.2.)
    const loginPath = slug ? `/${slug}/login` : '/';
    await logout();
    nav(loginPath, { replace: true });
  };

  return (
    <div className="admin-settings-page">
      <div className="settings-topbar">
        <div className="settings-topbar-left">
          <button className="btn-back" onClick={() => goTo('home')}>← Home</button>
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

          {/* Sprint 15.0: Settings are grouped into named categories so
              related toggles cluster visually. Order:
                Display → Operations → Departments → Staff Login →
                Shift Sheet → Account. */}
          <h3 className="settings-category-title">Display & Visibility</h3>

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

          <h3 className="settings-category-title">Operations</h3>

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

          <h3 className="settings-category-title">Departments</h3>

          {/* Sprint 11: Departments — name + color management. Each
              dept's color shows up on Calendar chips and shift band
              tinting; admin can add new depts as the property's
              org structure grows. */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon">🏷️</div>
              <div>
                <div className="settings-section-title">Departments</div>
                <div className="settings-section-desc">
                  Add or rename departments and pick a color. Colors drive Calendar chips + shift band tinting.
                </div>
              </div>
            </div>

            <div className="settings-dept-list">
              {depts.length === 0 && (
                <div className="settings-perf-help">No departments yet — add one below.</div>
              )}
              {depts.map(d => (
                <div key={d.department_id} className="settings-dept-row">
                  {editingDeptId === d.department_id ? (
                    <>
                      <input
                        type="color"
                        className="settings-dept-color"
                        value={editingDeptDraft.color || '#cccccc'}
                        onChange={e => setEditingDeptDraft(s => ({ ...s, color: e.target.value }))}
                        aria-label="Department color"
                      />
                      <input
                        type="text"
                        className="settings-dept-name"
                        value={editingDeptDraft.name}
                        onChange={e => setEditingDeptDraft(s => ({ ...s, name: e.target.value }))}
                        placeholder="Department name"
                      />
                      <button
                        type="button"
                        className="settings-dept-btn settings-dept-btn-save"
                        onClick={saveDeptEdit}
                        disabled={deptBusy || !editingDeptDraft.name.trim()}
                      >Save</button>
                      <button
                        type="button"
                        className="settings-dept-btn"
                        onClick={cancelDeptEdit}
                        disabled={deptBusy}
                      >Cancel</button>
                    </>
                  ) : (
                    <>
                      <span
                        className="settings-dept-swatch"
                        style={{ background: d.color || 'var(--bg-raised)' }}
                        aria-hidden
                      />
                      <span className="settings-dept-name-text">{d.name}</span>
                      <button
                        type="button"
                        className="settings-dept-btn"
                        onClick={() => startDeptEdit(d)}
                        disabled={deptBusy}
                      >Edit</button>
                      <button
                        type="button"
                        className="settings-dept-btn settings-dept-btn-danger"
                        onClick={() => deleteDept(d)}
                        disabled={deptBusy}
                      >Delete</button>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="settings-dept-add">
              <input
                type="color"
                className="settings-dept-color"
                value={deptDraft.color}
                onChange={e => setDeptDraft(s => ({ ...s, color: e.target.value }))}
                aria-label="New department color"
              />
              <input
                type="text"
                className="settings-dept-name"
                value={deptDraft.name}
                placeholder="New department name…"
                onChange={e => setDeptDraft(s => ({ ...s, name: e.target.value }))}
              />
              <button
                type="button"
                className="settings-dept-btn settings-dept-btn-save"
                onClick={addDept}
                disabled={deptBusy || !deptDraft.name.trim()}
              >Add</button>
            </div>

            {deptError && (
              <div className="settings-perf-help" style={{ color: 'var(--danger-text)' }}>
                {deptError}
              </div>
            )}
          </div>

          <h3 className="settings-category-title">Staff Login</h3>

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

          {/* Sprint 16.1: idle-logout for the staff focused-action
              screen. Separate from the auto sign-out above — that
              one fires *after* a clock action; this one fires if
              the staff logs in but doesn't take any action. The GM
              reported staff sometimes log in, get distracted, and
              walk away; the session would otherwise sit open for
              the next person to (accidentally) clock in/out as
              them. */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon">⏳</div>
              <div>
                <div className="settings-section-title">Idle sign-out (focused action screen)</div>
                <div className="settings-section-desc">
                  After a staff member logs in, how many seconds the big "Clock In" / "Clock Out" screen waits for a tap before auto-signing them out.
                  Range 5–120 seconds. Lower values close kiosk sessions faster; higher values give slower readers time to act.
                </div>
              </div>
            </div>

            <div className="settings-perf-grid">
              <label className="settings-perf-field">
                <span className="settings-perf-label">Idle timer</span>
                <span className="settings-perf-input-wrap">
                  <input
                    type="number"
                    min="5"
                    max="120"
                    step="1"
                    value={idleSign}
                    onChange={e => { setIdleSign(e.target.value); setSaved(false); }}
                  />
                  <span className="settings-perf-unit">seconds</span>
                </span>
                <span className="settings-perf-help">
                  Default 15s. Any tap on the focused screen resets the timer; the last few seconds show a visible countdown so staff have a chance to keep their session.
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

          <h3 className="settings-category-title">Shift Sheet</h3>

          {/* Sprint 14.1 / 15.0: re-expose the legacy AssignPanel side panel.
              Default off — the Shift Sheet (Sprint 14) is the primary
              assignment surface. Lives in its own section as of 15.0
              (was previously folded under Hide ABC, which never made
              sense). */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon">📐</div>
              <div>
                <div className="settings-section-title">Legacy assign panel</div>
                <div className="settings-section-desc">
                  Pre-Sprint-14 the calendar's ＋ button opened a form-style side panel
                  for assigning individual shifts. Sprint 14 swapped that for the
                  Excel-style Shift Sheet. Turn this on to keep the old panel
                  available as a fallback.
                </div>
              </div>
            </div>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                className="hop-check"
                checked={legacyAssign}
                onChange={e => { setLegacyAssign(e.target.checked); setSaved(false); }}
              />
              <div className="settings-toggle-text">
                <div className="settings-toggle-label">{legacyAssign ? 'On — Calendar shows a small “Legacy panel” button next to Assign' : 'Off — Calendar exposes only the new Shift Sheet'}</div>
              </div>
            </label>
          </div>

          {/* Sprint 15.0: coverage-history weeks. Drives the
              Sprint-15.4 coverage algorithm's lookback window. The
              algo still does its own intelligent trimming (regime-
              change detection); this is just the upper bound. */}
          <div className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon">📊</div>
              <div>
                <div className="settings-section-title">Coverage history window</div>
                <div className="settings-section-desc">
                  Maximum weeks of historical clock data the coverage algorithm considers when computing target hours per department.
                  The algorithm intelligently trims this window if it detects a recent scheduling regime change, so this is just the upper bound.
                </div>
              </div>
            </div>
            <div className="settings-perf-grid">
              <label className="settings-perf-field">
                <span className="settings-perf-label">Weeks</span>
                <span className="settings-perf-input-wrap">
                  <input
                    type="number"
                    min="2"
                    max="52"
                    step="1"
                    value={coverageWeeks}
                    onChange={e => { setCoverageWeeks(e.target.value); setSaved(false); }}
                  />
                  <span className="settings-perf-unit">weeks</span>
                </span>
                <span className="settings-perf-help">
                  Default 8. Minimum 2 (anything less and the dataset-too-small warning fires regardless).
                </span>
              </label>
            </div>
          </div>

          {/* Sprint 15.0: Status Codes — admin-defined pill rendering
              for cell text (HELP, BRK, DEEP CLEAN, H.M, OFF + any
              custom codes). Read by the Shift Sheet's cell renderer
              (15.2) and the calendar overlay. */}
          <StatusCodesSection />

          {/* Account / Sign out section */}
          <h3 className="settings-category-title">Account</h3>

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
