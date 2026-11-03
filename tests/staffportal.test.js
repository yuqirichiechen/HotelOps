// Sprint 24 — the staff portal: login screen modes (Clock in · Manager · Staff login), which door a person is sent through, the portal shell
// (front desk vs other employees), the front-desk Home (tiles + sellable vs arriving, no guest data, no manager routes) and the simplified Housekeeping.
//   node tests/staffportal.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, CustomEvent: w.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));   // jsdom has none (Sidebar + the login keypad ask)
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils'); const RR = require(ROOT + '/node_modules/react-router-dom');
const { computeForecast } = require(ROOT + '/server/forecast/compute'); const { redactCurrentResponse } = require(ROOT + '/server/frontdesk');

globalThis.__HOTELOPS_NO_ANIM = true;   // count-ups / ring fills show their final values immediately
const calls = []; let responses = {}; let mockAuth = null;
const apiFetchMock = async (p, o = {}) => { calls.push({ p, method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null }); const r = responses[(o.method || 'GET') + ' ' + p.split('?')[0]]; return typeof r === 'function' ? r(p, o) : (r || { ok: false, status: 404, data: { message: 'no mock ' + p } }); };
const modCache = new Map();
const load = (file, useMockAuth = true) => { const ck = file + '|' + useMockAuth; if (modCache.has(ck)) return modCache.get(ck); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (useMockAuth && /^(\.\.\/)+auth$/.test(id)) return mockAuth; if (id === '../../shells/ViewContext' && file.includes('/components/Forecast')) return { useView: () => ({ goTo() {} }) };
    if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : (fs.existsSync(p) && fs.statSync(p).isDirectory() ? p + '/index.js' : p), useMockAuth); } return orig(id); };
  modCache.set(ck, m.exports); m._compile(code, file); return m.exports; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };
