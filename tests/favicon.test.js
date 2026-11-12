// Sprint 27.8 — the tab icon follows the mode (dark mark in dark mode, navy mark in light mode), on the login (login theme) and in the app (app theme).
//   node tests/favicon.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert'); const fs = require('fs');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><html><head><link rel="icon" type="image/svg+xml" href="/inntrio/inntrio-icon-dark.svg"></head><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage });
const path = require('path'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core');
const load = (file) => { const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code; const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); m._compile(code, file); return m.exports; };
const F = load(ROOT + '/src/lib/favicon.js'); let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
const icon = () => document.querySelectorAll('link[rel="icon"]');
t('both icon files ship in public/inntrio and are the right marks (white for dark mode, navy for light)', () => {
  for (const f of ['inntrio-icon-dark.svg', 'inntrio-icon-light.svg']) assert(fs.existsSync(`${ROOT}/public/inntrio/${f}`), f);
  assert(/stop-color="#d9d8d7"/.test(fs.readFileSync(`${ROOT}/public/inntrio/inntrio-icon-dark.svg`, 'utf8')), 'dark-mode icon is the white / grey mark'); assert(/stop-color="#05325c"/.test(fs.readFileSync(`${ROOT}/public/inntrio/inntrio-icon-light.svg`, 'utf8')), 'light-mode icon is the navy mark');
});
t('setFavicon swaps the single <link rel=icon> between the dark and light mark (the element is replaced — Safari ignores a changed href), and does nothing when already right', () => {
  const before = icon()[0]; F.setFavicon('dark'); assert.strictEqual(icon()[0], before, 'unchanged → same element'); F.setFavicon('light'); assert.strictEqual(icon().length, 1); assert.strictEqual(icon()[0].getAttribute('href'), '/inntrio/inntrio-icon-light.svg'); assert.notStrictEqual(icon()[0], before, 'replaced'); assert.strictEqual(icon()[0].type, 'image/svg+xml');
  F.setFavicon('dark'); assert.strictEqual(icon()[0].getAttribute('href'), '/inntrio/inntrio-icon-dark.svg'); document.querySelector('link[rel="icon"]').remove(); F.setFavicon('light'); assert.strictEqual(icon().length, 1, 'created when missing');
});
t('login paths use the login theme, the rest of the app its own', () => { for (const p of ['/', '/snoqualmieinn/login', '/login/dev']) assert(F.isLoginPath(p), p); for (const p of ['/snoqualmieinn/admin', '/snoqualmieinn/staff', '/snoqualmieinn/clockin', '/dev', '/set-pin']) assert(!F.isLoginPath(p), p); });
t('wiring: index.html has the icon link; App syncs it from the login theme (no config fetch) on sign-in screens and the app theme elsewhere', () => {
  assert(/<link rel="icon" type="image\/svg\+xml" href="\/inntrio\/inntrio-icon-dark\.svg"/.test(fs.readFileSync(ROOT + '/public/index.html', 'utf8')));
  const app = fs.readFileSync(ROOT + '/src/App.js', 'utf8'); assert(/<FaviconSync appTheme=\{theme\} \/>/.test(app) && /useLoginTheme\(\{ fetchConfig: false \}\)/.test(app) && /isLoginPath\(pathname\) \? loginLight/.test(app) && /setFavicon\(light \? 'light' : 'dark'\)/.test(app));
  assert(/fetchConfig = true/.test(fs.readFileSync(ROOT + '/src/pages/Login/loginTheme.js', 'utf8')), 'the hook only fetches when asked to');
});
console.log(`\n${pass} passed`); process.exit(process.exitCode || 0);
