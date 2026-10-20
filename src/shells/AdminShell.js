import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ViewProvider, useView } from './ViewContext';
import { useAuth } from '../auth';
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
import { DevSync, DevForecastSettings, DevLogsView, DevPlatformView } from '../pages/Dev/DevViews';
import '../pages/Dev/DevPages.css';
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
  // Sprint 18.11: Staff promoted into the mobile primary tabs (it's
  // the most-used admin page on phones — manual time-entry adds,
  // OT approval, recent-hires lookups). Forecast moves into the More
  // sheet since the GM rarely opens it from a phone.
  { view: 'staff',     label: 'Staff',     icon: 'stafficon',  live: true, mobilePrimary: true },
  { view: 'calendar',  label: 'Calendar',  icon: 'calendar',   live: true, mobilePrimary: true },
  // Sprint 17.11: split the prior "Forecast" nav item in two.
  // "Reservations" = booking-list / arrivals-detail view (the page
  // previously labelled Forecast). "Forecast" = room-type
  // availability projection (new page). Both share the same scrape.
  { view: 'reservations', label: 'Reservations', icon: 'calendar', live: true, mobilePrimary: true },
  { view: 'forecast',     label: 'Forecast',     icon: 'calendar', live: true },
  { view: 'reports',   label: 'Logbook',   icon: 'logbook' },
  { view: 'assistant', label: 'Assistant', icon: 'assistant' },
  { view: 'settings',  label: 'Settings',  icon: 'settings',   live: true },
];

// Sprint 22.6 — the "Dev tools" group: ONE shell for managers and dev. A dev session sees these extra items (and may switch the pages
// between the full dev view and what a manager sees); a manager session never gets them, and the server refuses their data routes.
const DEV_NAV = [
  { view: 'devsync',     label: 'Auto-sync',         icon: 'settings', section: 'Dev tools' },
  { view: 'devlogs',     label: 'Logs',              icon: 'logbook' },
  { view: 'devsettings', label: 'Forecast settings', icon: 'settings' },
  { view: 'devplatform', label: 'Platform',          icon: 'settings' },
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
const DEV_VIEWS = {
  devsync: DevSync, devlogs: DevLogsView, devsettings: DevForecastSettings, devplatform: DevPlatformView,
};

const ACTIVE_PARENT = {
  staffDetail: 'staff',
  // Sprint 14: the Shift Sheet opens from the Calendar header's
  // Assign pill — keep the Calendar nav item highlighted while
  // the sheet is on screen.
  sheet:       'calendar',
};

// "View as" (dev only): Full = every detail and debug control; Manager = exactly what a manager sees. Remembered for the browser session.
const VIEW_AS_KEY = 'hotelops-view-as';
const readViewAs = () => { try { return sessionStorage.getItem(VIEW_AS_KEY) === 'manager' ? 'manager' : 'full'; } catch { return 'full'; } };

const Body = ({ theme, onToggleTheme }) => {
  const { view, goTo } = useView();
  const { user } = useAuth();
  const nav = useNavigate();
  const isDev = !!(user && user.role === 'dev');
  const [viewAs, setViewAsRaw] = useState(readViewAs);
  const setViewAs = (v) => { setViewAsRaw(v); try { sessionStorage.setItem(VIEW_AS_KEY, v); } catch { /* ignore */ } };
  const mode = isDev && viewAs === 'full' ? 'dev' : 'manager';
  const devView = !!DEV_VIEWS[view.name];
  const Component = (devView && isDev) ? DEV_VIEWS[view.name] : (VIEWS[view.name] || VIEWS.home);
  const activeNav = ACTIVE_PARENT[view.name] || (devView && !isDev ? 'home' : view.name);
  const navItems = isDev ? [...NAV, ...DEV_NAV] : NAV;
  return (
    <div className="app-shell">
      <Sidebar
        navItems={navItems}
        currentView={activeNav}
        onNavigate={goTo}
        role="admin"
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <main className="app-main">
        {isDev && (
          <div className="dv-viewbar" role="region" aria-label="Dev view controls">
            <span className="dv-tag">DEV</span>
            <span>View as</span>
            <span className="dv-seg" role="group" aria-label="View as">
              <button type="button" className={viewAs === 'full' ? 'on' : ''} aria-pressed={viewAs === 'full'} onClick={() => setViewAs('full')}>Full</button>
              <button type="button" className={viewAs === 'manager' ? 'on' : ''} aria-pressed={viewAs === 'manager'} onClick={() => setViewAs('manager')}>Manager</button>
            </span>
            <button type="button" className="dv-link" onClick={() => nav('/dev')}>Switch property</button>
          </div>
        )}
        <Component theme={theme} onToggleTheme={onToggleTheme} role="admin" mode={mode} {...view.params} />
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
