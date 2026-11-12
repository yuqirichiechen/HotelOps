// Sprint 27.6 — the Inntrio login's automatic light / dark: the window maths, the hook (auto by the clock, server config, click override that expires), the
// public-config + dev-only settings routes (mock pg), and the Dev → Platform card.   node tests/login-theme.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
process.env.PORT = '3992'; process.env.JWT_SECRET = 'x'.repeat(40); process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, sessionStorage: w.sessionStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils'); const jwt = require(ROOT + '/server/node_modules/jsonwebtoken'); const pg = require(ROOT + '/server/node_modules/pg');
const nativeFetch = global.fetch;
let authFetchImpl = async () => ({ json: async () => ({ success: true }) });
const modCache = new Map(); const load = (file) => { if (modCache.has(file)) return modCache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); modCache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { authFetch: (...a) => authFetchImpl(...a), apiFetch: async () => ({}) }; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); };
  m._compile(code, file); return m.exports; };
const Theme = load(ROOT + '/src/pages/Login/loginTheme.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
const RealDate = Date; let FAKE = null; const at = (h, m = 0, d = 4) => new RealDate(2026, 10, d, h, m, 0, 0);
const useFake = (d) => { FAKE = d.getTime(); global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(FAKE); } static now() { return FAKE; } }; };
const useReal = () => { global.Date = RealDate; FAKE = null; };
const mount = async (el) => { const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host); await act(async () => { root.render(el); }); return { host, root }; };
const Probe = () => { const { light, toggle } = Theme.useLoginTheme(); return React.createElement('button', { id: 'p', onClick: toggle }, light ? 'LIGHT' : 'DARK'); };
const DEF = Theme.DEFAULT_CFG;

