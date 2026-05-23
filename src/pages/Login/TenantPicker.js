import React, { useEffect } from 'react';
import { KNOWN_TENANTS } from '../../config/tenant';
import HotelOpsLogo from '../../components/shared/HotelOpsLogo';
import { TransitionLink } from './TransitionLink';
import './Login.css';
import '../../components/shared/HotelOpsLogo.css';

// Sprint 9.2 / 9.2.1: TenantPicker — full-page property selector.
// HotelOps platform logo at the top, one row per property in
// KNOWN_TENANTS with the tenant's logo + name.
//
// 9.2.1 dropped the Staff↔Manager toggle from this page: which login
// roles a property supports is a per-tenant decision (some properties
// might not even have managers signing in here), so we don't surface
// the toggle before the user has picked a property. The role choice
// lives on the post-pick login page instead, where the tenant has
// been selected and any tenant-specific role visibility can apply.
//
// Dev sign-in remains as the only secondary link, styled like the
// post-pick "Manager sign-in" / "Staff sign-in" link so the visual
// language stays consistent across the login family.

// Sprint 11.2.1: `kind` is no longer used — the post-pick login is
// a single combined page at `/:tenant/login`. Kept the prop slot in
// case future variants want to swap copy. Default subtitle remains
// kiosk-flavored ("clock in") since that's the dominant path.
const TenantPicker = ({ kind }) => {
  const tenants = Object.values(KNOWN_TENANTS);

  // Apply the dev-chosen tenant-logo dark-mode strategy so the picker
  // row thumbnails honor it (and so the strategy is set before the
  // user lands on the post-pick login). 'card' is the CSS default and
  // needs no JS work.
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
      {/* Sprint 11.3: two-column shape on desktop — brand intro
          (logo + title + sub) on the left, property chooser
          (list + dev sign-in) on the right. With a single tenant
          the right column shows one tall row; with more tenants
          the visual still reads cleanly. Mobile (<1024px): the
          two wrappers stack naturally. */}
      <div className="login-card tenant-picker-card">
        <div className="tenant-picker-intro">
          <div className="tenant-picker-header">
            <HotelOpsLogo size="xl" />
          </div>
          <h1 className="login-title">Select your property</h1>
          <p className="login-sub">
            Choose where you work to {kind === 'admin' ? 'sign in as a manager' : 'clock in'}.
          </p>
        </div>

        <div className="tenant-picker-chooser">
          <ul className="tenant-picker-list">
            {tenants.map(t => (
              <li key={t.slug}>
                <TransitionLink to={`/${t.slug}/login`} className="tenant-picker-row">
                  {t.logoUrl ? (
                    <span className="tenant-picker-logo-wrap">
                      {/* Sprint 9.2.2: per-tenant view-transition-name so
                          the row's thumbnail morphs directly into the
                          post-pick page's big tenant banner. Other rows'
                          thumbs (different names) just fade out. */}
                      <img
                        src={t.logoUrl}
                        alt=""
                        className="tenant-picker-logo"
                        style={{ viewTransitionName: `tenant-brand-${t.slug}` }}
                      />
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

          {/* Sprint 9.2.1: only Dev sign-in here. Manager/Staff toggle
              moves to the post-pick login pages where it belongs. */}
          <div className="login-switch">
            <TransitionLink to="/login/dev">Dev sign-in →</TransitionLink>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantPicker;
