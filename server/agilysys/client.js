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
  // Sprint 18.9 — rate plan catalog (~830 entries at Snoqualmie).
  // Used to resolve `ratePlanCode` (e.g. "BAR") to a friendly name
  // (e.g. "Best Available Rate") in the bulk Reservations table.
  // Same 24h TTL as the other reference catalogs.
  ratePlans:   { data: null, expiresAt: 0, key: null },
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

  // Sprint 18.9 — GET /rate-service/tenants/{tid}/properties/{pid}/ratePlans
  // The full rate plan catalog. Each entry has at least `code`,
  // `name`, plus rate-category / channel / commission / yieldable
  // metadata we don't currently use. 24h cache (entries change
  // rarely — new rate plans get added but existing ones don't
  // rename mid-day).
  async function getRatePlans() {
    const key = _cacheKey(tenantId, propertyId);
    const slot = _refCache.ratePlans;
    if (slot.data && slot.key === key && Date.now() < slot.expiresAt) {
      log('info', 'agilysys.ratePlans.cache_hit', { count: slot.data.length });
      return slot.data;
    }
    const path = `/rate-service/tenants/${tenantId}/properties/${propertyId}/ratePlans`;
    const result = await call('GET', path);
    log('info', 'agilysys.ratePlans.fetched', {
      count: Array.isArray(result) ? result.length : 0,
    });
    if (Array.isArray(result)) {
      slot.data = result;
      slot.key = key;
      slot.expiresAt = Date.now() + REF_TTL_MS;
    }
    return result;
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
  // ───────────────────────────────────────────────────────────
  // Sprint 18.7 — per-reservation detail (on-demand, not bulk).
  // Five endpoints surface the rich data the row doesn't have:
  // full reservation, full guest profile, comments/notes, folio
  // balances, and stay-history. Orchestrated by
  // `fetchReservationFullDetail` which fans out in parallel after
  // the initial reservation fetch resolves accountId + profileId.

  // GET /reservation-service/v1/.../reservations/{id}?travelAndTransportInfo=false&updateCasinoDetails=true
  // Returns the FULL reservation (~30 top-level keys), including
  // `accountId` + `sourceInfo` (channel / booked-by / walk-in).
  async function getReservationDetail(reservationId) {
    const qs = `?travelAndTransportInfo=false&updateCasinoDetails=true`;
    const path = `/reservation-service/v1/tenants/${tenantId}/properties/${propertyId}/reservations/${reservationId}${qs}`;
    const result = await call('GET', path);
    log('info', 'agilysys.reservationDetail.fetched', { id: reservationId, accountId: result?.accountId });
    return result;
  }

  // GET /profile-service/v1/.../guests/{profileId}?updateCasinoDetails=true
  // Returns the full guest profile with addressDetails /
  // phoneDetails / emailDetails / loyaltyDetails / preferences.
  async function getGuestProfile(profileId) {
    const path = `/profile-service/v1/tenants/${tenantId}/properties/${propertyId}/guests/${profileId}?updateCasinoDetails=true`;
    const result = await call('GET', path);
    log('info', 'agilysys.guestProfile.fetched', { profileId });
    return result;
  }

  // GET /comment-service/tenants/{tid}/reservation/{reservationId}
  // Returns reservation comments / notes / special requests.
  // Empty {} when there are none. Tenant-scoped (no propertyId).
  async function getReservationComments(reservationId) {
    const path = `/comment-service/tenants/${tenantId}/reservation/${reservationId}`;
    const result = await call('GET', path);
    log('info', 'agilysys.comments.fetched', { reservationId });
    return result;
  }

  // POST /account-service/v1/.../accounts/balances
  // Returns the folio balance breakdown {subtotal, tax, paid,
  // total, badDebt} per account. Body shape inferred from the
  // response: `accountStatementMap` keyed by account id with an
  // empty placeholder object. Falls back to a simpler array body
  // if the structured one 4xx's.
  async function getAccountBalances(accountIds) {
    if (!Array.isArray(accountIds) || accountIds.length === 0) return null;
    const path = `/account-service/v1/tenants/${tenantId}/properties/${propertyId}/accounts/balances`;
    const structuredBody = {
      accountStatementMap: Object.fromEntries(accountIds.map(id => [id, {}])),
    };
    try {
      const result = await call('POST', path, structuredBody);
      log('info', 'agilysys.accountBalances.fetched', { accounts: accountIds.length, shape: 'structured' });
      return result;
    } catch (err) {
      log('warn', 'agilysys.accountBalances.structured_failed', { error: String(err.message || err) });
      // Try simple array body as a fallback.
      const arrayBody = { accountIds };
      const result = await call('POST', path, arrayBody);
      log('info', 'agilysys.accountBalances.fetched', { accounts: accountIds.length, shape: 'array' });
      return result;
    }
  }

  // GET /reservation-service/v1/.../reservations/guest/{profileId}/stayHistory
  // Returns counts: totalNoPrevStays, totalNoShows, totalCancelled,
  // currentCount, futureCount, pastCount. Lets the UI show
  // "returning guest" badges.
  async function getStayHistory(profileId) {
    const path = `/reservation-service/v1/tenants/${tenantId}/properties/${propertyId}/reservations/guest/${profileId}/stayHistory`;
    const result = await call('GET', path);
    log('info', 'agilysys.stayHistory.fetched', { profileId, pastCount: result?.pastCount });
    return result;
  }

  // Sprint 18.9 — open service requests linked to a reservation.
  // Three sibling endpoints (guest / housekeeping / maintenance);
  // each returns an array of request objects. The recon-captured
  // URL had no query string but UI suggests the endpoint accepts
  // `?reservationId={id}` — we pass it so the server filters
  // server-side. We also stamp each item with a `kind` tag so the
  // frontend can group/badge by type without re-inspecting the URL.
  async function getServiceRequestsByReservation(reservationId) {
    const base = `/servicerequest-service/tenants/${tenantId}/properties/${propertyId}/servicerequests`;
    const qs = `?reservationId=${encodeURIComponent(reservationId)}`;
    const kinds = ['guest', 'housekeeping', 'maintenance'];
    const results = await Promise.all(kinds.map(async (kind) => {
      try {
        const arr = await call('GET', `${base}/${kind}/byReservation${qs}`);
        if (!Array.isArray(arr)) return [];
        return arr.map(item => ({ ...item, _kind: kind }));
      } catch (err) {
        log('warn', 'agilysys.serviceRequests.failed', { kind, error: String(err.message || err) });
        return [];
      }
    }));
    const combined = results.flat();
    log('info', 'agilysys.serviceRequests.fetched', {
      reservationId,
      counts: Object.fromEntries(kinds.map((k, i) => [k, results[i].length])),
      total: combined.length,
    });
    return combined;
  }

  // Sprint 18.8 — account details. The folio account holds
  // `paymentSettings.paymentInstruments[]` which is the list of
  // tokens we need to dereference into masked card metadata.
  // Returns the full account object so future sprints can also
  // surface charges / authorizations / split-pay rules.
  async function getAccountDetails(accountId) {
    const path = `/account-service/v1/tenants/${tenantId}/properties/${propertyId}/accounts/${accountId}/details`;
    const result = await call('GET', path);
    log('info', 'agilysys.accountDetails.fetched', {
      accountId,
      instruments: Array.isArray(result?.paymentSettings?.paymentInstruments)
        ? result.paymentSettings.paymentInstruments.length : 0,
    });
    return result;
  }

  // Sprint 18.8 — masked card metadata for the rail-panel chip.
  // Returns accountNumberLast4, cardIssuer, cardType, cardHolderName,
  // expirationYearMonth. Issuer is a UUID we map to a friendly
  // brand name client-side (the catalog at
  // `/payment-service/.../cardIssuers` is cacheable but tiny
  // enough to fold into the frontend until we need a 2nd lookup).
  async function getPaymentInstrument(accountId, instrumentId) {
    const path = `/payment-service/tenants/${tenantId}/properties/${propertyId}/accounts/${accountId}/paymentInstruments/${instrumentId}`;
    const result = await call('GET', path);
    log('info', 'agilysys.paymentInstrument.fetched', {
      accountId, instrumentId,
      last4: result?.accountNumberLast4,
    });
    return result;
  }

  // High-level orchestration for the Reservations rail panel.
  // Fetches the reservation first (since accountId + profileId are
  // hidden in its body), then fans out in parallel for the rest.
  // Each sub-call is wrapped in catch() so partial failure returns
  // partial data rather than blowing up the whole aggregate.
  async function fetchReservationFullDetail(reservationId) {
    if (!token) await login();
    const reservation = await getReservationDetail(reservationId);
    const profileId = reservation?.primaryGuestInfo?.profileId;
    const accountId = reservation?.accountId;

    // Sprint 18.8 — accountDetails joins the first fan-out so
    // payment instruments can fire in a second batch as soon as
    // the instrument IDs are known. Total wall-time is still
    // ~2 round trips (first batch + instrument batch) instead of
    // sequential ~6.
    // Sprint 18.9 — serviceRequests joins the parallel fan-out.
    // Independent of accountId/profileId since it's keyed off the
    // reservation directly. Internal Promise.all over the 3 kinds
    // already collapses any individual 4xx to an empty array.
    const [profile, comments, balances, stayHistory, accountDetails, serviceRequests] = await Promise.all([
      profileId ? getGuestProfile(profileId).catch(e => {
        log('warn', 'agilysys.guestProfile.failed', { error: e.message });
        return null;
      }) : null,
      getReservationComments(reservationId).catch(e => {
        log('warn', 'agilysys.comments.failed', { error: e.message });
        return null;
      }),
      accountId ? getAccountBalances([accountId]).catch(e => {
        log('warn', 'agilysys.accountBalances.failed', { error: e.message });
        return null;
      }) : null,
      profileId ? getStayHistory(profileId).catch(e => {
        log('warn', 'agilysys.stayHistory.failed', { error: e.message });
        return null;
      }) : null,
      accountId ? getAccountDetails(accountId).catch(e => {
        log('warn', 'agilysys.accountDetails.failed', { error: e.message });
        return null;
      }) : null,
      getServiceRequestsByReservation(reservationId).catch(e => {
        log('warn', 'agilysys.serviceRequests.aggregate_failed', { error: e.message });
        return null;
      }),
    ]);

    // Sprint 18.8 — second batch: dereference each payment-instrument
    // token into masked card metadata. Empty array (rather than null)
    // when there's an account but no cards on file, so the UI can
    // confidently render "No card on file" instead of "Loading…".
    let paymentInstruments = null;
    const instrumentRefs = Array.isArray(accountDetails?.paymentSettings?.paymentInstruments)
      ? accountDetails.paymentSettings.paymentInstruments : [];
    const instrumentIds = instrumentRefs
      .map(p => p?.paymentInstrumentId || p?.id)
      .filter(Boolean);
    if (accountId && instrumentIds.length > 0) {
      const resolved = await Promise.all(
        instrumentIds.map(id => getPaymentInstrument(accountId, id).catch(e => {
          log('warn', 'agilysys.paymentInstrument.failed', { instrumentId: id, error: e.message });
          return null;
        }))
      );
      paymentInstruments = resolved.filter(Boolean);
    } else if (accountId) {
      paymentInstruments = [];
    }

    return {
      reservation,
      profile,
      comments,
      balances,
      stayHistory,
      accountDetails,
      paymentInstruments,
      serviceRequests,
    };
  }

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

    // Sprint 18.9 — ratePlans joins the parallel fan-out. 24h
    // cache so this is free on cache hit. Soft failure: if the
    // rate-service is down the rest of the scrape still ships,
    // we just fall back to showing raw rate plan codes.
    const [rooms, roomTypes, reservations, metrics, ratePlans] = await Promise.all([
      listRooms(),
      listRoomTypes(),
      searchAllReservationsByDate(effectiveDate),
      getReservationMetrics(effectiveDate),
      getRatePlans().catch(err => {
        log('warn', 'agilysys.ratePlans.skipped', { error: String(err.message || err) });
        return null;
      }),
    ]);
    log('info', 'agilysys.scrape.done', {
      effectiveDate,
      rooms: rooms.length,
      roomTypes: roomTypes.length,
      reservations: reservations.length,
      vipStatuses: Array.isArray(vipStatuses) ? vipStatuses.length : null,
      ratePlans: Array.isArray(ratePlans) ? ratePlans.length : null,
      metricsArrivals:   metrics?.remainingArrivalsSummary?.total,
      metricsDepartures: metrics?.remainingDeparturesSummary?.total,
    });
    return {
      rooms, roomTypes, reservations, metrics, vipStatuses, ratePlans,
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
    getReservationDetail,
    getGuestProfile,
    getReservationComments,
    getAccountBalances,
    getStayHistory,
    getAccountDetails,
    getPaymentInstrument,
    getRatePlans,
    getServiceRequestsByReservation,
    fetchReservationFullDetail,
    fetchForecastInputs,
    getLogs: () => logs.slice(),
    // Exposed for testing / introspection — don't rely on these in
    // app code.
    _getToken: () => token,
    _config:   { baseUrl, tenantId, propertyId, hasCreds: !!(username && password) },
  };
}

module.exports = { createAgilysysClient };
