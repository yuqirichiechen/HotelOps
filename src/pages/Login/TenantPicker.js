import React from 'react';
import { KNOWN_TENANTS } from '../../config/tenant';
import { TransitionLink } from './TransitionLink';
import './Login.css';

// Sprint 9.1.1: when the user lands on a bare /login/staff or /login/admin
// URL (no /:tenant slug), we don't want to silently default to whichever
// property is "first" — that leaks one tenant's identity to anyone hitting
// the root login URL. Instead, prompt them to pick a property.
//
// `kind` is 'staff' | 'admin' so the destination URL routes correctly.
// Single-property deploys can skip this page entirely by configuring
// DNS/Nginx to redirect bare /login/* to /{their-slug}/login/*.

const TenantPicker = ({ kind }) => {
  const tenants = Object.values(KNOWN_TENANTS);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">🏨</span>
          <span className="login-brand-name">HotelOps</span>
        </div>

        <h1 className="login-title">Select your property</h1>
        <p className="login-sub">
          Choose where you work to {kind === 'admin' ? 'sign in as a manager' : 'clock in'}.
        </p>

        <ul className="tenant-picker-list">
          {tenants.map(t => (
            <li key={t.slug}>
              <TransitionLink to={`/${t.slug}/login/${kind}`} className="tenant-picker-row">
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
      </div>
    </div>
  );
};

export default TenantPicker;
