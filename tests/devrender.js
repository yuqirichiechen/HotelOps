// Renders the manager Reservations page / the Dev shell with mock data to HTML for screenshots.  DUMP=out.html WHICH=manager|dev node tests/devrender.js "$PWD"
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
  mockAuth = { apiFetch: apiFetchMock, authFetch: async () => ({ ok: true, json: async () => ({ success: true }) }), useAuth: () => ({ logout: async () => {}, user: { role: 'dev' } }) };
  std({ state: 'ok', everyMinutes: 5 });
  responses['GET /admin/sync/events'] = { ok: true, data: { success: true, events: [{ event_id: 3, event_type: 'new', occurred_at: iso(6), changes: {}, info: {}, guest_name: 'Ann Lee', confirmation_id: 'S9TJXNR3', type_code: 'NQRR', arrival_date: '2026-10-24', departure_date: '2026-10-26', booked_by: 'SiteMinder' }], summary: { new: 2 }, hasMore: false } };
  const React_ = React; const RRd = RR;
  const el = process.env.WHICH === 'dev' ? React_.createElement(RRd.MemoryRouter, { initialEntries: ['/dev'] }, React_.createElement(load(ROOT + '/src/pages/Dev/DevShell.js').default)) : React_.createElement(load(ROOT + '/src/components/Forecasting/index.js').default);
  const h = await mount(el); fs.writeFileSync(process.env.DUMP, h.el.innerHTML); console.log('rendered', h.el.textContent.length); process.exit(0);
})();
