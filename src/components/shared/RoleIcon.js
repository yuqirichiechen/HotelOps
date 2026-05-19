import React from 'react';

// Sprint 9.2.4: dual-PNG role icon (manager / staff), theme-aware via
// CSS only — same pattern as HotelOpsLogo. PNG backgrounds match the
// themed --bg-base so the icon's plate disappears into the page (or
// into the .login-role-switch button background, which is bg-surface
// — close enough that the seam is invisible in practice). File
// naming follows TARGET THEME: manager-light.png is the version
// designed for light theme, etc.
//
// `role` ('manager' | 'staff') picks which icon pair to render.
// `alt` is the accessible label; defaults to the role name.

const SOURCES = {
  manager: { light: '/manager-light.png', dark: '/manager-dark.png' },
  staff:   { light: '/staff-light.png',   dark: '/staff-dark.png'   },
};

const RoleIcon = ({ role, alt }) => {
  const src = SOURCES[role];
  if (!src) return null;
  return (
    <span className="role-icon">
      <img
        className="role-icon-img role-icon-img-light"
        src={src.light}
        alt=""
        aria-hidden="true"
      />
      <img
        className="role-icon-img role-icon-img-dark"
        src={src.dark}
        alt={alt || role}
      />
    </span>
  );
};

export default RoleIcon;
