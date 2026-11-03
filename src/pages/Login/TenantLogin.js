import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import StaffLogin from './StaffLogin';
import AdminLogin from './AdminLogin';
import { getStaffEntry } from '../../auth';

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

// Sprint 24: three modes — 'clockin' (the original staff sign-in, lands in the clock-in dashboard), 'staff' (the staff portal; same
// credentials, different door) and 'admin'. The screen opens on the door this browser used last, so a front-desk PC keeps opening
// on "Staff login" and a kiosk tablet keeps opening on "Clock in".
const TenantLogin = () => {
  const [mode, setMode] = useState(() => (getStaffEntry() === 'staff' ? 'staff' : 'clockin'));

  const switchMode = (next) => {
    if (typeof document !== 'undefined' && document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(() => setMode(next));
      });
    } else {
      setMode(next);
    }
  };

  return mode === 'admin' ? (
    <AdminLogin onSwitchMode={switchMode} />
  ) : (
    <StaffLogin key={mode} entry={mode} onSwitchMode={switchMode} />
  );
};

export default TenantLogin;
