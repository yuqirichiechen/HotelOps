// Sprint 22.2 — REAL SyncPanel + RecentChanges components in jsdom (mocked apiFetch) + the pure syncFormat helpers.
//   node tests/syncpanel.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const { JSDOM } = require(ROOT + '/node_modules/jsdom'); const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true }); const w = dom.window;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
Object.assign(globalThis, { window: w, document: w.document, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, IS_REACT_ACT_ENVIRONMENT: true });
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core'); const React = require(ROOT + '/node_modules/react');
const { createRoot } = require(ROOT + '/node_modules/react-dom/client'); const { act } = require(ROOT + '/node_modules/react-dom/test-utils');
const calls = []; let responses = {};
const apiFetch = async (p, opts = {}) => { calls.push({ p, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null }); const key = (opts.method || 'GET') + ' ' + p.split('?')[0]; const r = responses[key]; return typeof r === 'function' ? r(p, opts) : (r || { ok: false, data: { message: 'no mock for ' + key } }); };
const load = (file) => { const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id === '../../auth') return { apiFetch }; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); };
  m._compile(code, file); return m.exports; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };
const F = load(ROOT + '/src/components/Forecasting/syncFormat.js');

const settings = (o = {}) => ({ enabled: true, paused: false, timezone: 'America/Los_Angeles', frequent: { enabled: true, from: '12:00', to: '24:00', everyMinutes: 5, daysAhead: 1 }, hourly: { everyMinutes: 60, aheadDays: 400, nearDays: 14 }, reconcile: { at: '04:30' },
  flushEveryMinutes: 15, backfill: { monthsBack: 12, chunksPerTick: 2, auto: true }, storeRaw: true, detailForNewMax: 25, maxDetailChecks: 80, ...o });
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const run = (id, kind, o = {}) => ({ run_id: id, kind, trigger: 'tick', status: 'success', started_at: iso(5), duration_ms: 420, calls: 3, fetched: 81, new_count: 0, changed: 0, gone: 0, unchanged: 81, ...o });
const status = (o = {}) => ({ hydrated: true, running: null, settings: settings(), authFailure: null, state: { initialized: true, backfillDone: true, backfill: { done: true }, sliceCounts: {} }, indexSize: 1234, lastFlushAt: iso(7),
  pending: { upserts: 2, patches: 0, events: 3, touch: 40, runs: 0 }, recentRuns: [run('r1', 'frequent'), run('r2', 'hourly', { started_at: iso(40), duration_ms: 6400, calls: 44, fetched: 783, new_count: 1 })], now: new Date().toISOString(), lastTickAt: iso(2), tickCount: 10, bootedAt: iso(300),
  nextDue: { frequent: new Date(Date.now() + 3 * 60000).toISOString(), hourly: new Date(Date.now() + 20 * 60000).toISOString(), reconcile: new Date(Date.now() + 15 * 3600000).toISOString(), reason: null }, ...o });
const ok = (data) => ({ ok: true, status: 200, data: { success: true, ...data } });

