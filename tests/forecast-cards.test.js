// Sprint 29.4 — which cards the front desk's Forecast page shows: the list + parsing, the dev-only setting on the server, and the dev screen.   node tests/forecast-cards.test.js "$PWD"
const ROOT = process.argv[2]; const SRV = ROOT + '/server'; process.env.NODE_ENV = 'test'; globalThis.__HOTELOPS_NO_ANIM = true; const assert = require('assert');
process.env.PORT = '3997'; process.env.JWT_SECRET = 'x'.repeat(40); process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, CustomEvent: w.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils'); const jwt = require(SRV + '/node_modules/jsonwebtoken'); const pg = require(SRV + '/node_modules/pg');
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 5).join(' | ')); process.exitCode = 1; } };
// the client card list, loaded the way the other UI tests load components
let calls = [], store = {}; let putResult = null;
const apiFetch = async (p, o = {}) => { const method = o.method || 'GET', body = o.body ? JSON.parse(o.body) : null; calls.push({ p, method, body });
  if (p === '/admin/settings' && method === 'GET') return { ok: true, status: 200, data: { success: true, settings: { ...store } } };
  if (p === '/admin/settings' && method === 'PUT') { if (putResult) return putResult; Object.assign(store, body); return { ok: true, status: 200, data: { success: true } }; }
  return { ok: true, status: 200, data: { success: true } }; };
const modCache = new Map(); const load = (file) => { if (modCache.has(file)) return modCache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); modCache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { apiFetch, authFetch: apiFetch }; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : (fs.existsSync(p) && fs.statSync(p).isDirectory() ? p + '/index.js' : p)); } return orig(id); };
  m._compile(code, file); return m.exports; };
const Cards = load(ROOT + '/src/components/FrontDesk/fdCards.js'); const FD = require(SRV + '/frontdesk');

