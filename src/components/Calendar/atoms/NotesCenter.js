import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../auth';

// Sprint 11: Notes Center — the top-of-Day-view summary card.
// Mirrors mockup #25 with three clickable stat tiles:
//   - Unread Notes  (current viewer's unread for the date)
//   - General Notes (scope IN ('department','all') for the date)
//   - Carryovers    (notes with carry_until reaching the date)
//
// Each tile click sets the corresponding tab on the embedded
// NotesDrawer via the onTileClick callback (parent owns the drawer
// state). The "View all notes →" link routes to the full-screen
// notes page for the same date.
//
// Counts come from a single GET /handoff-notes call for the date
// (small payload — one day), aggregated client-side. Cheaper than
// adding a dedicated counts-by-category endpoint for one surface.
//
// Props:
//   forDate       — 'YYYY-MM-DD'
//   onTileClick   — (tab: 'all'|'assigned'|'general'|'cross-day') => void
//   onViewAll     — callback invoked when "View all notes" is tapped
//                   (Sprint 11.2.1: replaces the old `viewAllHref` URL;
//                   in-state navigation through the shell's view stack)
//   staffScope    — restrict counts to (own dept) + (scope='all')
//   staffDepartmentId — staff's department for the scope filter

const NotesCenter = ({
  forDate,
  onTileClick,
  onViewAll,
  staffScope = false,
  staffDepartmentId = null,
  currentUser = null,
}) => {
  const [counts, setCounts] = useState({ unread: 0, general: 0, carryovers: 0 });
  const [loading, setLoading] = useState(true);

  // Sprint 11.1: admin has no users row, so the server returns
  // is_read=TRUE for every note (admin is moderator, not audience).
  // The "Unread" tile would then read "0" forever — useless. For
  // admin, repurpose the tile to count *unresolved* active notes
  // (the moderation queue: anything that hasn't been resolved yet).
  // Staff still uses real per-user is_read tracking.
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ from: forDate, to: forDate });
    apiFetch(`/handoff-notes?${params.toString()}`).then(({ data }) => {
      if (cancelled) return;
      if (!data?.success) { setLoading(false); return; }
      const notes = (data.notes || []).filter(n => {
        if (!staffScope) return true;
        if (n.scope === 'all') return true;
        return n.department_id === staffDepartmentId;
      });
      const today = forDate;
      setCounts({
        unread: isAdmin
          ? notes.filter(n => !n.resolved_at).length
          : notes.filter(n => !n.is_read && !n.resolved_at).length,
        general: notes.filter(n =>
          !n.resolved_at &&
          (n.scope === 'department' || n.scope === 'all') &&
          n.for_date === today
        ).length,
        carryovers: notes.filter(n =>
          !n.resolved_at &&
          n.carry_until &&
          n.carry_until >= today
        ).length,
      });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [forDate, staffScope, staffDepartmentId, isAdmin]);

  return (
    <section className="notes-center">
      <header className="notes-center-header">
        <div className="notes-center-head">
          <span className="notes-center-icon" aria-hidden>📋</span>
          <div>
            <h2 className="notes-center-title">Notes Center</h2>
            <p className="notes-center-sub">Stay ahead of shift updates, handoffs, and cross-day notes.</p>
          </div>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="notes-center-view-all"
          >
            View all notes <span aria-hidden>›</span>
          </button>
        )}
      </header>

      <div className="notes-center-tiles">
        <button
          type="button"
          className="notes-center-tile"
          onClick={() => onTileClick && onTileClick('all')}
          disabled={loading}
        >
          <span className="notes-center-tile-icon notes-center-tile-icon-unread" aria-hidden>📨</span>
          <div className="notes-center-tile-text">
            <div className="notes-center-tile-num">{counts.unread}</div>
            <div className="notes-center-tile-label">
              {isAdmin ? 'Active Notes' : 'Unread Notes'}
            </div>
            <div className="notes-center-tile-meta">
              {isAdmin ? 'Awaiting resolution' : 'Needs attention'}
            </div>
          </div>
        </button>

        <button
          type="button"
          className="notes-center-tile"
          onClick={() => onTileClick && onTileClick('general')}
          disabled={loading}
        >
          <span className="notes-center-tile-icon notes-center-tile-icon-general" aria-hidden>💬</span>
          <div className="notes-center-tile-text">
            <div className="notes-center-tile-num">{counts.general}</div>
            <div className="notes-center-tile-label">General Notes</div>
            <div className="notes-center-tile-meta">Visible to teams</div>
          </div>
        </button>

        <button
          type="button"
          className="notes-center-tile"
          onClick={() => onTileClick && onTileClick('cross-day')}
          disabled={loading}
        >
          <span className="notes-center-tile-icon notes-center-tile-icon-carry" aria-hidden>↺</span>
          <div className="notes-center-tile-text">
            <div className="notes-center-tile-num">{counts.carryovers}</div>
            <div className="notes-center-tile-label">Carryovers</div>
            <div className="notes-center-tile-meta">Next-shift items</div>
          </div>
        </button>
      </div>
    </section>
  );
};

export default NotesCenter;
