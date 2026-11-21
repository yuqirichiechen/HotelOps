// Sprint 29.2 — "Change password" on the manager and developer SIGN-IN screens (before signing in), in the same Inntrio style as the sign-in itself.
//   node tests/login-change-password.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; globalThis.__HOTELOPS_NO_ANIM = true; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const RR = require(ROOT + '/node_modules/react-router-dom'); const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils');
let calls = []; let changeResult = { success: true }; let loginResult = { success: true };
const auth = { apiFetch: async () => ({ ok: true, data: {} }), useAuth: () => ({ loginAdmin: async (u, p) => { calls.push(['loginAdmin', u, p]); return loginResult; }, loginDev: async (u, p) => { calls.push(['loginDev', u, p]); return loginResult; } }),
  changeLoginPassword: async (kind, body) => { calls.push(['change', kind, body]); return changeResult; } };
const modCache = new Map(); const load = (file) => { if (modCache.has(file)) return modCache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); modCache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return auth; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : (fs.existsSync(p) && fs.statSync(p).isDirectory() ? p + '/index.js' : p)); } return orig(id); };
  m._compile(code, file); return m.exports; };
const Admin = load(ROOT + '/src/pages/Login/AdminLogin.js').default; const Dev = load(ROOT + '/src/pages/Login/DevLogin.js').default;
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 5).join(' | ')); process.exitCode = 1; } };
const $ = (sel, root = document) => root.querySelector(sel), $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const mount = async (Comp) => { const host = document.createElement('div'); document.body.innerHTML = ''; document.body.appendChild(host); const root = createRoot(host);
  await act(async () => { root.render(React.createElement(RR.MemoryRouter, { initialEntries: ['/snoqualmieinn/login'] }, React.createElement(RR.Routes, null, React.createElement(RR.Route, { path: '/:tenant/*', element: React.createElement(Comp, { onBack: () => calls.push(['back']), onChangeProperty: () => {} }) })))); }); await act(async () => { await sleep(40); }); return host; };
const click = async (el) => { await act(async () => { el.click(); }); await act(async () => { await sleep(30); }); };
const type = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('input', { bubbles: true })); }); };
const submit = async (host) => { await act(async () => { $('form', host).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }); await act(async () => { await sleep(40); }); };
const reset = () => { calls = []; changeResult = { success: true }; loginResult = { success: true }; };

