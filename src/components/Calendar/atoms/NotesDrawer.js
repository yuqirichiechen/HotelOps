import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../auth';
import DepartmentChips from './DepartmentChips';

// Sprint 11: NotesDrawer (renamed + restructured from HandoffsDrawer).
// Four tabs:
//   - All       — every note for the day (default)
//   - Assigned  — scope='shift' (tied to a specific staff member's shift)
//   - General   — scope IN ('department','all') broadcasts
//   - Cross-day — carry_until set (carryovers visible on this date)
//
// Compose footer redesigned per mockup #25:
//   [textarea]   [Visibility ⌄]   [📎 Attach]   [✈ Post]
//
// Visibility dropdown options (admin):
//   - Visible to {dept name from current chip filter, fallback "Choose department"}
//   - Visible to all staff
//   - Assign to shift (placeholder for now; full picker lands later)
//
// Staff get the same dropdown but with restricted choices: visibility
// pre-locked to their own department + the option to broadcast to
// all staff if a property's policy allows it (admin gate in 11.x).
//
// Per-note overflow menu carries over from Sprint 10.2 (Pin / Resolve
// / Carry / Edit / Delete) with the same author-or-admin gate.
//
// Props:
//   forDate         — 'YYYY-MM-DD'
//   departments     — [{ department_id, name, color }]
//   editable        — render compose footer + overflow menus
//   currentUser     — { user_id?, role, type, department_id? } from useAuth
//   variant         — 'embedded' (default, bottom drawer) | 'page' (full-screen
//                     /admin/calendar/notes use). 'page' suppresses the close
//                     button and uses different chrome.
//   onClose         — optional close handler for embedded
//   staffScope      — if true, restrict visible notes to (own dept) +
//                     (scope='all'). Staff Day view passes this.
//   staffDepartmentId — when staffScope, this is the staff's dept.
//
// Sprint 10.4 caveat carried over: admin tokens have req.auth.sub =
// username (string). Server handles the read-state + author paths
// per its admin-aware branches.

const TABS = [
  { key: 'all',       label: 'All'       },
  { key: 'assigned',  label: 'Assigned'  },
  { key: 'general',   label: 'General'   },
  { key: 'cross-day', label: 'Cross-day' },
];

