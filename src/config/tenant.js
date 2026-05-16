// Tenant config. Single tenant per deployment for now (one Postgres DB per
// hotel), but the login URLs accept an optional `/:tenant` slug prefix so
// the same app can be branded for any property by name. Sprint 9: lookup
// table for known tenant slugs; the default is what the current deployment
// brands as.
//
// To add another property: drop an entry in KNOWN_TENANTS keyed by its
// slug, set DEFAULT_TENANT_SLUG to its slug for that deployment, and
// optionally configure DATABASE_URL on the server to point at that
// property's database.

export const KNOWN_TENANTS = {
  snoqualmieinn: { slug: 'snoqualmieinn', name: 'Snoqualmie Inn' },
  // Add more here as properties onboard.
};

export const DEFAULT_TENANT_SLUG = 'snoqualmieinn';

export const TENANT = KNOWN_TENANTS[DEFAULT_TENANT_SLUG];

// Resolve a slug from the URL (or fall back to default) to a tenant config.
// Returns null only when the slug is given but isn't in KNOWN_TENANTS, which
// the login routes use to render a "property not found" message.
export const resolveTenant = (slug) => {
  if (!slug) return TENANT;
  return KNOWN_TENANTS[slug.toLowerCase()] || null;
};
