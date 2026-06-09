// Sprint 17.1 — rGuest Stay (Agilysys) API client.
//
// Built from the Sprint 17 recon (scraper/agilysys_recon.py). rGuest
// has a clean REST API behind its React UI; we call it directly with
// the same x-token header pattern the SPA uses. No browser, no DOM
// scraping in production.
//
// Auth:
//   POST /auth-service/auth/tenants/{tid}/users/login { username, password }
//     → { token: "<uuid>", … }
//   Every other call sends `x-token: <uuid>`. (NOT Authorization,
//   NOT Bearer, NOT a cookie — a custom header.)
//
// Each forecast scrape calls createAgilysysClient() to get a fresh
// client with its own log buffer. The buffer ends up in
// forecast_snapshot.logs so the admin "view raw output" panel has
// real per-step debug info.
//
// Env vars (credentials only — set as Koyeb secrets):
//   AGILYSYS_USER     — rGuest username
//   AGILYSYS_PASS     — rGuest password
//
// Tenant + property are hardcoded for Snoqualmie. When we onboard a
// second hotel, lift these into a per-property config table; the
// `overrides` argument already supports per-call substitution.

'use strict';

const BASE_URL    = 'https://stay.rguest.com';
const TENANT_ID   = '1566'; // Snoqualmie Inn
const PROPERTY_ID = '481';  // Snoqualmie Inn

// Sprint 18.5 — module-level cache for the reference catalogs
// (`config/rooms` + `config/roomTypes` + `vipStatuses`). Lives
// outside the client factory so it persists across scrape calls.
// Room inventory + type catalog change rarely; refetching them on
// every sync wastes ~3 round-trips per scrape. 24h TTL keeps us
// close enough to live data without thrashing the API.
const REF_TTL_MS = 24 * 60 * 60 * 1000;
const _refCache = {
  rooms:       { data: null, expiresAt: 0, key: null },
  roomTypes:   { data: null, expiresAt: 0, key: null },
  vipStatuses: { data: null, expiresAt: 0, key: null },
};
function _cacheKey(tenantId, propertyId) {
  return `${tenantId}/${propertyId}`;
}

