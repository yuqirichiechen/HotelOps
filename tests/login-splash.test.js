// Sprint 27.4 — (1) the entrance animation must not replay after a view transition (the 27.3 double-animation bug), (2) the welcome splash: logo alone, then fade
// into the property picker, once per page load, skippable, never for the dev picker.   node tests/login-splash.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const RR = require(ROOT + '/node_modules/react-router-dom'); const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils');
const modCache = new Map(); const load = (file) => { if (modCache.has(file)) return modCache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); modCache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); };
  m._compile(code, file); return m.exports; };
const Frame = load(ROOT + '/src/pages/Login/InntrioFrame.js'); const SplashMod = load(ROOT + '/src/pages/Login/Splash.js'); const Picker = load(ROOT + '/src/pages/Login/TenantPicker.js').default;
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
const mount = async (el) => { const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host); await act(async () => { root.render(el); }); return { host, root }; };
const picker = (kind) => React.createElement(RR.MemoryRouter, { initialEntries: ['/'] }, React.createElement(RR.Routes, null, React.createElement(RR.Route, { path: '/', element: React.createElement(Picker, { kind }) })));
(async () => {
  await t('ENTRANCE (27.6): every screen mounts with in-enter, fixed at mount (nothing can restart it); only the FIRST screen of a page load also animates the top bar; a screen reached by going back (navDir) settles from above', async () => {
    const A = Frame.default; const root = document.documentElement;
    let m = await mount(React.createElement(A, { step: 'access' }, React.createElement('p', null, 'x'))); const el = m.host.querySelector('.in-root'); assert(el.classList.contains('in-enter') && el.classList.contains('in-enter-top'), 'first screen: content + top bar'); assert(!el.classList.contains('in-from-back'));
    m = await mount(React.createElement(A, { step: 'access' }, React.createElement('p', null, 'x'))); assert(m.host.querySelector('.in-root.in-enter') && !m.host.querySelector('.in-root').classList.contains('in-enter-top'), 'later screens: the top bar stays still');
    root.dataset.navDir = 'back'; m = await mount(React.createElement(A, { step: 'access' }, React.createElement('p', null, 'x'))); assert(m.host.querySelector('.in-root').classList.contains('in-from-back'), 'going back'); delete root.dataset.navDir;
    await act(async () => { m.root.render(React.createElement(A, { step: 'access' }, React.createElement('p', null, 'y'))); }); assert(m.host.querySelector('.in-root').classList.contains('in-from-back') && m.host.querySelector('.in-root').classList.contains('in-enter'), 'classes fixed at mount — a re-render changes nothing');
  });
  await t('top bar: plain Inntrio logo left, gold "Hospitality management platform" right; no big logo, no "One workspace" note, no step line', async () => {
    localStorage.setItem('inntrio-login-cfg', JSON.stringify({ mode: 'dark' })); const m = await mount(React.createElement(Frame.default, { step: 'property' }, React.createElement('p', null, 'x')));
    const top = m.host.querySelector('.in-topnav'); assert(top.querySelector('img').getAttribute('src') === '/inntrio/Inntrio-logo-dark.svg'); localStorage.clear(); assert.strictEqual(top.querySelector('.in-tagline').textContent, 'Hospitality management platform');
    assert(!m.host.querySelector('.in-masthead, .in-hero-logo, .in-steps')); const css = fs.readFileSync(ROOT + '/src/pages/Login/Inntrio.css', 'utf8'); assert(/\.in-tagline \{ color: var\(--in-gold\)/.test(css), 'gold');
    const picker = fs.readFileSync(ROOT + '/src/pages/Login/TenantPicker.js', 'utf8'); assert(!/One workspace/.test(picker));
  });
  await t('SPLASH: first open shows only the logo (no picker yet), after the hold the picker mounts under a fading splash, then the splash is gone; the picker is usable', async () => {
    SplashMod._resetSplash(); const m = await mount(picker('staff'));
    assert(m.host.querySelector('.in-splash') && m.host.querySelector('.in-splash-logo'), 'splash visible'); assert(!m.host.querySelector('.in-property-row'), 'picker not mounted during the hold'); assert(/Hospitality management platform/.test(m.host.querySelector('.in-splash').textContent));
    await act(async () => { await sleep(SplashMod.SPLASH_HOLD_MS + 120); }); assert(m.host.querySelector('.in-splash.is-fading'), 'fading'); assert(m.host.querySelector('.in-property-row'), 'picker mounted under it');
    await act(async () => { await sleep(SplashMod.SPLASH_FADE_MS + 120); }); assert(!m.host.querySelector('.in-splash'), 'splash removed'); assert(m.host.querySelector('.in-property-row') && /Select a property/.test(m.host.textContent));
    const total = SplashMod.SPLASH_HOLD_MS + SplashMod.SPLASH_FADE_MS; assert(total >= 1500 && total <= 2600, `${total} ms — "a sec or two"`);
  });
  await t('SPLASH plays once per page load: opening the picker again straight after shows no splash', async () => {
    const m = await mount(picker('staff')); assert(!m.host.querySelector('.in-splash') && m.host.querySelector('.in-property-row'), 'no repeat');
  });
  await t('SPLASH can be skipped with a tap, and a key press', async () => {
    SplashMod._resetSplash(); let m = await mount(picker('staff')); assert(m.host.querySelector('.in-splash')); await act(async () => { m.host.querySelector('.in-splash').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); assert(m.host.querySelector('.in-property-row'), 'tap skips the hold');
    await act(async () => { await sleep(SplashMod.SPLASH_FADE_MS + 120); }); assert(!m.host.querySelector('.in-splash'));
    SplashMod._resetSplash(); m = await mount(picker('staff')); await act(async () => { window.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }); assert(m.host.querySelector('.in-property-row'), 'a key skips it too');
  });
  await t('no splash for the dev property picker, and none with reduced motion', async () => {
    SplashMod._resetSplash(); let m = await mount(picker('dev')); assert(!m.host.querySelector('.in-splash') && m.host.querySelector('.in-property-row'), 'dev picker');
    SplashMod._resetSplash(); const mm = window.matchMedia; window.matchMedia = (q) => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {} }); m = await mount(picker('staff')); window.matchMedia = mm; assert(!m.host.querySelector('.in-splash') && m.host.querySelector('.in-property-row'), 'reduced motion');
  });
  await t('light mode (27.5): with a saved light theme the splash and the picker come up light with the navy logo', async () => {
    localStorage.setItem('inntrio-login-cfg', JSON.stringify({ mode: 'light' })); SplashMod._resetSplash(); const m = await mount(picker('staff'));
    assert(m.host.querySelector('.in-splash.in-light') && m.host.querySelector('.in-splash-logo').getAttribute('src') === '/inntrio/inntrio-logo-light.svg', 'light splash'); await act(async () => { m.host.querySelector('.in-splash').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
    assert(m.host.querySelector('.in-root.in-light .in-property-row') && m.host.querySelector('.in-topnav img').getAttribute('src') === '/inntrio/inntrio-logo-light.svg', 'light picker'); localStorage.clear();
  });
  console.log(`\n${pass} passed`); process.exit(process.exitCode || 0);
})();
