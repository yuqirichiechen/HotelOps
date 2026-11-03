// Sprint 24 / 24.1 / 24.3 — the staff portal: login modes (Clock in numpad · Manager · Staff login PC form, icon-only), which door a person is sent through,
// the clock-only Clock in door, the portal shell (Front Desk DEPARTMENT vs other staff; no clocking in the portal), the front-desk Home (tiles +
// sellable vs arriving, no guest data, no manager routes) and the simplified Housekeeping.
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
  'GET /me/hours': (p) => { const ws = (p.match(/weekStart=([0-9-]+)/) || [])[1] || '2026-11-02'; const d0 = new Date(ws + 'T00:00:00Z'); const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(d0.getTime() + i * 864e5); return { date: d.toISOString().slice(0, 10), dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] }; });
    return ok({ weekStart: ws, days, entries: [], scheduledHours: 0, totalHours: ws === '2026-11-02' ? 12.5 : 3, currentlyClockedIn: false, idleLogoutSeconds: 15, autoSignoutSeconds: 5,
      recentShifts: ws === '2026-11-02' ? [{ entry_id: 'e1', clock_in_time: '2026-11-02T16:00:00Z', clock_out_time: '2026-11-03T00:00:00Z', hours: 8 }, { entry_id: 'e2', clock_in_time: '2026-10-31T16:00:00Z', clock_out_time: null, hours: 0 }] : [] }); },
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

  await t('homePathFor: managers → admin; everyone else → the door they last used (default: the Clock in door)', () => {
    localStorage.clear(); const desk = { role: 'employee', department: 'Front Desk' }, adm = { role: 'admin' };
    assert.strictEqual(Auth.homePathFor(desk, 'x'), '/x/clockin'); assert.strictEqual(Auth.homePathFor(adm, 'x'), '/x/admin');
    Auth.setStaffEntry('staff'); assert.strictEqual(Auth.homePathFor(desk, 'x'), '/x/staff'); assert.strictEqual(Auth.homePathFor(adm, 'x'), '/x/admin'); assert.strictEqual(Auth.getStaffEntry(), 'staff');
    Auth.setStaffEntry('whatever'); assert.strictEqual(Auth.getStaffEntry(), 'clockin', 'unknown values fall back to clock-in');
  });
  await t('guards: signed-in staff on the login page / wrong shell are sent to THEIR door; both shells accept any non-admin, neither admits a manager', async () => {
    localStorage.setItem('hotelops-token', 't'); localStorage.setItem('hotelops-tenant-slug', 'x'); meUser = { role: 'employee', department: 'Front Desk', name: 'Fran' };
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
  const typeStaff = async (h, id, pin) => { await h.type(h.el.querySelector('#staff-identifier'), id); if (pin) await h.type(h.el.querySelector('#staff-pin'), pin); await h.click(h.el.querySelector('.login-submit')); await act(async () => { await sleep(60); }); };
  await t('LOGIN SCREEN: opens on Clock in (numpad); the buttons are HotelOps, Manager, then Staff login at the far right — ICON ONLY, no names on screen', async () => {
    localStorage.clear(); meUser = null; const h = await mount(loginPage(), 120);
    assert(h.el.querySelector('#identifier') && h.el.querySelector('.login-keypad'), 'numpad screen'); assert.deepStrictEqual(sw(h), ['admin', 'staff'], 'Manager first, Staff login to its right');
    const row = [...h.el.querySelector('.login-headline-actions').children]; assert(row[0].classList.contains('login-topbar-brand'), 'HotelOps mark first'); const last = row[row.length - 1]; assert.strictEqual(last.getAttribute('data-mode'), 'staff');
    assert.strictEqual(last.getAttribute('aria-label'), 'Staff login', 'the name is only the tooltip'); assert.strictEqual(last.textContent.trim(), '', 'no visible text on the button'); assert(last.querySelector('svg'), 'uses the current badge icon');
    assert(!h.el.querySelector('.login-entry-tag, .login-role-label'), 'no name tags anywhere'); await h.unmount();
  });
  await t('STAFF LOGIN is the PC form, same design as the manager card — typed identifier + PIN, NO numpad; every mode button is the same square so the logo stays put', async () => {
    localStorage.clear(); const h = await mount(loginPage(), 120); await h.click(h.el.querySelector('[data-mode="staff"]'));
    assert(h.el.querySelector('#staff-identifier') && h.el.querySelector('#staff-pin'), 'two typed fields'); assert(!h.el.querySelector('.login-keypad, .lk-btn, #identifier'), 'no numpad'); assert(!h.el.querySelector('.login-card-staff'), 'single-column card like the manager sign-in');
    assert.strictEqual(h.el.querySelector('.login-title').textContent, 'Staff sign-in'); assert.deepStrictEqual(sw(h), ['clockin', 'admin']); assert(/phone number or employee ID/.test(h.el.querySelector('label[for="staff-identifier"]').textContent), 'label follows the enabled login methods');
    assert(h.el.querySelector('.login-submit').disabled, 'needs an identifier'); assert(![...h.el.querySelectorAll('.login-role-switch')].some(b => b.textContent.trim()), 'icon-only buttons');
    assert.strictEqual(h.el.querySelectorAll('.login-headline-actions > *').length, 3, 'always HotelOps + two buttons → same widths on every screen'); await h.unmount();
  });
  await t('switching modes: all three screens, any order; Manager is the username/password form', async () => {
    localStorage.clear(); const h = await mount(loginPage(), 120);
    await h.click(h.el.querySelector('[data-mode="staff"]')); assert(h.el.querySelector('#staff-identifier'));
    await h.click(h.el.querySelector('[data-mode="admin"]')); assert(h.el.querySelector('#username') && h.el.querySelector('#password') && !h.el.querySelector('#identifier')); assert.deepStrictEqual(sw(h), ['clockin', 'staff']);
    await h.click(h.el.querySelector('[data-mode="staff"]')); assert(h.el.querySelector('#staff-identifier')); await h.click(h.el.querySelector('[data-mode="clockin"]')); assert(h.el.querySelector('#identifier') && h.el.querySelector('.login-keypad')); await h.unmount();
  });
  await t('SAME CREDENTIALS, different door: Clock in (numpad) → /clockin, Staff login (typed) → /staff, one request each to the existing endpoint — and the page still opens on Clock in next time', async () => {
    const user = { user_id: 'u9', name: 'Fran', role: 'employee', department: 'Front Desk', pin_must_set: false }; staffLogin = { status: 200, body: { success: true, token: 'TOK', user } };
    localStorage.clear(); realFetchLog.length = 0; let h = await mount(loginPage(), 120); await signIn(h); assert(/CLOCKIN SHELL/.test(h.el.textContent), h.el.textContent); assert.strictEqual(Auth.getStaffEntry(), 'clockin'); await h.unmount();
    localStorage.clear(); realFetchLog.length = 0; h = await mount(loginPage(), 120); await h.click(h.el.querySelector('[data-mode="staff"]')); await typeStaff(h, 'fran.desk', '1234'); assert(/PORTAL SHELL/.test(h.el.textContent), h.el.textContent); assert.strictEqual(Auth.getStaffEntry(), 'staff');
    const logins = realFetchLog.filter(([u]) => /auth\/staff\/login/.test(u)); assert.strictEqual(logins.length, 1, 'one request, the existing endpoint — no new credential path'); await h.unmount();
    h = await mount(loginPage(), 120); assert(h.el.querySelector('#identifier') && h.el.querySelector('.login-keypad') && !h.el.querySelector('#staff-identifier'), 'the login page ALWAYS opens on Clock in (the numpad), even right after a Staff login'); await h.unmount();
  });
  await t('Staff login sends exactly what was typed (username / phone / ID + PIN) and a PIN the person has is optional', async () => {
    let sent = null; const orig = global.fetch; global.fetch = async (url, init = {}) => { if (/auth\/staff\/login$/.test(url)) sent = JSON.parse(init.body); return orig(url, init); };
    staffLogin = { status: 200, body: { success: true, token: 'TOK', user: { user_id: 'u9', name: 'Fran', role: 'employee' } } }; localStorage.clear();
    let h = await mount(loginPage(), 120); await h.click(h.el.querySelector('[data-mode="staff"]')); await typeStaff(h, 'fran.desk'); assert.deepStrictEqual(sent, { identifier: 'fran.desk' }, 'no PIN → none sent'); await h.unmount();
    localStorage.clear(); h = await mount(loginPage(), 120); await h.click(h.el.querySelector('[data-mode="staff"]')); await typeStaff(h, '4155550123', '4321'); assert.deepStrictEqual(sent, { identifier: '4155550123', pin: '4321' }); await h.unmount(); global.fetch = orig;
  });
  await t('a person who needs a PIN is told so on the form; an unknown person gets the server message; neither leaves the screen', async () => {
    staffLogin = { status: 400, body: { success: false, message: 'PIN required', pin_required: true } }; localStorage.clear(); let h = await mount(loginPage(), 120); await h.click(h.el.querySelector('[data-mode="staff"]')); await typeStaff(h, 'fran.desk');
    assert(/Enter your PIN/.test(h.el.textContent)); assert(!/PORTAL SHELL/.test(h.el.textContent)); await h.unmount();
    staffLogin = { status: 404, body: { success: false, message: 'Employee not found' } }; h = await mount(loginPage(), 120); await h.click(h.el.querySelector('[data-mode="staff"]')); await typeStaff(h, 'nobody');
    assert(/Employee not found/.test(h.el.textContent)); assert(!/PORTAL SHELL/.test(h.el.textContent)); await h.unmount();
  });
  await t('a stale deep link to the OTHER staff shell does not override the door just chosen', async () => {
    staffLogin = { status: 200, body: { success: true, token: 'TOK', user: { user_id: 'u9', name: 'Fran', role: 'employee' } } }; localStorage.clear(); meUser = null;
    const page = (state) => R({ pathname: '/snoqualmieinn/login', state }, [route('/:tenant/login', React.createElement(TenantLogin)), route('/:tenant/staff', txt('PORTAL SHELL')), route('/:tenant/clockin', txt('CLOCKIN SHELL'))]);
    let h = await mount(page({ from: { pathname: '/snoqualmieinn/staff' } }), 120); await signIn(h); assert(/CLOCKIN SHELL/.test(h.el.textContent), 'Clock in screen → clock-in door even though the link said /staff'); await h.unmount();
    localStorage.clear(); h = await mount(page({ from: { pathname: '/snoqualmieinn/clockin' } }), 120); await h.click(h.el.querySelector('[data-mode="staff"]')); await typeStaff(h, 'fran.desk'); assert(/PORTAL SHELL/.test(h.el.textContent)); await h.unmount();
  });

  // ── 3. the portal shell ──
  mockAuth = { apiFetch: apiFetchMock, authFetch: async () => ({ ok: true, json: async () => ({ success: true }) }), useAuth: () => ({ logout: async () => {}, user: mockAuth._user }), setStaffEntry() {}, getStaffEntry: () => 'staff', homePathFor: () => '/x/staff', isFrontDesk: Auth.isFrontDesk };
  const Shell = load(ROOT + '/src/shells/StaffPortalShell.js').default; const ClockIn = load(ROOT + '/src/shells/ClockInShell.js').default; const AuthMock = mockAuth;
  const DESK = { user_id: 'u9', name: 'Fran Desk', role: 'employee', department: 'Front Desk' }, HK = { user_id: 'u5', name: 'Hana Housekeeper', role: 'employee', department: 'Housekeeping' }, ROLE_ONLY = { user_id: 'u7', name: 'Old Role', role: 'front_desk', department: 'Housekeeping' };
  const portal = () => React.createElement(RR.MemoryRouter, null, React.createElement(LanguageProvider, null, React.createElement(Shell, { theme: 'light', onToggleTheme() {} })));
  const navLabels = (h) => [...h.el.querySelectorAll('.sidebar-nav button, .sidebar button, nav button, nav a')].map(b => b.textContent.trim()).filter(Boolean);
  const openTab = async (h, label) => { await h.click([...h.el.querySelectorAll('button, a')].find(b => b.textContent.trim() === label)); await act(async () => { await sleep(250); }); };
  await t('PORTAL (Front Desk): nav = Home · Reservations · Housekeeping · Calendar · Settings (NO Timesheet page); Home = hours + timesheet; Reservations = the 5 tiles + sellable-vs-arriving WITHOUT the chart', async () => {
    AuthMock._user = DESK; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 250);
    const labels = navLabels(h).join('|'); for (const l of ['Home', 'Reservations', 'Housekeeping', 'Calendar', 'Settings']) assert(labels.includes(l), l + ' in ' + labels); assert(!labels.includes('Timesheet'), 'no Timesheet page');
    const text = h.el.textContent; assert(/This week/.test(text) && /12\.5h/.test(text), 'hours summary'); assert(h.el.querySelector('.ts-recent'), 'recent shifts card');
    assert(h.el.querySelector('.ts-page .ts-total') && h.el.querySelector('.ts-chart') && h.el.querySelector('.ts-daily-card') && h.el.querySelector('.ts-chev-btn'), 'the timesheet is part of Home (week navigator, total, chart, daily breakdown)');
    assert(!/Export CSV|csv/i.test(h.el.innerHTML), 'no CSV export'); assert(!h.el.querySelector('.fd-ops, .fd-tiles'), 'the front-desk block is no longer on Home');
    assert(!h.el.querySelector('.home-clock-section, .home-clock-action, .focused-action'), 'clocking in/out is not part of the portal'); assert(calls.every(c => !/clock-(in|out)/.test(c.p)), 'no clock requests'); assert(calls.some(c => c.p.startsWith('/me/hours')));
    await openTab(h, 'Reservations'); const t2 = h.el.textContent;
    for (const l of ['Arrivals left', 'In-house', 'Check-outs left', 'Left to sell', 'Dirty rooms', 'Sellable vs arriving', 'Total left to sell']) assert(t2.includes(l), l);
    assert(h.el.querySelectorAll('.fd-tiles .fc-kpi-card').length === 5, 'five tiles'); assert(!h.el.querySelector('.fb-chart, .fb-bar'), 'no chart for the front desk'); assert(!h.el.querySelector('.fb-seg'), 'no dev toggle for the front desk');
    assert(!/Secret|Guest[ab]|CONFa/.test(t2), 'no guest data on screen'); assert(calls.every(c => !c.p.startsWith('/admin/')), 'never calls a manager route: ' + calls.map(c => c.p).join(', '));
    assert(calls.some(c => c.p === '/frontdesk/forecast/current') && calls.some(c => c.p === '/frontdesk/forecast/live')); await h.unmount();
  });
  await t('HOME LAYOUT (24.4): greeting, then ONE row [This week · Total worked · Recent], then the timeline: week navigator → Daily totals on top, Daily breakdown below; no "shifts below" line', async () => {
    AuthMock._user = DESK; responses = stdResponses(); const h = await mount(portal(), 300); const el = h.el; const idx = (sel) => [...el.querySelectorAll('*')].indexOf(el.querySelector(sel));
    const cards = [...el.querySelectorAll('.ts-top > .ts-card')]; assert.strictEqual(cards.length, 3, 'three cards'); assert.deepStrictEqual(cards.map(c => c.querySelector('.ts-card-eyebrow').textContent), ['This week', 'Total worked', 'Recent']);
    assert(el.querySelector('.ph-title') && /Good (morning|afternoon|evening), Fran\./.test(el.querySelector('.ph-title').textContent), 'greeting'); assert(idx('.ph-greet') < idx('.ts-top') && idx('.ts-top') < idx('.ts-timeline-head') && idx('.ts-timeline-head') < idx('.ts-chart-card') && idx('.ts-chart-card') < idx('.ts-daily-card'), 'order: greeting → cards → timeline header → daily totals → daily breakdown');
    assert(!/shifts? below/i.test(el.textContent), 'the "N shifts below" line is gone'); assert.strictEqual(cards[0].querySelector('.ts-big').textContent, '12.5h'); assert(cards[0].textContent.includes('Nov 2'), 'week range'); assert.strictEqual(el.querySelectorAll('.ts-recent-list li').length, 2, 'recent shifts listed'); assert(/in progress/.test(cards[2].textContent));
    assert(el.querySelector('.ts-timeline-head .ts-chev-btn') && el.querySelector('.ts-timeline-head .ts-this-week-btn'), 'navigator sits with the timeline'); assert(!el.querySelector('.ts-hero, .ts-header'), 'old separate hero / header are gone');
    await h.unmount();
  });
  await t('HOME: browsing to an earlier week changes Total worked + the timeline but NOT This week / Recent (always the current week)', async () => {
    AuthMock._user = DESK; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 300); const el = h.el; const big = (i) => el.querySelectorAll('.ts-top > .ts-card')[i].querySelector('.ts-big').textContent;
    await h.click(el.querySelector('[aria-label="Previous week"]')); await act(async () => { await sleep(100); });
    assert(calls.some(c => /weekStart=2026-10-26/.test(c.p)), 'fetched the earlier week'); assert.strictEqual(big(0), '12.5h', 'This week unchanged'); assert(el.querySelectorAll('.ts-recent-list li').length === 2, 'Recent unchanged'); assert(/Oct 26/.test(el.querySelector('.ts-week').textContent), 'timeline label moved');
    assert.strictEqual(calls.filter(c => /weekStart=2026-11-02/.test(c.p)).length, 1, 'the current week was not fetched twice'); await h.unmount();
  });
  await t('Reservations "Sellable vs arriving" shows x/y: VI-only left to sell / VI+PU left to sell (fixture: 1 inspected + 1 pickup, 1 arriving → 0/1, total 0/1 rooms)', async () => {
    AuthMock._user = DESK; responses = stdResponses(); const h = await mount(portal(), 200); await openTab(h, 'Reservations');
    const rows = [...h.el.querySelectorAll('.fb-summary-list li')].map(li => li.textContent.replace(/\s+/g, ' ').replace(/^\s*›\s*/, '').trim()); assert(rows.some(r => /^VI \/ VI \+ PU/.test(r)), 'column header: ' + rows.join(' | '));
    assert(rows.some(r => /^NQRR left to sell ?0\/1$/.test(r)), rows.join(' | ')); assert(rows.some(r => /^Total left to sell ?0\/1 rooms$/.test(r)), rows.join(' | ')); await h.unmount();
  });
  await t('the tile numbers come from the same models as the manager pages (arrivals left 1, left to sell 2 = VI+PU, dirty 2 = D+IP)', async () => {
    AuthMock._user = DESK; responses = stdResponses(); const h = await mount(portal(), 200); await openTab(h, 'Reservations');
    const tile = (label) => [...h.el.querySelectorAll('.fc-kpi-card')].find(c => c.textContent.includes(label)); const num = (c) => Number(c.querySelector('.fc-kpi-primary').textContent);
    const got = JSON.stringify(Object.fromEntries(['Arrivals left', 'In-house', 'Left to sell', 'Dirty rooms'].map(l => [l, num(tile(l))]))); assert.strictEqual(got, JSON.stringify({ 'Arrivals left': 1, 'In-house': 1, 'Left to sell': 2, 'Dirty rooms': 2 })); await h.unmount();
  });
  await t('PORTAL (any other staff — e.g. Housekeeping): Home (hours + timesheet) + Calendar + Settings only; no Reservations / Housekeeping, no front-desk requests; still no clocking', async () => {
    AuthMock._user = HK; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 200);
    const labels = navLabels(h).join('|'); assert(!labels.includes('Housekeeping') && !labels.includes('Reservations') && !labels.includes('Timesheet')); for (const l of ['Home', 'Calendar', 'Settings']) assert(labels.includes(l), l);
    assert(h.el.querySelector('.ts-this') && h.el.querySelector('.ts-total') && h.el.querySelector('.ts-chart'), 'their own hours + timesheet are there'); assert(!h.el.querySelector('.home-clock-section'));
    assert(calls.every(c => !c.p.startsWith('/frontdesk/') && !c.p.startsWith('/admin/')), calls.map(c => c.p).join(', ')); await h.unmount();
  });
  await t('front-desk features = ROLE "front desk" OR DEPARTMENT "Front Desk": a front-desk role with NO department works; spellings count; anyone else does not', async () => {
    AuthMock._user = { ...ROLE_ONLY, department: null }; responses = stdResponses(); calls.length = 0; let h = await mount(portal(), 200); assert(navLabels(h).join('|').includes('Housekeeping') && navLabels(h).join('|').includes('Reservations'), 'role only, department None (the reported case)'); await openTab(h, 'Reservations'); assert(h.el.querySelector('.fd-ops'), 'tab content'); assert(calls.some(c => c.p === '/frontdesk/forecast/current')); await h.unmount();
    AuthMock._user = ROLE_ONLY; h = await mount(portal(), 150); assert(navLabels(h).join('|').includes('Reservations'), 'role + other department'); await h.unmount();
    for (const d of ['front desk', 'Front-Desk', ' FRONT DESK ']) { AuthMock._user = { ...HK, department: d }; h = await mount(portal(), 150); assert(navLabels(h).join('|').includes('Reservations'), d); await h.unmount(); }
    AuthMock._user = { ...HK, department: 'Front Desk Supervisor' }; h = await mount(portal(), 150); assert(!navLabels(h).join('|').includes('Reservations'), 'exact department name'); await h.unmount();
    AuthMock._user = { ...HK, role: 'employee', department: null }; h = await mount(portal(), 150); assert(!navLabels(h).join('|').includes('Reservations'), 'plain employee, no department'); await h.unmount();
  });
  const clockin = () => React.createElement(RR.MemoryRouter, null, React.createElement(LanguageProvider, null, React.createElement(ClockIn)));
  await t('CLOCK IN door: ONLY the clock — focused-action screen, Clock In / Out, confirmation + auto-signout countdown; no sidebar, no hours, no timesheet / calendar / settings', async () => {
    AuthMock._user = DESK; responses = stdResponses(); responses['POST /clock-in-self'] = ok({}); responses['GET /me'] = ok({ idleLogoutSeconds: 15 }); calls.length = 0; sessionStorage.clear();
    const h = await mount(clockin(), 200); assert(document.querySelector('.focused-action'), 'kiosk overlay at landing'); assert(!h.el.querySelector('.sidebar, .bottom-nav, nav'), 'no sidebar / tab bar'); assert(!h.el.querySelector('.home-hero, .home-recent'), 'no hours / recent shifts');
    await h.click(h.el.querySelector('.focused-action button')); await act(async () => { await sleep(1500); });   // the pad confirms the tap after a short delay
    assert(calls.some(c => c.p === '/clock-in-self' && c.method === 'POST'), 'clocks in'); assert(h.el.querySelector('.home-confirm .home-hero-event'), 'confirmation'); assert(h.el.querySelector('.auto-signout-banner'), 'auto-signout countdown');
    assert(!h.el.querySelector('.home-hero, .home-recent'), 'still no hours'); assert(!/Timesheet|Calendar|Settings/.test(h.el.textContent), 'no other pages'); await h.unmount();
  });
  await t('HOUSEKEEPING (portal): the trimmed redesign — Plan by + Today/Tomorrow + Who\'s working + Rules, a wide Not assigned card and the assignment cards; no KPI tiles / overview / links row; all calls on /frontdesk', async () => {
    AuthMock._user = DESK; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 200);
    await h.click([...h.el.querySelectorAll('button, a')].find(b => b.textContent.trim() === 'Housekeeping')); await act(async () => { await sleep(250); });
    const text = h.el.textContent; for (const l of ['Plan by', 'Names', 'No name', 'Not assigned', 'Housekeepers’ assignments', 'Auto-assign', 'Reset', 'Rules']) assert(text.includes(l), l); assert(h.btn(/Who's working/), 'staff pop-over button');
    assert(!h.el.querySelector('.fc-kpi-card, .hk-overview, .hk-links, .hk-donut'), 'no KPI tiles / overview / links row for the front desk'); assert(h.el.querySelector('.hk-pool.hk-pool-wide') && h.el.querySelector('.hk-assign') && !h.el.querySelector('.hk-daycard, .hk-v2-top'), 'Not assigned (wide) then the assignments; no overview / calendar row'); assert(h.btn(/^Today$/) && h.btn(/^Tomorrow$/), 'Today | Tomorrow switch');
    assert(calls.some(c => c.p.startsWith('/frontdesk/housekeeping/plans')) && calls.some(c => c.p === '/frontdesk/employees')); assert(calls.every(c => !c.p.startsWith('/admin/')), calls.map(c => c.p).join(', '));
    assert(!/Print sheet colours/i.test(text), 'dev-only colour card stays hidden'); await h.unmount();
  });
  await t('HOUSEKEEPING (portal): same functions as the manager page — add a name, save to /frontdesk, switch to Tomorrow, No-name mode', async () => {
    AuthMock._user = DESK; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 200);
    await h.click([...h.el.querySelectorAll('button, a')].find(b => b.textContent.trim() === 'Housekeeping')); await act(async () => { await sleep(250); });
    await h.click(h.btn(/Who's working/)); await h.click(h.el.querySelector('input[aria-label="Bryan is working"]')); assert([...h.el.querySelectorAll('.hk-hkcol h2')].some(x => x.textContent === 'Bryan'), 'Bryan is working'); await h.click(h.btn(/^Save$/)); await act(async () => { await sleep(50); });
    const put = calls.find(c => c.method === 'PUT'); assert(put && put.p === '/frontdesk/housekeeping/plan', 'saved through the front-desk route'); assert.strictEqual(put.body.assignments[0].name, 'Bryan');
    await h.click(h.btn(/^Tomorrow$/)); await act(async () => { await sleep(120); }); assert(h.btn(/^Tomorrow$/).getAttribute('aria-selected') === 'true', 'Tomorrow view'); assert(calls.some(c => /housekeeping\/plan\?date=2026-11-03/.test(c.p)), 'loaded tomorrow’s plan');
    await h.click(h.btn(/^No name$/)); await act(async () => { await sleep(60); }); assert(/How many housekeepers/i.test(h.el.textContent), 'No-name mode works'); assert(calls.every(c => !c.p.startsWith('/admin/'))); await h.unmount();
  });
  await t('DEV "Front desk view": one click on the dev bar shows the real portal as a front-desk employee sees it (no sign-in as an employee); switch back any time', async () => {
    mockAuth._user = { username: 'dev', name: 'Dev', role: 'dev', type: 'dev' }; sessionStorage.clear(); responses = stdResponses(); calls.length = 0;
    const AdminShell = load(ROOT + '/src/shells/AdminShell.js').default; const h = await mount(React.createElement(RR.MemoryRouter, null, React.createElement(LanguageProvider, null, React.createElement(AdminShell, { theme: 'light', onToggleTheme() {} }))), 200);
    const bar = () => h.el.querySelector('.dvb'); assert(bar() && bar().classList.contains('is-full'), 'starts as Dev view'); const modes = [...h.el.querySelectorAll('.dvb-switch button')].map(b => b.getAttribute('data-view')); assert.deepStrictEqual(modes, ['full', 'manager', 'frontdesk']);
    await h.click(h.el.querySelector('[data-view="frontdesk"]')); await act(async () => { await sleep(250); });
    assert(bar().classList.contains('is-frontdesk') && /Front desk/.test(bar().textContent), 'bar shows the front desk colour/label'); const labels = navLabels(h).join('|');
    for (const l of ['Home', 'Reservations', 'Housekeeping', 'Calendar']) assert(labels.includes(l), l + ' in ' + labels); assert(!labels.includes('Timesheet') && !/Settings/.test(labels.split('Dark mode')[0]), 'portal menu, not the admin one'); assert(!labels.includes('Staff') && !labels.includes('Logbook'), 'admin menu is gone');
    assert(/Front desk view \(preview\)/.test(h.el.textContent), 'Home explains there are no personal hours'); assert(calls.every(c => !c.p.startsWith('/me/hours')), 'no personal-hours requests for a dev');
    await openTab(h, 'Reservations'); assert(h.el.querySelectorAll('.fd-tiles .fc-kpi-card').length === 5 && !h.el.querySelector('.fb-chart'), 'tiles + chart-less sellable card'); assert(calls.some(c => c.p === '/frontdesk/forecast/current'), 'through the front-desk route (the server accepts the dev token)');
    await openTab(h, 'Housekeeping'); assert(/Plan by/.test(h.el.textContent) && !h.el.querySelector('.hk-top'), 'simple Housekeeping');
    await h.click(h.el.querySelector('[data-view="full"]')); await act(async () => { await sleep(150); }); assert(bar().classList.contains('is-full') && !h.el.querySelector('.fd-tiles'), 'back to the Dev view'); await h.unmount(); mockAuth._user = DESK;
  });
  if (process.env.DUMP_DIR) {   // screenshots: DUMP_DIR=somewhere node tests/staffportal.test.js "$PWD"  → login-*.html, home.html, reservations.html, housekeeping.html (wrap with the built CSS)
    const out = (n, h) => fs.writeFileSync(path.join(process.env.DUMP_DIR, n + '.html'), h.el.innerHTML);
    localStorage.clear(); let h = await mount(loginPage(), 150); out('login-clockin', h); await h.click(h.el.querySelector('[data-mode="staff"]')); out('login-staff', h); await h.unmount();
    AuthMock._user = DESK; responses = stdResponses(); h = await mount(portal(), 250); out('home', h); await openTab(h, 'Reservations'); await h.click(h.el.querySelector('.fb-sum-row')); out('reservations', h);
    await h.click([...h.el.querySelectorAll('button, a')].find(b => b.textContent.trim() === 'Housekeeping')); await act(async () => { await sleep(250); }); await h.click(h.btn(/Who's working/)); await h.click(h.el.querySelector('input[aria-label="Bryan is working"]')); await h.key('Escape'); out('housekeeping', h); await h.unmount();
  }
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
