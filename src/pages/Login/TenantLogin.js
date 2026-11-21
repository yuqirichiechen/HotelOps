import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { resolveTenant, TENANT } from '../../config/tenant';
import StaffLogin from './StaffLogin';
import StaffPortalLogin from './StaffPortalLogin';
import AdminLogin from './AdminLogin';
import DevLogin from './DevLogin';
import AuthFrame, { PropertyBar } from './InntrioFrame';
import Icon from './InntrioIcons';
import { withTransition } from './viewTransition';

// Sprint 27.1 — `/:tenant/login` is steps 2 and 3 of the Inntrio login (step 1, the property, is `/`):
//   'access'  — "How would you like to continue?": Clock in / out · Staff sign-in · Manager sign-in · Developer sign-in
//   'clockin' — the numpad (clock in / out door)        'staff' — Staff sign-in (PC form → staff portal)
//   'admin'   — Manager sign-in                         'dev'   — Developer sign-in
// Sprint 29.3: the screen is read FROM THE ADDRESS (`?mode=clockin|staff|admin|dev`; no mode = the access chooser) instead of living only in memory. Moving between the screens
// REPLACES the address (no history entries), so nothing about Back changes — but a reload, a tablet restoring its tab, or a restart now comes back to the SAME screen. Before this, a
// reload on the keypad silently dropped the tablet back to the access chooser ("it keeps going back to the previous page"). The clock-in door also uses `?mode=clockin` to bring the
// kiosk straight back to the keypad after a session ends (Sprint 27.1). The credentials/redirect logic lives in the four screens, unchanged.
export const MODES = ['clockin', 'staff', 'admin', 'dev'];

export const CHOICES = [
  { mode: 'clockin', title: 'Clock in & out',    desc: 'Use the familiar keypad to record your shift.', icon: 'clock' },
  { mode: 'staff',   title: 'Staff sign-in',     desc: 'Schedules, hours, and team updates.',            icon: 'users' },
  { mode: 'admin',   title: 'Manager sign-in',   desc: 'Staff management and hotel operations.',         icon: 'shield' },
  { mode: 'dev',     title: 'Developer sign-in', desc: 'Authorized developer tools and integrations.',   icon: 'code' },
];

const AccessChooser = ({ tenant, onPick, onChangeProperty }) => (
  <AuthFrame step="access">
    <PropertyBar tenant={tenant} onChange={onChangeProperty} />
    <h1 className="in-h1">How would you like to continue?</h1>
    <p className="in-subtitle">Choose an access method for {tenant.name}.</p>
    <div className="in-gap-lg" />
    <div className="in-choices-wrap">
      <div className="in-choices-grid">
        {CHOICES.map(c => (
          <button key={c.mode} type="button" data-mode={c.mode} className="in-choice" onClick={() => onPick(c.mode)}>
            <span className="in-choice-icon"><Icon name={c.icon} size={27} /></span>
            <span><span className="in-choice-title">{c.title}</span><span className="in-choice-desc">{c.desc}</span></span>
            <Icon name="arrow" size={22} />
          </button>
        ))}
      </div>
    </div>
  </AuthFrame>
);

const TenantLogin = () => {
  const nav = useNavigate();
  const { tenant: slug } = useParams();
  const tenant = resolveTenant(slug) || TENANT;
  const [params, setParams] = useSearchParams();
  const mode = MODES.includes(params.get('mode')) ? params.get('mode') : 'access';
  const setMode = (m) => setParams(m === 'access' ? {} : { mode: m }, { replace: true });
  // Sprint 27.3: every move is a directional transition — into a screen slides forward, back out of it slides back
  const toAccess = () => withTransition(() => setMode('access'), 'back');
  const toProperty = () => withTransition(() => nav('/'), 'back');
  const pick = (m) => withTransition(() => setMode(m), 'forward');

  if (mode === 'clockin') return <StaffLogin onBack={toAccess} onChangeProperty={toProperty} />;
  if (mode === 'staff')   return <StaffPortalLogin onBack={toAccess} onChangeProperty={toProperty} />;
  if (mode === 'admin')   return <AdminLogin onBack={toAccess} onChangeProperty={toProperty} />;
  if (mode === 'dev')     return <DevLogin onBack={toAccess} onChangeProperty={toProperty} />;
  return <AccessChooser tenant={tenant} onPick={pick} onChangeProperty={toProperty} />;
};

export default TenantLogin;
