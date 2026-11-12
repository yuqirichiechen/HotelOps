// Sprint 27.1.1 — a render crash must show a readable error panel (not a blank page); Reload / Sign out and reload / Copy details work.
//   node tests/error-boundary.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/dev', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, sessionStorage: w.sessionStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils');
const load = (file) => { const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); m._compile(code, file); return m.exports; };
const Mod = load(ROOT + '/src/AppErrorBoundary.js'); const Boundary = Mod.default;
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
const Bomb = ({ boom }) => { if (boom) throw new TypeError("Cannot read properties of undefined (reading 'filter')"); return React.createElement('p', null, 'ALL GOOD'); };
const origErr = console.error; const quiet = () => { console.error = () => {}; }; const loud = () => { console.error = origErr; };
(async () => {
  const el = document.getElementById('root');
  await t('healthy children render untouched', async () => { const root = createRoot(el); await act(async () => { root.render(React.createElement(Boundary, null, React.createElement(Bomb, { boom: false }))); }); assert(/ALL GOOD/.test(el.textContent)); assert(!el.querySelector('[role=alert]')); await act(async () => { root.unmount(); }); });
  await t('a render crash shows the panel with the actual error text and three buttons — never a blank page', async () => {
    quiet(); const root = createRoot(el); await act(async () => { root.render(React.createElement(Boundary, null, React.createElement(Bomb, { boom: true }))); }); loud();
    const alert = el.querySelector('[role=alert]'); assert(alert, 'panel shown'); assert(/Something went wrong/.test(alert.textContent)); assert(/Cannot read properties of undefined \(reading 'filter'\)/.test(alert.textContent), 'error text visible so it can be reported');
    assert.deepStrictEqual([...alert.querySelectorAll('button')].map(b => b.textContent), ['Reload', 'Sign out and reload', 'Copy details']); assert(!/ALL GOOD/.test(el.textContent));
    window.__copied = null; Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (s) => { window.__copied = s; } }, configurable: true });
    await act(async () => { [...alert.querySelectorAll('button')].find(b => /Copy/.test(b.textContent)).click(); await sleep(10); }); assert(/reading 'filter'/.test(window.__copied || ''), 'copy puts the error on the clipboard'); assert(/Copied/.test(el.textContent));
    await act(async () => { root.unmount(); });
  });
  await t('describeError keeps the stack + component stack and is bounded in size', () => {
    const d = Mod.describeError(new Error('x'.repeat(5000)), { componentStack: '\n  at Foo' }); assert(d.length <= 2500); assert(/at Foo/.test(Mod.describeError(new Error('boom'), { componentStack: '\n  at Foo' })));
    assert(/Unknown error/.test(Mod.describeError(null, null)));
  });
  await t('"Sign out and reload" clears the saved token / remembered state (so a broken saved state cannot keep crashing the page) and goes to /', async () => {
    localStorage.setItem('hotelops-token', 'T'); localStorage.setItem('hotelops-staff-entry', 'staff'); localStorage.setItem('hotelops-theme', 'dark'); sessionStorage.setItem('x', '1'); let went = null;
    const real = w.location; const orig = Mod.resetAndReload; // jsdom location.assign is not implemented: observe via a stub
    Object.defineProperty(w, 'location', { value: { assign: (u) => { went = u; }, reload() {} }, configurable: true });
    try { orig(); } finally { Object.defineProperty(w, 'location', { value: real, configurable: true }); }
    assert.strictEqual(localStorage.getItem('hotelops-token'), null); assert.strictEqual(localStorage.getItem('hotelops-staff-entry'), null); assert.strictEqual(sessionStorage.getItem('x'), null); assert.strictEqual(localStorage.getItem('hotelops-theme'), 'dark', 'preferences survive'); assert.strictEqual(went, '/');
  });
  await t('public/index.html has the 10 s "could not load" fallback for a script that never starts', () => {
    const h = require('fs').readFileSync(ROOT + '/public/index.html', 'utf8'); assert(/could not load/i.test(h) && /setTimeout/.test(h) && /!r\.firstChild/.test(h));
  });
  console.log(`\n${pass} passed`); process.exit(process.exitCode || 0);
})();
