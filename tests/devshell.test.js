// Sprint 22.4 — Dev sign-in (server-verified), route guards for the dev role, the Dev shell, manager-vs-dev page modes, and the plain freshness badge.
//   node tests/devshell.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, CustomEvent: w.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils'); const RR = require(ROOT + '/node_modules/react-router-dom'); const { computeForecast } = require(ROOT + '/server/forecast/compute');
w.scrollTo = () => {};   // jsdom has no scrolling
const TODAY = '2026-10-12'; const calls = []; let responses = {}; let mockAuth = null;
const apiFetchMock = async (p, o = {}) => { calls.push({ p, method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null }); const r = responses[(o.method || 'GET') + ' ' + p.split('?')[0]]; return typeof r === 'function' ? r(p, o) : (r || { ok: false, status: 404, data: { message: 'no mock ' + p } }); };
const modCache = new Map();   // one instance per file (a context created in two module copies would never match)
const load = (file, useMockAuth = true) => { const ck = file + '|' + useMockAuth; if (modCache.has(ck)) return modCache.get(ck); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if ((id === '../../auth' || id === '../auth') && useMockAuth) return mockAuth; if (id === '../../shells/ViewContext' && file.includes('/components/Forecast')) return { useView: () => ({ goTo() {} }) };
    if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : (fs.existsSync(p) && fs.statSync(p).isDirectory() ? p + '/index.js' : p), useMockAuth); } return orig(id); };
  modCache.set(ck, m.exports); m._compile(code, file); return m.exports; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };
