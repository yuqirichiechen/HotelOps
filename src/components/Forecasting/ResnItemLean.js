// Sprint 22.6 — the manager's guest row: name, stay (dates + nights), confirmation code, room type. Nothing else (no status, room number,
// source, contact, charges, notes, flags or details panel — those stay in the Dev view). Uses only the list row; no guest-detail lookups.
import React from 'react';
import { fmtStayRange } from './resnFormat';

const ResnItemLean = ({ r }) => {
  const range = fmtStayRange(r.arrivalDate, r.departureDate);
  const type = [r.baseLabel, r.subLabel && r.subLabel !== 'Standard' ? r.subLabel : null].filter(Boolean).join(' · ') || r.typeCode || '—';
  return (
    <li className="rl-item rl-lean">
      <div className="rl-lean-name">{r.guestName || '(no name)'}</div>
      <div className="rl-lean-stay">{range || '—'}{r.nights ? <span className="rl-nights"> · {r.nights} night{r.nights === 1 ? '' : 's'}</span> : null}</div>
      <div className="rl-lean-conf">{r.confirmationId ? <code>{r.confirmationId}</code> : <span className="rl-sub">—</span>}</div>
      <div className="rl-lean-type">{type}{r.typeCode ? <code className="rl-lean-code">{r.typeCode}</code> : null}</div>
    </li>
  );
};

export default ResnItemLean;
