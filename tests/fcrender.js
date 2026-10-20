const ROOT = process.argv[2]; process.env.NODE_ENV = 'test';
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/' }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true }); Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils');
require(ROOT + '/server/node_modules/dotenv').config({ path: ROOT + '/server/.env', override: true });
const { createAgilysysClient } = require(ROOT + '/server/agilysys/client'); const { computeForecast } = require(ROOT + '/server/forecast/compute');
let snapshotPayload, LIVEBOARD;
const load = (file) => { const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { apiFetch: async (p) => (p === '/admin/forecast/live' ? { ok: true, data: { success: true, live: LIVEBOARD } } : { ok: true, data: { success: true, snapshot: { scraped_at: new Date().toISOString(), status: 'success', payload: snapshotPayload } } }) };
    if (id === '../../shells/ViewContext') return { useView: () => ({ goTo() {} }) }; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); };
  m._compile(code, file); return m.exports; };
(async () => {
  const c = createAgilysysClient(); const inputs = await c.fetchForecastInputs(null);
  liveBoard = await c.fetchTodayLive();
  const mapping = []; snapshotPayload = computeForecast({ rooms: inputs.rooms, roomTypes: inputs.roomTypes, reservations: inputs.reservations, metrics: inputs.metrics, vipStatuses: inputs.vipStatuses, ratePlans: inputs.ratePlans, roomTypeMapping: mapping, config: {}, forecastDate: inputs.effectiveDate });
  LIVEBOARD = await c.fetchTodayLive();
  console.log('payload keys:', Object.keys(snapshotPayload).join(','));
  console.log('payload.reservations:', snapshotPayload.reservations.length, '| byRoomType rows:', (snapshotPayload.byRoomType || []).length, '| perRoomSheet:', (snapshotPayload.perRoomSheet || []).length, '| newMappings:', (snapshotPayload.newMappings || []).length);
  const errors = []; const origErr = console.error; console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 300)); };
  if (process.env.FC_DAY) w.sessionStorage.setItem('hotelops-fc-day', process.env.FC_DAY);
  const Forecast = load(ROOT + '/src/components/Forecast/index.js').default; const el = document.getElementById('root'); const root = createRoot(el);
  try { await act(async () => { root.render(React.createElement(Forecast, { mode: process.env.FC_MODE || 'dev' })); }); await act(async () => { await new Promise(r => setTimeout(r, 100)); }); console.log('RENDER OK; text length', el.textContent.length); console.log('first 400 chars:', el.textContent.replace(/\s+/g, ' ').slice(0, 400)); }
  catch (e) { console.log('RENDER THREW:', e.message.slice(0, 300)); }
  if (process.env.FC_SHEET) { const b = [...el.querySelectorAll('button')].find(x => /Generate forecast/.test(x.textContent)); await act(async () => { b.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); console.log('sheet open:', !!el.querySelector('.fc-sheet')); }
  if (process.env.DUMP) require('fs').writeFileSync(process.env.DUMP, el.innerHTML);
  console.error = origErr; const real = errors.filter(e => !/act\(/.test(e)); console.log('console errors (excluding act warnings):', real.length); real.slice(0, 4).forEach(e => console.log('  -', e));
  // Tell whether the mapping table being empty (my harness) vs real DB mapping matters
  const rt = snapshotPayload.byRoomType || []; console.log('byRoomType sample:', JSON.stringify(rt.slice(0, 2)).slice(0, 300));
  process.exit(0); // the page registers a polling timer; don't wait for it
})().catch(e => { console.error('HARNESS FAILED', e.message); process.exit(1); });
