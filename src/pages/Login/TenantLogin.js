import React, { useState } from 'react';
import StaffLogin from './StaffLogin';
import AdminLogin from './AdminLogin';

// Sprint 11.2.1: `/:tenant/login` is a single URL that hosts both
// the staff and the manager sign-in. Mode is internal state — the
// URL doesn't change when the user taps the role-switch icon.
// Defaults to 'staff' (the kiosk path; managers are the rare case).

const TenantLogin = () => {
  const [mode, setMode] = useState('staff');
  return mode === 'staff' ? (
    <StaffLogin onRoleSwitch={() => setMode('admin')} />
  ) : (
    <AdminLogin onRoleSwitch={() => setMode('staff')} />
  );
};

export default TenantLogin;
