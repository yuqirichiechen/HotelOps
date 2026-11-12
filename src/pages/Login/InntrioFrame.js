// Sprint 27.1 — the shell every Inntrio login screen shares: the navy scene, the top bar (the Inntrio logo on the left, "Hospitality management platform" in
// gold on the right) and the property bar. History: 27.2 removed "Secure access" + date/time and the 1-2-3 step line; 27.3 the top-right "Access options";
// 27.4 the big centred logo (masthead) and the tagline-in-logo variant. Pure UI: no auth, no routing — screens pass callbacks.
import React, { useEffect, useState } from 'react';
import Icon from './InntrioIcons';
import './Inntrio.css';

export const LOGO_SRC = '/inntrio/Inntrio-logo-dark.svg';   // the white-and-gold wordmark for dark backgrounds (public/inntrio/*)
export const TAGLINE = 'Hospitality management platform';

// "Thu, Nov 12, 1:23 AM PT" — the property's wall clock (the hotel is in Pacific time)
export const formatPT = (d = new Date()) => {
  try {
    return `${new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).format(d)} PT`;
  } catch { return ''; }
};
export const usePTClock = () => {
  const [now, setNow] = useState(() => formatPT());
  useEffect(() => { const id = setInterval(() => setNow(formatPT()), 30000); return () => clearInterval(id); }, []);
  return now;
};

// the property's mark: its own logo on a white chip when it has one, else the generic building tile
// `shared` gives it the view-transition name that lets it glide from the picker row into the property bar (names must be unique on a page: only the chosen row)
export const PropertyMark = ({ tenant, iconSize = 25, shared = false }) => {
  const style = shared ? { viewTransitionName: 'in-property' } : undefined;
  return tenant && tenant.logoUrl
    ? <span className="in-logo-chip" style={style}><img src={tenant.logoUrl} alt={tenant.name} /></span>
    : <span className="in-tile-ico" style={style}><Icon name="hotel" size={iconSize} /></span>;
};

export const PropertyBar = ({ tenant, onChange }) => (
  <div className="in-selected-bar">
    <PropertyMark tenant={tenant} shared />
    <span className="in-bar-text"><b className="in-property-title">{tenant.name}</b><small className="in-property-sub">{tenant.location || ''}</small></span>
    <div className="in-spacer" />
    <button className="in-change" type="button" onClick={onChange}><Icon name="swap" size={17} /> <span>Change property</span></button>
  </div>
);

// the navy waves + gold curves (also the backdrop of the welcome splash)
export const Scene = () => (
  <div className="in-scene" aria-hidden="true">
        <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="inBlueWave" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#245889" stopOpacity=".56" /><stop offset=".58" stopColor="#1b3c60" stopOpacity=".22" /><stop offset="1" stopColor="#051525" stopOpacity=".17" /></linearGradient>
            <linearGradient id="inGoldCurve" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#7f5830" stopOpacity=".03" /><stop offset=".27" stopColor="#d2a967" stopOpacity=".8" /><stop offset=".42" stopColor="#fff1c7" /><stop offset=".50" stopColor="#d4a65a" /><stop offset=".75" stopColor="#b38a4b" stopOpacity=".55" /><stop offset="1" stopColor="#d5b379" stopOpacity=".07" /></linearGradient>
            <filter id="inGoldGlow"><feGaussianBlur stdDeviation="6" /></filter>
          </defs>
          <path d="M-120 200 Q230 -40 515 -100 T1170 -100 L1490 -190 L1490 0 Q1040 80 700 80 T-120 350Z" fill="url(#inBlueWave)" opacity=".7" />
          <path d="M-180 245 Q175 38 420 2 T1180 -126" fill="none" stroke="url(#inGoldCurve)" strokeWidth="7" filter="url(#inGoldGlow)" opacity=".53" />
          <path d="M-180 245 Q175 38 420 2 T1180 -126" fill="none" stroke="url(#inGoldCurve)" strokeWidth="1.6" opacity=".9" />
          <path d="M-80 850 Q210 700 510 850 T1140 835 Q1300 780 1515 650 L1510 1040 L-80 1040Z" fill="url(#inBlueWave)" opacity=".47" />
          <path d="M-80 895 Q280 760 530 895 T1130 877 Q1360 790 1515 702" fill="none" stroke="url(#inGoldCurve)" strokeWidth="7" filter="url(#inGoldGlow)" opacity=".53" />
          <path d="M-80 895 Q280 760 530 895 T1130 877 Q1360 790 1515 702" fill="none" stroke="url(#inGoldCurve)" strokeWidth="1.35" opacity=".82" />
        </svg>
  </div>
);

// step: 'property' | 'access' | 'signin' | 'clock'
const AuthFrame = ({ step, children }) => {
  // Entrance animation (staggered fade-up) only for a screen that is NOT arriving through a view transition (first load / browsers without the API).
  // Decided ONCE at mount: toggling it later would restart the CSS animation and make the screen animate twice (the 27.3 bug).
  const [enter] = useState(() => typeof document === 'undefined' || !document.documentElement.dataset.vt);
  return (
    <div className={`in-root${enter ? ' in-enter' : ''}`}>
      <Scene />
      <div className="in-container">
        <header className="in-topnav">
          <div className="in-brand"><img src={LOGO_SRC} alt="Inntrio" /></div>
          <div className="in-tagline">{TAGLINE}</div>
        </header>
        <main className={`in-layout in-step-${step}`}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default AuthFrame;
