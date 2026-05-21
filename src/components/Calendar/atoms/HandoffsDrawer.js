import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../auth';
import DepartmentChips from './DepartmentChips';

// Sprint 10 + 10.1: shared bottom drawer that lists handoff notes for
// a given date + optional department filter. Three filter tabs:
//   - Handoffs  — shift-attached threads (scope='shift')
//   - General   — department/all-staff broadcasts
//   - Cross-day — carryovers + tomorrow preview (10.1)
//
// Each note row has an overflow menu (⋯) with Carry-forward actions
// (Carry to next / Carry to next week / Stop carrying) and Edit /
// Delete (author or admin only). The Carry actions PATCH carry_until
// directly so the same note "moves" between Today and Tomorrow on
// the cross-day view without re-creating rows.
//
// Props:
//   forDate      — 'YYYY-MM-DD' the drawer is showing
//   departments  — [{ department_id, name }] for the dept chips
//   editable     — whether to show the compose footer + per-note
//                  edit/delete affordances
//   defaultScope — initial compose scope ('department' | 'all')
//   currentUser  — { user_id, role } — required for author/admin
//                  gating on the overflow menu
//
// Sprint 10.2 will add pin/resolve + read state UI on top of this.

const TABS = [
  { key: 'handoffs',  label: 'Handoffs'  },
  { key: 'general',   label: 'General'   },
  { key: 'cross-day', label: 'Cross-day' },
];

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const addDaysIso = (iso, days) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const HandoffsDrawer = ({
  forDate,
  departments = [],
  editable = false,
  defaultScope = 'department',
  currentUser = null,
}) => {
  const [tab, setTab]               = useState('handoffs');
  // Cross-day sub-toggle. 'today' shows notes whose carry covers
  // forDate; 'tomorrow' shows notes whose carry covers forDate + 1.
  const [crossSide, setCrossSide]   = useState('today');
  const [deptFilter, setDeptFilter] = useState(null);
  const [notes, setNotes]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Compose state
  const [composeBody,  setComposeBody]  = useState('');
  const [composeScope, setComposeScope] = useState(defaultScope);
  const [composeDept,  setComposeDept]  = useState(null);
  const [composeBusy,  setComposeBusy]  = useState(false);

  // Per-note overflow menu — only one open at a time
  const [openMenuId, setOpenMenuId] = useState(null);
  // Per-note edit mode
  const [editingId,   setEditingId]   = useState(null);
  const [editingBody, setEditingBody] = useState('');
  const [editingBusy, setEditingBusy] = useState(false);
  // Sprint 10.2: collapse state for the "Resolved (N)" group at
  // the bottom of the list. Default collapsed — resolved notes
  // shouldn't compete with active ones for attention.
  const [showResolved, setShowResolved] = useState(false);
  // "Mark all read" busy flag
  const [markingRead, setMarkingRead] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const menuRef = useRef(null);

  // Dismiss the overflow menu when clicking outside it
  useEffect(() => {
    if (!openMenuId) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openMenuId]);

  // ── fetch ────────────────────────────────────────────────────────────────
  // For Today/General tabs the drawer fetches notes for `forDate`.
  // For Cross-day, the fetch widens by one day (today + tomorrow) so
  // we can flip the sub-toggle without re-fetching. The filter to
  // each tab's actual rows happens in the `filtered` derivation
  // below.
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
        setError(data?.message || 'Could not load handoff notes.');
      }
    } catch (e) {
      setError('Could not load handoff notes.');
    }
    setLoading(false);
  }, [forDate, tab]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── filter by tab + dept ─────────────────────────────────────────────────
  const visibleDate = tab === 'cross-day' && crossSide === 'tomorrow'
    ? addDaysIso(forDate, 1)
    : forDate;

  const allFiltered = notes.filter(n => {
    if (tab === 'handoffs') {
      return n.scope === 'shift' && n.for_date === forDate;
    }
    if (tab === 'general') {
      return (n.scope === 'department' || n.scope === 'all') && n.for_date === forDate;
    }
    if (tab === 'cross-day') {
      if (!n.carry_until) return false;
      return n.carry_until >= visibleDate;
    }
    return true;
  }).filter(n => {
    if (deptFilter == null) return true;
    return n.department_id === deptFilter;
  });

  // Sprint 10.2: split into active vs resolved. The list returned
  // from the server is already sorted (pinned first, then newest),
  // so resolved notes fall to the bottom anyway — but pulling them
  // out into a collapsed group means active notes stay focused.
  const active   = allFiltered.filter(n => !n.resolved_at);
  const resolved = allFiltered.filter(n =>  n.resolved_at);
  const unreadActiveIds = active.filter(n => !n.is_read).map(n => n.note_id);

  // ── cross-day header summary ─────────────────────────────────────────────
  const crossSummary = (() => {
    const carrying = notes.filter(n => n.carry_until && n.carry_until >= forDate);
    const tomorrowOnly = carrying.filter(n => n.carry_until >= addDaysIso(forDate, 1));
    const unread = carrying.filter(n => !n.is_read).length;
    return {
      unread,
      total: carrying.length,
      tomorrow: tomorrowOnly.length,
    };
  })();

  // ── compose ──────────────────────────────────────────────────────────────
  const onPost = async () => {
    if (!composeBody.trim()) return;
    if (composeScope === 'department' && !composeDept) {
      setError('Pick a department to post to.');
      return;
    }
    setComposeBusy(true);
    setError('');
    try {
      const { ok, data } = await apiFetch('/handoff-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body:          composeBody.trim(),
          scope:         composeScope,
          department_id: composeScope === 'department' ? composeDept : undefined,
          for_date:      forDate,
        }),
      });
      if (ok && data?.success) {
        setComposeBody('');
        refresh();
      } else {
        setError(data?.message || 'Could not post note.');
      }
    } catch (e) {
      setError('Could not post note.');
    }
    setComposeBusy(false);
  };

  // ── per-note actions (10.1) ──────────────────────────────────────────────
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
    if (days == null) {
      patchNote(note.note_id, { carry_until: null });
    } else {
      patchNote(note.note_id, { carry_until: addDaysIso(forDate, days) });
    }
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

  // Sprint 10.2: pin / resolve via PATCH. Boolean true stamps the
  // corresponding *_at; false clears it. Admin-only — the server
  // enforces, the UI just hides the menu items for non-admins.
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

  // Mark a single note read on body-click (so reading = acknowledging
  // without needing to hit a button). We only fire when the note is
  // currently unread to avoid no-op POSTs on every tap.
  const markOneRead = async (note) => {
    if (note.is_read) return;
    await apiFetch('/handoff-notes/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_ids: [note.note_id] }),
    });
    refresh();
  };

  // Sprint 10.2: shared per-note row renderer. Used by both the
  // active list and the collapsed Resolved group below it.
  const renderNote = (n) => (
    <li
      key={n.note_id}
      className={[
        'handoffs-drawer-note',
        n.is_read     ? ''             : 'is-unread',
        n.pinned_at   ? 'is-pinned'    : '',
        n.resolved_at ? 'is-resolved'  : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="handoffs-drawer-note-head">
        {/* Read-state dot. Filled = unread, hollow = read. Clicking
            it marks read explicitly even when the rest of the row's
            click target is elsewhere. */}
        <button
          type="button"
          className={`handoffs-drawer-note-dot ${n.is_read ? 'is-read' : 'is-unread'}`}
          aria-label={n.is_read ? 'Already read' : 'Mark read'}
          title={n.is_read ? 'Read' : 'Unread — tap to mark read'}
          onClick={() => markOneRead(n)}
        />
        <span className="handoffs-drawer-note-author">{n.author_name}</span>
        {n.pinned_at && (
          <span className="handoffs-drawer-note-badge handoffs-drawer-note-badge-pinned">📌 Pinned</span>
        )}
        {n.resolved_at && (
          <span className="handoffs-drawer-note-badge handoffs-drawer-note-badge-resolved">✓ Resolved</span>
        )}
        {n.scope === 'shift' && n.schedule_user_name && (
          <span className="handoffs-drawer-note-badge handoffs-drawer-note-badge-shift">
            {n.schedule_user_name}
            {n.shift_start && ` · ${n.shift_start.slice(0, 5)}`}
          </span>
        )}
        {n.scope === 'department' && n.department_name && (
          <span className="handoffs-drawer-note-badge handoffs-drawer-note-badge-dept">
            {n.department_name}
          </span>
        )}
        {n.scope === 'all' && (
          <span className="handoffs-drawer-note-badge handoffs-drawer-note-badge-all">All staff</span>
        )}
        {n.carry_until && (
          <span className="handoffs-drawer-note-badge handoffs-drawer-note-badge-carry">
            Carries to {n.carry_until}
          </span>
        )}
        <span className="handoffs-drawer-note-time">{formatTime(n.created_at)}</span>
        {editable && canMutate(n) && (
          <button
            type="button"
            className="handoffs-drawer-note-more"
            aria-label="Note actions"
            onClick={() => setOpenMenuId(openMenuId === n.note_id ? null : n.note_id)}
          >⋯</button>
        )}
      </div>

      {editingId === n.note_id ? (
        <div className="handoffs-drawer-note-edit">
          <textarea
            className="handoffs-drawer-compose-input"
            value={editingBody}
            onChange={e => setEditingBody(e.target.value)}
            rows={2}
          />
          <div className="handoffs-drawer-note-edit-actions">
            <button
              type="button"
              className="handoffs-drawer-note-cancel"
              onClick={cancelEdit}
              disabled={editingBusy}
            >Cancel</button>
            <button
              type="button"
              className="handoffs-drawer-compose-go"
              onClick={() => saveEdit(n)}
              disabled={editingBusy || !editingBody.trim()}
            >{editingBusy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <div className="handoffs-drawer-note-body">{n.body}</div>
      )}

      {openMenuId === n.note_id && (
        <div className="handoffs-drawer-note-menu" ref={menuRef}>
          {/* Admin-only: pin / resolve. Hidden for non-admins so
              the menu doesn't get visually crowded for staff. */}
          {isAdmin && (
            <>
              <button type="button" onClick={() => togglePin(n)}>
                {n.pinned_at ? 'Unpin' : 'Pin to top'}
              </button>
              <button type="button" onClick={() => toggleResolve(n)}>
                {n.resolved_at ? 'Reopen' : 'Mark resolved'}
              </button>
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
          <button
            type="button"
            className="handoffs-drawer-note-menu-danger"
            onClick={() => doDelete(n)}
          >Delete</button>
        </div>
      )}
    </li>
  );

  const doDelete = async (note) => {
    // No confirm dialog — a stray click would be annoying, but the
    // PATCH/DELETE is reversible by re-posting; keep it light.
    // Sprint 10.2 can add an undo toast.
    const { ok, data } = await apiFetch(`/handoff-notes/${note.note_id}`, { method: 'DELETE' });
    if (!ok || !data?.success) {
      setError(data?.message || 'Delete failed.');
      return;
    }
    setOpenMenuId(null);
    refresh();
  };

  return (
    <section className="handoffs-drawer">
      <header className="handoffs-drawer-header">
        <div className="handoffs-drawer-title">Handoff notes</div>
        <div className="handoffs-drawer-header-right">
          {unreadActiveIds.length > 0 && (
            <button
              type="button"
              className="handoffs-drawer-mark-all"
              onClick={markAllRead}
              disabled={markingRead}
              title={`${unreadActiveIds.length} unread`}
            >
              {markingRead ? 'Marking…' : `Mark all read (${unreadActiveIds.length})`}
            </button>
          )}
          <div className="handoffs-drawer-date">{forDate}</div>
        </div>
      </header>

      <div className="handoffs-drawer-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`handoffs-drawer-tab ${tab === t.key ? 'is-active' : ''}`}
            onClick={() => { setTab(t.key); setOpenMenuId(null); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Cross-day header: today/tomorrow toggle + summary chips */}
      {tab === 'cross-day' && (
        <div className="handoffs-drawer-cross-header">
          <div className="handoffs-drawer-cross-toggle">
            <button
              type="button"
              className={`handoffs-drawer-cross-side ${crossSide === 'today' ? 'is-active' : ''}`}
              onClick={() => setCrossSide('today')}
            >
              Today · {forDate}
            </button>
            <button
              type="button"
              className={`handoffs-drawer-cross-side ${crossSide === 'tomorrow' ? 'is-active' : ''}`}
              onClick={() => setCrossSide('tomorrow')}
            >
              Tomorrow · {addDaysIso(forDate, 1)}
            </button>
          </div>
          <div className="handoffs-drawer-cross-summary">
            <span className="handoffs-drawer-cross-stat">
              <strong>{crossSummary.unread}</strong> Unread
            </span>
            <span className="handoffs-drawer-cross-stat">
              <strong>{crossSummary.total}</strong> Carrying
            </span>
            <span className="handoffs-drawer-cross-stat">
              <strong>{crossSummary.tomorrow}</strong> Reach tomorrow
            </span>
          </div>
        </div>
      )}

      {departments.length > 0 && (
        <DepartmentChips
          departments={departments}
          value={deptFilter}
          onChange={setDeptFilter}
          className="handoffs-drawer-dept-chips"
        />
      )}

      <div className="handoffs-drawer-body">
        {loading ? (
          <div className="handoffs-drawer-empty">Loading…</div>
        ) : error ? (
          <div className="handoffs-drawer-error">{error}</div>
        ) : allFiltered.length === 0 ? (
          <div className="handoffs-drawer-empty">
            {tab === 'handoffs'  && 'No shift-attached handoffs for this day.'}
            {tab === 'general'   && 'No general handoffs for this day.'}
            {tab === 'cross-day' && (crossSide === 'today'
              ? 'No carryovers reach today.'
              : 'No carryovers reach tomorrow.')}
          </div>
        ) : (
          <>
            <ul className="handoffs-drawer-list">
              {active.map(n => renderNote(n))}
            </ul>
            {resolved.length > 0 && (
              <div className="handoffs-drawer-resolved-group">
                <button
                  type="button"
                  className="handoffs-drawer-resolved-toggle"
                  onClick={() => setShowResolved(v => !v)}
                  aria-expanded={showResolved}
                >
                  <span className="handoffs-drawer-resolved-caret">{showResolved ? '▾' : '▸'}</span>
                  Resolved ({resolved.length})
                </button>
                {showResolved && (
                  <ul className="handoffs-drawer-list handoffs-drawer-list-resolved">
                    {resolved.map(n => renderNote(n))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {editable && tab !== 'cross-day' && (
        <footer className="handoffs-drawer-compose">
          <div className="handoffs-drawer-compose-scope">
            <label className={`handoffs-drawer-scope-opt ${composeScope === 'department' ? 'is-active' : ''}`}>
              <input
                type="radio"
                className="hop-radio"
                name="handoff-compose-scope"
                checked={composeScope === 'department'}
                onChange={() => setComposeScope('department')}
              />
              <span>Department</span>
            </label>
            <label className={`handoffs-drawer-scope-opt ${composeScope === 'all' ? 'is-active' : ''}`}>
              <input
                type="radio"
                className="hop-radio"
                name="handoff-compose-scope"
                checked={composeScope === 'all'}
                onChange={() => setComposeScope('all')}
              />
              <span>All staff</span>
            </label>
            {composeScope === 'department' && (
              <select
                className="handoffs-drawer-compose-dept"
                value={composeDept || ''}
                onChange={e => setComposeDept(e.target.value ? parseInt(e.target.value, 10) : null)}
              >
                <option value="">Choose dept…</option>
                {departments.map(d => (
                  <option key={d.department_id} value={d.department_id}>{d.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="handoffs-drawer-compose-row">
            <textarea
              className="handoffs-drawer-compose-input"
              placeholder={`Add a note for ${composeScope === 'all' ? 'all staff' : 'this department'}…`}
              value={composeBody}
              onChange={e => setComposeBody(e.target.value)}
              rows={2}
            />
            <button
              type="button"
              className="handoffs-drawer-compose-go"
              onClick={onPost}
              disabled={composeBusy || !composeBody.trim()}
            >
              {composeBusy ? 'Posting…' : 'Post'}
            </button>
          </div>
        </footer>
      )}
    </section>
  );
};

export default HandoffsDrawer;
