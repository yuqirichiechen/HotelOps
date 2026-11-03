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
import Housekeeping from '../components/Housekeeping'; // Sprint 23 — assign housekeepers to rooms
import StaffPortalShell from './StaffPortalShell';       // Sprint 24.3 — dev "View as → Front desk"
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
  { view: 'housekeeping', label: 'Housekeeping', icon: 'timesheet', live: true },   // Sprint 23
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
  housekeeping: Housekeeping, // Sprint 23: who cleans which rooms + printable sheets
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
// Sprint 23.8: the switch is a big two-button control in a coloured bar (purple = Dev, teal = Manager) so the current view is obvious at a glance.
const VIEW_AS_KEY = 'hotelops-view-as';
// Sprint 24.3: a third view — 'frontdesk' = the staff portal as a front-desk employee sees it (no sign-in as an employee needed). Later views (e.g. plain staff) slot in the same way.
const readViewAs = () => { try { const v = sessionStorage.getItem(VIEW_AS_KEY); return v === 'manager' || v === 'frontdesk' ? v : 'full'; } catch { return 'full'; } };

const Body = ({ theme, onToggleTheme }) => {
  const { view, goTo } = useView();
  const { user } = useAuth();
  const nav = useNavigate();
  const isDev = !!(user && user.role === 'dev');
  const [viewAs, setViewAsRaw] = useState(readViewAs);
  const setViewAs = (v) => { setViewAsRaw(v); try { sessionStorage.setItem(VIEW_AS_KEY, v); } catch { /* ignore */ } };
  const mode = isDev && viewAs === 'full' ? 'dev' : 'manager';
  const deskView = isDev && viewAs === 'frontdesk';
  const devView = !!DEV_VIEWS[view.name];
  const Component = (devView && isDev) ? DEV_VIEWS[view.name] : (VIEWS[view.name] || VIEWS.home);
  const activeNav = ACTIVE_PARENT[view.name] || (devView && !isDev ? 'home' : view.name);
  const navItems = isDev ? [...NAV, ...DEV_NAV] : NAV;
  const viewNow = deskView ? 'Front desk' : mode === 'dev' ? 'Dev' : 'Manager';   // Sprint 24.4: short — the three buttons carry no descriptions
  const devBar = !isDev ? null : (
    <div className={`dvb ${deskView ? 'is-frontdesk' : mode === 'dev' ? 'is-full' : 'is-manager'}`} role="region" aria-label="Dev view controls">
      <div className="dvb-id">
        <span className="dvb-tag">DEV</span>
        <span className="dvb-now">You are viewing as <b>{viewNow}</b></span>
      </div>
      <div className="dvb-switch" role="group" aria-label="View as">
        <button type="button" data-view="full" className={viewAs === 'full' ? 'on' : ''} aria-pressed={viewAs === 'full'} onClick={() => setViewAs('full')}>
          <svg className="dvb-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.5 2.5-2.4-.6-.6-2.4z" /></svg>
          <span className="dvb-txt"><b>Dev view</b></span>
        </button>
        <button type="button" data-view="manager" className={viewAs === 'manager' ? 'on' : ''} aria-pressed={viewAs === 'manager'} onClick={() => setViewAs('manager')}>
          <svg className="dvb-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
          <span className="dvb-txt"><b>Manager view</b></span>
        </button>
        <button type="button" data-view="frontdesk" className={viewAs === 'frontdesk' ? 'on' : ''} aria-pressed={viewAs === 'frontdesk'} onClick={() => setViewAs('frontdesk')}>
          <svg className="dvb-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="5.5" width="14" height="16" rx="2.2" /><path d="M9 2.5h6" /><circle cx="12" cy="11.2" r="2.3" /><path d="M8.2 18c.5-2 2-3 3.8-3s3.3 1 3.8 3" /></svg>
          <span className="dvb-txt"><b>Front desk view</b></span>
        </button>
      </div>
      <button type="button" className="dvb-prop" onClick={() => nav('/dev')}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4" /></svg>
        Switch property
      </button>
    </div>
  );
  // Sprint 24.3: the front-desk view is the real staff portal, with this same bar on top so you can switch back.
  if (deskView) return <StaffPortalShell theme={theme} onToggleTheme={onToggleTheme} preview={{ bar: devBar }} />;
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
        {devBar}
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
