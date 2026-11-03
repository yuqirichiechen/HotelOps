import React from 'react';
import RoleIcon from '../../components/shared/RoleIcon';
import '../../components/shared/RoleIcon.css';

// The sign-in screen has three modes, shown as buttons next to the HotelOps mark (every screen shows the OTHER two):
//   clockin — phone / ID / PIN on a numpad; clock in / out only (formerly just "staff")
//   admin   — manager username + password
//   staff   — "Staff login": a PC form (same staff credentials, typed) → the staff portal
// Sprint 24.1: icon only (the name is the tooltip / aria-label); the icons are placeholders the user will replace. Every button is the same
// square, so the HotelOps mark keeps its place on all three screens (the card morph between screens depends on that).

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
  { key: 'clockin', title: 'Clock in',        icon: <RoleIcon role="staff" alt="Clock in" /> },
  { key: 'admin',   title: 'Manager sign-in', icon: <RoleIcon role="manager" alt="Manager sign-in" /> },
  { key: 'staff',   title: 'Staff login',     icon: <StaffPortalIcon /> },
];

const LoginModeSwitch = ({ current, onSwitch }) => (
  <>
    {LOGIN_MODES.filter(m => m.key !== current).map(m => (
      <button
        key={m.key}
        type="button"
        data-mode={m.key}
        onClick={() => onSwitch(m.key)}
        className="login-role-switch"
        aria-label={m.title}
        title={m.title}
      >
        {m.icon}
      </button>
    ))}
  </>
);

export default LoginModeSwitch;
