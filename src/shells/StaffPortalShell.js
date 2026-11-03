import React from 'react';
import { ViewProvider, useView } from './ViewContext';
import { useAuth, isFrontDesk } from '../auth';
import Sidebar from '../components/Layout/Sidebar';
import PortalHome from '../pages/PortalHome';
import Housekeeping from '../components/Housekeeping';
import Timesheet from '../pages/Timesheet';
import StaffCalendar from '../pages/StaffCalendar';
import NotesPage from '../pages/NotesPage';
import Settings from '../pages/Settings';

// Sprint 24 / 24.1: the staff portal (`/:tenant/staff`) — what "Staff login" opens, for EVERY employee. (The other door, `/:tenant/clockin`,
// is clock in / out only; it replaced the old multi-page staff shell, whose pages now live here.) Same single-URL pattern as the other
// shells: sidebar clicks set view state.
//
//   Home          — greeting, this-week hours, recent shifts (NO clocking: that is the Clock in door) + for the Front Desk department
//                   today's tiles and sellable-vs-arriving
//   Housekeeping  — Front Desk department only: plan who cleans which rooms, simplified; same functions as the manager page
//   Timesheet · Calendar · Settings — the existing staff pages, unchanged
//
// The server enforces the same split: `/api/frontdesk/*` needs the Front Desk department (carried in the token) or a manager.
const NAV = [
  { view: 'home',         label: 'Home',         icon: 'home',      live: true, mobilePrimary: true },
  { view: 'housekeeping', label: 'Housekeeping', icon: 'timesheet', live: true, mobilePrimary: true, frontDeskOnly: true },
  { view: 'timesheet',    label: 'Timesheet',    icon: 'timesheet', live: true, mobilePrimary: true },
  { view: 'calendar',     label: 'Calendar',     icon: 'calendar',  live: true, mobilePrimary: true },
  { view: 'settings',     label: 'Settings',     icon: 'settings' },
];

// Housekeeping reads/writes through the front-desk routes and uses the simplified layout (see Housekeeping `simple`).
const PortalHousekeeping = (props) => <Housekeeping {...props} mode="manager" apiBase="/frontdesk" simple />;

const VIEWS = {
  home:         PortalHome,
  housekeeping: PortalHousekeeping,
  timesheet:    Timesheet,
  calendar:     StaffCalendar,
  notes:        NotesPage,
  settings:     Settings,
};
const ACTIVE_PARENT = { notes: 'calendar' };

const Body = ({ theme, onToggleTheme }) => {
  const { view, goTo } = useView();
  const { user } = useAuth();
  const deskStaff = isFrontDesk(user);
  const navItems = NAV.filter(n => !n.frontDeskOnly || deskStaff);
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
        <Component theme={theme} onToggleTheme={onToggleTheme} role="staff" {...(allowed ? view.params : {})} />
      </main>
    </div>
  );
};

// No shell-level idle auto-logout here (the clock-in kiosk has one): a desk PC stays signed in for the shift; the 8-hour token still expires.
const StaffPortalShell = ({ theme, onToggleTheme }) => (
  <ViewProvider initialView="home">
    <Body theme={theme} onToggleTheme={onToggleTheme} />
  </ViewProvider>
);

export default StaffPortalShell;
