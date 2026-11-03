import React from 'react';
import RoleIcon from '../../components/shared/RoleIcon';
import '../../components/shared/RoleIcon.css';

// Sprint 24: the sign-in screen has three modes, shown as buttons next to the HotelOps mark (every screen shows the OTHER two):
//   clockin — phone / ID / PIN, lands in the original clock-in dashboard (formerly just "staff")
//   admin   — manager username + password
//   staff   — the staff portal: same phone / ID / PIN, lands in the portal (forecast tiles, housekeeping for the front desk, …)
// The two staff doors carry a visible label (they would otherwise look alike); the manager button stays an icon like before.

const StaffPortalIcon = () => (
  // ID badge on a lanyard — "staff" as in the team, distinct from the single-person clock-in icon
  <svg className="login-role-svg" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 2.5h6" /><path d="M10 2.5v3M14 2.5v3" />
    <rect x="5" y="5.5" width="14" height="16" rx="2.2" />
    <circle cx="12" cy="11.2" r="2.3" />
    <path d="M8.2 18c.5-2 2-3 3.8-3s3.3 1 3.8 3" />
  </svg>
);

export const LOGIN_MODES = [
  { key: 'clockin', label: 'Clock in',    title: 'Clock in',         labeled: true,  icon: <RoleIcon role="staff" alt="Clock in" /> },
  { key: 'admin',   label: 'Manager',     title: 'Manager sign-in',  labeled: false, icon: <RoleIcon role="manager" alt="Manager sign-in" /> },
  { key: 'staff',   label: 'Staff login', title: 'Staff login',      labeled: true,  icon: <StaffPortalIcon /> },
];

const LoginModeSwitch = ({ current, onSwitch }) => (
  <>
    {LOGIN_MODES.filter(m => m.key !== current).map(m => (
      <button
        key={m.key}
        type="button"
        data-mode={m.key}
        onClick={() => onSwitch(m.key)}
        className={`login-role-switch${m.labeled ? ' is-labeled' : ''}`}
        aria-label={m.title}
        title={m.title}
      >
        {m.icon}
        {m.labeled && <span className="login-role-label">{m.label}</span>}
      </button>
    ))}
  </>
);

export default LoginModeSwitch;
