import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { KNOWN_TENANTS } from '../../config/tenant';
import HotelOpsLogo from '../../components/shared/HotelOpsLogo';
import { TransitionLink } from './TransitionLink';
import './Login.css';
import '../../components/shared/HotelOpsLogo.css';

// Sprint 9.2: revamped TenantPicker. Full-page layout matching staff
// login dimensions. HotelOps platform logo at the top (theme-aware via
// the dual-SVG selector). One row per property in KNOWN_TENANTS, each
// row showing the tenant's logo and name — the user clicks the actual
// brand they're picking, not just a name. Dev sign-in link at the
// bottom for platform maintenance.

const TenantPicker = ({ kind }) => {
  const tenants = Object.values(KNOWN_TENANTS);

  // Sprint 9.2: apply the dev-chosen tenant-logo dark-mode strategy so
  // the picker row thumbnails honor it too (not just the post-pick
  // login page). 'card' is the CSS default and needs no JS work.
  useEffect(() => {
    fetch('/api/public-config')
      .then(r => r.json())
      .then(data => {
        const strat = data?.config?.tenant_logo_dark_strategy;
        if (strat === 'invert' || strat === 'force-light' || strat === 'card') {
          document.documentElement.dataset.tenantLogoStrategy = strat;
          if (strat === 'force-light') document.documentElement.dataset.theme = 'light';
        }
      })
      .catch(() => { /* default to 'card' (CSS) */ });
  }, []);

  return (
    <div className="login-page login-layout-hardcode">
      <div className="login-card tenant-picker-card">
        <div className="tenant-picker-header">
          <HotelOpsLogo size="xl" wordmark />
        </div>

        <h1 className="login-title">Select your property</h1>
        <p className="login-sub">
          Choose where you work to {kind === 'admin' ? 'sign in as a manager' : 'clock in'}.
        </p>

        <ul className="tenant-picker-list">
          {tenants.map(t => (
            <li key={t.slug}>
              <TransitionLink to={`/${t.slug}/login/${kind}`} className="tenant-picker-row">
                {t.logoUrl ? (
                  <span className="tenant-picker-logo-wrap">
                    <img src={t.logoUrl} alt="" className="tenant-picker-logo" />
                  </span>
                ) : (
                  <span className="tenant-picker-logo-wrap tenant-picker-logo-empty">
                    {t.name.charAt(0)}
                  </span>
                )}
                <span className="tenant-picker-name">{t.name}</span>
                <span className="tenant-picker-arrow" aria-hidden>›</span>
              </TransitionLink>
            </li>
          ))}
        </ul>

        <div className="login-switch">
          <TransitionLink to={`/login/${kind === 'admin' ? 'staff' : 'admin'}`}>
            {kind === 'admin' ? 'Staff sign-in →' : 'Manager sign-in →'}
          </TransitionLink>
        </div>

        {/* Sprint 9.2: dev sign-in — minimal entry point for platform
            maintenance settings (currently just dark-mode strategy for
            tenant logos). Hidden link, not styled as a primary action,
            because dev isn't a workflow staff or managers should care
            about. */}
        <div className="tenant-picker-dev">
          <Link to="/login/dev" className="tenant-picker-dev-link">Dev sign-in</Link>
        </div>
      </div>
    </div>
  );
};

export default TenantPicker;
