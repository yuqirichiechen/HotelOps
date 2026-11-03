import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import StaffLogin from './StaffLogin';
import StaffPortalLogin from './StaffPortalLogin';
import AdminLogin from './AdminLogin';

// Sprint 11.2.1: `/:tenant/login` is a single URL that hosts both
// the staff and the manager sign-in. Mode is internal state — the
// URL doesn't change when the user taps the role-switch icon.
// Defaults to 'staff' (the kiosk path; managers are the rare case).
//
// Sprint 11.3: restore the staff <-> admin morph animation we lost
// when 11.2.1 collapsed the two URLs into one. TransitionLink (the
// old role-switch implementation) wrapped its `navigate()` in
// `document.startViewTransition` — that's gone now because the
// switch is a `setState`, not a route change. Wrap the state update
// directly so the browser still snapshots before/after and animates
// the `view-transition-name` elements (the card, the HotelOps mark,
// the tenant banner). `flushSync` is required: React batches state
// updates and without it `startViewTransition` would snapshot the
// "after" DOM before React has actually updated it. Browsers that
// don't implement the API fall through to a plain `setMode`.

// Sprint 24 / 24.1 / 24.2: three modes — 'clockin' (numpad: clock in / out only), 'staff' (PC form → the staff portal: timesheet, calendar,
// settings; front desk adds forecast + housekeeping) and 'admin'. Same staff credentials for the first two. The screen ALWAYS opens on
// Clock in (the numpad); the other modes are one click away and are not remembered for the next visit.
const TenantLogin = () => {
  const [mode, setMode] = useState('clockin');

  const switchMode = (next) => {
    if (typeof document !== 'undefined' && document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(() => setMode(next));
      });
    } else {
      setMode(next);
    }
  };

  if (mode === 'admin') return <AdminLogin onSwitchMode={switchMode} />;
  if (mode === 'staff') return <StaffPortalLogin onSwitchMode={switchMode} />;
  return <StaffLogin onSwitchMode={switchMode} />;
};

export default TenantLogin;
