// Sprint 22.6 — the Dev tool pages that live INSIDE the admin shell (nav group "Dev tools", visible to dev sessions only).
import React from 'react';
import SyncPanel from '../../components/Forecasting/SyncPanel';
import ForecastSettings from '../../components/Forecasting/ForecastSettings';
import DevLogs from './DevLogs';
import DevPlatform from './DevPlatform';
import './DevPages.css';

const Page = ({ title, children }) => (<div className="dv-page"><h1>{title}</h1>{children}</div>);

export const DevSync = () => <Page title="Auto-sync"><SyncPanel /></Page>;
export const DevForecastSettings = () => <Page title="Forecast settings"><ForecastSettings inline showSync={false} /></Page>;
export const DevLogsView = DevLogs;
export const DevPlatformView = () => <Page title="Platform"><DevPlatform /></Page>;
