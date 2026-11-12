// Sprint 27.1 — the icon set of the Inntrio login screens (24×24 outline icons, stroke = currentColor).
import React from 'react';

const PATHS = {
  hotel:     <path d="M4 20V6l8-3 8 3v14M2 20h20M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 20v-4h6v4" />,
  clock:     <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  users:     <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  shield:    <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
  code:      <path d="m8 17-5-5 5-5m8 0 5 5-5 5m-3-15-3 20" />,
  arrow:     <path d="M4 12h16m-6-6 6 6-6 6" />,
  check:     <path d="m5 12 5 5L20 7" />,
  search:    <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  user:      <><circle cx="12" cy="7" r="4" /><path d="M4 22v-2a8 8 0 0 1 16 0v2" /></>,
  lock:      <><rect x="4" y="10" width="16" height="12" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  eye:       <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff:    <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /><path d="m3 3 18 18" /></>,
  backspace: <><path d="M9 4H20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9L2 12l7-8Z" /><path d="m12 9 6 6m0-6-6 6" /></>,
  swap:      <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />,
  left:      <path d="M20 12H4m6-6-6 6 6 6" />,
};

const Icon = ({ name, size = 21 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {PATHS[name] || null}
  </svg>
);

export default Icon;
