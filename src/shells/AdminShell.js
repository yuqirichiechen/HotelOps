import React from 'react';
import { ViewProvider, useView } from './ViewContext';
import Sidebar from '../components/Layout/Sidebar';
import AdminHome from '../pages/AdminHome';
import StaffManager from '../components/AdminPanel/StaffManager';
import StaffDetail from '../components/AdminPanel/StaffDetail';
import SchedulingManager from '../components/AdminPanel/Calendar';
import NotesPage from '../pages/NotesPage';
import AdminReports from '../pages/AdminReports';
import Assistant from '../pages/Assistant';
import AdminSettings from '../components/AdminPanel/AdminSettings';

// Sprint 11.2.1: admin app is a single URL (`/:tenant/admin`).
// Sub-views (StaffDetail, NotesPage) carry their identifiers through
// view params instead of URL params.

// Sprint 11.6: nav `icon` is now an icon *base name* — Sidebar
// resolves it to `/logo/<base>_<dark|light>.png` based on the
// active theme. PNGs live in /public/logo/. "Reports" relabelled
// to "Logbook" in step with the icon swap (a Sprint 12 surface
// rebuild lands in the next iteration).
const NAV = [
  { view: 'home',      label: 'Home',      icon: 'home',       live: true },
  { view: 'staff',     label: 'Staff',     icon: 'stafficon',  live: true },
  { view: 'calendar',  label: 'Calendar',  icon: 'calendar',   live: true },
  { view: 'reports',   label: 'Logbook',   icon: 'logbook' },
  { view: 'assistant', label: 'Assistant', icon: 'assistant' },
  { view: 'settings',  label: 'Settings',  icon: 'settings',   live: true },
];

const VIEWS = {
  home:        AdminHome,
  staff:       StaffManager,
  staffDetail: StaffDetail,
  calendar:    SchedulingManager,
  notes:       NotesPage,
  reports:     AdminReports,
  assistant:   Assistant,
  settings:    AdminSettings,
};

const ACTIVE_PARENT = {
  staffDetail: 'staff',
  notes:       'calendar',
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
