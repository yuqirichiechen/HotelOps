import React from 'react';
import { ViewProvider, useView } from './ViewContext';
import { useAuth, isFrontDesk } from '../auth';
import Sidebar from '../components/Layout/Sidebar';
import PortalHome from '../pages/PortalHome';
import Housekeeping from '../components/Housekeeping';
import PortalReservations from '../pages/PortalReservations';
import LogBook from '../components/LogBook';
import ComingSoon from '../components/shared/ComingSoon';
import '../components/LogBook/LogBook.css';
import Settings from '../pages/Settings';
import { PortalPreviewContext, usePortalPreview } from './PortalPreview';

// Sprint 24 / 24.1: the staff portal (`/:tenant/staff`) — what "Staff login" opens, for EVERY employee. (The other door, `/:tenant/clockin`,
// is clock in / out only; it replaced the old multi-page staff shell, whose pages now live here.) Same single-URL pattern as the other
// shells: sidebar clicks set view state.
//
//   Home          — the person's own hours: greeting, this-week hours, recent shifts and (Sprint 24.3) the timesheet underneath. No clocking
//                   (that is the Clock in door), no separate Timesheet page, no CSV export.
//   Reservations  — Front Desk only: today's five tiles + sellable-vs-arriving (no chart)
//   Housekeeping  — Front Desk only: plan who cleans which rooms, simplified; same functions as the manager page
//   Logbook       — Sprint 26: the Log Book. Front Desk gets the full page (same as managers for now); every other employee sees "under construction" until
//                   the staff side (what they may read / acknowledge) is built. It took the place of the old staff Calendar tab.
//   Settings      — the existing staff page, unchanged
//
// The server enforces the same split: `/api/frontdesk/*` needs the Front Desk role / department (carried in the token) or a manager.
// `preview` (dev only, from the AdminShell's "View as → Front desk"): the dev sees exactly this portal as a front-desk employee would.
const NAV = [
  { view: 'home',         label: 'Home',         icon: 'home',      live: true, mobilePrimary: true },
  { view: 'reservations', label: 'Reservations', icon: 'calendar',  live: true, mobilePrimary: true, frontDeskOnly: true },
  { view: 'housekeeping', label: 'Housekeeping', icon: 'timesheet', live: true, mobilePrimary: true, frontDeskOnly: true },
  { view: 'logbook',      label: 'Logbook',      icon: 'logbook',   live: true, mobilePrimary: true },
  { view: 'settings',     label: 'Settings',     icon: 'settings',  hideInPreview: true },   // a dev has no staff profile to edit
];

// Housekeeping reads/writes through the front-desk routes and uses the simplified layout (see Housekeeping `simple`).
const PortalHousekeeping = (props) => <Housekeeping {...props} mode="manager" apiBase="/frontdesk" simple />;

// The Log Book reads / writes through the front-desk routes. Anyone who is not Front Desk gets the placeholder (the server would refuse the data anyway).
const PortalLogBook = () => {
  const { user } = useAuth();
  const preview = usePortalPreview();
  return (preview || isFrontDesk(user))
    ? <LogBook apiBase="/frontdesk" />
    : <div className="lb-soon"><ComingSoon title="Logbook" description="The Logbook is under construction for staff — some of its features are not ready for you to read or change yet." planned="Coming soon" /></div>;
};

const VIEWS = {
  home:         PortalHome,
  reservations: PortalReservations,
  housekeeping: PortalHousekeeping,
  logbook:      PortalLogBook,
  settings:     Settings,
};
const ACTIVE_PARENT = {};

const Body = ({ theme, onToggleTheme, preview }) => {
  const { view, goTo } = useView();
  const { user } = useAuth();
  const deskStaff = !!preview || isFrontDesk(user);
  const navItems = NAV.filter(n => (!n.frontDeskOnly || deskStaff) && !(preview && n.hideInPreview));
  // a view the person's department can't see falls back to Home (the server would refuse the data anyway)
  const allowed = navItems.some(n => n.view === view.name) || !NAV.some(n => n.view === view.name);
  const name = allowed ? view.name : 'home';
  const Component = VIEWS[name] || VIEWS.home;
  const activeNav = ACTIVE_PARENT[name] || name;
  return (
    <div className="app-shell">
      <Sidebar
        navItems={navItems}
        currentView={activeNav}
        onNavigate={goTo}
        role="staff"
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <main className="app-main">
        {preview && preview.bar}
        <Component theme={theme} onToggleTheme={onToggleTheme} role="staff" {...(allowed ? view.params : {})} />
      </main>
    </div>
  );
};

// No shell-level idle auto-logout here (the clock-in kiosk has one): a desk PC stays signed in for the shift; the 8-hour token still expires.
const StaffPortalShell = ({ theme, onToggleTheme, preview = null }) => (
  <PortalPreviewContext.Provider value={preview}>
    <ViewProvider initialView="home">
      <Body theme={theme} onToggleTheme={onToggleTheme} preview={preview} />
    </ViewProvider>
  </PortalPreviewContext.Provider>
);

export default StaffPortalShell;
