// Tenant config. Single tenant per deployment for now (one Postgres DB per
// hotel), but the login URLs accept an optional `/:tenant` slug prefix so
// the same app can be branded for any property by name.
//
// Sprint 9.2: each tenant now also carries a `logoUrl` (their PNG/SVG
// served from /public) so the picker can show it on the property card
// and the login pages can use it as the primary brand. `darkLogoUrl` is
// optional — if absent, the tenant's logo is rendered with a white-card
// backdrop in dark mode (the default strategy; configurable via Dev
// Panel as 'card' | 'invert' | 'force-light').
//
// To add another property: drop an entry in KNOWN_TENANTS keyed by its
// slug, place its logo in /public, point logoUrl at it, set
// DEFAULT_TENANT_SLUG to its slug for that deployment, and optionally
// configure DATABASE_URL on the server to point at that property's
// database.

export const KNOWN_TENANTS = {
  snoqualmieinn: {
    slug:         'snoqualmieinn',
    name:         'Snoqualmie Inn',
    logoUrl:      '/snoqualmieinn.png',
    darkLogoUrl:  null,  // no dark variant; fall back to the dev-chosen strategy
  },
  // Add more here as properties onboard.
};

export const DEFAULT_TENANT_SLUG = 'snoqualmieinn';

export const TENANT = KNOWN_TENANTS[DEFAULT_TENANT_SLUG];

// HotelOps platform logos. Sprint 9.2.1 switched from background-stripped
// SVGs to PNGs whose background colors match the app's themed page
// backgrounds. Naming follows TARGET THEME (not content color):
//   - `light` → designed for light theme; its background matches the
//     light-theme `--bg-base`, so it visually blends into the page.
//   - `dark` → designed for dark theme; background matches dark-theme
//     `--bg-base`. The HotelOps wordmark is baked into both PNGs;
//     <HotelOpsLogo /> doesn't render a separate text span.
export const HOTELOPS_LOGOS = {
  light: '/hotelops-light.png',  // for light theme (dark navy mark on white)
  dark:  '/hotelops-dark.png',   // for dark theme (white mark on dark navy)
};

// Resolve a slug from the URL (or fall back to default) to a tenant config.
// Returns null only when the slug is given but isn't in KNOWN_TENANTS, which
// the login routes use to render a "property not found" message.
export const resolveTenant = (slug) => {
  if (!slug) return TENANT;
  return KNOWN_TENANTS[slug.toLowerCase()] || null;
};