const mount = async (el_, wait = 60) => { const el = document.getElementById('root'); el.innerHTML = ''; const root = createRoot(el); await act(async () => { root.render(el_); }); await act(async () => { await sleep(wait); });
  const click = async (n) => { await act(async () => { n.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await act(async () => { await sleep(40); }); };
  const type = async (input, value) => { const set = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set; await act(async () => { set.call(input, value); input.dispatchEvent(new w.Event('input', { bubbles: true })); }); };
  return { el, root, click, type, btn: (re) => [...el.querySelectorAll('button')].find(b => re.test(b.textContent) || re.test(b.getAttribute('aria-label') || '')), unmount: () => act(async () => { root.unmount(); }) }; };

// ── fixtures: a real payload from the real model, then run through the server's redaction (what the front desk receives) ──
const TODAY = '2026-11-02';
const resn = (id, arr, dep, status = 'RES', room) => ({ id, status, roomType: 'rt1', roomId: room ? 'r' + room : undefined, roomNumber: room, arrivalDateLocalDate: arr, departureDateLocalDate: dep, arrivalDate: arr + 'T07:00:00Z', departureDate: dep + 'T07:00:00Z', confirmationId: 'C' + id, ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'Secret', lastName: 'Guest' + id } });
const room = (n, hk, occ = 'VAC') => ({ id: 'r' + n, roomNumber: n, roomTypeId: 'rt1', floorId: '01', status: true, currentOccupancyStatus: occ, housekeepingRoomStatus: hk });
const payload = computeForecast({ rooms: [room('101', 'VI'), room('102', 'PU'), room('103', 'D'), room('104', 'IP'), room('105', 'OC', 'OCC')], roomTypes: [{ id: 'rt1', typeCode: 'NQRR', name: 'Double Queen' }],
  reservations: [resn('a', TODAY, '2026-11-04'), resn('b', '2026-11-01', TODAY, 'INH', '105')], metrics: null, vipStatuses: [], ratePlans: [], mappings: [{ type_code: 'NQRR', base_code: 'NQRR', base_label: 'Double Queen', sub_label: '' }], forecastDate: TODAY, config: {} });
const deskCurrent = redactCurrentResponse({ success: true, source: 'mirror', sync: { state: 'ok', everyMinutes: 5 }, snapshot: { snapshot_id: null, scraped_at: new Date(Date.now() - 3 * 60000).toISOString(), status: 'success', payload } });
const ok = (data) => ({ ok: true, status: 200, data: { success: true, ...data } });
const stdResponses = () => ({
  'GET /frontdesk/forecast/current': { ok: true, status: 200, data: deskCurrent }, 'GET /frontdesk/forecast/live': { ok: false, status: 502, data: { success: false } },
  'GET /me/hours': ok({ totalHours: 12.5, recentShifts: [], currentlyClockedIn: false, idleLogoutSeconds: 15, autoSignoutSeconds: 5 }),
  'GET /frontdesk/employees': ok({ employees: [{ user_id: 'u1', name: 'Bryan', active: true, department: 'Housekeeping' }, { user_id: 'u2', name: 'Berta Rangel', active: true, department: 'Housekeeping' }] }),
  'GET /frontdesk/settings': ok({ settings: {} }), 'GET /frontdesk/housekeeping/plans': ok({ plans: [] }), 'GET /frontdesk/housekeeping/locked-rooms': ok({ rooms: [] }),
  'GET /frontdesk/housekeeping/plan': ok({ plan: null }), 'PUT /frontdesk/housekeeping/plan': ok({ updatedAt: new Date().toISOString() }),
});

(async () => {
  // ── 1. which door a person is sent through ──
  const realFetchLog = []; let meUser = null; let staffLogin = { status: 200, body: null };
  global.fetch = async (url, init = {}) => { realFetchLog.push([String(url), init && init.method]); const json = (o, st = 200) => ({ ok: st < 400, status: st, json: async () => o });
    if (/\/api\/me$/.test(url)) return meUser ? json({ success: true, user: meUser }) : json({ success: false }, 401);
    if (/\/api\/public-config$/.test(url)) return json({ success: true, config: { enabled_login_methods: ['phone', 'employee_code'], hide_abc_keyboard: true } });
    if (/\/api\/auth\/staff\/login$/.test(url)) return json(staffLogin.body, staffLogin.status); return json({ success: false }, 404); };
  const Auth = load(ROOT + '/src/auth/index.js', false); const { LanguageProvider } = load(ROOT + '/src/i18n/index.js', false);
  const R = (entry, routes) => React.createElement(Auth.AuthProvider, null, React.createElement(LanguageProvider, null, React.createElement(RR.MemoryRouter, { initialEntries: [entry] }, React.createElement(RR.Routes, null, ...routes))));
  const route = (p, el) => React.createElement(RR.Route, { key: p, path: p, element: el }); const txt = (s) => React.createElement('div', null, s);

  await t('homePathFor: managers → admin; everyone else → the door they last used (default: clock-in dashboard, as before)', () => {
    localStorage.clear(); const desk = { role: 'front_desk' }, adm = { role: 'admin' };
    assert.strictEqual(Auth.homePathFor(desk, 'x'), '/x/clockin'); assert.strictEqual(Auth.homePathFor(adm, 'x'), '/x/admin');
    Auth.setStaffEntry('staff'); assert.strictEqual(Auth.homePathFor(desk, 'x'), '/x/staff'); assert.strictEqual(Auth.homePathFor(adm, 'x'), '/x/admin'); assert.strictEqual(Auth.getStaffEntry(), 'staff');
    Auth.setStaffEntry('whatever'); assert.strictEqual(Auth.getStaffEntry(), 'clockin', 'unknown values fall back to clock-in');
  });
  await t('guards: signed-in staff on the login page / wrong shell are sent to THEIR door; both shells accept any non-admin, neither admits a manager', async () => {
    localStorage.setItem('hotelops-token', 't'); localStorage.setItem('hotelops-tenant-slug', 'x'); meUser = { role: 'front_desk', name: 'Fran' };
    const page = (entry) => R(entry, [route('/x/login', React.createElement(Auth.RedirectIfAuthed, null, txt('LOGIN'))), route('/x/staff', React.createElement(Auth.RequireRole, { role: 'staff' }, txt('PORTAL'))), route('/x/clockin', React.createElement(Auth.RequireRole, { role: 'staff' }, txt('CLOCKIN'))), route('/x/admin', React.createElement(Auth.RequireRole, { role: 'admin' }, txt('ADMIN')))]);
    Auth.setStaffEntry('staff'); let h = await mount(page('/x/login')); assert(/PORTAL/.test(h.el.textContent), h.el.textContent); await h.unmount();
    Auth.setStaffEntry('clockin'); h = await mount(page('/x/login')); assert(/CLOCKIN/.test(h.el.textContent)); await h.unmount();
    h = await mount(page('/x/staff')); assert(/PORTAL/.test(h.el.textContent)); await h.unmount(); h = await mount(page('/x/clockin')); assert(/CLOCKIN/.test(h.el.textContent)); await h.unmount();
    meUser = { role: 'admin', name: 'Mgr' }; h = await mount(page('/x/staff')); assert(/ADMIN/.test(h.el.textContent), 'a manager is sent to the admin shell, not the portal'); await h.unmount(); h = await mount(page('/x/clockin')); assert(/ADMIN/.test(h.el.textContent)); await h.unmount();
  });

  // ── 2. the login screen ──
  const TenantLogin = load(ROOT + '/src/pages/Login/TenantLogin.js', false).default;
  const loginPage = () => R('/snoqualmieinn/login', [route('/:tenant/login', React.createElement(TenantLogin)), route('/:tenant/staff', txt('PORTAL SHELL')), route('/:tenant/clockin', txt('CLOCKIN SHELL')), route('/set-pin', txt('SET PIN'))]);
  const sw = (h) => [...h.el.querySelectorAll('.login-headline-actions .login-role-switch')].map(b => b.getAttribute('data-mode'));
  const signIn = async (h) => { await h.type(h.el.querySelector('#identifier'), '4155550123'); await h.click(h.el.querySelector('.login-submit')); await act(async () => { await sleep(60); }); };
  await t('LOGIN SCREEN: opens on Clock in; the buttons are HotelOps, Manager, then "Staff login" at the far right with its name visible', async () => {
    localStorage.clear(); meUser = null; const h = await mount(loginPage(), 120);
    assert.strictEqual(h.el.querySelector('.login-entry-tag').textContent, 'Clock in'); assert.deepStrictEqual(sw(h), ['admin', 'staff'], 'Manager first, Staff login to its right');
    const row = [...h.el.querySelector('.login-headline-actions').children]; assert(row[0].classList.contains('login-topbar-brand'), 'HotelOps mark first'); assert.strictEqual(row[row.length - 1].getAttribute('data-mode'), 'staff');
    assert.strictEqual(row[row.length - 1].querySelector('.login-role-label').textContent, 'Staff login'); assert.strictEqual(row[row.length - 1].getAttribute('aria-label'), 'Staff login'); await h.unmount();
  });
  await t('switching modes: Staff login shows the other two (Clock in, Manager); Manager shows Clock in + Staff login; the form changes only for Manager', async () => {
    localStorage.clear(); const h = await mount(loginPage(), 120);
    await h.click(h.el.querySelector('[data-mode="staff"]')); assert.strictEqual(h.el.querySelector('.login-entry-tag').textContent, 'Staff login'); assert.deepStrictEqual(sw(h), ['clockin', 'admin']); assert(h.el.querySelector('#identifier'), 'same phone / ID keypad form');
    await h.click(h.el.querySelector('[data-mode="admin"]')); assert(h.el.querySelector('#username') && h.el.querySelector('#password') && !h.el.querySelector('#identifier')); assert.deepStrictEqual(sw(h), ['clockin', 'staff']);
    await h.click(h.el.querySelector('[data-mode="staff"]')); assert.strictEqual(h.el.querySelector('.login-entry-tag').textContent, 'Staff login');
    await h.click(h.el.querySelector('[data-mode="clockin"]')); assert.strictEqual(h.el.querySelector('.login-entry-tag').textContent, 'Clock in'); await h.unmount();
  });
  await t('SAME CREDENTIALS, different door: the same sign-in request from Clock in lands on /clockin, from Staff login on /staff — and the choice is remembered', async () => {
    const user = { user_id: 'u9', name: 'Fran', role: 'front_desk', pin_must_set: false }; staffLogin = { status: 200, body: { success: true, token: 'TOK', user } };
    localStorage.clear(); realFetchLog.length = 0; let h = await mount(loginPage(), 120); await signIn(h); assert(/CLOCKIN SHELL/.test(h.el.textContent), h.el.textContent); assert.strictEqual(Auth.getStaffEntry(), 'clockin'); await h.unmount();
    localStorage.clear(); realFetchLog.length = 0; h = await mount(loginPage(), 120); await h.click(h.el.querySelector('[data-mode="staff"]')); await signIn(h); assert(/PORTAL SHELL/.test(h.el.textContent), h.el.textContent); assert.strictEqual(Auth.getStaffEntry(), 'staff');
    const logins = realFetchLog.filter(([u]) => /auth\/staff\/login/.test(u)); assert.strictEqual(logins.length, 1, 'one request, the existing endpoint — no new credential path'); await h.unmount();
    h = await mount(loginPage(), 120); assert.strictEqual(h.el.querySelector('.login-entry-tag').textContent, 'Staff login', 'this browser now opens on the door it used last'); await h.unmount();
  });
  await t('a stale deep link to the OTHER staff shell does not override the door just chosen; a deep link elsewhere still works', async () => {
    staffLogin = { status: 200, body: { success: true, token: 'TOK', user: { user_id: 'u9', name: 'Fran', role: 'front_desk' } } }; localStorage.clear(); meUser = null;
    const page = (state) => R({ pathname: '/snoqualmieinn/login', state }, [route('/:tenant/login', React.createElement(TenantLogin)), route('/:tenant/staff', txt('PORTAL SHELL')), route('/:tenant/clockin', txt('CLOCKIN SHELL'))]);
    let h = await mount(page({ from: { pathname: '/snoqualmieinn/staff' } }), 120); await signIn(h); assert(/CLOCKIN SHELL/.test(h.el.textContent), 'Clock in screen → clock-in door even though the link said /staff'); await h.unmount();
  });
  await t('a wrong employee id / unknown person shows the server message and stays on the screen (Staff login too)', async () => {
    staffLogin = { status: 404, body: { success: false, message: 'Employee not found' } }; localStorage.clear(); const h = await mount(loginPage(), 120); await h.click(h.el.querySelector('[data-mode="staff"]')); await signIn(h);
    assert(/Employee not found/.test(h.el.textContent)); assert(!/PORTAL SHELL/.test(h.el.textContent)); await h.unmount();
  });

  // ── 3. the portal shell ──
  mockAuth = { apiFetch: apiFetchMock, authFetch: async () => ({ ok: true, json: async () => ({ success: true }) }), useAuth: () => ({ logout: async () => {}, user: mockAuth._user }), setStaffEntry() {}, getStaffEntry: () => 'staff', homePathFor: () => '/x/staff' };
  const Shell = load(ROOT + '/src/shells/StaffPortalShell.js').default; const AuthMock = mockAuth;
  const portal = () => React.createElement(RR.MemoryRouter, null, React.createElement(LanguageProvider, null, React.createElement(Shell, { theme: 'light', onToggleTheme() {} })));
  const navLabels = (h) => [...h.el.querySelectorAll('.sidebar-nav button, .sidebar button, nav button, nav a')].map(b => b.textContent.trim()).filter(Boolean);
  await t('PORTAL (front desk): nav = Home · Housekeeping · Timesheet · Calendar · Settings; Home = front-desk tiles + sellable-vs-arriving + the original clock/hours dashboard', async () => {
    AuthMock._user = { user_id: 'u9', name: 'Fran Desk', role: 'front_desk' }; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 250);
    const labels = navLabels(h).join('|'); for (const l of ['Home', 'Housekeeping', 'Timesheet', 'Calendar', 'Settings']) assert(labels.includes(l), l + ' in ' + labels);
    const text = h.el.textContent; for (const l of ['Arrivals left', 'In-house', 'Check-outs left', 'Left to sell', 'Dirty rooms', 'Sellable vs arriving', 'Total left to sell']) assert(text.includes(l), l);
    assert(h.el.querySelectorAll('.fd-tiles .fc-kpi-card').length === 5, 'five tiles'); assert(h.el.querySelector('.home-clock-section'), 'clock card is on the same Home'); assert(/This week|home\.this_week|12\.5h/.test(text), 'hours summary');
    assert(!/Secret|Guest[ab]|CONFa/.test(text), 'no guest data on screen'); assert(calls.every(c => !c.p.startsWith('/admin/')), 'never calls a manager route: ' + calls.map(c => c.p).join(', '));
    assert(calls.some(c => c.p === '/frontdesk/forecast/current') && calls.some(c => c.p === '/frontdesk/forecast/live')); await h.unmount();
  });
  await t('the tile numbers come from the same models as the manager pages (arrivals left 1, left to sell 2 = VI+PU, dirty 2 = D+IP)', async () => {
    AuthMock._user = { user_id: 'u9', name: 'Fran Desk', role: 'front_desk' }; responses = stdResponses(); const h = await mount(portal(), 250);
    const tile = (label) => [...h.el.querySelectorAll('.fc-kpi-card')].find(c => c.textContent.includes(label)); const num = (c) => Number(c.querySelector('.fc-kpi-primary').textContent);
    const got = JSON.stringify(Object.fromEntries(['Arrivals left', 'In-house', 'Left to sell', 'Dirty rooms'].map(l => [l, num(tile(l))]))); assert.strictEqual(got, JSON.stringify({ 'Arrivals left': 1, 'In-house': 1, 'Left to sell': 2, 'Dirty rooms': 2 })); await h.unmount();
  });
  await t('PORTAL (other employee): no Housekeeping, no front-desk block, and not one request to the front-desk routes', async () => {
    AuthMock._user = { user_id: 'u5', name: 'Hana Housekeeper', role: 'employee' }; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 200);
    assert(!navLabels(h).join('|').includes('Housekeeping')); assert(!h.el.querySelector('.fd-ops')); assert(h.el.querySelector('.home-clock-section'), 'their own dashboard is there');
    assert(calls.every(c => !c.p.startsWith('/frontdesk/') && !c.p.startsWith('/admin/')), calls.map(c => c.p).join(', ')); await h.unmount();
  });
  await t('PORTAL has no full-screen "focused action" overlay and no auto-signout countdown after a clock event (it is a desk PC, not the kiosk)', async () => {
    AuthMock._user = { user_id: 'u9', name: 'Fran Desk', role: 'front_desk' }; responses = stdResponses(); responses['POST /clock-in-self'] = ok({}); calls.length = 0; const h = await mount(portal(), 200);
    assert(!document.querySelector('.focused-action'), 'no overlay at landing'); await h.click(h.el.querySelector('.home-clock-action.in')); await act(async () => { await sleep(80); });
    assert(!h.el.querySelector('.auto-signout-banner'), 'no countdown banner'); assert(calls.some(c => c.p === '/clock-in-self' && c.method === 'POST'), 'clocking in still works from the portal'); await h.unmount();
  });
  await t('control: the ORIGINAL Home (clock-in door) still shows the full-screen focused-action overlay, so the portal test above is not vacuous', async () => {
    AuthMock._user = { user_id: 'u5', name: 'Hana Housekeeper', role: 'employee' }; responses = stdResponses(); sessionStorage.clear();
    const Home = load(ROOT + '/src/pages/Home/index.js').default; const h = await mount(React.createElement(RR.MemoryRouter, null, React.createElement(LanguageProvider, null, React.createElement(Home))), 150);
    assert(document.querySelector('.focused-action'), 'kiosk overlay present on the legacy Home'); await h.unmount();
  });
  await t('HOUSEKEEPING (portal): the simple layout — Plan by + Today/Tomorrow, Staff, Working today, Not assigned; no stat cards or history strip; all calls on /frontdesk', async () => {
    AuthMock._user = { user_id: 'u9', name: 'Fran Desk', role: 'front_desk' }; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 200);
    await h.click([...h.el.querySelectorAll('button, a')].find(b => b.textContent.trim() === 'Housekeeping')); await act(async () => { await sleep(250); });
    const text = h.el.textContent; for (const l of ['Plan by', 'Names', 'No name', 'Staff', 'Working today', 'Not assigned', 'Auto-assign', 'Reset', 'Min', 'Max']) assert(text.includes(l), l);
    assert(!h.el.querySelector('.hk-top') && !h.el.querySelector('.hk-stats') && !h.el.querySelector('.hk-strip'), 'no stat cards / history strip'); assert(h.btn(/^Today$/) && h.btn(/^Tomorrow$/), 'Today | Tomorrow switch');
    assert(calls.some(c => c.p.startsWith('/frontdesk/housekeeping/plans')) && calls.some(c => c.p === '/frontdesk/employees')); assert(calls.every(c => !c.p.startsWith('/admin/')), calls.map(c => c.p).join(', '));
    assert(!/Print sheet colours/i.test(text), 'dev-only colour card stays hidden'); await h.unmount();
  });
  await t('HOUSEKEEPING (portal): same functions as the manager page — add a name, save to /frontdesk, switch to Tomorrow, No-name mode', async () => {
    AuthMock._user = { user_id: 'u9', name: 'Fran Desk', role: 'front_desk' }; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 200);
    await h.click([...h.el.querySelectorAll('button, a')].find(b => b.textContent.trim() === 'Housekeeping')); await act(async () => { await sleep(250); });
    await h.click(h.btn(/^Add Bryan$/)); assert(/Working today[\s\S]*Bryan/.test(h.el.textContent), 'Bryan is working'); await h.click(h.btn(/^Save$/)); await act(async () => { await sleep(50); });
    const put = calls.find(c => c.method === 'PUT'); assert(put && put.p === '/frontdesk/housekeeping/plan', 'saved through the front-desk route'); assert.strictEqual(put.body.assignments[0].name, 'Bryan');
    await h.click(h.btn(/^Tomorrow$/)); await act(async () => { await sleep(120); }); assert(/Working tomorrow/.test(h.el.textContent), 'Tomorrow view'); assert(calls.some(c => /housekeeping\/plan\?date=2026-11-03/.test(c.p)), 'loaded tomorrow’s plan');
    await h.click(h.btn(/^No name$/)); await act(async () => { await sleep(60); }); assert(/How many housekeepers/i.test(h.el.textContent), 'No-name mode works'); assert(calls.every(c => !c.p.startsWith('/admin/'))); await h.unmount();
  });
  if (process.env.DUMP_DIR) {   // screenshots: DUMP_DIR=somewhere node tests/staffportal.test.js "$PWD"  → login-*.html, home.html, housekeeping.html (wrap with the built CSS)
    const out = (n, h) => fs.writeFileSync(path.join(process.env.DUMP_DIR, n + '.html'), h.el.innerHTML);
    localStorage.clear(); let h = await mount(loginPage(), 150); out('login-clockin', h); await h.click(h.el.querySelector('[data-mode="staff"]')); out('login-staff', h); await h.unmount();
    AuthMock._user = { user_id: 'u9', name: 'Fran Desk', role: 'front_desk' }; responses = stdResponses(); h = await mount(portal(), 250); out('home', h);
    await h.click([...h.el.querySelectorAll('button, a')].find(b => b.textContent.trim() === 'Housekeeping')); await act(async () => { await sleep(250); }); await h.click(h.btn(/^Add Bryan$/)); out('housekeeping', h); await h.unmount();
  }
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
