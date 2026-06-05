import React from 'react';
import { ViewProvider, useView } from './ViewContext';
import Sidebar from '../components/Layout/Sidebar';
import AdminHome from '../pages/AdminHome';
import StaffManager from '../components/AdminPanel/StaffManager';
import StaffDetail from '../components/AdminPanel/StaffDetail';
import SchedulingManager from '../components/AdminPanel/Calendar';
import AdminReports from '../pages/AdminReports';
import Assistant from '../pages/Assistant';
import AdminSettings from '../components/AdminPanel/AdminSettings';
import ShiftSheet from '../pages/ShiftSheet';
import Forecasting from '../components/Forecasting'; // Sprint 17.3 — reservations overview (renamed in 17.11)
import Forecast    from '../components/Forecast';    // Sprint 17.11 — room-type availability forecast
// Sprint 12.1: NotesPage no longer reachable from the admin shell —
// handoff notes moved to the Logbook surface (AdminReports). Staff
// shell still maps view='notes' to NotesPage for the staff calendar
// "view all notes" link.

// Sprint 11.2.1: admin app is a single URL (`/:tenant/admin`).
// Sub-views (StaffDetail, NotesPage) carry their identifiers through
// view params instead of URL params.

// Sprint 11.6: nav `icon` is now an icon *base name* — Sidebar
// resolves it to `/logo/<base>_<dark|light>.png` based on the
// active theme. PNGs live in /public/logo/. "Reports" relabelled
// to "Logbook" in step with the icon swap (a Sprint 12 surface
// rebuild lands in the next iteration).
// Sprint 17.4: `mobilePrimary` marks items that show in the mobile
// bottom tab bar. Items without the flag collapse into a "More"
// sheet (slides up from the bottom nav). Desktop sidebar still
// shows everything — the flag is mobile-only.
const NAV = [
  { view: 'home',      label: 'Home',      icon: 'home',       live: true, mobilePrimary: true },
  { view: 'staff',     label: 'Staff',     icon: 'stafficon',  live: true },
  { view: 'calendar',  label: 'Calendar',  icon: 'calendar',   live: true, mobilePrimary: true },
  // Sprint 17.11: split the prior "Forecast" nav item in two.
  // "Reservations" = booking-list / arrivals-detail view (the page
  // previously labelled Forecast). "Forecast" = room-type
  // availability projection (new page). Both share the same scrape.
  { view: 'reservations', label: 'Reservations', icon: 'calendar', live: true, mobilePrimary: true },
  { view: 'forecast',     label: 'Forecast',     icon: 'calendar', live: true, mobilePrimary: true },
  { view: 'reports',   label: 'Logbook',   icon: 'logbook' },
  { view: 'assistant', label: 'Assistant', icon: 'assistant' },
  { view: 'settings',  label: 'Settings',  icon: 'settings',   live: true },
];

const VIEWS = {
  home:        AdminHome,
  staff:       StaffManager,
  staffDetail: StaffDetail,
  calendar:    SchedulingManager,
  sheet:       ShiftSheet,
  reservations: Forecasting, // Sprint 17.11: was 'forecast' → 'reservations'
  forecast:     Forecast,    // Sprint 17.11: room-type availability page
  reports:     AdminReports,
  assistant:   Assistant,
  settings:    AdminSettings,
};

const ACTIVE_PARENT = {
  staffDetail: 'staff',
  // Sprint 14: the Shift Sheet opens from the Calendar header's
  // Assign pill — keep the Calendar nav item highlighted while
  // the sheet is on screen.
  sheet:       'calendar',
};

const Body = ({ theme, onToggleTheme }) => {
  const { view, goTo } = useView();
  const Component = VIEWS[view.name] || VIEWS.home;
  const activeNav = ACTIVE_PARENT[view.name] || view.name;
  return (
    <div className="app-shell">
      <Sidebar
        navItems={NAV}
        currentView={activeNav}
        onNavigate={goTo}
        role="admin"
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <main className="app-main">
        <Component theme={theme} onToggleTheme={onToggleTheme} role="admin" {...view.params} />
      </main>
    </div>
  );
};

const AdminShell = ({ theme, onToggleTheme }) => (
  <ViewProvider initialView="home">
    <Body theme={theme} onToggleTheme={onToggleTheme} />
  </ViewProvider>
);

export default AdminShell;