(async () => {
  await t('THE CARD LIST: seven cards (five top cards, Rooms to sell today, Sellable vs arriving); the standard set is everything EXCEPT Sellable vs arriving; the client and the server list the SAME keys in the same order', () => {
    assert.deepStrictEqual(Cards.FD_CARD_KEYS, ['arrivals', 'inhouse', 'departures', 'leftToSell', 'dirty', 'roomsToSell', 'sellable']); assert.deepStrictEqual(Cards.FD_CARDS_DEFAULT, ['arrivals', 'inhouse', 'departures', 'leftToSell', 'dirty', 'roomsToSell']);
    assert.deepStrictEqual(FD.FD_CARD_KEYS, Cards.FD_CARD_KEYS, 'server and client agree'); assert(Cards.FD_CARDS.every(c => c.label && c.note && ['tile', 'table', 'card'].includes(c.kind))); assert.strictEqual(Cards.FD_CARDS.filter(c => c.kind === 'tile').length, 5);
  });
  await t('PARSING the stored setting: unset / broken / not a list / empty / only unknown keys → the standard set (the page is never blank); unknown keys and duplicates are dropped; the page order is always kept', () => {
    const D = Cards.FD_CARDS_DEFAULT; for (const raw of [undefined, null, '', 'nonsense', '{}', '"arrivals"', '[]', '["nope"]', '[1,2]']) assert.deepStrictEqual(Cards.parseFdCards(raw), D, String(raw));
    assert.deepStrictEqual(Cards.parseFdCards('["sellable","arrivals","arrivals","zzz"]'), ['arrivals', 'sellable'], 'order is the page order, unknown + duplicate dropped'); assert.deepStrictEqual(Cards.parseFdCards(JSON.stringify(Cards.FD_CARD_KEYS)), Cards.FD_CARD_KEYS); assert.deepStrictEqual(Cards.parseFdCards('["roomsToSell"]'), ['roomsToSell']);
  });
  await t('SERVER VALIDATION: a valid setting is a JSON list of 1–7 distinct known card keys; anything else is refused', () => {
    for (const ok of ['["arrivals"]', JSON.stringify(FD.FD_CARD_KEYS), '["roomsToSell","sellable"]']) assert.strictEqual(FD.validFdCards(ok), true, ok);
    for (const bad of ['[]', 'nonsense', '{}', '"x"', '["nope"]', '["arrivals","arrivals"]', '[1]', '[null]', JSON.stringify([...FD.FD_CARD_KEYS, 'arrivals']), '', undefined]) assert.strictEqual(FD.validFdCards(bad), false, String(bad));
    assert(FD.SETTINGS_ALLOWED.includes('forecast_fd_cards'), 'the front desk portal may READ it'); assert.deepStrictEqual(FD.pickSettings([{ key: 'forecast_fd_cards', value: '["arrivals"]' }, { key: 'overtime_threshold_hours', value: '40' }]), { forecast_fd_cards: '["arrivals"]' }, 'and nothing else comes with it');
  });
  // ── the routes (queries mocked) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const db = {}; pg.Pool.prototype.query = async function (sql, params) { const q = String(sql).replace(/\s+/g, ' ');
    if (/^INSERT INTO app_settings/.test(q)) { db[params[0]] = params[1]; return { rows: [], rowCount: 1 }; }
    if (/FROM app_settings WHERE key = ANY/.test(q)) return { rows: Object.entries(db).filter(([k]) => params[0].includes(k)).map(([key, value]) => ({ key, value })) };
    return { rows: [], rowCount: 0 }; };
  pg.Pool.prototype.connect = async function () { return { query: async () => ({ rows: [], rowCount: 0 }), release() {} }; };
  const sign = (o) => jwt.sign(o, process.env.JWT_SECRET); const DEV = sign({ sub: 'd', role: 'dev', type: 'dev' }), ADM = sign({ sub: 'a', role: 'admin', type: 'admin' }), FDESK = sign({ sub: '11111111-1111-4111-8111-111111111111', role: 'employee', type: 'staff', pages: ['reservations'] }), NOPAGE = sign({ sub: '11111111-1111-4111-8111-111111111111', role: 'employee', type: 'staff', pages: [] });
  const http = (p, o = {}) => fetch('http://127.0.0.1:3997' + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  require(SRV + '/server.js'); await sleep(600);
  await t('THE SETTING IS DEV-ONLY TO CHANGE: a manager gets 403 (the forecast_ prefix), dev can save a valid list, bad lists are 400; the front desk (and only people with a page) can READ it from /api/frontdesk/settings, never change it', async () => {
    const put = (token, v) => http('/api/admin/settings', { method: 'PUT', token, body: { forecast_fd_cards: v } });
    assert.strictEqual((await put(ADM, '["arrivals"]')).status, 403, 'manager refused'); assert.strictEqual(db.forecast_fd_cards, undefined); for (const bad of ['[]', 'nonsense', '["nope"]', '["arrivals","arrivals"]']) assert.strictEqual((await put(DEV, bad)).status, 400, bad);
    assert.strictEqual((await put(DEV, 5)).status, 400, 'not text'); assert.strictEqual((await put(DEV, '["arrivals","roomsToSell"]')).status, 200); assert.strictEqual(db.forecast_fd_cards, '["arrivals","roomsToSell"]');
    const r = await http('/api/frontdesk/settings', { token: FDESK }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.settings.forecast_fd_cards, '["arrivals","roomsToSell"]', 'the front desk reads it'); assert.strictEqual((await http('/api/frontdesk/settings', { token: NOPAGE })).status, 403, 'someone with no page cannot');
    assert.strictEqual((await http('/api/admin/settings', { method: 'PUT', token: FDESK, body: { forecast_fd_cards: '["arrivals"]' } })).status, 403, 'the front desk cannot change it');
  });
  // ── the dev screen ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const Card = load(ROOT + '/src/pages/Dev/DevFrontDeskCards.js').default; const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const mount = async (el) => { const host = document.getElementById('root'); host.innerHTML = ''; const root = createRoot(host); await act(async () => { root.render(el); }); await act(async () => { await sleep(80); }); return { unmount: async () => { await act(async () => { root.unmount(); }); } }; };
  const click = async (el) => { await act(async () => { el.click(); }); await act(async () => { await sleep(40); }); }; const btn = (re) => $$('button').find(b => re.test(b.textContent));
  const box = (label) => $$('input[type="checkbox"]').find(i => i.getAttribute('aria-label') === label);
  await t('DEV SCREEN: lists the seven cards with what each is; opens on the standard set (Sellable vs arriving unticked); Save is off until something changes', async () => {
    store = {}; calls = []; const h = await mount(React.createElement(Card)); assert(/Front desk — Forecast cards/.test($('h2').textContent)); assert.deepStrictEqual($$('.dvf-text strong').map(e => e.textContent), ['Arrivals left', 'In-house', 'Check-outs left', 'Left to sell', 'Dirty rooms', 'Rooms to sell today', 'Sellable vs arriving']);
    assert.deepStrictEqual($$('input[type="checkbox"]').map(i => i.checked), [true, true, true, true, true, true, false]); assert(btn(/Save cards/).disabled && btn(/Reset to the standard set/).disabled, 'nothing to save / reset'); assert(/hidden — you can bring it back/.test($('.dv-muted').textContent)); await h.unmount();
  });
  await t('DEV SCREEN: ticking Sellable vs arriving and saving writes the list (in page order, as JSON) through the settings route; the stored choice is what the screen opens on next time; untick the rest and the last one cannot be unticked', async () => {
    store = {}; calls = []; let h = await mount(React.createElement(Card)); await click(box('Sellable vs arriving')); assert(!btn(/Save cards/).disabled); await click(btn(/Save cards/));
    assert.deepStrictEqual(calls.find(c => c.method === 'PUT').body, { forecast_fd_cards: JSON.stringify(['arrivals', 'inhouse', 'departures', 'leftToSell', 'dirty', 'roomsToSell', 'sellable']) }); assert(/Saved — the front desk sees this/.test($('[role="status"]').textContent)); assert(btn(/Save cards/).disabled, 'clean again'); await h.unmount();
    h = await mount(React.createElement(Card)); assert.strictEqual(box('Sellable vs arriving').checked, true, 'opens on the stored choice'); for (const l of ['Arrivals left', 'In-house', 'Check-outs left', 'Left to sell', 'Dirty rooms', 'Rooms to sell today']) await click(box(l)); assert.deepStrictEqual($$('input[type="checkbox"]').map(i => i.checked), [false, false, false, false, false, false, true]);
    assert(box('Sellable vs arriving').disabled, 'the last card stays on — the page is never blank'); await click(box('Sellable vs arriving')); assert.strictEqual(box('Sellable vs arriving').checked, true); await h.unmount();
  });
  await t('DEV SCREEN: "Reset to the standard set" restores the default; a refusal from the server is shown; a stored value that is damaged opens as the standard set', async () => {
    store = { forecast_fd_cards: '["roomsToSell"]' }; calls = []; let h = await mount(React.createElement(Card)); assert.deepStrictEqual($$('input[type="checkbox"]').map(i => i.checked), [false, false, false, false, false, true, false]); await click(btn(/Reset to the standard set/)); assert.deepStrictEqual($$('input[type="checkbox"]').map(i => i.checked), [true, true, true, true, true, true, false]);
    putResult = { ok: false, status: 403, data: { success: false, message: 'Forbidden' } }; await click(btn(/Save cards/)); assert(/Forbidden/.test($('[role="status"]').textContent) && $('[role="status"]').classList.contains('dv-error')); putResult = null; await h.unmount();
    store = { forecast_fd_cards: 'garbage' }; h = await mount(React.createElement(Card)); assert.deepStrictEqual($$('input[type="checkbox"]').map(i => i.checked), [true, true, true, true, true, true, false]); await h.unmount();
  });
  await t('THE CARD IS ON DEV → PLATFORM, and the portal page keeps every card\'s code (nothing was deleted): FrontDeskSummary still contains the Sellable vs arriving card and the Rooms to sell table', () => {
    const plat = fs.readFileSync(ROOT + '/src/pages/Dev/DevPlatform.js', 'utf8'); assert(/FrontDeskCardsCard/.test(plat) && /DevFrontDeskCards/.test(plat)); const sum = fs.readFileSync(ROOT + '/src/components/FrontDesk/FrontDeskSummary.js', 'utf8');
    assert(/ForecastSummaryCard model=\{model\}/.test(sum) && /SimpleRoomTable model=\{model\}/.test(sum) && /show\('sellable'\)/.test(sum) && /show\('roomsToSell'\)/.test(sum), 'code kept, drawn only when switched on'); assert(!/Reservations/.test(sum.split('\n').filter(l => /<h2>/.test(l)).join('')), 'the heading is Forecast');
  });
  console.log(`${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