function createAgilysysClient(overrides = {}) {
  const baseUrl    = overrides.baseUrl    || BASE_URL;
  const tenantId   = overrides.tenantId   || TENANT_ID;
  const propertyId = overrides.propertyId || PROPERTY_ID;
  const username   = overrides.username   || process.env.AGILYSYS_USER;
  const password   = overrides.password   || process.env.AGILYSYS_PASS;

  let token = null;
  const logs = [];

  function log(level, message, context) {
    logs.push({
      at: new Date().toISOString(),
      level,
      message,
      ...(context ? { context } : {}),
    });
  }

  // ── Auth ────────────────────────────────────────────────
  // Hits the tenant-scoped login endpoint and stashes the token.
  // Throws if credentials are missing or the response doesn't
  // include a token.
  async function login() {
    if (!username || !password) {
      throw new Error(
        'Agilysys client: AGILYSYS_USER and AGILYSYS_PASS env vars are required',
      );
    }
    const url = `${baseUrl}/auth-service/auth/tenants/${tenantId}/users/login`;
    log('info', 'agilysys.login.start', { url, username });
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
    } catch (e) {
      log('error', 'agilysys.login.network_error', { error: String(e) });
      throw new Error(`Agilysys login network error: ${e.message}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log('error', 'agilysys.login.http_error', { status: res.status, body: body.slice(0, 200) });
      throw new Error(`Agilysys login failed: ${res.status}`);
    }
    const data = await res.json();
    if (!data || !data.token) {
      log('error', 'agilysys.login.no_token', { keys: data ? Object.keys(data) : [] });
      throw new Error('Agilysys login response did not include a token');
    }
    token = data.token;
    log('info', 'agilysys.login.success', { tokenPreview: token.slice(0, 8) + '…' });
    return token;
  }

  // ── HTTP helper ─────────────────────────────────────────
  // Wraps fetch with the x-token header. On 401, drops the cached
  // token, re-logs-in once, and retries. Anything else is fatal.
  async function call(method, path, body) {
    if (!token) await login();

    const url = `${baseUrl}${path}`;
    const headers = {
      'x-token':      token,
      'Accept':       'application/json',
      'Content-Type': 'application/json',
    };
    const init = { method, headers, body: body ? JSON.stringify(body) : undefined };

    log('debug', 'agilysys.call.start', { method, path });
    let res = await fetch(url, init);

    if (res.status === 401) {
      log('warn', 'agilysys.call.token_expired_retry', { method, path });
      token = null;
      await login();
      init.headers['x-token'] = token;
      res = await fetch(url, init);
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      log('error', 'agilysys.call.http_error', {
        method, path, status: res.status, body: errBody.slice(0, 200),
      });
      throw new Error(`Agilysys ${method} ${path} failed: ${res.status}`);
    }

    const json = await res.json();
    log('debug', 'agilysys.call.success', { method, path, status: res.status });
    return json;
  }

  // ── Endpoints ───────────────────────────────────────────

  // GET /property-service/.../config/rooms → array of 100 rooms.
  // The goldmine: each room includes roomNumber, floor/floorId,
  // roomTypeId, currentOccupancyStatus (OCC/VAC),
  // housekeepingRoomStatus (D/PU/VI/IP), housekeepingSectionId,
  // reservation (UUID pointer to the active reservation if any).
  async function listRooms() {
    // Sprint 18.5 — module-level 24h cache (see _refCache at top).
    const key = _cacheKey(tenantId, propertyId);
    const slot = _refCache.rooms;
    if (slot.data && slot.key === key && Date.now() < slot.expiresAt) {
      log('info', 'agilysys.rooms.cache_hit', { count: slot.data.length, ttlRemainingMs: slot.expiresAt - Date.now() });
      return slot.data;
    }
    const path = `/property-service/tenants/${tenantId}/properties/${propertyId}/config/rooms`;
    const rooms = await call('GET', path);
    log('info', 'agilysys.rooms.fetched', { count: Array.isArray(rooms) ? rooms.length : 0 });
    if (Array.isArray(rooms)) {
      slot.data = rooms;
      slot.key = key;
      slot.expiresAt = Date.now() + REF_TTL_MS;
    }
    return rooms;
  }

  // GET /property-service/.../config/roomTypes → array of room types.
  // Each item: { id, typeCode, name, typeDescription, isSmoking,
  // isADA, suite, maxGuests, … }. Used to render typeCode → display
  // name on the forecast.
  async function listRoomTypes() {
    // Sprint 18.5 — module-level 24h cache.
    const key = _cacheKey(tenantId, propertyId);
    const slot = _refCache.roomTypes;
    if (slot.data && slot.key === key && Date.now() < slot.expiresAt) {
      log('info', 'agilysys.roomTypes.cache_hit', { count: slot.data.length });
      return slot.data;
    }
    const path = `/property-service/tenants/${tenantId}/properties/${propertyId}/config/roomTypes`;
    const types = await call('GET', path);
    log('info', 'agilysys.roomTypes.fetched', { count: Array.isArray(types) ? types.length : 0 });
    if (Array.isArray(types)) {
      slot.data = types;
      slot.key = key;
      slot.expiresAt = Date.now() + REF_TTL_MS;
    }
    return types;
  }

  // POST /reservation-service/v2/.../reservations/search/date
  // Returns a Spring pageable: { content: [...], totalElements,
  // totalPages, number, size, last, first }. Each content item is
  // a reservation with arrivalDate, departureDate, roomType,
  // roomNumber, primaryGuestInfo, status, etc.
  //
  // Body shape `{date, page, size}` is the common Spring search
  // pattern and was confirmed live in Sprint 17.6 (rGuest parsed
  // the body and only rejected the size value).
  //
  // Sprint 17.6: rGuest enforces "page size must be less than 100"
  // (`PAGE_SIZE_LIMIT_EXCEEDED`, MAX=100). Default is 99 → fits in
  // one round-trip for Snoqualmie's <100 rooms; the
  // `searchAllReservationsByDate` walker handles anything larger.
  async function searchReservationsByDate(date, { page = 0, size = 99 } = {}) {
    const path = `/reservation-service/v2/tenants/${tenantId}/properties/${propertyId}/reservations/search/date`;
    const result = await call('POST', path, { date, page, size });
    const count = result && Array.isArray(result.content) ? result.content.length : 0;
    log('info', 'agilysys.reservations.fetched', {
      date,
      page,
      size,
      count,
      totalElements: result && result.totalElements,
      totalPages:    result && result.totalPages,
    });
    return result;
  }

  // Walks every page of /reservations/search/date and returns a flat
  // array. For Snoqualmie's load, a single page (99) covers it — but
  // remain robust against larger properties / multi-day windows.
  //
  // Sprint 17.7.1: also log per-page details so we can tell whether
  // pagination is the source of a count discrepancy (e.g. rGuest says
  // totalElements=120 but we only walk 1 page = 99 → 21 missing).
  async function searchAllReservationsByDate(date, { size = 99 } = {}) {
    const all = [];
    let pageNum = 0;
    let totalPages = 1;
    let totalElements = null;
    do {
      const page = await searchReservationsByDate(date, { page: pageNum, size });
      const content = (page && page.content) || [];
      all.push(...content);
      totalPages = (page && page.totalPages) || 1;
      if (page && typeof page.totalElements === 'number') {
        totalElements = page.totalElements;
      }
      log('info', 'agilysys.reservations.page_fetched', {
        pageNum,
        gotInPage: content.length,
        totalPages,
        totalElements,
      });
      pageNum += 1;
    } while (pageNum < totalPages);
    log('info', 'agilysys.reservations.all_pages_fetched', {
      date,
      pagesFetched: pageNum,
      total:        all.length,
      totalElements,
      walkComplete: totalElements === null || all.length === totalElements,
    });
    return all;
  }

  // GET /property-service/.../propertyDate
  //
  // Sprint 17.14 — returns rGuest's *property date* (business
  // day). Comes back as a bare JSON string like `"2026-06-04"`.
  // Importantly: this is what the FD considers "today" — the
  // property day-rolls some time around 3–4 AM, so at 12:08 AM
  // the local calendar already says Jun 5 but rGuest still has
  // the operation pinned at Jun 4 until day-roll completes.
  //
  // Use this everywhere we currently use a local clock-derived
  // date, otherwise our derived KPIs (Jun 5 pipeline) disagree
  // with rGuest's dashboard widgets (Jun 4 remaining).
  async function getPropertyDate() {
    const path = `/property-service/tenants/${tenantId}/properties/${propertyId}/propertyDate`;
    const result = await call('GET', path);
    log('info', 'agilysys.propertyDate.fetched', { propertyDate: result });
    // Response is a bare string ("2026-06-04"). Defensive cast.
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object' && result.date) return result.date;
    return null;
  }

  // GET /property-service/tenants/{tid}/properties/{pid}/vipStatuses
  // Returns the catalog of VIP labels (e.g. "Corporate VIP",
  // "Loyalty Platinum") keyed by UUID. Reservations reference these
  // via `primaryGuestInfo.vipStatus`. Sprint 18.3 adds this so the
  // Reservations page can render the actual label instead of an
  // opaque UUID.
  //
  // Falls back to the tenant-scoped variant
  // /property-service/tenants/{tid}/vipStatuses if the property-
  // scoped one 404s (both URLs appear in the recon — different
  // rGuest UIs use different scopes).
  async function getVipStatuses() {
    // Sprint 18.5 — module-level 24h cache.
    const key = _cacheKey(tenantId, propertyId);
    const slot = _refCache.vipStatuses;
    if (slot.data && slot.key === key && Date.now() < slot.expiresAt) {
      log('info', 'agilysys.vipStatuses.cache_hit', { count: slot.data.length });
      return slot.data;
    }
    const propScoped = `/property-service/tenants/${tenantId}/properties/${propertyId}/vipStatuses`;
    try {
      const result = await call('GET', propScoped);
      log('info', 'agilysys.vipStatuses.fetched', { count: Array.isArray(result) ? result.length : 0, scope: 'property' });
      if (Array.isArray(result)) { slot.data = result; slot.key = key; slot.expiresAt = Date.now() + REF_TTL_MS; }
      return result;
    } catch (err) {
      log('warn', 'agilysys.vipStatuses.property_failed', { error: String(err.message || err) });
      const tenScoped = `/property-service/tenants/${tenantId}/vipStatuses`;
      const result = await call('GET', tenScoped);
      log('info', 'agilysys.vipStatuses.fetched', { count: Array.isArray(result) ? result.length : 0, scope: 'tenant' });
      if (Array.isArray(result)) { slot.data = result; slot.key = key; slot.expiresAt = Date.now() + REF_TTL_MS; }
      return result;
    }
  }

  // GET /reservation-service/v1/.../reservations/reservationMetrics?endDate=DATE
  // The authoritative source for rGuest's dashboard widget numbers
  // (REMAINING ARRIVALS x/y, REMAINING DEPARTURES x/y, TOTAL
  // GUESTS, ROOM CONDITION). Sprint 17.7.2 — discovered after our
  // /search/date-derived counts couldn't match rGuest's UI. Use
  // these as source-of-truth for KPIs; use /search/date only for
  // the per-reservation list we render to the user.
  //
  // Returns the raw rGuest body; computeForecast picks the fields
  // it needs.
  async function getReservationMetrics(date) {
    const qs   = date ? `?endDate=${encodeURIComponent(date)}` : '';
    const path = `/reservation-service/v1/tenants/${tenantId}/properties/${propertyId}/reservations/reservationMetrics${qs}`;
    const result = await call('GET', path);
    log('info', 'agilysys.metrics.fetched', {
      date,
      arrivalsTotal:     result?.remainingArrivalsSummary?.total,
      arrivalsRemaining: result?.remainingArrivalsSummary?.remaining,
      departuresTotal:   result?.remainingDeparturesSummary?.total,
      departuresRemaining: result?.remainingDeparturesSummary?.remaining,
      totalGuests:       result?.totalGuestsSummary?.total,
    });
    return result;
  }

  // Convenience: fetch everything one forecast snapshot needs.
  //
  // Sprint 17.6: pre-login serially before the parallel fetch. The
  // previous version called Promise.all([rooms, roomTypes, reservations])
  // first; with no cached token, all three independently raced into
  // login() and we issued three logins per scrape. Now: one login,
  // then the data calls in parallel.
  //
  // Sprint 17.7.2: also fetches reservationMetrics. Adds one round
  // trip but lets the compute fn produce KPIs that match rGuest's
  // UI exactly.
  async function fetchForecastInputs(requestedDate) {
    log('info', 'agilysys.scrape.start', { requestedDate });
    if (!token) await login();

    // Sprint 17.14 — resolve effective date from rGuest's
    // propertyDate first; fall back to the caller's date only if
    // propertyDate is null. This guarantees our derived counts
    // and rGuest's metrics widgets share a denominator.
    const propertyDate = await getPropertyDate();
    const effectiveDate = requestedDate || propertyDate;
    log('info', 'agilysys.scrape.dateResolved', {
      requestedDate, propertyDate, effectiveDate,
    });

    // Sprint 18.3 — also fetch VIP statuses for label resolution.
    // Soft failure: if the endpoint 404s for either scope, return
    // null and the rest of the scrape still succeeds.
    let vipStatuses = null;
    try {
      vipStatuses = await getVipStatuses();
    } catch (err) {
      log('warn', 'agilysys.vipStatuses.skipped', { error: String(err.message || err) });
    }

    const [rooms, roomTypes, reservations, metrics] = await Promise.all([
      listRooms(),
      listRoomTypes(),
      searchAllReservationsByDate(effectiveDate),
      getReservationMetrics(effectiveDate),
    ]);
    log('info', 'agilysys.scrape.done', {
      effectiveDate,
      rooms: rooms.length,
      roomTypes: roomTypes.length,
      reservations: reservations.length,
      vipStatuses: Array.isArray(vipStatuses) ? vipStatuses.length : null,
      metricsArrivals:   metrics?.remainingArrivalsSummary?.total,
      metricsDepartures: metrics?.remainingDeparturesSummary?.total,
    });
    return {
      rooms, roomTypes, reservations, metrics, vipStatuses,
      propertyDate,
      effectiveDate,
    };
  }

  return {
    login,
    listRooms,
    listRoomTypes,
    searchReservationsByDate,
    searchAllReservationsByDate,
    getReservationMetrics,
    getPropertyDate,
    getVipStatuses,
    fetchForecastInputs,
    getLogs: () => logs.slice(),
    // Exposed for testing / introspection — don't rely on these in
    // app code.
    _getToken: () => token,
    _config:   { baseUrl, tenantId, propertyId, hasCreds: !!(username && password) },
  };
}

module.exports = { createAgilysysClient };
