import React, { useState } from 'react';
import { CountUp, StatusRing } from './CountUp';

// A KPI tile: coloured icon (or a status ring around it), label, big count-up number, optional "of N" and a sub-line. Clickable when `onClick` is
// given. Moved here from Forecasting/index.js in Sprint 24.5 (Reservations, the front-desk Home and Housekeeping all use it); styles: Forecasting.css (.fc-kpi-*).
const KpiCard = ({ label, primary, secondary, sublabel, accent, icon, onClick, active, ring, ringColor, ringLabel }) => {
  // Sprint 20.3 — like rGuest's top tiles, a KPI card can act as a tab button.
  const clickable = typeof onClick === 'function';
  // Sprint 22.7 — a click (and the first appearance) restarts the count-up + ring fill from zero.
  const [animKey, setAnimKey] = useState(1);
  const press = () => { setAnimKey(k => k + 1); if (clickable) onClick(); };
  return (
    <div
      className={`fc-kpi-card fc-kpi-${accent || 'default'}${clickable ? ' fc-kpi-clickable' : ''}${active ? ' fc-kpi-active' : ''}`}
      {...(clickable ? {
        role: 'button', tabIndex: 0, 'aria-pressed': !!active,
        onClick: press,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(); } },
      } : {})}
    >
      {ring != null
        ? <StatusRing fraction={ring} animKey={animKey} color={ringColor} label={ringLabel}><span className="fc-kpi-icon fc-kpi-icon-in" aria-hidden="true">{icon}</span></StatusRing>
        : <div className="fc-kpi-icon" aria-hidden="true">{icon}</div>}
      <div className="fc-kpi-body">
        <div className="fc-kpi-label">{label}</div>
        <div className="fc-kpi-numbers">
          <span className="fc-kpi-primary">{typeof primary === 'number' ? <CountUp value={primary} animKey={animKey} /> : (primary ?? '—')}</span>
          {secondary != null && secondary !== '' && (
            <span className="fc-kpi-secondary">{secondary}</span>
          )}
        </div>
        {sublabel && <div className="fc-kpi-sublabel">{sublabel}</div>}
      </div>
    </div>
  );
};

export default KpiCard;
