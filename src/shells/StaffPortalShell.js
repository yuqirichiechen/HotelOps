import React, { useEffect, useState } from 'react';
import { ViewProvider, useView } from './ViewContext';
import { useAuth, hasPage, apiFetch } from '../auth';
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
//   Reservations  — only when the department's View switches it on (Front Desk's does): today's five tiles + sellable-vs-arriving (no chart)
//   Housekeeping  — only when the View switches it on: plan who cleans which rooms, simplified; same functions as the manager page
//   Logbook       — Sprint 26: the Log Book. People whose View switches it on get the full page (same as managers for now); every other employee sees "under
//                   construction" until the staff side (what they may read / acknowledge) is built. It took the place of the old staff Calendar tab.
//   Settings      — the existing staff page, unchanged
//
// The server enforces the same split: `/api/frontdesk/*` needs the matching page in the token (28.10: from the department's View) or a manager.
// `preview` (dev only, from the AdminShell's "View as → Front desk"): the dev sees exactly this portal as a front-desk employee would (every page on).
const NAV = [
  { view: 'home',         label: 'Home',         icon: 'home',      live: true, mobilePrimary: true },
  { view: 'reservations', label: 'Reservations', icon: 'ticket',    live: true, mobilePrimary: true, page: 'reservations' },
  { view: 'housekeeping', label: 'Housekeeping', icon: 'bed',       live: true, mobilePrimary: true, page: 'housekeeping' },
  { view: 'logbook',      label: 'Logbook',      icon: 'notebook',  live: true, mobilePrimary: true },
  { view: 'settings',     label: 'Settings',     icon: 'gear',      hideInPreview: true },   // a dev has no staff profile to edit
];

// Housekeeping reads/writes through the front-desk routes and uses the simplified layout (see Housekeeping `simple`).
const PortalHousekeeping = (props) => <Housekeeping {...props} mode="manager" apiBase="/frontdesk" simple />;

// The Log Book reads / writes through the staff-portal routes. Anyone whose View does not switch the Logbook on gets the placeholder (the server would refuse the data anyway).
const PortalLogBook = () => {
  const { user } = useAuth();
  const preview = usePortalPreview();
  return (preview || hasPage(user, 'logbook'))
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
  const can = (key) => !!preview || hasPage(user, key);   // 28.10: the pages this person's department View switches on (a dev preview sees them all)
  // Sprint 26.1: notes sent to this front-desk person that they have not looked at yet → a badge on the Logbook tab. Read once when the portal opens (that is "when they
  // log in"); the Log Book page tells us when the number changes (event below) — no timers.
  const [logbookNew, setLogbookNew] = useState(0);
  useEffect(() => {
    if (!can('logbook') || preview) return undefined;
    let alive = true;
    apiFetch('/frontdesk/logbook/unread').then(({ ok, data }) => { if (alive && ok && data?.success) setLogbookNew(data.count || 0); }).catch(() => {});
    const on = (e) => setLogbookNew((e.detail && e.detail.count) || 0);
    window.addEventListener('hotelops:logbook-unread', on);
    return () => { alive = false; window.removeEventListener('hotelops:logbook-unread', on); };
  }, [user, preview]);   // eslint-disable-line react-hooks/exhaustive-deps
  const navItems = NAV.filter(n => (!n.page || can(n.page)) && !(preview && n.hideInPreview));
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
        badges={{ logbook: logbookNew }}
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
