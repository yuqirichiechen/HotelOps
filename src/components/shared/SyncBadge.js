// Sprint 22.4 — "how fresh is this?" badge for the Reservations and Forecast pages. Plain words only (managers + front desk).
// Re-renders every minute so "3 min ago" stays true while the page is open (client timer only — no requests).
import React, { useEffect, useState } from 'react';
import { freshnessOf } from '../Forecasting/syncFormat';
import './SyncBadge.css';

const SyncBadge = ({ source, syncedAt, health, label = 'Reservations' }) => {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(id); }, []);
  const f = freshnessOf({ source, syncedAt, health });
  return (
    <div className={`sb sb-${f.tone}`} role="status" title={f.hint}>
      <span className="sb-dot" aria-hidden="true" />
      <span className="sb-text">
        <span className="sb-label">{label}</span>
        <strong className="sb-title">{f.title}</strong>
        {f.sub && <span className="sb-sub">{f.sub}</span>}
      </span>
    </div>
  );
};

export default SyncBadge;
