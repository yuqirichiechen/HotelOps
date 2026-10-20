// Sprint 22.4 — the Dev area (/dev). Server-verified `dev` role (see DevLogin). It holds everything technical that managers no longer see:
// Auto-sync health + settings, Forecast settings (labor / late bookings / mapping), Logs, platform settings — plus the FULL Reservations and
// Forecast pages (mode="dev": every detail and debug control). Managers get simplified versions of those two pages (Sprint 22.5); the split is
// fixed in code, not a toggle.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { ViewProvider, useView } from '../../shells/ViewContext';
import HotelOpsLogo from '../../components/shared/HotelOpsLogo';
import SyncPanel from '../../components/Forecasting/SyncPanel';
import ForecastSettings from '../../components/Forecasting/ForecastSettings';
import Forecasting from '../../components/Forecasting';
import Forecast from '../../components/Forecast';
import DevLogs from './DevLogs';
import DevPlatform from './DevPlatform';
import './DevShell.css';

const NAV = [
  { view: 'sync', label: 'Auto-sync' },
  { view: 'reservations', label: 'Reservations' },
  { view: 'forecast', label: 'Forecast' },
  { view: 'settings', label: 'Settings' },
  { view: 'logs', label: 'Logs' },
  { view: 'platform', label: 'Platform' },
];

const Page = ({ title, children }) => (<div className="dv-page"><h1>{title}</h1>{children}</div>);
const VIEWS = {
  home: () => <Page title="Auto-sync"><SyncPanel /></Page>,
  sync: () => <Page title="Auto-sync"><SyncPanel /></Page>,
  reservations: () => <Forecasting mode="dev" />,
  forecast: () => <Forecast mode="dev" />,
  settings: () => <Page title="Forecast settings"><ForecastSettings inline showSync={false} /></Page>,
  logs: DevLogs,
  platform: () => <Page title="Platform"><DevPlatform /></Page>,
};

const Body = () => {
  const { view, goTo } = useView();
  const { logout } = useAuth();
  const nav = useNavigate();
  const Component = VIEWS[view.name] || VIEWS.home;
  const active = view.name === 'home' ? 'sync' : view.name;
  const signOut = async () => { await logout(); nav('/login/dev', { replace: true }); };
  return (
    <div className="dv-shell">
      <header className="dv-bar">
        <div className="dv-brand"><HotelOpsLogo size="sm" /><span className="dv-badge">DEV</span></div>
        <nav className="dv-nav" aria-label="Dev sections">
          {NAV.map(n => <button key={n.view} type="button" className={active === n.view ? 'on' : ''} aria-current={active === n.view ? 'page' : undefined} onClick={() => goTo(n.view)}>{n.label}</button>)}
        </nav>
        <button type="button" className="dv-signout" onClick={signOut}>Sign out</button>
      </header>
      <main className="dv-main"><Component /></main>
    </div>
  );
};

const DevShell = () => (<ViewProvider initialView="sync"><Body /></ViewProvider>);
export default DevShell;
