import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KNOWN_TENANTS } from '../../config/tenant';
import AuthFrame, { PropertyMark } from './InntrioFrame';
import Icon from './InntrioIcons';
import { withTransition } from './viewTransition';

// Sprint 27.1: step 1 of the Inntrio login — "Select a property". Same destinations as before (only the look changed):
//   signed-out visitors:  Continue → /:slug/login   (step 2, the access chooser, lives there)
//   `kind="dev"` (after dev sign-in, the /dev route): Continue → /:slug/admin, remembering the slug
// With one property it is preselected; the search box filters by name or place.
const TenantPicker = ({ kind }) => {
  const nav = useNavigate();
  const isDevPick = kind === 'dev';
  const tenants = useMemo(() => Object.values(KNOWN_TENANTS), []);
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState(tenants.length === 1 ? tenants[0].slug : null);
  const shown = tenants.filter(t => `${t.name} ${t.location || ''}`.toLowerCase().includes(q.trim().toLowerCase()));

  const go = () => {
    const t = KNOWN_TENANTS[chosen];
    if (!t) return;
    if (isDevPick) { try { localStorage.setItem('hotelops-tenant-slug', t.slug); } catch { /* ignore */ } nav(`/${t.slug}/admin`); return; }
    withTransition(() => nav(`/${t.slug}/login`), 'forward');   // Sprint 27.3: the property logo glides into the property bar of the next screen
  };

  return (
    <AuthFrame step="property" hero>
      <h1 className="in-h1">Select a property</h1>
      <p className="in-subtitle">{isDevPick ? 'Choose which property to open. You will see its manager layout with the Dev tools added.' : 'Choose where you work to continue.'}</p>
      <div className="in-gap-lg" />
      <section className="in-surface in-select-card">
        <div className="in-card-head">
          <div className="in-label-small">Available properties</div>
          <span className="in-count-pill">{tenants.length} {tenants.length === 1 ? 'property' : 'properties'}</span>
        </div>
        <div className="in-search-wrap">
          <Icon name="search" size={19} />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search properties..." aria-label="Search properties" />
        </div>
        {shown.map(t => (
          <button key={t.slug} type="button" className={`in-property-row${chosen === t.slug ? ' selected' : ''}`} aria-pressed={chosen === t.slug} onClick={() => setChosen(t.slug)}>
            <PropertyMark tenant={t} iconSize={23} shared={chosen === t.slug} />
            <span><span className="in-property-title">{t.name}</span><span className="in-property-sub">{t.location || ''}</span></span>
            <span className="in-spacer" />
            {t.status && <span className="in-small-state">{t.status}</span>}
            <span className="in-selected-circle">{chosen === t.slug && <Icon name="check" size={16} />}</span>
          </button>
        ))}
        {shown.length === 0 && <p className="in-none">No matching properties.</p>}
        <button type="button" className="in-primary in-property-go" disabled={!chosen || !shown.some(t => t.slug === chosen)} onClick={go}>Continue <Icon name="arrow" size={19} /></button>
      </section>
      <div className="in-below-note">One workspace. Every department.</div>
    </AuthFrame>
  );
};

export default TenantPicker;
