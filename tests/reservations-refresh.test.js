// Sprint 22.3 — the REAL Reservations page in jsdom: it reads /admin/forecast/current, and its refresh button asks the sync engine
// (quick scan + hourly check) instead of running a 20-second full scrape — unless the mirror isn't ready (legacy snapshot) .
//   node tests/reservations-refresh.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils'); const { computeForecast } = require(ROOT + '/server/forecast/compute');
const TODAY = '2026-10-12'; const calls = []; let source = 'mirror', statusSeq = [], currentVersion = 0;
const rooms = [{ id: 'r1', roomNumber: '101', roomTypeId: 'rt1', floorId: '01', status: true, currentOccupancyStatus: 'VAC', housekeepingRoomStatus: 'VI' }];
const resn = (id, arr, dep, st = 'RES') => ({ id, status: st, roomType: 'rt1', arrivalDateLocalDate: arr, departureDateLocalDate: dep, arrivalDate: arr + 'T07:00:00Z', departureDate: dep + 'T07:00:00Z', confirmationId: 'C' + id, ratePlanCode: 'BAR', primaryGuestInfo: { firstName: 'Guest', lastName: id } });
const payloadFor = (v) => computeForecast({ rooms, roomTypes: [{ id: 'rt1', typeCode: 'NQRR', name: 'Double Queen' }], reservations: [resn('a', TODAY, '2026-10-14'), ...(v > 0 ? [resn('b', TODAY, '2026-10-13')] : [])], metrics: null, vipStatuses: [], ratePlans: [], roomTypeMapping: [], config: {}, forecastDate: TODAY });
const apiFetch = async (p, o = {}) => { calls.push({ p, method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null });
  if (p === '/admin/forecast/current') return { ok: true, data: { success: true, source, snapshot: { snapshot_id: null, scraped_at: new Date().toISOString(), status: 'success', payload: payloadFor(currentVersion) } } };
  if (p === '/admin/forecast/snapshots/latest') throw new Error('page must not call the old endpoint');
  if (p === '/admin/sync/run') return { ok: true, status: 202, data: { success: true, started: true } };
  if (p === '/admin/sync/health') { const running = statusSeq.length ? statusSeq.shift() : null; if (!running) currentVersion = 1; return { ok: true, data: { success: true, health: { running: !!running } } }; }
  if (p === '/admin/sync/status') throw new Error('managers must not poll the dev-only status endpoint');
  if (p === '/admin/forecast/scrape') { currentVersion = 1; return { ok: true, data: { success: true, snapshot: { scraped_at: new Date().toISOString(), status: 'success', payload: payloadFor(1) } } }; }
  if (p.startsWith('/admin/forecast/jobs/latest')) return { ok: true, data: { success: true, job: null } };
  if (p.startsWith('/admin/reservations/summaries')) return { ok: true, data: { success: true, summaries: {} } };
  if (p.startsWith('/admin/sync/events')) return { ok: true, data: { success: true, events: [], summary: {}, hasMore: false } };
  return { ok: false, status: 404, data: { message: 'no mock ' + p } }; };
const load = (file) => { const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { apiFetch }; if (id === '../../shells/ViewContext') return { useView: () => ({ goTo() {} }) }; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); };
  m._compile(code, file); return m.exports; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };
async function mount() {
  calls.length = 0; sessionStorage.clear(); const Page = load(ROOT + '/src/components/Forecasting/index.js').default; const el = document.getElementById('root'); el.innerHTML = ''; const root = createRoot(el);
  await act(async () => { root.render(React.createElement(Page)); }); await act(async () => { await sleep(40); });
  return { el, root, refresh: () => el.querySelector('.fc-refresh, button[aria-label^="Refresh"]'), unmount: () => act(async () => { root.unmount(); }) };
}
(async () => {
  await t('loads from /admin/forecast/current (never the old snapshots endpoint) and shows the reservations', async () => {
    source = 'mirror'; currentVersion = 0; const h = await mount(); assert(calls.some(c => c.p === '/admin/forecast/current')); assert(!calls.some(c => c.p === '/admin/forecast/snapshots/latest')); assert(/Reservations/.test(h.el.textContent)); assert(h.refresh(), 'refresh button present'); await h.unmount();
  });
  await t('MIRROR: refresh = sync "refresh" run → wait until the engine is idle → re-read current; the 20-second scrape is NOT used', async () => {
    source = 'mirror'; currentVersion = 0; statusSeq = [{ kind: 'frequent' }, null]; const h = await mount(); calls.length = 0;
    await act(async () => { h.refresh().dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await act(async () => { await sleep(3600); });
    const seq = calls.map(c => c.method + ' ' + c.p); assert.strictEqual(seq[0], 'POST /admin/sync/run'); assert.deepStrictEqual(calls[0].body, { kind: 'refresh' }); assert(seq.filter(x => x === 'GET /admin/sync/health').length >= 2, 'polled until idle: ' + seq.join(','));
    assert(seq.lastIndexOf('GET /admin/forecast/current') > seq.lastIndexOf('GET /admin/sync/health'), 'reloaded AFTER the run finished'); assert(!seq.includes('POST /admin/forecast/scrape'));
    await h.unmount();
  });
  await t('SNAPSHOT fallback (mirror not ready): the refresh button still runs the legacy scrape', async () => {
    source = 'snapshot'; currentVersion = 0; const h = await mount(); calls.length = 0; await act(async () => { h.refresh().dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await act(async () => { await sleep(100); });
    assert(calls.some(c => c.method === 'POST' && c.p === '/admin/forecast/scrape')); assert(!calls.some(c => c.p === '/admin/sync/run')); await h.unmount();
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
