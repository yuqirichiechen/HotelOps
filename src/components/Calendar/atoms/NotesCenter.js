import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
//   viewAllHref   — absolute href to the full-screen notes page
//   staffScope    — restrict counts to (own dept) + (scope='all')
//   staffDepartmentId — staff's department for the scope filter

const NotesCenter = ({
  forDate,
  onTileClick,
  viewAllHref,
  staffScope = false,
  staffDepartmentId = null,
}) => {
  const [counts, setCounts] = useState({ unread: 0, general: 0, carryovers: 0 });
  const [loading, setLoading] = useState(true);

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
        unread: notes.filter(n => !n.is_read && !n.resolved_at).length,
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
  }, [forDate, staffScope, staffDepartmentId]);

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
        {viewAllHref && (
          <Link to={viewAllHref} className="notes-center-view-all">
            View all notes <span aria-hidden>›</span>
          </Link>
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
            <div className="notes-center-tile-label">Unread Notes</div>
            <div className="notes-center-tile-meta">Needs attention</div>
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