const mount = async (el_) => { const el = document.getElementById('root'); el.innerHTML = ''; const root = createRoot(el); await act(async () => { root.render(el_); }); await act(async () => { await sleep(40); });
  const click = async (n) => { await act(async () => { n.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await act(async () => { await sleep(20); }); };
  const type = async (input, value) => { const set = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set; await act(async () => { set.call(input, value); input.dispatchEvent(new w.Event('input', { bubbles: true })); }); };
  return { el, root, click, type, btn: (re) => [...el.querySelectorAll('button')].find(b => re.test(b.textContent)), unmount: () => act(async () => { root.unmount(); }) }; };

// ── fixtures ──
const resn = (id, arr, dep) => ({ id, status: 'RES', roomType: 'rt1', arrivalDateLocalDate: arr, departureDateLocalDate: dep, arrivalDate: arr + 'T07:00:00Z', departureDate: dep + 'T07:00:00Z', confirmationId: 'C' + id, ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'Guest', lastName: id } });
const payload = computeForecast({ rooms: [{ id: 'r1', roomNumber: '101', roomTypeId: 'rt1', floorId: '01', status: true, currentOccupancyStatus: 'VAC', housekeepingRoomStatus: 'VI' }], roomTypes: [{ id: 'rt1', typeCode: 'NQRR', name: 'Double Queen' }], reservations: [resn('a', TODAY, '2026-10-14')], metrics: null, vipStatuses: [], ratePlans: [], roomTypeMapping: [], config: {}, forecastDate: TODAY });
const iso = (min) => new Date(Date.now() - min * 60000).toISOString();
const current = (sync, source = 'mirror', min = 3) => ({ ok: true, data: { success: true, source, sync, snapshot: { snapshot_id: null, scraped_at: iso(min), status: 'success', payload } } });
const std = (sync) => { responses = { 'GET /admin/forecast/current': current(sync), 'GET /admin/forecast/jobs/latest': { ok: true, data: { success: true, job: null } }, 'GET /admin/reservations/summaries': { ok: true, data: { success: true, summaries: {} } }, 'GET /admin/sync/events': { ok: true, data: { success: true, events: [], summary: {}, hasMore: false } },
  'GET /admin/forecast/live': { ok: false, status: 502, data: { success: false } }, 'GET /admin/settings': { ok: true, data: { success: true, settings: {} } }, 'GET /admin/sync/status': { ok: true, data: { success: true, tickConfigured: true, status: { settings: { enabled: true, paused: false, timezone: 'America/Los_Angeles', frequent: { enabled: true, from: '12:00', to: '24:00', everyMinutes: 5, daysAhead: 1 }, hourly: { everyMinutes: 60, aheadDays: 400, nearDays: 14 }, reconcile: { at: '04:30' }, flushEveryMinutes: 15, backfill: { monthsBack: 12, chunksPerTick: 2, auto: true }, storeRaw: true, detailForNewMax: 25, maxDetailChecks: 80 }, state: { backfill: { done: true } }, indexSize: 10, pending: { upserts: 0, patches: 0, events: 0 }, recentRuns: [], lastTickAt: iso(1), bootedAt: iso(60), nextDue: {} } } }, 'GET /admin/sync/runs': { ok: true, data: { success: true, runs: [] } } }; };

(async () => {
  const FM = load(ROOT + '/src/components/Forecasting/syncFormat.js');
  await t('freshness wording is plain: Up to date / May be out of date / Not updating / Manual update — and never technical', () => {
    const now = Date.now(); const f = (o) => FM.freshnessOf({ ...o }, now);
    let r = f({ source: 'mirror', syncedAt: iso(3), health: { state: 'ok', everyMinutes: 5 } }); assert.deepStrictEqual([r.tone, r.title, r.sub], ['ok', 'Up to date', '3 min ago']); assert(/every 5 minutes/.test(r.hint));
    r = f({ source: 'mirror', syncedAt: iso(50), health: { state: 'stale' } }); assert.deepStrictEqual([r.tone, r.title], ['warn', 'May be out of date']); assert(/tap refresh/i.test(r.hint));
    r = f({ source: 'mirror', syncedAt: iso(300), health: { state: 'down' } }); assert.deepStrictEqual([r.tone, r.title], ['bad', 'Not updating']); assert(/tell the manager/i.test(r.hint)); assert.strictEqual(f({ source: 'mirror', syncedAt: iso(300), health: { state: 'off' } }).tone, 'bad');
    r = f({ source: 'snapshot', syncedAt: iso(500), health: null }); assert.deepStrictEqual([r.tone, r.title], ['warn', 'Manual update']); assert.strictEqual(f({ source: null, syncedAt: null }).title, 'Not updated yet');
    for (const x of [f({ source: 'mirror', syncedAt: iso(3), health: { state: 'ok' } }), f({ source: 'mirror', syncedAt: iso(50), health: { state: 'stale' } }), f({ source: 'mirror', syncedAt: iso(300), health: { state: 'down' } })]) assert(!/scrape|snapshot|mirror|sync run|rGuest|api|token/i.test(x.title + x.sub + x.hint), 'no jargon: ' + JSON.stringify(x));
  });

  // ── real auth module + real router for sign-in / guards ──
  const realFetchLog = []; let meUser = null, loginResp = null;
  global.fetch = async (url, init = {}) => { realFetchLog.push(String(url)); const json = (o, st = 200) => ({ ok: st < 400, status: st, json: async () => o });
    if (/\/api\/me$/.test(url)) return meUser ? json({ success: true, user: meUser }) : json({ success: false }, 401);
    if (/\/api\/auth\/dev\/login$/.test(url)) return json(loginResp.body, loginResp.status); return json({ success: false }, 404); };
  const Auth = load(ROOT + '/src/auth/index.js', false); const DevLogin = load(ROOT + '/src/pages/Login/DevLogin.js', false).default;
  const R = (entry, routes) => React.createElement(Auth.AuthProvider, null, React.createElement(RR.MemoryRouter, { initialEntries: [entry] }, React.createElement(RR.Routes, null, ...routes)));
  const route = (path, el) => React.createElement(RR.Route, { key: path, path, element: el }); const txt = (s) => React.createElement('div', null, s);
  await t('DevLogin: server error states are explained (not configured / too many attempts / invalid); success stores the token and opens /dev', async () => {
    localStorage.clear(); meUser = null;
    const attempt = async (status, body) => { loginResp = { status, body }; const h = await mount(R('/login/dev', [route('/login/dev', React.createElement(DevLogin)), route('/dev', txt('DEV HOME'))])); await h.type(h.el.querySelector('#dev-username'), 'dev'); await h.type(h.el.querySelector('#dev-password'), 'pw'); await h.click(h.btn(/Sign in/)); return h; };
    let h = await attempt(503, { success: false, message: 'x' }); assert(/not set up on the server/.test(h.el.textContent)); assert(!localStorage.getItem('hotelops-token')); await h.unmount();
    h = await attempt(429, { success: false }); assert(/Too many attempts/.test(h.el.textContent)); await h.unmount();
    h = await attempt(401, { success: false, message: 'Invalid credentials' }); assert(/Invalid credentials/.test(h.el.textContent)); assert(!/dev\/dev/.test(h.el.textContent), 'no hint of default credentials'); await h.unmount();
    h = await attempt(200, { success: true, token: 'TOK', user: { username: 'dev', role: 'dev', type: 'dev' } }); assert(/DEV HOME/.test(h.el.textContent)); assert.strictEqual(localStorage.getItem('hotelops-token'), 'TOK'); await h.unmount();
  });
  await t('RequireDev: only a signed-in DEV gets in; signed-out visitors and MANAGERS are sent to the dev sign-in', async () => {
    const page = (entry) => R(entry, [route('/dev', React.createElement(Auth.RequireDev, null, txt('DEV AREA'))), route('/login/dev', txt('DEV SIGN-IN'))]);
    localStorage.clear(); meUser = null; let h = await mount(page('/dev')); assert(/DEV SIGN-IN/.test(h.el.textContent)); await h.unmount();
    localStorage.setItem('hotelops-token', 't'); meUser = { username: 'mgr', role: 'admin', type: 'admin' }; h = await mount(page('/dev')); assert(/DEV SIGN-IN/.test(h.el.textContent), 'a manager session must not open /dev'); await h.unmount();
    meUser = { username: 'dev', role: 'dev', type: 'dev' }; h = await mount(page('/dev')); assert(/DEV AREA/.test(h.el.textContent)); await h.unmount();
  });
  await t('a dev session never lands in the manager or staff shells: they redirect to /dev; managers still reach the admin shell', async () => {
    localStorage.setItem('hotelops-token', 't'); const shell = (entry) => R(entry, [route('/x/admin', React.createElement(Auth.RequireRole, { role: 'admin' }, txt('ADMIN SHELL'))), route('/x/staff', React.createElement(Auth.RequireRole, { role: 'staff' }, txt('STAFF SHELL'))), route('/dev', txt('DEV AREA')), route('/login', React.createElement(Auth.RedirectIfAuthed, null, txt('LOGIN PAGE')))]);
    meUser = { username: 'dev', role: 'dev', type: 'dev' }; for (const e of ['/x/admin', '/x/staff', '/login']) { const h = await mount(shell(e)); assert(/DEV AREA/.test(h.el.textContent), e); await h.unmount(); }
    meUser = { username: 'mgr', role: 'admin', type: 'admin' }; localStorage.setItem('hotelops-tenant-slug', 'x'); const h = await mount(shell('/x/admin')); assert(/ADMIN SHELL/.test(h.el.textContent)); await h.unmount();
  });

  // ── pages: manager vs dev mode + freshness badge ──
  mockAuth = { apiFetch: apiFetchMock, authFetch: async () => ({ ok: true, json: async () => ({ success: true }) }), useAuth: () => ({ logout: async () => {}, user: { role: 'dev' } }) };
  const Reservations = load(ROOT + '/src/components/Forecasting/index.js').default, Forecast = load(ROOT + '/src/components/Forecast/index.js').default;
  await t('RESERVATIONS (manager): plain freshness badge, refresh button, NO snapshot history / forecast settings / raw scraper output / "Last sync"', async () => {
    std({ state: 'ok', everyMinutes: 5 }); const h = await mount(React.createElement(Reservations)); const txt = h.el.textContent;
    assert(/Up to date/.test(txt) && /3 min ago/.test(txt)); assert(!/Last sync/.test(txt)); for (const w of [/Snapshot history/, /Forecast settings/, /Raw scraper output/]) assert(!w.test(txt), String(w)); assert(h.el.querySelector('button[aria-label^="Refresh"]')); await h.unmount();
  });
  await t('RESERVATIONS (dev): the full replica — every debug control is still there', async () => {
    std({ state: 'ok', everyMinutes: 5 }); const h = await mount(React.createElement(Reservations, { mode: 'dev' })); const txt = h.el.textContent; for (const w of [/Snapshot history/, /Forecast settings/, /Raw scraper output/, /Up to date/]) assert(w.test(txt), String(w)); await h.unmount();
  });
  await t('badge reflects the health: stale → "May be out of date"; down → "Not updating"; legacy snapshot → "Manual update"', async () => {
    std({ state: 'stale' }); let h = await mount(React.createElement(Reservations)); assert(/May be out of date/.test(h.el.textContent)); assert(h.el.querySelector('.sb-warn')); await h.unmount();
    std({ state: 'down' }); h = await mount(React.createElement(Reservations)); assert(/Not updating/.test(h.el.textContent) && h.el.querySelector('.sb-bad')); await h.unmount();
    std(null); responses['GET /admin/forecast/current'] = current(null, 'snapshot', 500); h = await mount(React.createElement(Reservations)); assert(/Manual update/.test(h.el.textContent)); await h.unmount();
  });
  await t('FORECAST (manager): freshness badge, no snapshot-history / forecast-settings links; (dev): both present', async () => {
    std({ state: 'ok', everyMinutes: 5 }); let h = await mount(React.createElement(Forecast)); let txt = h.el.textContent; assert(/Reservations\s*Up to date/.test(txt), txt.slice(0, 200)); assert(!/Snapshot history/.test(txt) && !/Forecast settings/.test(txt)); assert(/Reservations detail/.test(txt)); await h.unmount();
    h = await mount(React.createElement(Forecast, { mode: 'dev' })); txt = h.el.textContent; assert(/Snapshot history/.test(txt) && /Forecast settings/.test(txt)); await h.unmount();
  });

  // ── the Dev shell ──
  const DevShell = load(ROOT + '/src/pages/Dev/DevShell.js').default;
  const shellEl = () => React.createElement(RR.MemoryRouter, { initialEntries: ['/dev'] }, React.createElement(DevShell));
  await t('DEV SHELL: Auto-sync is home; nav reaches Reservations (full), Forecast (full), Settings (no Auto-sync tab — it has its own page), Logs, Platform; Sign out works', async () => {
    std({ state: 'ok', everyMinutes: 5 }); responses['GET /dev/jobs'] = { ok: true, data: { success: true, jobs: [{ job_id: 'j1', status: 'failed', total: 5, done: 3, skipped: 0, failed: 2, gone: 0, error: 'rGuest failing repeatedly', started_at: iso(30), finished_at: iso(29) }] } };
    responses['GET /admin/forecast/config'] = { ok: true, data: { success: true, config: { productivity_target: 6, avg_min_per_clean: {}, dedup_window_minutes: 60 } } }; responses['GET /admin/forecast/mapping'] = { ok: true, data: { success: true, mapping: [] } }; responses['GET /admin/forecast/snapshots'] = { ok: true, data: { success: true, snapshots: [] } };
    const h = await mount(shellEl()); const nav = (l) => [...h.el.querySelectorAll('.dv-nav button')].find(b => b.textContent === l);
    assert(/Sync health/.test(h.el.textContent), 'Auto-sync is the landing page'); assert(h.el.querySelector('.dv-badge').textContent === 'DEV');
    await h.click(nav('Reservations')); assert(/Raw scraper output/.test(h.el.textContent) && /Snapshot history/.test(h.el.textContent), 'dev gets the full Reservations page');
    await h.click(nav('Forecast')); assert(/Room Forecast/.test(h.el.textContent) && /Forecast settings/.test(h.el.textContent));
    await h.click(nav('Settings')); const tabs = [...h.el.querySelectorAll('[role=tab]')].map(b => b.textContent.replace(/\d+$/, '')); assert(tabs.includes('Labor constants') && tabs.includes('Late bookings') && tabs.includes('Room-type mapping') && !tabs.includes('Auto-sync'), tabs.join('|'));
    await h.click(nav('Logs')); assert(/Change feed/.test(h.el.textContent)); await h.click([...h.el.querySelectorAll('.dv-tabs button')].find(b => /Guest-detail jobs/.test(b.textContent))); assert(/rGuest failing repeatedly/.test(h.el.textContent));
    await h.click(nav('Platform')); assert(/Tenant logo/.test(h.el.textContent)); await h.unmount();
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
