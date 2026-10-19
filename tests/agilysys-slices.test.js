// Sprint 22 — exact range fetch against a SIMULATED rGuest search (no network): night-overlap RES semantics, shuffled result order,
// 99-row pages. Regression test for the live dry-run finding that inclusive splitting lost 1-night stays arriving on the split day.
//   node tests/agilysys-slices.test.js "$PWD"
const ROOT = process.argv[2] + '/server'; const assert = require('assert');
process.env.AGILYSYS_USER = 'fake-user'; process.env.AGILYSYS_PASS = 'fake-pass';
const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const TODAY = '2026-10-19'; let seq = 0; const world = [];
const add = (status, arr, nights) => world.push({ id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, status, arrivalDateLocalDate: arr, departureDateLocalDate: addDays(arr, nights), arrivalDate: arr + 'T07:00:00Z', departureDate: addDays(arr, nights) + 'T07:00:00Z' });
for (let i = 0; i < 900; i++) add('RES', addDays(TODAY, (i * 7) % 400), 1 + (i % 3 === 0 ? 3 : 0));        // mostly 1-night stays: the loss-prone kind
for (let i = 0; i < 130; i++) add('RES', addDays(TODAY, 150), 1 + (i % 2));                                // one very dense night (>99 stays overlap) → needs the union-walk path
for (let i = 0; i < 300; i++) add('DPT', addDays(TODAY, -(i % 200) - 2), 2); for (let i = 0; i < 80; i++) add('CXL', addDays(TODAY, (i * 11) % 300), 2);
const overlapsRes = (r, from, to) => r.arrivalDateLocalDate < to && r.departureDateLocalDate > from;      // [from, to)
const touchesIncl = (r, from, to) => r.arrivalDateLocalDate <= to && r.departureDateLocalDate >= from;    // [from, to]
let calls = 0, mismatch = false;
global.fetch = async (url, init) => {
  const u = String(url); const json = (o, st = 200) => ({ ok: st < 400, status: st, text: async () => JSON.stringify(o), json: async () => o });
  if (/\/users\/login$/.test(u)) return json({ token: 'tok' });
  if (/reservations\/search\/date$/.test(u)) {
    calls++; const b = JSON.parse(init.body); const sts = b.statuses || ['RES'];
    let rows = world.filter(r => sts.includes(r.status) && (b.endDate ? (sts.length === 1 && sts[0] === 'RES' ? overlapsRes(r, b.date, b.endDate) : touchesIncl(r, b.date, b.endDate)) : r.departureDateLocalDate >= b.date));
    const total = rows.length; const hidden = mismatch && rows.length ? rows.map(r => r.id).sort()[0] : null;   // a row rGuest counts but never returns
    rows = rows.filter(r => r.id !== hidden).sort(() => Math.random() - 0.5); const size = b.size || 99, page = b.page || 0, content = rows.slice(page * size, (page + 1) * size);
    return json({ content, number: page, size, totalElements: total, totalPages: Math.max(1, Math.ceil(total / size)) });
  }
  throw new Error('unexpected fetch ' + u);
};
const { createAgilysysClient } = require(ROOT + '/agilysys/client'); const c = createAgilysysClient();
const truthRes = (from, to) => new Set(world.filter(r => r.status === 'RES' && overlapsRes(r, from, to)).map(r => r.id));
const ids = (items) => new Set(items.map(x => x.id)); const diff = (a, b) => [...a].filter(x => !b.has(x));
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
(async () => {
  await t('RES over a wide range returns EVERY stay with a night in [from, to) — including the dense >99 night and 1-night stays on split boundaries', async () => {
    const r = await c.fetchSliceExact(TODAY, addDays(TODAY, 400), ['RES']); const truth = truthRes(TODAY, addDays(TODAY, 400));
    assert.strictEqual(r.complete, true); assert.deepStrictEqual([diff(truth, ids(r.items)).length, diff(ids(r.items), truth).length], [0, 0], `missing ${diff(truth, ids(r.items)).length}`); assert.strictEqual(r.items.length, truth.size);
  });
  await t('the answer does not depend on how the range is cut: 30-day slices, 7-day slices and one big range all agree (the live dry-run discrepancy)', async () => {
    const end = addDays(TODAY, 400), big = ids((await c.fetchSliceExact(TODAY, end, ['RES'])).items); const u30 = new Set(), u7 = new Set();
    for (let s = TODAY; s < end; s = addDays(s, 30)) (await c.fetchSliceExact(s, addDays(s, 30), ['RES'])).items.forEach(x => u30.add(x.id));
    for (let s = TODAY; s < end; s = addDays(s, 7)) (await c.fetchSliceExact(s, addDays(s, 7), ['RES'])).items.forEach(x => u7.add(x.id));
    assert.deepStrictEqual([diff(big, u30).length, diff(u30, big).length, diff(big, u7).length, diff(u7, big).length], [0, 0, 0, 0]);
  });
  await t('SENSITIVITY: the old inclusive split (sliceExact) DOES lose rows for RES — this is the bug the fix removes', async () => {
    const r = await c.fetchSliceExact(TODAY, addDays(TODAY, 400), ['RES', 'XXX']);   // 2 statuses → legacy inclusive splitting path
    assert(r.items.length < truthRes(TODAY, addDays(TODAY, 400)).size, 'legacy path should be missing rows: ' + r.items.length);
  });
  await t('single night [d, d+1) with more than a page of stays is complete (union-walk path) and stays complete=true', async () => {
    const d = addDays(TODAY, 150), r = await c.fetchSliceExact(d, addDays(d, 1), ['RES']); const truth = truthRes(d, addDays(d, 1)); assert(truth.size > 99, 'fixture has a dense night: ' + truth.size);
    assert.strictEqual(r.complete, true); assert.strictEqual(diff(truth, ids(r.items)).length, 0);
  });
  await t('INH / DPT / CXL use inclusive day ranges and are exact too', async () => {
    for (const st of ['DPT', 'CXL']) { const from = addDays(TODAY, st === 'DPT' ? -150 : 0), to = addDays(TODAY, st === 'DPT' ? -1 : 200); const r = await c.fetchSliceExact(from, to, [st]); const truth = new Set(world.filter(x => x.status === st && touchesIncl(x, from, to)).map(x => x.id));
      assert.strictEqual(r.complete, true, st); assert.deepStrictEqual([diff(truth, ids(r.items)).length, diff(ids(r.items), truth).length], [0, 0], st); }
  });
  await t('countSlice equals the exact fetch size for a RES range (the count-gate detector is consistent with the data)', async () => {
    for (const [a, b] of [[TODAY, addDays(TODAY, 30)], [addDays(TODAY, 60), addDays(TODAY, 90)], [addDays(TODAY, 149), addDays(TODAY, 152)]]) assert.strictEqual(await c.countSlice(a, b, ['RES']), (await c.fetchSliceExact(a, b, ['RES'])).items.length, `${a}..${b}`);
  });
  await t('an inconsistent page (fewer rows than totalElements) is never reported as complete', async () => {
    mismatch = true; const r = await c.fetchSliceExact(addDays(TODAY, 10), addDays(TODAY, 12), ['RES']); mismatch = false; assert.strictEqual(r.complete, false);
  });
  console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}  (${calls} simulated search calls)`);
})();
