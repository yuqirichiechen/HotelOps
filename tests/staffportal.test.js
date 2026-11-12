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
  'GET /frontdesk/settings': ok({ settings: { hk_plan_by_name: 'true' } }), 'GET /frontdesk/logbook/notes': ok({ notes: [] }), 'GET /frontdesk/logbook/audience': ok({ departments: [], staff: [] }), 'GET /frontdesk/housekeeping/plans': ok({ plans: [] }), 'GET /frontdesk/housekeeping/locked-rooms': ok({ rooms: [] }),
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
  const loginPage = (mode) => R('/snoqualmieinn/login' + (mode ? '?mode=' + mode : ''), [route('/:tenant/login', React.createElement(TenantLogin)), route('/:tenant/staff', txt('PORTAL SHELL')), route('/:tenant/clockin', txt('CLOCKIN SHELL')), route('/set-pin', txt('SET PIN'))]);
  const pinTheme = (mode) => localStorage.setItem('inntrio-login-cfg', JSON.stringify({ mode }));   // 27.6: the login theme depends on the time of day unless the config pins it
  const pick = async (h, mode) => { await h.click(h.el.querySelector(`.in-choice[data-mode="${mode}"]`)); };   // step 2 → the chosen screen
  const signIn = async (h) => { await h.type(h.el.querySelector('#identifier'), '4155550123'); await h.click(h.el.querySelector('.in-primary')); await act(async () => { await sleep(60); }); };
  const typeStaff = async (h, id, pin) => { await h.type(h.el.querySelector('#staff-identifier'), id); if (pin) await h.type(h.el.querySelector('#staff-pin'), pin); await h.click(h.el.querySelector('.in-primary')); await act(async () => { await sleep(60); }); };
  await t('LOGIN FLOW (27.1): the page opens on step 2, "How would you like to continue?" — four access choices (Clock in / out first, Staff, Manager, Developer) under the chosen property; nothing is typed yet', async () => {
    localStorage.clear(); pinTheme('dark'); meUser = null; const h = await mount(loginPage(), 120);
    assert(/How would you like to continue\?/.test(h.el.textContent)); assert(/Snoqualmie Inn/.test(h.el.querySelector('.in-selected-bar').textContent) && /Snoqualmie, Washington/.test(h.el.querySelector('.in-selected-bar').textContent));
    const ch = [...h.el.querySelectorAll('.in-choice')]; assert.deepStrictEqual(ch.map(c => c.getAttribute('data-mode')), ['clockin', 'staff', 'admin', 'dev']); assert.deepStrictEqual(ch.map(c => c.querySelector('.in-choice-title').textContent), ['Clock in / out', 'Staff sign-in', 'Manager sign-in', 'Developer sign-in']);
    assert(ch.every(c => c.className === 'in-choice'), '27.3: Clock in / out has no gold highlight — all four cards look alike'); assert(!h.el.querySelector('input'), 'no form on this step'); assert(!h.el.querySelector('.in-steps, .in-step-bubble') && !/Sign-in \/ clock/.test(h.el.textContent), '27.2: no 1-2-3 step line'); assert(!/Secure access/.test(h.el.textContent) && !/\d{1,2}:\d{2} [AP]M PT/.test(h.el.querySelector('.in-topnav').textContent), '27.2: no secure-access / date-time in the top bar');
    const mark = h.el.querySelector('.in-selected-bar .in-logo-chip img'); assert(mark && mark.getAttribute('src') === '/snoqualmieinn.png' && mark.getAttribute('alt') === 'Snoqualmie Inn', '27.2: the property bar shows the property logo');
    assert(h.el.querySelector('img[src="/inntrio/Inntrio-logo-dark.svg"]'), 'Inntrio logo'); const top = h.el.querySelector('.in-topnav'); assert(top.querySelector('.in-brand img[src="/inntrio/Inntrio-logo-dark.svg"]') && !top.querySelector('img[src*="tagline"]'), '27.4: top-left is the plain Inntrio logo again'); assert.strictEqual(top.querySelector('.in-tagline').textContent, 'Hospitality management platform', '27.4: the gold platform line on the right'); assert(!/PROPERTY MANAGEMENT SYSTEM/i.test(top.textContent));
    assert(!h.el.querySelector('.in-hero-logo, .in-masthead') && !/PROPERTY OPERATIONS, REFINED/i.test(h.el.textContent), '27.4: no big logo in the middle'); assert(h.el.querySelectorAll('img[src="/inntrio/Inntrio-logo-dark.svg"]').length === 1, 'one Inntrio logo on the page'); assert(!/HotelOps/.test(h.el.textContent) && !h.el.querySelector('.hotelops-logo'), 'no HotelOps brand on the login'); await h.unmount();
  });
  await t('CLOCK IN / OUT is the numpad (same keypad logic): one gold Continue button, no Clock out button; the keys fill the field; ABC appears (and switches to letters) only when usernames are allowed', async () => {
    localStorage.clear(); const h = await mount(loginPage(), 120); await pick(h, 'clockin');
    assert(h.el.querySelector('#identifier') && h.el.querySelector('.in-keypad-grid'), 'numpad screen'); assert(/Clock in \/ out/.test(h.el.querySelector('.in-h1').textContent));
    assert.deepStrictEqual([...h.el.querySelectorAll('.in-action-row button')].map(b => b.textContent.trim()), ['Continue'], 'one button only'); assert(!/Clock out/.test(h.el.querySelector('.in-clock-card').textContent));
    const keys = [...h.el.querySelectorAll('.in-keypad-grid .in-key')]; assert.strictEqual(keys.length, 12, '1-9, Clear, 0, backspace'); assert(h.el.querySelector('.in-primary').disabled, 'needs a valid identifier');
    for (const d of ['4', '1', '5', '5']) await h.click(keys.find(k => k.getAttribute('aria-label') === d)); assert.strictEqual(h.el.querySelector('#identifier').value, '4155'); await h.click(keys.find(k => k.textContent === 'Clear')); assert.strictEqual(h.el.querySelector('#identifier').value, '');
    assert(!h.el.querySelector('.in-kb-switch'), 'this property only allows phone / employee ID (and hides ABC): no letters switch'); await h.unmount();
    const orig = global.fetch; global.fetch = async (url, init) => (/\/api\/public-config$/.test(url) ? { ok: true, json: async () => ({ success: true, config: { enabled_login_methods: ['phone', 'username'] } }) } : orig(url, init));
    const h2 = await mount(loginPage('clockin'), 120); await h2.click(h2.el.querySelector('.in-kb-switch')); assert(h2.el.querySelector('.in-letters') && !h2.el.querySelector('.in-keypad-grid'), 'usernames allowed → ABC opens the letters keyboard');
    await h2.click([...h2.el.querySelectorAll('.in-letters .in-key')].find(k => k.textContent === 'a')); assert.strictEqual(h2.el.querySelector('#identifier').value, 'a'); await h2.click(h2.el.querySelector('.in-kb-switch')); assert(h2.el.querySelector('.in-keypad-grid')); await h2.unmount(); global.fetch = orig;
  });
  await t('STAFF SIGN-IN is the PC form — typed identifier + optional PIN (with a show/hide eye), NO numpad; the label follows the enabled login methods', async () => {
    localStorage.clear(); const h = await mount(loginPage(), 120); await pick(h, 'staff');
    assert(h.el.querySelector('#staff-identifier') && h.el.querySelector('#staff-pin'), 'two typed fields'); assert(!h.el.querySelector('.in-keypad-grid, .in-key, #identifier'), 'no numpad');
    assert.strictEqual(h.el.querySelector('.in-h1').textContent, 'Staff sign-in'); assert(/phone number or employee ID/.test(h.el.querySelector('label[for="staff-identifier"]').textContent), 'label follows the enabled login methods');
    assert(h.el.querySelector('.in-primary').disabled, 'needs an identifier'); const pin = h.el.querySelector('#staff-pin'); assert.strictEqual(pin.type, 'password'); await h.click(h.el.querySelector('.in-input-eye')); assert.strictEqual(h.el.querySelector('#staff-pin').type, 'text', 'eye shows the PIN'); await h.unmount();
  });
  await t('every screen reaches every other: any choice, "Back to access options" and "Back to access options" goes to step 2; Manager is username + password; Developer is its own form; "Change property" goes to the property picker', async () => {
    localStorage.clear(); const h = await mount(R('/snoqualmieinn/login', [route('/:tenant/login', React.createElement(TenantLogin)), route('/', txt('PROPERTY PICKER'))]), 120);
    await pick(h, 'staff'); assert(h.el.querySelector('#staff-identifier')); await h.click(h.el.querySelector('.in-back')); assert(h.el.querySelector('.in-choice'), 'Back to access options');
    await pick(h, 'admin'); assert(h.el.querySelector('#username') && h.el.querySelector('#password') && !h.el.querySelector('#identifier')); assert.strictEqual(h.el.querySelector('.in-h1').textContent, 'Manager sign-in');
    assert(!h.el.querySelector('.in-linkish') && !/Access options/.test(h.el.querySelector('.in-topnav').textContent), '27.3: no top-right Access options');
    await h.click(h.el.querySelector('.in-back'));
    await pick(h, 'dev'); assert(h.el.querySelector('#dev-username') && h.el.querySelector('#dev-password')); assert.strictEqual(h.el.querySelector('.in-h1').textContent, 'Developer sign-in');
    await h.click(h.el.querySelector('.in-back')); await pick(h, 'clockin'); assert(h.el.querySelector('#identifier') && h.el.querySelector('.in-keypad-grid'));
    assert(!h.el.querySelector('.in-selected-bar, .in-change') && !/Change property/.test(h.el.textContent), '27.6: no property bar / Change property on the Clock in / out screen'); assert(h.el.querySelector('.in-back') && /Back to access options/.test(h.el.querySelector('.in-back').textContent), 'Back to access options at the bottom');
    await h.click(h.el.querySelector('.in-back')); await h.click(h.el.querySelector('.in-change')); assert(/PROPERTY PICKER/.test(h.el.textContent), 'Change property → /'); await h.unmount();
  });
  await t('?mode= opens a screen directly (the kiosk comes back to the keypad); an unknown mode falls back to the chooser; the choice is NOT remembered', async () => {
    localStorage.clear(); let h = await mount(loginPage('clockin'), 120); assert(h.el.querySelector('#identifier') && h.el.querySelector('.in-keypad-grid')); await h.unmount();
    h = await mount(loginPage('dev'), 120); assert(h.el.querySelector('#dev-username')); await h.unmount(); h = await mount(loginPage('nonsense'), 120); assert(h.el.querySelector('.in-choice')); await h.unmount();
    h = await mount(loginPage('staff'), 120); await h.unmount(); h = await mount(loginPage(), 120); assert(h.el.querySelector('.in-choice') && !h.el.querySelector('input'), 'no memory of the last screen'); await h.unmount();
  });
  await t('SCREEN CHANGE (27.6): withTransition first melts the current screen away with CSS (data-leave on .in-layout, direction on <html>), applies the change after LEAVE_MS, ignores a double tap, clears the direction afterwards; it applies at once without animation support, with reduced motion, or with no screen', async () => {
    const VT = load(ROOT + '/src/pages/Login/viewTransition.js', false); const root = document.documentElement; const layout = document.createElement('div'); layout.className = 'in-layout'; document.body.appendChild(layout);
    globalThis.Element = window.Element; const hadAnimate = window.Element.prototype.animate; window.Element.prototype.animate = () => ({}); let applied = 0;
    try {
      VT.withTransition(() => { applied++; }, 'back'); assert.strictEqual(applied, 0, 'not yet — the screen is leaving'); assert.strictEqual(layout.dataset.leave, 'back'); assert.strictEqual(root.dataset.navDir, 'back');
      VT.withTransition(() => { applied += 10; }, 'forward'); await act(async () => { await sleep(VT.LEAVE_MS + 60); }); assert.strictEqual(applied, 1, 'applied once, after the leave; the double tap was ignored');
      await act(async () => { await sleep(200); }); assert.strictEqual(root.dataset.navDir, undefined, 'direction cleared after the new screen mounted');
      VT.withTransition(() => { applied++; }, 'forward'); await act(async () => { await sleep(VT.LEAVE_MS + 60); }); assert.strictEqual(applied, 2, 'works again afterwards'); await act(async () => { await sleep(200); }); layout.removeAttribute('data-leave');
      const mm = window.matchMedia; window.matchMedia = (q) => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {} }); VT.withTransition(() => { applied++; }); assert.strictEqual(applied, 3, 'reduced motion → immediate'); window.matchMedia = mm;
      layout.remove(); VT.withTransition(() => { applied++; }); assert.strictEqual(applied, 4, 'no screen mounted → immediate');
      document.body.appendChild(layout); delete window.Element.prototype.animate; VT.withTransition(() => { applied++; }); assert.strictEqual(applied, 5, 'no animation support → immediate');
    } finally { if (hadAnimate) window.Element.prototype.animate = hadAnimate; else delete window.Element.prototype.animate; layout.remove(); delete globalThis.Element; }
  });
  await t('MOTION CSS (27.6): one splash-style language in plain CSS — screens leave with a quick fade (data-leave) and arrive from a blur + scale (rise; settle from above when going back); the top bar animates only on the first screen; the theme reveal uses CORRECT pseudo-element selectors (no space before ::); no view-transition names left; reduced motion switches it off; gold feature card / top-right link gone; Back to access options is gold', () => {
    const css = fs.readFileSync(ROOT + '/src/pages/Login/Inntrio.css', 'utf8');
    for (const x of [/@keyframes in-fade-up \{ from \{ opacity: 0; transform: translateY\(14px\) scale\(\.975\); filter: blur\(8px\)/, /@keyframes in-fade-down/, /@keyframes in-leave \{ to \{ opacity: 0; transform: scale\(\.985\); filter: blur\(6px\)/, /\.in-enter \.in-layout > \* \{ animation: in-fade-up/,
      /\.in-from-back \.in-layout > \* \{ animation-name: in-fade-down/, /\.in-enter-top \.in-brand/, /\.in-layout\[data-leave\] \{ animation: in-leave/, /html\[data-vt="theme"\]::view-transition-new\(root\) \{ z-index: 2; animation: in-reveal/, /prefers-reduced-motion: reduce\) \{\s*\.in-enter \.in-layout/]) assert(x.test(css), String(x));
    assert(!/\] ::view-transition/.test(css), 'a space before ::view-transition-* never matches (the pseudo-elements belong to <html>) — that was the 27.3-27.5 bug'); assert(!/view-transition-name|in-drift|in-hero|in-out-left|in-in-right|in-arrive/.test(css), 'no names / old keyframes');
    assert(!/in-choice-feature|\.in-linkish|\.in-nav-side|PROPERTY MANAGEMENT/.test(css)); assert(/\.in-back \{[^}]*color: var\(--in-gold\)/.test(css), 'back button is gold');
    const frame = fs.readFileSync(ROOT + '/src/pages/Login/InntrioFrame.js', 'utf8'); assert(!/viewTransitionName/.test(frame));
  });
  await t('TOP BAR TAGLINE (27.6): one line at any width — nowrap, and below 760 px the type shrinks with the room beside the logo (container query units), so it never wraps to 2 lines', () => {
    const css = fs.readFileSync(ROOT + '/src/pages/Login/Inntrio.css', 'utf8'); assert(/\.in-topnav \{ container-type: inline-size; \}/.test(css)); assert(/\.in-tagline \{[^}]*white-space: nowrap/.test(css)); assert(/@container \(max-width: 760px\) \{ \.in-tagline \{ font-size: clamp\(5px, calc\(\(100cqi - 190px\) \/ 29\), 11px\)/.test(css));
    assert(!/\.in-tagline \{ white-space: normal/.test(css), 'the old wrapping rule is gone');
  });
  await t('CLOCK SCREEN FILLS THE SCREEN (27.6): on phones / tablets the card takes the remaining height and the keypad takes the card — rows are 1fr so the keys grow with the screen', () => {
    const css = fs.readFileSync(ROOT + '/src/pages/Login/Inntrio.css', 'utf8'); const i = css.indexOf('Sprint 27.6: the Clock in / out screen fills'); assert(i > 0); const blk = css.slice(i);
    for (const x of [/@media \(max-width: 1023px\)/, /\.in-step-clock \.in-clock-card \{ flex: 1 1 auto/, /\.in-step-clock \.in-keypad-panel \{ flex: 1 1 auto/, /\.in-step-clock \.in-keypad-grid \{ flex: 1 1 auto; grid-template-rows: repeat\(4, minmax\(0, 1fr\)\)/, /\.in-step-clock \.in-key \{ min-height: 0/]) assert(x.test(blk), String(x));
  });
  await t('LIGHT MODE (27.5 / 27.6): the top-left logo is the switch — click it: light theme (class in-light), navy logo, a click override saved until the next change of the dark window, label flips; click again → back; the override is used on the next visit', async () => {
    localStorage.clear(); pinTheme('dark'); let h = await mount(loginPage(), 120); const root = () => h.el.querySelector('.in-root'); const btn = () => h.el.querySelector('.in-topnav button.in-brand');
    assert(btn() && btn().querySelector('img[src="/inntrio/Inntrio-logo-dark.svg"]') && !root().classList.contains('in-light'), 'dark (pinned)'); assert(/switch to light mode/i.test(btn().getAttribute('aria-label')));
    await h.click(btn()); assert(root().classList.contains('in-light'), 'light'); assert(btn().querySelector('img[src="/inntrio/inntrio-logo-light.svg"]'), 'navy logo in light mode'); assert(/switch to dark mode/i.test(btn().getAttribute('aria-label')));
    const ov = JSON.parse(localStorage.getItem('inntrio-login-theme')); assert.strictEqual(ov.theme, 'light'); assert(ov.until > Date.now(), 'the override lasts until the next change of the window'); assert.strictEqual(localStorage.getItem('hotelops-theme'), null, 'the in-app theme is untouched');
    await h.click(btn()); assert(!root().classList.contains('in-light')); await h.click(btn()); await h.unmount();
    h = await mount(loginPage(), 120); assert(h.el.querySelector('.in-root.in-light'), 'remembered on the next visit'); await pick(h, 'staff'); assert(h.el.querySelector('.in-root.in-light') && h.el.querySelector('#staff-identifier'), 'light on every screen of the flow'); await h.unmount(); localStorage.clear();
  });
  await t('LIGHT MODE CSS (27.5): defined for every part of the flow (surfaces, rows, choices, fields, keypad, buttons, splash), uses the scene variables, rice-white background, and the theme switch is a circular reveal from the logo', () => {
    const css = fs.readFileSync(ROOT + '/src/pages/Login/Inntrio.css', 'utf8');
    for (const sel of ['.in-root.in-light', '.in-light .in-surface', '.in-light .in-property-row', '.in-light .in-choice', '.in-light .in-field', '.in-light .in-key', '.in-light .in-keypad-panel', '.in-light .in-back', '.in-light .in-tagline', '.in-light h1.in-h1', '.in-light .in-error', '.in-light .in-splash-logo']) assert(css.includes(sel), sel);
    assert(/--in-wave-1: #e6d9b8/.test(css) && /#fbf8f1/.test(css), 'rice white + gold scene'); assert(/stopColor: 'var\(--in-wave-1\)'/.test(fs.readFileSync(ROOT + '/src/pages/Login/InntrioFrame.js', 'utf8')), 'scene colours come from variables');
    assert(/@keyframes in-reveal \{ from \{ clip-path: circle\(0 at var\(--vt-x/.test(css) && /html\[data-vt="theme"\]::view-transition-new\(root\)/.test(css), 'circular reveal from the click point');
    const VT = load(ROOT + '/src/pages/Login/viewTransition.js', false); const root = document.documentElement; let during = null; document.startViewTransition = (cb) => { cb(); during = { vt: root.dataset.vt, x: root.style.getPropertyValue('--vt-x'), y: root.style.getPropertyValue('--vt-y') }; return { finished: Promise.resolve() }; };
    VT.withTransition(() => {}, 'theme', { x: 40, y: 30 }); delete document.startViewTransition; assert.deepStrictEqual(during, { vt: 'theme', x: '40px', y: '30px' }, 'direction + reveal origin set while the transition runs');
  });
  await t('the clock-in door (idle sign-out in ClockInShell and the auto sign-out in Home) returns to /<property>/login?mode=clockin — the keypad — while Settings / manager sign-outs return to the chooser', () => {
    for (const f of ['src/shells/ClockInShell.js', 'src/pages/Home/index.js']) assert(/login\?mode=clockin/.test(fs.readFileSync(ROOT + '/' + f, 'utf8')), f);
    for (const f of ['src/pages/Settings/index.js', 'src/components/AdminPanel/AdminSettings.js']) assert(!/mode=clockin/.test(fs.readFileSync(ROOT + '/' + f, 'utf8')), f);
  });

  await t('SAME CREDENTIALS, different door: Clock in (numpad) → /clockin, Staff login (typed) → /staff, one request each to the existing endpoint — and the page still opens on Clock in next time', async () => {
    const user = { user_id: 'u9', name: 'Fran', role: 'employee', department: 'Front Desk', pin_must_set: false }; staffLogin = { status: 200, body: { success: true, token: 'TOK', user } };
    localStorage.clear(); realFetchLog.length = 0; let h = await mount(loginPage('clockin'), 120); await signIn(h); assert(/CLOCKIN SHELL/.test(h.el.textContent), h.el.textContent); assert.strictEqual(Auth.getStaffEntry(), 'clockin'); await h.unmount();
    localStorage.clear(); realFetchLog.length = 0; h = await mount(loginPage(), 120); await pick(h, 'staff'); await typeStaff(h, 'fran.desk', '1234'); assert(/PORTAL SHELL/.test(h.el.textContent), h.el.textContent); assert.strictEqual(Auth.getStaffEntry(), 'staff');
    const logins = realFetchLog.filter(([u]) => /auth\/staff\/login/.test(u)); assert.strictEqual(logins.length, 1, 'one request, the existing endpoint — no new credential path'); await h.unmount();
    h = await mount(loginPage(), 120); assert(h.el.querySelector('.in-choice') && !h.el.querySelector('#identifier') && !h.el.querySelector('#staff-identifier'), 'the login page ALWAYS opens on the access chooser, even right after a Staff login'); await h.unmount();
  });
  await t('Staff login sends exactly what was typed (username / phone / ID + PIN) and a PIN the person has is optional', async () => {
    let sent = null; const orig = global.fetch; global.fetch = async (url, init = {}) => { if (/auth\/staff\/login$/.test(url)) sent = JSON.parse(init.body); return orig(url, init); };
    staffLogin = { status: 200, body: { success: true, token: 'TOK', user: { user_id: 'u9', name: 'Fran', role: 'employee' } } }; localStorage.clear();
    let h = await mount(loginPage(), 120); await pick(h, 'staff'); await typeStaff(h, 'fran.desk'); assert.deepStrictEqual(sent, { identifier: 'fran.desk' }, 'no PIN → none sent'); await h.unmount();
    localStorage.clear(); h = await mount(loginPage(), 120); await pick(h, 'staff'); await typeStaff(h, '4155550123', '4321'); assert.deepStrictEqual(sent, { identifier: '4155550123', pin: '4321' }); await h.unmount(); global.fetch = orig;
  });
  await t('CLOCK IN pad: when the server asks for a PIN the PIN field appears (keypad then fills it), and the existing endpoint gets identifier + PIN; wrong person → the server message', async () => {
    const orig = global.fetch; const sent = []; global.fetch = async (url, init = {}) => { if (/auth\/staff\/login$/.test(url)) sent.push(JSON.parse(init.body)); return orig(url, init); };
    staffLogin = { status: 400, body: { success: false, message: 'PIN required', pin_required: true } }; localStorage.clear(); let h = await mount(loginPage('clockin'), 120);
    await h.type(h.el.querySelector('#identifier'), '4155550123'); await h.click(h.el.querySelector('.in-primary')); await act(async () => { await sleep(60); });
    assert(h.el.querySelector('#pin'), 'PIN field appears'); assert(h.el.querySelector('#pin').type === 'password'); const keys = [...h.el.querySelectorAll('.in-keypad-grid .in-key')];
    for (const d of ['1', '2', '3', '4']) await h.click(keys.find(k => k.getAttribute('aria-label') === d)); assert.strictEqual(h.el.querySelector('#pin').value, '1234', 'the keypad fills the PIN once it is the active field');
    staffLogin = { status: 200, body: { success: true, token: 'TOK', user: { user_id: 'u9', name: 'Fran', role: 'employee', pin_must_set: false } } }; await h.click(h.el.querySelector('.in-primary')); await act(async () => { await sleep(60); });
    assert.deepStrictEqual(sent[sent.length - 1], { identifier: '4155550123', pin: '1234' }); assert(/CLOCKIN SHELL/.test(h.el.textContent)); await h.unmount(); global.fetch = orig;
  });
  await t('a person who needs a PIN is told so on the form; an unknown person gets the server message; neither leaves the screen', async () => {
    staffLogin = { status: 400, body: { success: false, message: 'PIN required', pin_required: true } }; localStorage.clear(); let h = await mount(loginPage(), 120); await pick(h, 'staff'); await typeStaff(h, 'fran.desk');
    assert(/Enter your PIN/.test(h.el.textContent)); assert(!/PORTAL SHELL/.test(h.el.textContent)); await h.unmount();
    staffLogin = { status: 404, body: { success: false, message: 'Employee not found' } }; h = await mount(loginPage(), 120); await pick(h, 'staff'); await typeStaff(h, 'nobody');
    assert(/Employee not found/.test(h.el.textContent)); assert(!/PORTAL SHELL/.test(h.el.textContent)); await h.unmount();
  });
  await t('a stale deep link to the OTHER staff shell does not override the door just chosen', async () => {
    staffLogin = { status: 200, body: { success: true, token: 'TOK', user: { user_id: 'u9', name: 'Fran', role: 'employee' } } }; localStorage.clear(); meUser = null;
    const page = (state, search) => R({ pathname: '/snoqualmieinn/login', search, state }, [route('/:tenant/login', React.createElement(TenantLogin)), route('/:tenant/staff', txt('PORTAL SHELL')), route('/:tenant/clockin', txt('CLOCKIN SHELL'))]);
    let h = await mount(page({ from: { pathname: '/snoqualmieinn/staff' } }, '?mode=clockin'), 120); await signIn(h); assert(/CLOCKIN SHELL/.test(h.el.textContent), 'Clock in screen → clock-in door even though the link said /staff'); await h.unmount();
    localStorage.clear(); h = await mount(page({ from: { pathname: '/snoqualmieinn/clockin' } }), 120); await pick(h, 'staff'); await typeStaff(h, 'fran.desk'); assert(/PORTAL SHELL/.test(h.el.textContent)); await h.unmount();
  });

  // ── 3. the portal shell ──
  mockAuth = { apiFetch: apiFetchMock, authFetch: async () => ({ ok: true, json: async () => ({ success: true }) }), useAuth: () => ({ logout: async () => {}, user: mockAuth._user }), setStaffEntry() {}, getStaffEntry: () => 'staff', homePathFor: () => '/x/staff', isFrontDesk: Auth.isFrontDesk };
  const Shell = load(ROOT + '/src/shells/StaffPortalShell.js').default; const ClockIn = load(ROOT + '/src/shells/ClockInShell.js').default; const AuthMock = mockAuth;
  const DESK = { user_id: 'u9', name: 'Fran Desk', role: 'employee', department: 'Front Desk' }, HK = { user_id: 'u5', name: 'Hana Housekeeper', role: 'employee', department: 'Housekeeping' }, ROLE_ONLY = { user_id: 'u7', name: 'Old Role', role: 'front_desk', department: 'Housekeeping' };
  const portal = () => React.createElement(RR.MemoryRouter, null, React.createElement(LanguageProvider, null, React.createElement(Shell, { theme: 'light', onToggleTheme() {} })));
  const navLabels = (h) => [...h.el.querySelectorAll('.sidebar-nav button, .sidebar button, nav button, nav a')].map(b => b.textContent.trim()).filter(Boolean);
  const openTab = async (h, label) => { await h.click([...h.el.querySelectorAll('button, a')].find(b => b.textContent.trim() === label)); await act(async () => { await sleep(250); }); };
  await t('PORTAL (Front Desk): nav = Home · Reservations · Housekeeping · Logbook · Settings (NO Timesheet page); Home = hours + timesheet; Reservations = the 5 tiles + sellable-vs-arriving WITHOUT the chart', async () => {
    AuthMock._user = DESK; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 250);
    const labels = navLabels(h).join('|'); for (const l of ['Home', 'Reservations', 'Housekeeping', 'Logbook', 'Settings']) assert(labels.includes(l), l + ' in ' + labels); assert(!labels.includes('Calendar'), 'the old Calendar tab is now the Logbook'); assert(!labels.includes('Timesheet'), 'no Timesheet page');
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
    const rows = [...h.el.querySelectorAll('.fb-summary-list li')].map(li => li.textContent.replace(/\s+/g, ' ').replace(/^\s*›\s*/, '').trim()); assert(/^VI ?\/ ?VI \+ PU$/.test(h.el.querySelector('.fb-card-head .fb-vi-legend').textContent.trim()), 'the key sits on the title line'); assert(!h.el.querySelector('.fb-summary-head'), 'not a small grey line above the list');
    assert(rows.some(r => /^NQRR left to sell ?0\/1$/.test(r)), rows.join(' | ')); assert(rows.some(r => /^Total left to sell ?0\/1 rooms$/.test(r)), rows.join(' | ')); await h.unmount();
  });
  await t('25.5 Reservations (front desk): the manager\'s "Rooms to sell today" table sits right below "Sellable vs arriving"; the VI / VI + PU key is big and dark on the title line; Refresh only re-reads synced data (never the live board)', async () => {
    AuthMock._user = DESK; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 200); await openTab(h, 'Reservations');
    if (process.env.DUMP_RES) fs.writeFileSync(process.env.DUMP_RES, h.el.innerHTML);
    const cards = [...h.el.querySelectorAll('.fd-sellable > .fb-card')]; assert.strictEqual(cards.length, 2, 'two cards'); assert.strictEqual(cards[0].querySelector('h2').textContent, 'Sellable vs arriving'); assert.strictEqual(cards[1].querySelector('h2').textContent, 'Rooms to sell today'); assert.strictEqual(cards[0].nextElementSibling === cards[1] || cards[0].parentElement.nextElementSibling.contains(cards[1]), true, 'right below');
    assert.deepStrictEqual([...cards[1].querySelectorAll('thead th')].map(x => x.textContent), ['Room type', 'Clean', 'Arriving', 'Left to sell', 'Status']); const row = cards[1].querySelector('tbody tr.sr-row'); assert(row, 'a row per room type'); await h.click(row); assert(cards[1].querySelector('.sr-detail.open .fb-room-chip'), 'tap a row → its rooms (numbers + status only)');
    assert(!/Secret|Guest[ab]|CONFa/.test(h.el.textContent), 'no guest data'); const css = fs.readFileSync(ROOT + '/src/components/Forecast/Forecast.css', 'utf8'); assert(/\.fb-vi-legend \{[^}]*font-size: 16px;[^}]*color: var\(--text-primary\)/.test(css), 'big and dark, like the total');
    calls.length = 0; await h.click(h.el.querySelector('.fd-refresh')); await act(async () => { await sleep(60); }); assert(calls.some(c => c.p === '/frontdesk/forecast/current'), 'it re-reads the synced numbers'); assert(!calls.some(c => c.p === '/frontdesk/forecast/live'), 'but never asks for the live board'); assert(calls.every(c => c.p.startsWith('/frontdesk/')), 'only portal routes'); await h.unmount();
  });
  await t('the tile numbers come from the same models as the manager pages (arrivals left 1, left to sell 2 = VI+PU, dirty 2 = D+IP)', async () => {
    AuthMock._user = DESK; responses = stdResponses(); const h = await mount(portal(), 200); await openTab(h, 'Reservations');
    const tile = (label) => [...h.el.querySelectorAll('.fc-kpi-card')].find(c => c.textContent.includes(label)); const num = (c) => Number(c.querySelector('.fc-kpi-primary').textContent);
    const got = JSON.stringify(Object.fromEntries(['Arrivals left', 'In-house', 'Left to sell', 'Dirty rooms'].map(l => [l, num(tile(l))]))); assert.strictEqual(got, JSON.stringify({ 'Arrivals left': 1, 'In-house': 1, 'Left to sell': 2, 'Dirty rooms': 2 })); await h.unmount();
  });
  await t('PORTAL (any other staff — e.g. Housekeeping): Home (hours + timesheet) + Logbook (under construction) + Settings only; no Reservations / Housekeeping, no front-desk requests; still no clocking', async () => {
    AuthMock._user = HK; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 200);
    const labels = navLabels(h).join('|'); assert(!labels.includes('Housekeeping') && !labels.includes('Reservations') && !labels.includes('Timesheet')); for (const l of ['Home', 'Logbook', 'Settings']) assert(labels.includes(l), l);
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
    const text = h.el.textContent; for (const l of ['Plan by', 'Names', 'No name', 'Not assigned', 'Housekeepers’ assignments', 'Auto-assign', 'Reset', 'Rules']) assert(text.includes(l), l); assert(h.btn(/Who's working/), 'staff pop-over button'); const pa = [...h.el.querySelectorAll('.hk-btn-dark')].find(b => /Print all sheets/.test(b.textContent)); assert(pa && !pa.disabled, 'the front desk can print the all-rooms sheet');
    assert(!h.el.querySelector('.fc-kpi-card, .hk-overview, .hk-links, .hk-donut'), 'no KPI tiles / overview / links row for the front desk'); assert(h.el.querySelector('.hk-pool.hk-pool-wide') && h.el.querySelector('.hk-assign') && !h.el.querySelector('.hk-daycard, .hk-v2-top'), 'Not assigned (wide) then the assignments; no overview / calendar row'); assert(h.btn(/^Today/) && h.btn(/^Tomorrow/), 'Today | Tomorrow switch');
    assert(calls.some(c => c.p.startsWith('/frontdesk/housekeeping/plans')) && calls.some(c => c.p === '/frontdesk/employees')); assert(calls.every(c => !c.p.startsWith('/admin/')), calls.map(c => c.p).join(', '));
    assert(!/Print sheet colours/i.test(text), 'dev-only colour card stays hidden'); await h.unmount();
  });
  await t('LOGBOOK (26): Front Desk opens the real Log Book (month calendar, New note) on the /frontdesk routes; every other employee gets "under construction" and no Log Book request; the old staff Calendar page is not reachable', async () => {
    AuthMock._user = DESK; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 200); await openTab(h, 'Logbook'); await act(async () => { await sleep(150); });
    assert(h.el.querySelector('.lb-page .lb-cal'), 'the Log Book'); assert(/Log Book/.test(h.el.querySelector('h1').textContent)); assert(h.btn(/^New note/)); assert(calls.some(c => c.p.startsWith('/frontdesk/logbook/notes?')) && calls.some(c => c.p === '/frontdesk/logbook/audience')); assert(calls.every(c => !c.p.startsWith('/admin/')), 'never a manager route'); assert(!h.el.querySelector('.coming-soon')); await h.unmount();
    AuthMock._user = HK; responses = stdResponses(); calls.length = 0; const k = await mount(portal(), 200); await openTab(k, 'Logbook'); await act(async () => { await sleep(100); });
    assert(k.el.querySelector('.coming-soon') && /under construction/i.test(k.el.querySelector('.coming-soon').textContent) && /Logbook/.test(k.el.querySelector('.coming-soon h2').textContent), 'placeholder'); assert(!k.el.querySelector('.lb-page')); assert(calls.every(c => !/logbook/.test(c.p)), 'no Log Book requests: ' + calls.map(c => c.p).join(', ')); assert(!k.el.querySelector('.ts-daily-card, .cal-grid, .staff-calendar'), 'not the old calendar'); await k.unmount();
  });
  await t('LOGBOOK 26.1: the admin / dev Logbook nav item has the green live dot like the other live pages; the front-desk Logbook tab shows a badge with the number of notes sent to that person and clears when told', async () => {
    for (const user of [{ username: 'dev', name: 'Dev', role: 'dev', type: 'dev' }, { username: 'mgr', name: 'Mgr', role: 'admin', type: 'admin' }]) {
      mockAuth._user = user; sessionStorage.clear(); responses = stdResponses(); const AdminShell = load(ROOT + '/src/shells/AdminShell.js').default; const a = await mount(React.createElement(RR.MemoryRouter, null, React.createElement(LanguageProvider, null, React.createElement(AdminShell, { theme: 'light', onToggleTheme() {} }))), 200);
      const link = [...a.el.querySelectorAll('.sidebar-link')].find(b => /Logbook/.test(b.textContent)); assert(link, user.role + ' has a Logbook item'); assert(link.querySelector('.live-dot'), user.role + ': the green live dot'); await a.unmount();
    }
    AuthMock._user = DESK; responses = stdResponses(); responses['GET /frontdesk/logbook/unread'] = ok({ count: 2, notes: [] }); calls.length = 0; const h = await mount(portal(), 250); const link = () => [...h.el.querySelectorAll('.sidebar-link')].find(b => /Logbook/.test(b.textContent));
    assert(link().querySelector('.live-dot'), 'live dot'); assert.strictEqual(link().querySelector('.sidebar-unread-badge').textContent, '2', 'two notes are waiting for this person'); assert(/new for you/.test(link().querySelector('.sidebar-unread-badge').title)); assert.strictEqual(calls.filter(c => /logbook\/unread/.test(c.p)).length, 1, 'asked once when the portal opened');
    await act(async () => { w.dispatchEvent(new w.CustomEvent('hotelops:logbook-unread', { detail: { count: 0 } })); }); assert(!link().querySelector('.sidebar-unread-badge'), 'cleared once they have looked'); await h.unmount();
    AuthMock._user = HK; responses = stdResponses(); calls.length = 0; const k = await mount(portal(), 200); assert(!calls.some(c => /logbook/.test(c.p)), 'other staff: no Log Book request at all'); await k.unmount();
  });
  await t('HOUSEKEEPING (portal) with "plan by name" OFF (the default dev setting): the front desk only has No name — no Plan by switch, "Enter how many" starts the plan, and names can be typed for the numbered housekeepers', async () => {
    AuthMock._user = DESK; responses = stdResponses(); responses['GET /frontdesk/settings'] = ok({ settings: {} }); calls.length = 0; const h = await mount(portal(), 200);
    await h.click([...h.el.querySelectorAll('button, a')].find(b => b.textContent.trim() === 'Housekeeping')); await act(async () => { await sleep(250); });
    assert(!/Plan by/.test(h.el.querySelector('.hk-modebar').textContent), 'no Plan by switch'); assert(![...h.el.querySelectorAll('.hk-modebar button')].some(b => /^Names$/.test(b.textContent)), 'no Names button'); assert(h.btn(/Enter how many/), 'starts with How many');
    await h.click(h.btn(/Enter how many/)); assert(h.el.querySelector('.hk-countcard'), 'the How-many card'); await h.unmount(); responses = stdResponses();
  });
  await t('HOUSEKEEPING (portal): same functions as the manager page — add a name, save to /frontdesk, switch to Tomorrow, No-name mode', async () => {
    AuthMock._user = DESK; responses = stdResponses(); calls.length = 0; const h = await mount(portal(), 200);
    await h.click([...h.el.querySelectorAll('button, a')].find(b => b.textContent.trim() === 'Housekeeping')); await act(async () => { await sleep(250); });
    await h.click(h.btn(/Who's working/)); await h.click(h.el.querySelector('input[aria-label="Bryan is working"]')); assert([...h.el.querySelectorAll('.hk-hkcol h2')].some(x => x.textContent === 'Bryan'), 'Bryan is working'); await h.click(h.btn(/^Save$/)); await act(async () => { await sleep(50); });
    const put = calls.find(c => c.method === 'PUT'); assert(put && put.p === '/frontdesk/housekeeping/plan', 'saved through the front-desk route'); assert.strictEqual(put.body.assignments[0].name, 'Bryan');
    await h.click(h.btn(/^Tomorrow/)); await act(async () => { await sleep(120); }); assert(h.btn(/^Tomorrow/).getAttribute('aria-selected') === 'true', 'Tomorrow view'); assert(calls.some(c => /housekeeping\/plan\?date=2026-11-03/.test(c.p)), 'loaded tomorrow’s plan');
    await h.click(h.btn(/^No name$/)); await act(async () => { await sleep(60); }); assert(/How many housekeepers/i.test(h.el.textContent), 'No-name mode works'); assert(h.el.querySelector('[aria-label="Name the sheets Housekeeper 1, 2, 3"]'), 'the front desk gets the blank-name switch too'); assert(calls.every(c => !c.p.startsWith('/admin/'))); await h.unmount();
  });
  await t('DEV "Front desk view": one click on the dev bar shows the real portal as a front-desk employee sees it (no sign-in as an employee); switch back any time', async () => {
    mockAuth._user = { username: 'dev', name: 'Dev', role: 'dev', type: 'dev' }; sessionStorage.clear(); responses = stdResponses(); calls.length = 0;
    const AdminShell = load(ROOT + '/src/shells/AdminShell.js').default; const h = await mount(React.createElement(RR.MemoryRouter, null, React.createElement(LanguageProvider, null, React.createElement(AdminShell, { theme: 'light', onToggleTheme() {} }))), 200);
    const bar = () => h.el.querySelector('.dvb'); assert(bar() && bar().classList.contains('is-full'), 'starts as Dev view'); const modes = [...h.el.querySelectorAll('.dvb-switch button')].map(b => b.getAttribute('data-view')); assert.deepStrictEqual(modes, ['full', 'manager', 'frontdesk']);
    await h.click(h.el.querySelector('[data-view="frontdesk"]')); await act(async () => { await sleep(250); });
    assert(bar().classList.contains('is-frontdesk') && /Front desk/.test(bar().textContent), 'bar shows the front desk colour/label'); const labels = navLabels(h).join('|');
    for (const l of ['Home', 'Reservations', 'Housekeeping', 'Logbook']) assert(labels.includes(l), l + ' in ' + labels); assert(!labels.includes('Timesheet') && !/Settings/.test(labels.split('Dark mode')[0]), 'portal menu, not the admin one'); assert(!labels.includes('Staff') && !labels.includes('Forecast') && !labels.includes('Assistant'), 'admin menu is gone');
    assert(/Front desk view \(preview\)/.test(h.el.textContent), 'Home explains there are no personal hours'); assert(calls.every(c => !c.p.startsWith('/me/hours')), 'no personal-hours requests for a dev');
    await openTab(h, 'Reservations'); assert(h.el.querySelectorAll('.fd-tiles .fc-kpi-card').length === 5 && !h.el.querySelector('.fb-chart'), 'tiles + chart-less sellable card'); assert(calls.some(c => c.p === '/frontdesk/forecast/current'), 'through the front-desk route (the server accepts the dev token)');
    await openTab(h, 'Housekeeping'); assert(/Plan by/.test(h.el.textContent) && !h.el.querySelector('.hk-top'), 'simple Housekeeping');
    await h.click(h.el.querySelector('[data-view="full"]')); await act(async () => { await sleep(150); }); assert(bar().classList.contains('is-full') && !h.el.querySelector('.fd-tiles'), 'back to the Dev view'); await h.unmount(); mockAuth._user = DESK;
  });
  if (process.env.DUMP_DIR) {   // screenshots: DUMP_DIR=somewhere node tests/staffportal.test.js "$PWD"  → login-*.html, home.html, reservations.html, housekeeping.html (wrap with the built CSS)
    const out = (n, h) => fs.writeFileSync(path.join(process.env.DUMP_DIR, n + '.html'), h.el.innerHTML);
    localStorage.clear(); let h = await mount(loginPage(), 150); out('login-access', h); await pick(h, 'staff'); out('login-staff', h); await h.unmount();
    AuthMock._user = DESK; responses = stdResponses(); h = await mount(portal(), 250); out('home', h); await openTab(h, 'Reservations'); await h.click(h.el.querySelector('.fb-sum-row')); out('reservations', h);
    await h.click([...h.el.querySelectorAll('button, a')].find(b => b.textContent.trim() === 'Housekeeping')); await act(async () => { await sleep(250); }); await h.click(h.btn(/Who's working/)); await h.click(h.el.querySelector('input[aria-label="Bryan is working"]')); await h.key('Escape'); out('housekeeping', h); await h.unmount();
  }
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