let intervals = [];
async function mount(Comp, props = {}) {
  intervals = []; const realSI = w.setInterval; globalThis.setInterval = (fn, ms) => { intervals.push({ fn, ms }); return realSI.call(w, fn, 1e9); };
  calls.length = 0; const el = document.getElementById('root'); el.innerHTML = ''; const root = createRoot(el);
  await act(async () => { root.render(React.createElement(Comp, props)); }); await act(async () => { await sleep(30); });
  const click = async (node) => { await act(async () => { node.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await act(async () => { await sleep(20); }); };
  const type = async (input, value) => { const set = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set; await act(async () => { set.call(input, value); input.dispatchEvent(new w.Event('input', { bubbles: true })); }); };
  const btn = (re) => [...el.querySelectorAll('button')].find(b => re.test(b.textContent));
  return { el, click, type, btn, unmount: () => act(async () => { root.unmount(); globalThis.setInterval = realSI; }) };
}
const SyncPanel = load(ROOT + '/src/components/Forecasting/SyncPanel.js').default, RecentChanges = load(ROOT + '/src/components/Forecasting/RecentChanges.js').default;
const standard = (st = status(), runs = [run('r3', 'reconcile', { started_at: iso(300), duration_ms: 2000 })]) => { responses = { 'GET /admin/sync/status': ok({ status: st, tickConfigured: true }), 'GET /admin/sync/runs': ok({ runs }), 'PUT /admin/sync/settings': ok({ settings: settings() }), 'POST /admin/sync/run': { ok: true, status: 202, data: { success: true, started: true } } }; };

(async () => {
  await t('helpers: relative time, clock formats, stay label, change descriptions (room first), draft round-trip', () => {
    const now = Date.parse('2026-10-20T20:00:00Z'); assert.strictEqual(F.ago('2026-10-20T19:59:50Z', now), 'just now'); assert.strictEqual(F.ago('2026-10-20T19:56:00Z', now), '4 min ago'); assert.strictEqual(F.ago('2026-10-20T17:00:00Z', now), '3 h ago'); assert.strictEqual(F.ago('2026-10-18T20:00:00Z', now), '2 d ago'); assert.strictEqual(F.ago(null, now), null); assert(/^in /.test(F.ago('2026-10-20T20:10:00Z', now)));
    assert.strictEqual(F.stayLabel({ arrival_date: '2026-10-24', departure_date: '2026-10-26' }), 'Oct 24 → Oct 26'); assert.strictEqual(F.stayLabel({}), '');
    const d = F.describeChanges({ nights: [2, 3], departure_date: ['2026-10-26', '2026-10-27'], room_number: [null, '305'], status: ['RES', 'INH'] }); assert.deepStrictEqual(d.map(x => x.label), ['Room', 'Departure', 'Status']); assert.deepStrictEqual([d[0].from, d[0].to], ['—', '305']);
    const s = settings(); assert.deepStrictEqual(JSON.parse(JSON.stringify(F.settingsFromDraft(F.draftFromSettings(s)))).frequent, { enabled: true, from: '12:00', to: '24:00', everyMinutes: '5', daysAhead: '1' });
  });
  await t('health: healthy / ping overdue / never pinged / no secret / auth failure / failing runs / paused / running', () => {
    const now = Date.now(); const h = (st, cfg = true) => F.healthOf(st, cfg, now);
    assert.strictEqual(h(status()).state, 'ok'); assert(h(status({ lastTickAt: iso(40) })).problems.some(p => /last scheduler ping was/.test(p))); assert.strictEqual(h(status({ lastTickAt: iso(40) })).state, 'warn');
    assert(h(status({ lastTickAt: null, bootedAt: iso(30) })).problems.some(p => /No scheduler ping/.test(p))); assert.strictEqual(h(status({ lastTickAt: null, bootedAt: iso(3) })).problems.length, 0, 'give a fresh boot a grace period');
    assert(h(status(), false).problems.some(p => /SYNC_TICK_SECRET/.test(p))); assert(h(status({ authFailure: { message: 'x' } })).problems.some(p => /rejected the login/.test(p)));
    assert(h(status({ recentRuns: [run('a', 'hourly', { status: 'failed', error: 'boom' }), run('b', 'frequent', { status: 'failed' }), run('c', 'frequent', { status: 'failed' })] })).problems.some(p => /last 3 runs failed: boom/.test(p)));
    assert.strictEqual(h(status({ settings: settings({ paused: true }) })).state, 'paused'); assert.strictEqual(h(status({ running: { kind: 'hourly', since: iso(1) } })).label, 'Running Hourly check'); assert.strictEqual(h(status({ settings: settings({ enabled: false }) })).state, 'off');
  });

  await t('SyncPanel: health card shows ping time, next runs, history load, tracked count, pending writes; recent runs merge memory + stored without duplicates', async () => {
    standard(status(), [run('r1', 'frequent'), run('r3', 'reconcile', { started_at: iso(300) })]); const h = await mount(SyncPanel); const txt = h.el.textContent;
    assert(/Healthy/.test(txt)); assert(/2 min ago/.test(txt)); assert(/History load\s*complete/.test(txt)); assert(/1,234/.test(txt)); assert(/2 changes, 3 events/.test(txt)); assert(/Next quick scan/.test(txt) && /≈/.test(txt));
    const rows = [...h.el.querySelectorAll('.sp-table tbody tr')]; assert.strictEqual(rows.length, 3, 'r1 (both) + r2 + r3 = 3 unique'); assert(/Quick scan/.test(rows[0].textContent) && /Hourly check/.test(rows[1].textContent) && /Daily reconcile/.test(rows[2].textContent));
    assert(calls.some(c => c.p === '/admin/sync/status') && calls.some(c => c.p.startsWith('/admin/sync/runs'))); await h.unmount();
  });
  await t('SyncPanel: problems are explained in plain language (ping overdue; scheduler secret missing)', async () => {
    standard(status({ lastTickAt: iso(45) })); let h = await mount(SyncPanel); assert(/Needs attention/.test(h.el.textContent)); assert(/last scheduler ping was 45 min ago/.test(h.el.querySelector('.sp-problem').textContent)); await h.unmount();
    responses['GET /admin/sync/status'] = ok({ status: status(), tickConfigured: false }); h = await mount(SyncPanel); assert(/SYNC_TICK_SECRET/.test(h.el.textContent)); await h.unmount();
  });
  await t('SyncPanel: Run now buttons POST the kind; they are disabled while a run is in progress; progress polling is fast only while running', async () => {
    standard(); let h = await mount(SyncPanel); await h.click(h.btn(/Hourly check/)); const post = calls.find(c => c.method === 'POST'); assert.deepStrictEqual(post.body, { kind: 'hourly' }); assert(/Hourly check started/.test(h.el.textContent));
    assert.strictEqual(intervals[intervals.length - 1].ms, 30000, 'idle: slow poll'); await h.unmount();
    standard(status({ running: { kind: 'reconcile', since: iso(1) } })); h = await mount(SyncPanel); assert(h.btn(/Quick scan/).disabled && h.btn(/Hourly check/).disabled); assert(/Running Daily reconcile since/.test(h.el.textContent)); assert.strictEqual(intervals[intervals.length - 1].ms, 4000, 'running: fast poll'); await h.unmount();
  });
  await t('SyncPanel: Full re-sync needs a second explicit confirmation (cost warning) before anything is sent', async () => {
    standard(); const h = await mount(SyncPanel); await h.click(h.btn(/Full re-sync…/)); assert(!calls.some(c => c.method === 'POST'), 'nothing sent on the first click'); assert(/~4 min/.test(h.el.textContent));
    await h.click(h.btn(/Cancel/)); assert(!/~4 min/.test(h.el.textContent)); await h.click(h.btn(/Full re-sync…/)); await h.click(h.btn(/Yes, re-sync/)); assert.deepStrictEqual(calls.find(c => c.method === 'POST').body, { kind: 'full' }); await h.unmount();
  });
  await t('SyncPanel: pause / resume the whole sync', async () => {
    standard(); let h = await mount(SyncPanel); await h.click(h.btn(/Pause sync/)); assert.deepStrictEqual(calls.find(c => c.method === 'PUT').body, { paused: true }); await h.unmount();
    standard(status({ settings: settings({ paused: true }) })); h = await mount(SyncPanel); assert(/Paused/.test(h.el.querySelector('.sp-pill').textContent)); await h.click(h.btn(/Resume sync/)); assert.deepStrictEqual(calls.find(c => c.method === 'PUT').body, { paused: false }); await h.unmount();
  });
  await t('SyncPanel: editing settings enables Save; the PUT carries the nested patch; Discard restores; polling never overwrites unsaved edits', async () => {
    standard(); const h = await mount(SyncPanel); const save = () => h.btn(/Save settings/); assert(save().disabled, 'nothing to save yet');
    const every = [...h.el.querySelectorAll('.sp-field')].find(f => /^Every/.test(f.textContent)).querySelector('input'); await h.type(every, '10'); assert(!save().disabled);
    await act(async () => { await intervals[intervals.length - 1].fn(); await sleep(20); }); assert.strictEqual(every.value, '10', 'a background refresh must not clobber the edit');
    await h.click(save()); const put = calls.find(c => c.method === 'PUT'); assert.strictEqual(put.body.frequent.everyMinutes, '10'); assert.strictEqual(put.body.frequent.from, '12:00'); assert.strictEqual(put.body.flushEveryMinutes, '15'); assert(/Sync settings saved/.test(h.el.textContent));
    await h.type(every, '7'); await h.click(h.btn(/Discard/)); assert.notStrictEqual(h.el.querySelector('.sp-field input[type=number]').value, '7'); await h.unmount();
  });
  await t('SyncPanel: validation errors from the server are shown and the edit stays', async () => {
    standard(); responses['PUT /admin/sync/settings'] = { ok: false, status: 400, data: { success: false, message: 'frequent.everyMinutes must be a whole number 1–120' } }; const h = await mount(SyncPanel);
    const every = [...h.el.querySelectorAll('.sp-field')].find(f => /^Every/.test(f.textContent)).querySelector('input'); await h.type(every, '0'); await h.click(h.btn(/Save settings/)); assert(/must be a whole number 1–120/.test(h.el.querySelector('.sp-error').textContent)); assert.strictEqual(every.value, '0'); await h.unmount();
  });

  const ev = (id, type, o = {}) => ({ event_id: id, event_type: type, occurred_at: iso(10 + id), changes: {}, info: {}, guest_name: 'Ann Lee', confirmation_id: 'C' + id, type_code: 'NQRR', arrival_date: '2026-10-24', departure_date: '2026-10-26', room_number: null, booked_by: 'SiteMinder', source: 'BAR', ...o });
  await t('RecentChanges: 24 h summary chips, labelled rows (who/what/when), room-change detail, booked-via for new bookings', async () => {
    responses = { 'GET /admin/sync/events': ok({ events: [ev(9, 'new'), ev(8, 'cancelled', { guest_name: 'Bob Ray' }), ev(7, 'changed', { changes: { room_number: [null, '305'], departure_date: ['2026-10-26', '2026-10-27'] } })], summary: { new: 12, cancelled: 3, changed: 5, arrived: 40 }, hasMore: false }) };
    const h = await mount(RecentChanges); const txt = h.el.textContent; assert(/12 new/.test(txt) && /3 cancelled/.test(txt) && /5 changed/.test(txt)); assert(!/40 arrived/.test(txt), 'arrivals are noise in the header');
    const items = [...h.el.querySelectorAll('.rc-item')]; assert.strictEqual(items.length, 3); assert(/New booking/.test(items[0].textContent) && /Ann Lee/.test(items[0].textContent) && /via SiteMinder/.test(items[0].textContent) && /Oct 24 → Oct 26/.test(items[0].textContent) && /NQRR/.test(items[0].textContent));
    assert(/Cancelled/.test(items[1].textContent) && /Bob Ray/.test(items[1].textContent)); assert(/Room\s*— → 305/.test(items[2].textContent) && /Departure/.test(items[2].textContent)); assert(/types=new,cancelled,no_show,moved,gone,changed,reappeared/.test(calls[0].p)); await h.unmount();
  });
  await t('RecentChanges: filters re-query with the chosen types; "Show older" pages with before=<last id>; empty/ error states', async () => {
    responses = { 'GET /admin/sync/events': (p) => ok({ events: /before=/.test(p) ? [ev(1, 'new')] : [ev(5, 'new'), ev(4, 'new')], summary: {}, hasMore: !/before=/.test(p) }) }; let h = await mount(RecentChanges);
    await h.click([...h.el.querySelectorAll('.rc-filter')].find(b => /Arrived/.test(b.textContent))); assert(/arrived,departed/.test(calls[calls.length - 1].p)); await h.click([...h.el.querySelectorAll('.rc-filter')].find(b => /^New/.test(b.textContent))); assert(!/types=new/.test(calls[calls.length - 1].p) || /,/.test(calls[calls.length - 1].p));
    calls.length = 0; await h.click(h.btn(/Show older/)); assert(/before=/.test(calls[0].p)); assert.strictEqual(h.el.querySelectorAll('.rc-item').length >= 3, true); await h.unmount();
    responses = { 'GET /admin/sync/events': ok({ events: [], summary: {}, hasMore: false }) }; h = await mount(RecentChanges); assert(/none yet/.test(h.el.textContent) && /Nothing here yet/.test(h.el.textContent)); await h.unmount();
    responses = { 'GET /admin/sync/events': { ok: false, status: 500, data: { message: 'Server error' } } }; h = await mount(RecentChanges); assert(/Server error/.test(h.el.querySelector('.rc-error').textContent)); await h.unmount();
  });
  await t('RecentChanges: can be collapsed (remembered for the session) and does not poll', async () => {
    sessionStorage.clear(); responses = { 'GET /admin/sync/events': ok({ events: [ev(2, 'new')], summary: { new: 1 }, hasMore: false }) }; const h = await mount(RecentChanges);
    assert.strictEqual(intervals.length, 0, 'no timers → no database wake-ups'); await h.click(h.el.querySelector('.rc-head')); assert(!h.el.querySelector('.rc-list')); assert.strictEqual(sessionStorage.getItem('hotelops-changes-open'), '0'); await h.unmount();
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`); process.exit(process.exitCode || 0);
})();