(async () => {
  for (const [kind, Comp, label, passId] of [['admin', Admin, 'Manager', 'password'], ['dev', Dev, 'Developer', 'dev-password']]) {
    await t(`${label.toUpperCase()} SIGN-IN: a gold "Change password" link sits under the password (in the same card), the screen is otherwise unchanged`, async () => {
      reset(); const host = await mount(Comp); const card = $('.in-login-card', host); const link = $('.in-aside .in-link', card); assert(link && link.textContent === 'Change password', 'the link'); assert.strictEqual(link.type, 'button', 'it never submits the sign-in form');
      assert(/Welcome back/.test(card.textContent) && $('.in-primary', card).textContent.startsWith('Sign in') && $('.in-back', host).textContent.includes('Back to access options')); assert.strictEqual($$('input', card).length, 2, 'username + password only');
      assert(card.contains($('#' + passId)) && (link.compareDocumentPosition($('#' + passId)) & w.Node.DOCUMENT_POSITION_PRECEDING), 'the link comes after the password field');
    });
    await t(`${label.toUpperCase()} CHANGE SCREEN: same Inntrio card / fields / gold button / back link as the sign-in; Username, Current, New, Confirm; the username typed on the sign-in is carried over; sign-in wording is gone`, async () => {
      reset(); const host = await mount(Comp); await type($$('input', host)[0], 'bossman'); await click($('.in-link', host));
      assert.strictEqual($('h1.in-h1', host).textContent, `${label} password`); assert(/Change your password/.test($('.in-login-header h2', host).textContent) && !/Welcome back/.test(host.textContent) && /Enter your current password/.test(host.textContent));
      const card = $('form.in-surface.in-login-card', host); assert(card, 'the same card'); assert.deepStrictEqual($$('label.in-field-label', card).map(l => l.textContent), ['Username', 'Current password', 'New password', 'Confirm new password']); assert.strictEqual($$('.in-field', card).length, 4); assert.strictEqual($$('.in-input-eye', card).length, 3, 'show / hide on the three password boxes');
      assert.strictEqual($('#cp-username', card).value, 'bossman'); assert.deepStrictEqual($$('input', card).map(i => i.getAttribute('autocomplete')), ['username', 'current-password', 'new-password', 'new-password']);
      assert.strictEqual($('.in-primary', card).textContent.trim(), 'Change password'); assert(!/Sign in/.test($('.in-primary', card).textContent)); assert(/Back to sign in/.test($('.in-back', host).textContent)); assert(!$('.in-aside', card), 'no second link here');
    });
    await t(`${label.toUpperCase()} CHANGE SCREEN: the button stays off until username + current + a valid new password + a matching confirmation; the hint says what is wrong; the eye shows a box`, async () => {
      reset(); const host = await mount(Comp); await click($('.in-link', host)); const f = (id) => $('#' + id, host); const btn = () => $('.in-primary', host); assert(btn().disabled && /Choose something/.test($('.in-hint', host).textContent));
      await type(f('cp-username'), 'bossman'); await type(f('cp-current'), 'old-pass-123'); await type(f('cp-new'), 'short'); assert(btn().disabled && /at least 8/.test($('.in-hint', host).textContent) && $('.in-hint', host).classList.contains('bad'));
      await type(f('cp-new'), 'brand-new-pass-1'); assert(/don.t match/.test($('.in-hint', host).textContent) && btn().disabled); await type(f('cp-confirm'), 'brand-new-pass-1'); assert(!btn().disabled && /Looks good/.test($('.in-hint', host).textContent) && $('.in-hint', host).classList.contains('good'));
      await type(f('cp-new'), 'old-pass-123'); await type(f('cp-confirm'), 'old-pass-123'); assert(btn().disabled && /different from the current/.test($('.in-hint', host).textContent)); await type(f('cp-new'), 'brand-new-pass-1'); await type(f('cp-confirm'), 'brand-new-pass-1');
      assert.strictEqual(f('cp-new').type, 'password'); await click($$('.in-input-eye', host)[1]); assert.strictEqual(f('cp-new').type, 'text'); assert.strictEqual(f('cp-current').type, 'password', 'each box has its own eye');
    });
    await t(`${label.toUpperCase()} CHANGE SCREEN: saving sends the change for "${kind}" (never a sign-in), then returns to the sign-in with a green "Password changed" line, the username filled in and the password box empty`, async () => {
      reset(); const host = await mount(Comp); await click($('.in-link', host)); const f = (id) => $('#' + id, host);
      await type(f('cp-username'), 'bossman'); await type(f('cp-current'), 'old-pass-123'); await type(f('cp-new'), 'brand-new-pass-1'); await type(f('cp-confirm'), 'brand-new-pass-1'); await submit(host);
      assert.deepStrictEqual(calls.filter(c => c[0] === 'change'), [['change', kind, { username: 'bossman', currentPassword: 'old-pass-123', newPassword: 'brand-new-pass-1' }]]); assert(!calls.some(c => /^login/.test(c[0])), 'nobody is signed in by this');
      assert.strictEqual($('h1.in-h1', host).textContent, kind === 'dev' ? 'Developer sign-in' : 'Manager sign-in'); assert(/Password changed\. Sign in with your new password\./.test($('.in-notice', host).textContent) && $('.in-notice', host).getAttribute('role') === 'status');
      const inputs = $$('input', host); assert.deepStrictEqual([inputs[0].value, inputs[1].value], ['bossman', ''], 'username kept, password cleared'); await type(inputs[1], 'brand-new-pass-1'); await submit(host); assert.deepStrictEqual(calls.filter(c => /^login/.test(c[0])), [[kind === 'dev' ? 'loginDev' : 'loginAdmin', 'bossman', 'brand-new-pass-1']], 'and the new password signs in');
    });
    await t(`${label.toUpperCase()} CHANGE SCREEN: a refusal from the server (wrong current password, too many attempts …) is shown in the red box and nothing typed is lost; "Back to sign in" returns without calling the server`, async () => {
      reset(); const host = await mount(Comp); await click($('.in-link', host)); const f = (id) => $('#' + id, host);
      await type(f('cp-username'), 'bossman'); await type(f('cp-current'), 'wrong-pass-12'); await type(f('cp-new'), 'brand-new-pass-1'); await type(f('cp-confirm'), 'brand-new-pass-1'); changeResult = { success: false, message: 'The username or current password is not right.' }; await submit(host);
      assert(/username or current password is not right/.test($('.in-error', host).textContent) && $('.in-error', host).getAttribute('role') === 'alert'); assert.deepStrictEqual(['cp-username', 'cp-current', 'cp-new', 'cp-confirm'].map(id => f(id).value), ['bossman', 'wrong-pass-12', 'brand-new-pass-1', 'brand-new-pass-1']);
      await type(f('cp-current'), 'other-pass-12'); assert(!$('.in-error', host), 'typing clears the message'); calls.length = 0; await click($('.in-back', host)); assert.deepStrictEqual(calls, [], 'back does nothing on the server'); assert(/Welcome back/.test(host.textContent) && !$('.in-notice', host), 'no success line when nothing changed'); assert.strictEqual($$('input', host)[0].value, 'bossman', 'what was typed as the username stays');
    });
  }
  await t('the staff sign-in is untouched (staff use a PIN, not a password) — no Change password link there', () => {
    const src = fs.readFileSync(ROOT + '/src/pages/Login/StaffLogin.js', 'utf8'); assert(!/Change password|ChangePasswordScreen|in-link/.test(src));
  });
  await t('STYLE: the link, the success line and the hint have dark AND light sign-in styles (gold link, green notice, red / green hint) in Inntrio.css — the same file as the rest of the sign-in', () => {
    const css = fs.readFileSync(ROOT + '/src/pages/Login/Inntrio.css', 'utf8'); for (const sel of ['.in-aside', '.in-link', '.in-notice', '.in-hint', '.in-hint.bad', '.in-hint.good']) assert(css.includes(sel + ' {') || css.includes(sel + ','), sel);
    for (const sel of ['.in-light .in-link', '.in-light .in-notice', '.in-light .in-hint']) assert(css.includes(sel), 'light: ' + sel); assert(/\.in-link \{[^}]*color: var\(--in-gold\)/.test(css), 'the same gold as "Back to access options"');
  });
  console.log(`${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