const VISIBILITY_OPTIONS = [
  { key: 'department', label: 'Visible to department', needsDept: true  },
  { key: 'all',        label: 'Visible to all staff',  needsDept: false },
  { key: 'shift',      label: 'Assign to shift (coming soon)', disabled: true },
];

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const addDaysIso = (iso, days) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const NotesDrawer = ({
  forDate,
  departments = [],
  editable = false,
  currentUser = null,
  variant = 'embedded',
  onClose,
  staffScope = false,
  staffDepartmentId = null,
  // Sprint 11: when provided, tab is controlled by the parent
  // (parent owns the state; NotesCenter tile clicks call
  // onTabChange to switch tabs). If omitted, the drawer manages
  // its own tab state internally — useful for standalone embeds.
  tab: tabProp,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState('all');
  const tab = tabProp !== undefined ? tabProp : internalTab;
  const setTab = (next) => {
    if (onTabChange) onTabChange(next);
    if (tabProp === undefined) setInternalTab(next);
  };
  const [crossSide, setCrossSide]   = useState('today');
  const [deptFilter, setDeptFilter] = useState(
    staffScope ? staffDepartmentId : null
  );
  const [notes, setNotes]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Compose state
  const [composeBody,       setComposeBody]       = useState('');
  const [composeVisibility, setComposeVisibility] = useState('department');
  const [composeDept,       setComposeDept]       = useState(
    staffScope ? staffDepartmentId : null
  );
  const [composeBusy,       setComposeBusy]       = useState(false);
  const [visMenuOpen,       setVisMenuOpen]       = useState(false);

  // Per-note overflow + edit
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingId,   setEditingId]   = useState(null);
  const [editingBody, setEditingBody] = useState('');
  const [editingBusy, setEditingBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const menuRef = useRef(null);
  const visRef  = useRef(null);

  const isAdmin = currentUser?.role === 'admin';

  // Dismiss open menus on outside click
  useEffect(() => {
    if (!openMenuId && !visMenuOpen) return;
    const onDown = (e) => {
      if (openMenuId && menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
      if (visMenuOpen && visRef.current && !visRef.current.contains(e.target)) {
        setVisMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openMenuId, visMenuOpen]);

  // Fetch notes for the day. Cross-day tab widens by one day so
  // flipping the Today/Tomorrow sub-toggle doesn't re-fetch.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = forDate;
      const to   = tab === 'cross-day' ? addDaysIso(forDate, 1) : forDate;
      const params = new URLSearchParams({ from, to });
      const { ok, data } = await apiFetch(`/handoff-notes?${params.toString()}`);
      if (ok && data?.success) {
        setNotes(data.notes || []);
      } else {
        setError(data?.message || 'Could not load notes.');
      }
    } catch (e) {
      setError('Could not load notes.');
    }
    setLoading(false);
  }, [forDate, tab]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── filter ───────────────────────────────────────────────────────────────
  const visibleDate = tab === 'cross-day' && crossSide === 'tomorrow'
    ? addDaysIso(forDate, 1)
    : forDate;

  const matchesTab = (n) => {
    if (tab === 'all')       return true; // also includes carryovers + everything for the day
    if (tab === 'assigned')  return n.scope === 'shift' && n.for_date === forDate;
    if (tab === 'general')   return (n.scope === 'department' || n.scope === 'all') && n.for_date === forDate;
    if (tab === 'cross-day') return n.carry_until && n.carry_until >= visibleDate;
    return true;
  };

  // Staff scope filter: notes are visible if scope='all', OR scope='department'
  // & department matches, OR scope='shift' & shift belongs to a person in
  // their dept. The server doesn't pre-filter, so we client-filter here.
  const passesStaffScope = (n) => {
    if (!staffScope) return true;
    if (n.scope === 'all') return true;
    if (n.scope === 'department') return n.department_id === staffDepartmentId;
    if (n.scope === 'shift')      return n.department_id === staffDepartmentId; // server joins shift→dept in the SELECT
    return false;
  };

  const allFiltered = notes
    .filter(passesStaffScope)
    .filter(matchesTab)
    .filter(n => deptFilter == null ? true : n.department_id === deptFilter);

  const active   = allFiltered.filter(n => !n.resolved_at);
  const resolved = allFiltered.filter(n =>  n.resolved_at);
  const unreadActiveIds = active.filter(n => !n.is_read).map(n => n.note_id);

  // Per-tab counts for the tab bar — computed against scope-filtered
  // notes (so a staff doesn't see "3" on a tab that's actually empty
  // for them after scoping).
  const scoped = notes.filter(passesStaffScope);
  const tabCounts = {
    all:        scoped.filter(n => !n.resolved_at).length,
    assigned:   scoped.filter(n => !n.resolved_at && n.scope === 'shift'   && n.for_date === forDate).length,
    general:    scoped.filter(n => !n.resolved_at && (n.scope === 'department' || n.scope === 'all') && n.for_date === forDate).length,
    'cross-day':scoped.filter(n => !n.resolved_at && n.carry_until && n.carry_until >= forDate).length,
  };

  // ── compose handlers ─────────────────────────────────────────────────────
  const composeOption = VISIBILITY_OPTIONS.find(o => o.key === composeVisibility);
  const composeDeptName = composeDept
    ? (departments.find(d => d.department_id === composeDept)?.name || 'Department')
    : 'Department';
  const visLabel = composeVisibility === 'department'
    ? `Visible to ${composeDeptName}`
    : composeOption?.label;

  const onPost = async () => {
    if (!composeBody.trim()) return;
    if (composeVisibility === 'department' && !composeDept) {
      setError('Pick a department to post to.');
      return;
    }
    if (composeVisibility === 'shift') {
      setError('Shift-attached compose is not wired yet.');
      return;
    }
    const scope = composeVisibility === 'all' ? 'all' : 'department';
    setComposeBusy(true);
    setError('');
    try {
      const { ok, data } = await apiFetch('/handoff-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: composeBody.trim(),
          scope,
          department_id: scope === 'department' ? composeDept : undefined,
          for_date: forDate,
        }),
      });
      if (ok && data?.success) {
        setComposeBody('');
        // Auto-switch tab to General so the user sees their post
        setTab('general');
        refresh();
      } else {
        setError(data?.message || 'Could not post note.');
      }
    } catch (e) {
      setError('Could not post note.');
    }
    setComposeBusy(false);
  };

  // ── per-note actions (unchanged from 10.2) ───────────────────────────────
  const canMutate = (note) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return note.author_user_id === currentUser.user_id;
  };

  const patchNote = async (id, patch) => {
    const { ok, data } = await apiFetch(`/handoff-notes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!ok || !data?.success) {
      setError(data?.message || 'Update failed.');
      return false;
    }
    setOpenMenuId(null);
    refresh();
    return true;
  };

  const doCarry = (note, days) => {
    if (days == null) patchNote(note.note_id, { carry_until: null });
    else              patchNote(note.note_id, { carry_until: addDaysIso(forDate, days) });
  };

  const startEdit = (note) => {
    setEditingId(note.note_id);
    setEditingBody(note.body);
    setOpenMenuId(null);
  };

  const saveEdit = async (note) => {
    if (!editingBody.trim()) return;
    setEditingBusy(true);
    const ok = await patchNote(note.note_id, { body: editingBody.trim() });
    setEditingBusy(false);
    if (ok) {
      setEditingId(null);
      setEditingBody('');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingBody('');
  };

  const doDelete = async (note) => {
    const { ok, data } = await apiFetch(`/handoff-notes/${note.note_id}`, { method: 'DELETE' });
    if (!ok || !data?.success) {
      setError(data?.message || 'Delete failed.');
      return;
    }
    setOpenMenuId(null);
    refresh();
  };

  const togglePin     = (note) => patchNote(note.note_id, { pinned:   !note.pinned_at });
  const toggleResolve = (note) => patchNote(note.note_id, { resolved: !note.resolved_at });

  const markAllRead = async () => {
    if (unreadActiveIds.length === 0) return;
    setMarkingRead(true);
    const { ok, data } = await apiFetch('/handoff-notes/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_ids: unreadActiveIds }),
    });
    setMarkingRead(false);
    if (!ok || !data?.success) {
      setError(data?.message || 'Could not mark read.');
      return;
    }
    refresh();
  };

  const markOneRead = async (note) => {
    if (note.is_read) return;
    await apiFetch('/handoff-notes/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_ids: [note.note_id] }),
    });
    refresh();
  };

  // ── note row renderer ────────────────────────────────────────────────────
  const renderNote = (n) => {
    const deptColor = departments.find(d => d.department_id === n.department_id)?.color;
    return (
      <li
        key={n.note_id}
        className={[
          'notes-drawer-note',
          n.is_read     ? ''            : 'is-unread',
          n.pinned_at   ? 'is-pinned'   : '',
          n.resolved_at ? 'is-resolved' : '',
        ].filter(Boolean).join(' ')}
        style={deptColor && !n.resolved_at && !n.pinned_at ? { borderLeftColor: deptColor } : undefined}
      >
        <div className="notes-drawer-note-head">
          <button
            type="button"
            className={`notes-drawer-note-dot ${n.is_read ? 'is-read' : 'is-unread'}`}
            aria-label={n.is_read ? 'Already read' : 'Mark read'}
            title={n.is_read ? 'Read' : 'Unread — tap to mark read'}
            onClick={() => markOneRead(n)}
          />
          <span className="notes-drawer-note-author">{n.author_name}</span>
          {n.pinned_at && (
            <span className="notes-drawer-note-badge is-pinned">📌 Pinned</span>
          )}
          {n.resolved_at && (
            <span className="notes-drawer-note-badge is-resolved">✓ Resolved</span>
          )}
          {n.scope === 'shift' && n.schedule_user_name && (
            <span
              className="notes-drawer-note-badge is-shift"
              style={deptColor ? { background: `${deptColor}1A`, color: deptColor } : undefined}
            >
              {n.schedule_user_name}
              {n.shift_start && ` · ${n.shift_start.slice(0, 5)}`}
            </span>
          )}
          {n.scope === 'department' && n.department_name && (
            <span
              className="notes-drawer-note-badge is-dept"
              style={deptColor ? { background: `${deptColor}1A`, color: deptColor } : undefined}
            >
              {n.department_name}
            </span>
          )}
          {n.scope === 'all' && (
            <span className="notes-drawer-note-badge is-all">All staff</span>
          )}
          {n.carry_until && (
            <span className="notes-drawer-note-badge is-carry">
              Carries to {n.carry_until}
            </span>
          )}
          <span className="notes-drawer-note-time">{formatTime(n.created_at)}</span>
          {editable && canMutate(n) && (
            <button
              type="button"
              className="notes-drawer-note-more"
              aria-label="Note actions"
              onClick={() => setOpenMenuId(openMenuId === n.note_id ? null : n.note_id)}
            >⋯</button>
          )}
        </div>

        {editingId === n.note_id ? (
          <div className="notes-drawer-note-edit">
            <textarea
              className="notes-drawer-compose-input"
              value={editingBody}
              onChange={e => setEditingBody(e.target.value)}
              rows={2}
            />
            <div className="notes-drawer-note-edit-actions">
              <button type="button" className="notes-drawer-note-cancel" onClick={cancelEdit} disabled={editingBusy}>Cancel</button>
              <button type="button" className="notes-drawer-post-btn" onClick={() => saveEdit(n)} disabled={editingBusy || !editingBody.trim()}>
                {editingBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="notes-drawer-note-body">{n.body}</div>
        )}

        {openMenuId === n.note_id && (
          <div className="notes-drawer-note-menu" ref={menuRef}>
            {isAdmin && (
              <>
                <button type="button" onClick={() => togglePin(n)}>{n.pinned_at ? 'Unpin' : 'Pin to top'}</button>
                <button type="button" onClick={() => toggleResolve(n)}>{n.resolved_at ? 'Reopen' : 'Mark resolved'}</button>
                <hr />
              </>
            )}
            <button type="button" onClick={() => doCarry(n, 1)}>Carry to next day</button>
            <button type="button" onClick={() => doCarry(n, 7)}>Carry to next week</button>
            {n.carry_until && (
              <button type="button" onClick={() => doCarry(n, null)}>Stop carrying</button>
            )}
            <hr />
            <button type="button" onClick={() => startEdit(n)}>Edit</button>
            <button type="button" className="is-danger" onClick={() => doDelete(n)}>Delete</button>
          </div>
        )}
      </li>
    );
  };

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <section className={`notes-drawer notes-drawer-${variant}`}>
      <header className="notes-drawer-header">
        <div className="notes-drawer-title-block">
          <div className="notes-drawer-title">Notes</div>
          <div className="notes-drawer-date">
            {new Date(forDate + 'T00:00:00').toLocaleDateString([], {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}
          </div>
        </div>
        <div className="notes-drawer-header-right">
          {unreadActiveIds.length > 0 && (
            <button
              type="button"
              className="notes-drawer-mark-all"
              onClick={markAllRead}
              disabled={markingRead}
            >
              {markingRead ? 'Marking…' : `Mark all read (${unreadActiveIds.length})`}
            </button>
          )}
          {variant === 'embedded' && onClose && (
            <button type="button" className="notes-drawer-close" onClick={onClose} aria-label="Close">×</button>
          )}
        </div>
      </header>

      <div className="notes-drawer-tabs" role="tablist">
        {TABS.map(t => {
          const n = tabCounts[t.key] || 0;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`notes-drawer-tab ${tab === t.key ? 'is-active' : ''}`}
              onClick={() => { setTab(t.key); setOpenMenuId(null); }}
            >
              {t.label}
              {n > 0 && <span className="notes-drawer-tab-count">{n}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'cross-day' && (
        <div className="notes-drawer-cross-header">
          <div className="notes-drawer-cross-toggle">
            <button
              type="button"
              className={`notes-drawer-cross-side ${crossSide === 'today' ? 'is-active' : ''}`}
              onClick={() => setCrossSide('today')}
            >Today · {forDate}</button>
            <button
              type="button"
              className={`notes-drawer-cross-side ${crossSide === 'tomorrow' ? 'is-active' : ''}`}
              onClick={() => setCrossSide('tomorrow')}
            >Tomorrow · {addDaysIso(forDate, 1)}</button>
          </div>
        </div>
      )}

      {departments.length > 0 && !staffScope && (
        <DepartmentChips
          departments={departments}
          value={deptFilter}
          onChange={setDeptFilter}
          className="notes-drawer-dept-chips"
        />
      )}

      <div className="notes-drawer-body">
        {loading ? (
          <div className="notes-drawer-empty">Loading…</div>
        ) : error ? (
          <div className="notes-drawer-error">{error}</div>
        ) : allFiltered.length === 0 ? (
          <div className="notes-drawer-empty">
            {tab === 'all'       && 'No notes for this day.'}
            {tab === 'assigned'  && 'No shift-assigned notes for this day.'}
            {tab === 'general'   && 'No general notes for this day.'}
            {tab === 'cross-day' && (crossSide === 'today'
              ? 'No carryovers reach today.'
              : 'No carryovers reach tomorrow.')}
          </div>
        ) : (
          <>
            <ul className="notes-drawer-list">
              {active.map(renderNote)}
            </ul>
            {resolved.length > 0 && (
              <div className="notes-drawer-resolved-group">
                <button
                  type="button"
                  className="notes-drawer-resolved-toggle"
                  onClick={() => setShowResolved(v => !v)}
                  aria-expanded={showResolved}
                >
                  <span className="notes-drawer-resolved-caret">{showResolved ? '▾' : '▸'}</span>
                  Resolved ({resolved.length})
                </button>
                {showResolved && (
                  <ul className="notes-drawer-list notes-drawer-list-resolved">
                    {resolved.map(renderNote)}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {editable && (
        <footer className="notes-drawer-compose">
          <div className="notes-drawer-compose-row">
            <textarea
              className="notes-drawer-compose-input"
              placeholder="Add a note…"
              value={composeBody}
              onChange={e => setComposeBody(e.target.value)}
              rows={2}
            />
          </div>
          <div className="notes-drawer-compose-actions">
            <div className="notes-drawer-visibility" ref={visRef}>
              <button
                type="button"
                className="notes-drawer-visibility-trigger"
                onClick={() => setVisMenuOpen(v => !v)}
              >
                <span className="notes-drawer-visibility-glyph" aria-hidden>👥</span>
                <span>{visLabel}</span>
                <span className="notes-drawer-visibility-caret" aria-hidden>▾</span>
              </button>
              {visMenuOpen && (
                <div className="notes-drawer-visibility-menu">
                  <button
                    type="button"
                    className={composeVisibility === 'department' ? 'is-active' : ''}
                    onClick={() => { setComposeVisibility('department'); setVisMenuOpen(false); }}
                  >
                    Visible to department
                  </button>
                  {composeVisibility === 'department' && (
                    <div className="notes-drawer-visibility-dept">
                      <select
                        value={composeDept || ''}
                        onChange={e => setComposeDept(e.target.value ? parseInt(e.target.value, 10) : null)}
                      >
                        <option value="">Choose department…</option>
                        {departments.map(d => (
                          <option key={d.department_id} value={d.department_id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {(!staffScope || isAdmin) && (
                    <button
                      type="button"
                      className={composeVisibility === 'all' ? 'is-active' : ''}
                      onClick={() => { setComposeVisibility('all'); setVisMenuOpen(false); }}
                    >
                      Visible to all staff
                    </button>
                  )}
                  <button
                    type="button"
                    disabled
                    title="Assign-to-shift compose lands in a future sprint"
                  >
                    Assign to shift (soon)
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="notes-drawer-attach"
              disabled
              title="Attachments land in a future sprint"
              aria-label="Attach"
            >
              <span aria-hidden>📎</span> Attach
            </button>
            <button
              type="button"
              className="notes-drawer-post-btn"
              onClick={onPost}
              disabled={composeBusy || !composeBody.trim()}
            >
              {composeBusy ? 'Posting…' : (<><span aria-hidden>✈</span> Post</>)}
            </button>
          </div>
          {error && <div className="notes-drawer-error">{error}</div>}
        </footer>
      )}
    </section>
  );
};

export default NotesDrawer;
