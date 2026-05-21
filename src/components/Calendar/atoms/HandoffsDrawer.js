import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../auth';
import DepartmentChips from './DepartmentChips';

// Sprint 10: shared bottom drawer that lists handoff notes for a
// given date + optional department filter. Hosts three filter tabs:
//   - Handoffs  — shift-attached threads (scope='shift'). 10 wires.
//   - General   — department/all-staff broadcasts (scope IN
//                 ('department','all')). 10 wires.
//   - Cross-day — carryovers + pins (carry_until or pinned_at set).
//                 Stubbed in 10; 10.1 lights it up.
//
// The drawer fetches once for the date and filters locally per-tab.
// A single date is cheap to fetch; the request also returns notes
// whose carry_until covers the date so the Cross-day tab has data
// available even before its UX lands.
//
// Props:
//   forDate      — 'YYYY-MM-DD' the drawer is showing
//   departments  — [{ department_id, name }] for the dept chips
//   editable     — whether to show the compose footer (admin-or-staff)
//   defaultScope — initial compose scope ('department' | 'all'). The
//                  Sprint 10 UI only exposes department + all in
//                  compose; shift-attached threads need a schedule_id
//                  context (10.1 wires that from the Day view).

const TABS = [
  { key: 'handoffs',  label: 'Handoffs'  },
  { key: 'general',   label: 'General'   },
  { key: 'cross-day', label: 'Cross-day' },
];

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const HandoffsDrawer = ({
  forDate,
  departments = [],
  editable = false,
  defaultScope = 'department',
}) => {
  const [tab, setTab]               = useState('handoffs');
  const [deptFilter, setDeptFilter] = useState(null); // department_id | null
  const [notes, setNotes]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Compose state (general tab only — Sprint 10 scope)
  const [composeBody,  setComposeBody]  = useState('');
  const [composeScope, setComposeScope] = useState(defaultScope);
  const [composeDept,  setComposeDept]  = useState(null);
  const [composeBusy,  setComposeBusy]  = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from: forDate, to: forDate });
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
  }, [forDate]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── filter notes for the active tab ──────────────────────────────────────
  const filtered = notes.filter(n => {
    if (tab === 'handoffs')  return n.scope === 'shift';
    if (tab === 'general')   return n.scope === 'department' || n.scope === 'all';
    if (tab === 'cross-day') return n.carry_until || n.pinned_at;
    return true;
  }).filter(n => {
    if (deptFilter == null) return true;
    return n.department_id === deptFilter;
  });

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

  return (
    <section className="handoffs-drawer">
      <header className="handoffs-drawer-header">
        <div className="handoffs-drawer-title">Handoff notes</div>
        <div className="handoffs-drawer-date">{forDate}</div>
      </header>

      <div className="handoffs-drawer-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`handoffs-drawer-tab ${tab === t.key ? 'is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {departments.length > 0 && tab !== 'cross-day' && (
        <DepartmentChips
          departments={departments}
          value={deptFilter}
          onChange={setDeptFilter}
          className="handoffs-drawer-dept-chips"
        />
      )}

      <div className="handoffs-drawer-body">
        {tab === 'cross-day' ? (
          <div className="handoffs-drawer-stub">
            Cross-day view lands in Sprint 10.1.
            Today's drawer can show carryovers and pinned notes in the
            other tabs once those tools are wired.
          </div>
        ) : loading ? (
          <div className="handoffs-drawer-empty">Loading…</div>
        ) : error ? (
          <div className="handoffs-drawer-error">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="handoffs-drawer-empty">
            {tab === 'handoffs'
              ? 'No shift-attached handoffs for this day.'
              : 'No general handoffs for this day.'}
          </div>
        ) : (
          <ul className="handoffs-drawer-list">
            {filtered.map(n => (
              <li key={n.note_id} className={`handoffs-drawer-note ${n.is_read ? '' : 'is-unread'}`}>
                <div className="handoffs-drawer-note-head">
                  <span className="handoffs-drawer-note-author">{n.author_name}</span>
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
                    <span className="handoffs-drawer-note-badge handoffs-drawer-note-badge-all">
                      All staff
                    </span>
                  )}
                  <span className="handoffs-drawer-note-time">{formatTime(n.created_at)}</span>
                </div>
                <div className="handoffs-drawer-note-body">{n.body}</div>
              </li>
            ))}
          </ul>
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