(async () => {
  await t('window maths: the default window is dark from 18:00 to 06:00 (wraps midnight); edges are inclusive at the start, exclusive at the end; a same-day window works', () => {
    for (const [h, m, dark] of [[5, 59, true], [6, 0, false], [12, 0, false], [17, 59, false], [18, 0, true], [23, 59, true], [0, 0, true]]) assert.strictEqual(Theme.isDarkAt(at(h, m), DEF), dark, `${h}:${m}`);
    const day = { mode: 'auto', darkFrom: '09:00', darkTo: '17:00' }; assert.strictEqual(Theme.isDarkAt(at(12), day), true); assert.strictEqual(Theme.isDarkAt(at(20), day), false);
    assert.deepStrictEqual(Theme.normalizeCfg({ mode: 'nope', darkFrom: '25:00', darkTo: '06:00' }), DEF, 'garbage → defaults'); assert.deepStrictEqual(Theme.normalizeCfg({ mode: 'auto', darkFrom: '07:00', darkTo: '07:00' }), DEF, 'same start and end → defaults');
  });
  await t('nextBoundary: the next moment the automatic theme flips (today or tomorrow), always in the future', () => {
    const f = (d) => { const n = new RealDate(Theme.nextBoundary(d, DEF)); return [n.getDate(), n.getHours(), n.getMinutes()]; };
    assert.deepStrictEqual(f(at(12)), [4, 18, 0], 'noon → 18:00 today'); assert.deepStrictEqual(f(at(19)), [5, 6, 0], '19:00 → 06:00 tomorrow'); assert.deepStrictEqual(f(at(3)), [4, 6, 0], '03:00 → 06:00 today'); assert.deepStrictEqual(f(at(18, 0)), [5, 6, 0], 'exactly 18:00 → the next change is 06:00');
    assert(Theme.nextBoundary(at(23, 59), DEF) > at(23, 59).getTime());
  });
  await t('resolveTheme: auto follows the clock; "dark" / "light" pin it; an unexpired click override wins; an expired one is ignored', () => {
    localStorage.clear(); assert.strictEqual(Theme.resolveTheme(DEF, at(20)), 'dark'); assert.strictEqual(Theme.resolveTheme(DEF, at(10)), 'light'); assert.strictEqual(Theme.resolveTheme({ ...DEF, mode: 'dark' }, at(10)), 'dark'); assert.strictEqual(Theme.resolveTheme({ ...DEF, mode: 'light' }, at(20)), 'light');
    useFake(at(20)); localStorage.setItem('inntrio-login-theme', JSON.stringify({ theme: 'light', until: at(23).getTime() })); assert.strictEqual(Theme.resolveTheme(DEF, at(20)), 'light', 'override wins at night');
    localStorage.setItem('inntrio-login-theme', JSON.stringify({ theme: 'light', until: at(19).getTime() })); assert.strictEqual(Theme.resolveTheme(DEF, at(20)), 'dark', 'expired override ignored'); localStorage.setItem('inntrio-login-theme', '{bad'); assert.strictEqual(Theme.resolveTheme(DEF, at(20)), 'dark', 'corrupt value ignored'); useReal(); localStorage.clear();
  });
  await t('HOOK: with nothing saved the login is DARK at 8 pm and LIGHT at noon (the default behaviour); the logo click overrides until the next change, then automatic resumes', async () => {
    localStorage.clear(); useFake(at(20)); let m = await mount(React.createElement(Probe)); assert.strictEqual(m.host.querySelector('#p').textContent, 'DARK');
    await act(async () => { m.host.querySelector('#p').click(); }); assert.strictEqual(m.host.querySelector('#p').textContent, 'LIGHT', 'click → light'); const ov = JSON.parse(localStorage.getItem('inntrio-login-theme')); assert.strictEqual(new RealDate(ov.until).getHours(), 6, 'lasts until 06:00, when automatic resumes');
    await act(async () => { m.root.unmount(); }); localStorage.clear(); useFake(at(12)); m = await mount(React.createElement(Probe)); assert.strictEqual(m.host.querySelector('#p').textContent, 'LIGHT', 'noon → light'); useReal(); localStorage.clear();
  });
  await t('HOOK: the server config is applied and cached (Dev pins the mode / moves the window); an older server without the keys changes nothing', async () => {
    localStorage.clear(); useFake(at(12)); Theme._resetLoginTheme(); global.fetch = async () => ({ json: async () => ({ success: true, config: { login_theme_mode: 'dark', login_dark_from: '18:00', login_dark_to: '06:00' } }) });
    let m = await mount(React.createElement(Probe)); await act(async () => { await sleep(20); }); assert.strictEqual(m.host.querySelector('#p').textContent, 'DARK', 'pinned dark by Dev at noon'); assert.deepStrictEqual(JSON.parse(localStorage.getItem('inntrio-login-cfg')), { mode: 'dark', darkFrom: '18:00', darkTo: '06:00' }, 'cached for the next load');
    await act(async () => { m.root.unmount(); }); localStorage.clear(); Theme._resetLoginTheme(); global.fetch = async () => ({ json: async () => ({ success: true, config: { hide_abc_keyboard: false } }) });
    m = await mount(React.createElement(Probe)); await act(async () => { await sleep(20); }); assert.strictEqual(m.host.querySelector('#p').textContent, 'LIGHT', 'no keys → automatic'); assert.strictEqual(localStorage.getItem('inntrio-login-cfg'), null);
    await act(async () => { m.root.unmount(); }); Theme._resetLoginTheme(); global.fetch = async () => { throw new Error('offline'); }; m = await mount(React.createElement(Probe)); await act(async () => { await sleep(20); }); assert.strictEqual(m.host.querySelector('#p').textContent, 'LIGHT', 'offline → still works'); useReal(); localStorage.clear(); global.fetch = nativeFetch;
  });
  await t('HOOK: a screen left open flips by itself when the window starts — one timer to the next change, no polling', async () => {
    localStorage.clear(); useFake(at(17, 59)); const timers = []; const realST = global.setTimeout; global.setTimeout = (fn, ms, ...a) => { timers.push(ms); return realST(fn, 1e9, ...a); };
    try { const m = await mount(React.createElement(Probe)); assert.strictEqual(m.host.querySelector('#p').textContent, 'LIGHT'); const wait = Math.min(...timers.filter(x => x > 0 && x < 3e5)); assert(wait >= 55000 && wait <= 70000, `timer ${wait} ms ≈ the 1 min left until 18:00`); await act(async () => { m.root.unmount(); }); } finally { global.setTimeout = realST; useReal(); }
  });

  // ── server ──
  let configRows = []; const sqls = [];
  pg.Pool.prototype.query = async function (sql, params) { const q = String(sql).replace(/\s+/g, ' '); sqls.push({ q, params }); if (/FROM app_settings WHERE key IN \('hide_abc_keyboard'/.test(q)) return { rows: configRows, rowCount: configRows.length }; return { rows: [], rowCount: 0 }; };
  require(ROOT + '/server/server.js'); await sleep(600);
  const tok = (role, type) => jwt.sign({ sub: 'u', role, type }, process.env.JWT_SECRET); const call = async (method, p, tk, body) => { const r = await nativeFetch('http://127.0.0.1:3992' + p, { method, headers: { ...(tk ? { Authorization: 'Bearer ' + tk } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  await t('public-config: defaults to automatic 18:00 → 06:00; serves the saved values; ignores invalid stored ones', async () => {
    configRows = []; let r = await call('GET', '/api/public-config'); assert.deepStrictEqual([r.body.config.login_theme_mode, r.body.config.login_dark_from, r.body.config.login_dark_to], ['auto', '18:00', '06:00']);
    configRows = [{ key: 'login_theme_mode', value: 'light' }, { key: 'login_dark_from', value: '20:30' }, { key: 'login_dark_to', value: '05:15' }]; r = await call('GET', '/api/public-config'); assert.deepStrictEqual([r.body.config.login_theme_mode, r.body.config.login_dark_from, r.body.config.login_dark_to], ['light', '20:30', '05:15']);
    configRows = [{ key: 'login_theme_mode', value: 'purple' }, { key: 'login_dark_from', value: '99:99' }]; r = await call('GET', '/api/public-config'); assert.deepStrictEqual([r.body.config.login_theme_mode, r.body.config.login_dark_from], ['auto', '18:00']);
  });
  await t('settings PUT: login_* is DEV-only (admin 403, dev 200) and validated (mode, HH:MM 24 h, start ≠ end)', async () => {
    const body = { login_theme_mode: 'auto', login_dark_from: '19:00', login_dark_to: '05:30' }; sqls.length = 0;
    assert.strictEqual((await call('PUT', '/api/admin/settings', tok('admin', 'admin'), body)).status, 403, 'a manager cannot change it'); assert.strictEqual(sqls.filter(s => /INSERT INTO app_settings/.test(s.q)).length, 0);
    const ok = await call('PUT', '/api/admin/settings', tok('dev', 'admin'), body); assert.strictEqual(ok.status, 200); const writes = sqls.filter(s => /INSERT INTO app_settings/.test(s.q)).map(s => s.params); assert.deepStrictEqual(writes, [['login_theme_mode', 'auto'], ['login_dark_from', '19:00'], ['login_dark_to', '05:30']]);
    for (const bad of [{ login_theme_mode: 'purple' }, { login_dark_from: '7pm' }, { login_dark_to: '24:00' }, { login_dark_from: '08:00', login_dark_to: '08:00' }]) assert.strictEqual((await call('PUT', '/api/admin/settings', tok('dev', 'admin'), bad)).status, 400, JSON.stringify(bad));
    assert.strictEqual((await call('PUT', '/api/admin/settings', null, body)).status, 401);
  });

  // ── Dev → Platform card ──
  await t('DEV CARD: loads the saved mode + window, the times are disabled unless Automatic, saving sends the three keys; start = end is refused before any request', async () => {
    global.fetch = async () => ({ json: async () => ({ success: true, config: { login_theme_mode: 'auto', login_dark_from: '18:00', login_dark_to: '06:00' } }) }); const sent = []; authFetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body), method: init.method }); return { json: async () => ({ success: true }) }; };
    const { LoginThemeCard } = load(ROOT + '/src/pages/Dev/DevPlatform.js'); const m = await mount(React.createElement(LoginThemeCard)); await act(async () => { await sleep(20); });
    const radios = [...m.host.querySelectorAll('input[type=radio]')]; assert.strictEqual(radios.length, 3); assert(radios[0].checked); const [fromEl, toEl] = m.host.querySelectorAll('input[type=time]'); assert.strictEqual(fromEl.value, '18:00'); assert.strictEqual(toEl.value, '06:00'); assert(!fromEl.disabled);
    const setVal = (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('input', { bubbles: true })); };
    await act(async () => { radios[1].click(); }); assert(fromEl.disabled && toEl.disabled, 'times only apply to Automatic'); await act(async () => { radios[0].click(); }); await act(async () => { setVal(fromEl, '19:30'); });
    await act(async () => { [...m.host.querySelectorAll('button')].find(b => /^Save/.test(b.textContent)).click(); await sleep(10); }); assert.deepStrictEqual(sent[0], { url: '/api/admin/settings', method: 'PUT', body: { login_theme_mode: 'auto', login_dark_from: '19:30', login_dark_to: '06:00' } });
    await act(async () => { setVal(toEl, '19:30'); }); await act(async () => { [...m.host.querySelectorAll('button')].find(b => /Save|Saved/.test(b.textContent)).click(); await sleep(10); }); assert.strictEqual(sent.length, 1, 'no request'); assert(/different/.test(m.host.textContent));
    const platform = fs.readFileSync(ROOT + '/src/pages/Dev/DevPlatform.js', 'utf8'); assert(/<LoginThemeCard \/>/.test(platform), 'shown on Dev → Platform');
  });
  console.log(`\n${pass} passed`); process.exit(process.exitCode || 0);
})();
