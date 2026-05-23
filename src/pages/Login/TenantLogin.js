import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import StaffLogin from './StaffLogin';
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

const TenantLogin = () => {
  const [mode, setMode] = useState('staff');

  const flipMode = (next) => () => {
    if (typeof document !== 'undefined' && document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(() => setMode(next));
      });
    } else {
      setMode(next);
    }
  };

  return mode === 'staff' ? (
    <StaffLogin onRoleSwitch={flipMode('admin')} />
  ) : (
    <AdminLogin onRoleSwitch={flipMode('staff')} />
  );
};

export default TenantLogin;
