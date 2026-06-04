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
    const path = `/property-service/tenants/${tenantId}/properties/${propertyId}/config/rooms`;
    const rooms = await call('GET', path);
    log('info', 'agilysys.rooms.fetched', { count: Array.isArray(rooms) ? rooms.length : 0 });
    return rooms;
  }

  // GET /property-service/.../config/roomTypes → array of room types.
  // Each item: { id, typeCode, name, typeDescription, isSmoking,
  // isADA, suite, maxGuests, … }. Used to render typeCode → display
  // name on the forecast.
  async function listRoomTypes() {
    const path = `/property-service/tenants/${tenantId}/properties/${propertyId}/config/roomTypes`;
    const types = await call('GET', path);
    log('info', 'agilysys.roomTypes.fetched', { count: Array.isArray(types) ? types.length : 0 });
    return types;
  }

  // POST /reservation-service/v2/.../reservations/search/date
  // Returns a Spring pageable: { content: [...], totalElements,
  // totalPages, number, size, last, first }. Each content item is
  // a reservation with arrivalDate, departureDate, roomType,
  // roomNumber, primaryGuestInfo, status, etc.
  //
  // We don't know the exact filter shape rGuest expects from the
  // recon (we logged response bodies but not request bodies). The
  // body shape below is the most common Spring search pattern;
  // adjust if a first-run scrape comes back empty.
  async function searchReservationsByDate(date, { page = 0, size = 200 } = {}) {
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
  // array. For Snoqualmie's ~25-room load, a single page covers it
  // — but be robust against larger properties / multi-day windows.
  async function searchAllReservationsByDate(date, { size = 200 } = {}) {
    const all = [];
    let pageNum = 0;
    let totalPages = 1;
    do {
      const page = await searchReservationsByDate(date, { page: pageNum, size });
      const content = (page && page.content) || [];
      all.push(...content);
      totalPages = (page && page.totalPages) || 1;
      pageNum += 1;
    } while (pageNum < totalPages);
    log('info', 'agilysys.reservations.all_pages_fetched', { date, total: all.length });
    return all;
  }

  // Convenience: fetch everything one forecast snapshot needs.
  // Parallelised — rooms + roomTypes are independent; reservations
  // also independent. Three round-trips total (or four if reservations
  // pages).
  async function fetchForecastInputs(date) {
    log('info', 'agilysys.scrape.start', { date });
    const [rooms, roomTypes, reservations] = await Promise.all([
      listRooms(),
      listRoomTypes(),
      searchAllReservationsByDate(date),
    ]);
    log('info', 'agilysys.scrape.done', {
      date,
      rooms: rooms.length,
      roomTypes: roomTypes.length,
      reservations: reservations.length,
    });
    return { rooms, roomTypes, reservations };
  }

  return {
    login,
    listRooms,
    listRoomTypes,
    searchReservationsByDate,
    searchAllReservationsByDate,
    fetchForecastInputs,
    getLogs: () => logs.slice(),
    // Exposed for testing / introspection — don't rely on these in
    // app code.
    _getToken: () => token,
    _config:   { baseUrl, tenantId, propertyId, hasCreds: !!(username && password) },
  };
}

module.exports = { createAgilysysClient };
