import React from 'react';
import { ViewProvider, useView } from './ViewContext';
import Sidebar from '../components/Layout/Sidebar';
import Home from '../pages/Home';
import Timesheet from '../pages/Timesheet';
import StaffCalendar from '../pages/StaffCalendar';
import NotesPage from '../pages/NotesPage';
import Settings from '../pages/Settings';

// Sprint 11.2.1: the staff side of the app is a single URL
// (`/:tenant/staff`). Sidebar clicks set view state instead of
// navigating; the URL never changes after login.

const NAV = [
  { view: 'home',      label: 'Home',      icon: '🏠', live: true },
  { view: 'timesheet', label: 'Timesheet', icon: '⏱️', live: true },
  { view: 'calendar',  label: 'Calendar',  icon: '📅', live: true },
  { view: 'settings',  label: 'Settings',  icon: '⚙️' },
];

const VIEWS = {
  home:      Home,
  timesheet: Timesheet,
  calendar:  StaffCalendar,
  notes:     NotesPage,
  settings:  Settings,
};

// Sub-views map to which sidebar item should appear "active" while
// they're on screen — e.g. NotesPage is reached from Calendar, so
// the Calendar nav stays highlighted while you're reading notes.
const ACTIVE_PARENT = {
  notes: 'calendar',
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
        role="staff"
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <main className="app-main">
        <Component theme={theme} onToggleTheme={onToggleTheme} role="staff" {...view.params} />
      </main>
    </div>
  );
};

const StaffShell = ({ theme, onToggleTheme }) => (
  <ViewProvider initialView="home">
    <Body theme={theme} onToggleTheme={onToggleTheme} />
  </ViewProvider>
);

export default StaffShell;
