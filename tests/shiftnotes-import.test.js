// Sprint 29.5 — the one-time Excel → Log Book import: logic on a synthetic workbook, the real workbook (if present), and the database path on a throwaway Postgres.
//   node tests/shiftnotes-import.test.js "$PWD"
const ROOT = process.argv[2]; const assert = require('assert'); const { execSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const XLSX = require(ROOT + '/node_modules/xlsx'); const pg = require(ROOT + '/server/node_modules/pg'); const lib = require(ROOT + '/server/scripts/shiftNotesImport');
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.message.split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const PGBIN = '/opt/homebrew/opt/postgresql@14/bin', DIR = '/tmp/hopdb_shiftnotes', PORT = 5441; const sh = (c) => execSync(c, { stdio: 'pipe' }).toString();

// a tiny workbook with the real layout: only the sheets/cells that matter
const SHEET_NAMES = lib.SHEETS.map(s => s[0]);
function workbook(cells) {   // cells: { 'Jan 2026': { A8:'Thursday', B8:1, D10:'note', Q10:'Wylie', ... } }
  const wb = XLSX.utils.book_new();
  SHEET_NAMES.forEach((n) => { const ws = {}; let maxR = 20; Object.entries(cells[n] || {}).forEach(([a, v]) => { ws[a] = { t: typeof v === 'number' ? 'n' : 's', v }; maxR = Math.max(maxR, +a.replace(/\D/g, '')); }); ws['!ref'] = 'A1:AI' + (maxR + 2); XLSX.utils.book_append_sheet(wb, ws, n); });
  return wb;
}
const jan = { A8: 'Thursday', B8: 1, D9: 'Happy new year 2026', Q9: 'Wylie', R9: 'All', S10: 'Cleusia called out today', AF10: 'Wylie', AG10: 'FD',
  A20: 'Friday', B20: 2, D21: '  Room 312 TV was left on.\r\nGuest complained  ', Q21: 'Luke', R21: 'MGMT', D22: 'x', S22: 'Res: ABC123XYZ  Smith needs a manager', A32: 'Saturday', B32: 3 };

(async () => {
  await t('reads notes (D) and priority notes (S) with their from / to, ties them to the block date, cleans whitespace, skips 1-character junk', () => {
    const p = lib.parseWorkbook(XLSX, workbook({ 'Jan 2026': jan })); const by = Object.fromEntries(p.notes.map(n => [n.key, n]));
    assert.strictEqual(p.notes.length, 4); assert.strictEqual(p.stats.junkSkipped, 1);
    assert.deepStrictEqual([by['Jan 2026!R9:note'].date, by['Jan 2026!R9:note'].from, by['Jan 2026!R9:note'].to], ['2026-01-01', 'Wylie', 'All']);
    assert.strictEqual(by['Jan 2026!R10:priority'].kind, 'priority'); assert.strictEqual(by['Jan 2026!R10:priority'].date, '2026-01-01');
    assert.strictEqual(by['Jan 2026!R21:note'].text, 'Room 312 TV was left on.\nGuest complained'); assert.strictEqual(by['Jan 2026!R21:note'].date, '2026-01-02');
    assert.strictEqual(by['Jan 2026!R22:priority'].from, ''); assert(by['Jan 2026!R22:priority'].flags.includes('no author'));
  });
  await t('an undated block takes its place in the month; day 31 on a 30-day sheet lands on the last day with a note saying so', () => {
    const c = { A8: 'Sat', B8: 1, D9: 'first', Q9: 'A' }; let r = 20; for (let d = 2; d <= 30; d++, r += 2) c['A' + r] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][(d - 1 + 6) % 7];   // days 2..30, no typed dates
    c['A' + r] = 'Tue'; c['D' + (r + 1)] = 'written under a 31st'; c['Q' + (r + 1)] = 'B';
    const p = lib.parseWorkbook(XLSX, workbook({ April: c })); const last = p.notes.find(n => n.text.startsWith('written'));
    assert.strictEqual(last.date, '2026-04-30'); assert.strictEqual(last.overflowDay, 31);
    const plan = lib.buildPlan(p).rows.find(x => x.title.startsWith('written')); assert(/day 31 of the April sheet/.test(plan.body), plan.body);
  });
  await t('maps to the Log Book: priority column → High, note column → General; one-line note is title only; "To" kept as a visible line; no author → "Unknown (Excel)"', () => {
    const { rows } = lib.buildPlan(lib.parseWorkbook(XLSX, workbook({ 'Jan 2026': jan })), { merge: false }); const by = Object.fromEntries(rows.map(r => [r.import_key, r]));
    const ny = by['Jan 2026!R9:note']; assert.deepStrictEqual([ny.priority, ny.title, ny.body, ny.author_label, ny.start_date, ny.end_date], ['general', 'Happy new year 2026', 'To: All', 'Wylie', '2026-01-01', '2026-01-01']);
    assert.strictEqual(by['Jan 2026!R10:priority'].priority, 'high'); assert.strictEqual(by['Jan 2026!R10:priority'].body, 'To: FD');
    const two = by['Jan 2026!R21:note']; assert.strictEqual(two.title, 'Room 312 TV was left on.'); assert.strictEqual(two.body, 'Room 312 TV was left on.\nGuest complained\n\nTo: MGMT');
    assert.strictEqual(by['Jan 2026!R22:priority'].author_label, lib.UNKNOWN_AUTHOR); assert.strictEqual(by['Jan 2026!R22:priority'].title, 'Res: ABC123XYZ Smith needs a manager'); assert.strictEqual(by['Jan 2026!R22:priority'].body, '', 'a one-line note with no "To" is title only');
  });
  await t('a long first line is cut at a word to fit the title column, and the FULL text is kept in the body', () => {
    const long = 'word '.repeat(60).trim(); const title = lib.makeTitle(long); assert(title.length <= lib.TITLE_MAX + 1 && title.endsWith('…')); assert(!/wor…$/.test(title), 'cut on a word boundary');
    const { rows } = lib.buildPlan(lib.parseWorkbook(XLSX, workbook({ 'Jan 2026': { A8: 'Thu', B8: 1, D9: long, Q9: 'Wylie' } }))); assert.strictEqual(rows[0].body, long);
  });
  await t('the same note written on consecutive days becomes ONE multi-day note (with a line saying so); a gap, another author or other text starts a new one; --no-merge keeps all', () => {
    const c = { A8: 'Thu', B8: 1, A20: 'Fri', B20: 2, A32: 'Sat', B32: 3, A44: 'Sun', B44: 4, A56: 'Mon', B56: 5 };
    [[9, 'same note', 'Wylie'], [21, 'same note', 'Wylie'], [33, 'same note', 'Wylie'], [57, 'same note', 'Wylie'], [45, 'same note', 'Luke']].forEach(([r, x, a]) => { c['S' + r] = x; c['AF' + r] = a; });
    const p = lib.parseWorkbook(XLSX, workbook({ 'Jan 2026': c })); const { rows, summary } = lib.buildPlan(p); const mine = rows.map(r => [r.start_date, r.end_date, r.author_label]).sort();
    assert.deepStrictEqual(mine, [['2026-01-01', '2026-01-03', 'Wylie'], ['2026-01-04', '2026-01-04', 'Luke'], ['2026-01-05', '2026-01-05', 'Wylie']]); assert.strictEqual(summary.folded, 2);
    assert(/Written again every day in the Excel sheet: Jan 1, 2026 – Jan 3, 2026/.test(rows.find(r => r.end_date === '2026-01-03').body));
    assert.strictEqual(lib.buildPlan(p, { merge: false }).rows.length, 5);
  });
  await t('--date-shift moves a whole sheet; the CSV review file quotes commas, quotes and line breaks', () => {
    const wb = workbook({ 'Jan 2026': { A8: 'Thu', B8: 1, D9: 'a, "b"\nc', Q9: 'W' } });
    assert.strictEqual(lib.buildPlan(lib.parseWorkbook(XLSX, wb, { dateShift: { 'Jan 2026': -1 } })).rows[0].start_date, '2025-12-31');
    const csv = lib.toCsv(lib.buildPlan(lib.parseWorkbook(XLSX, wb)).rows); assert(csv.includes('"a, ""b""\nc"'), csv);
  });

  const REAL = ROOT + '/database/shiftnotes/Shift notes for 2026.xlsx';
  if (fs.existsSync(REAL)) await t('the REAL workbook: every month sheet is read, nothing breaks the Log Book rules (title ≤ 120, dates ordered, unique keys), and the numbers match what was inspected', () => {
    const p = lib.parseWorkbook(XLSX, XLSX.readFile(REAL)); const { rows, summary } = lib.buildPlan(p);
    assert.strictEqual(p.stats.sheets, 12); assert.deepStrictEqual(p.warnings, []); assert.strictEqual(p.notes.length, 2122, 'every non-empty note + priority cell');
    assert(rows.every(r => r.title && r.title.length <= 120 && r.end_date >= r.start_date && ['high', 'general'].includes(r.priority) && r.author_label)); assert.strictEqual(new Set(rows.map(r => r.import_key)).size, rows.length);
    assert.strictEqual(summary.read - summary.folded, summary.notes); assert(summary.folded > 200 && summary.folded < 400, 'daily repeats folded: ' + summary.folded);
    assert(rows.every(r => r.start_date >= '2025-11-01' && r.end_date <= '2026-10-31'));
    assert.strictEqual(lib.buildPlan(p, { merge: false }).rows.length, 2122);
  });

  // ---- the database path -------------------------------------------------------------------------------------------------------------------------------------------
  try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* not running */ } sh(`rm -rf ${DIR}`); sh(`${PGBIN}/initdb -D ${DIR} -A trust -U postgres`);
  sh(`${PGBIN}/pg_ctl -D ${DIR} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l /tmp/hopdb_shiftnotes.log -w start`);
  try {
    const psql = (db, a) => sh(`${PGBIN}/psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} ${a} 2>&1`); const file = (db, f) => psql(db, `-v ON_ERROR_STOP=1 -q -f "${f}"`);
    psql('postgres', '-c "CREATE DATABASE sn"'); file('sn', ROOT + '/database/migrations/032_sprint26_logbook.sql'); file('sn', ROOT + '/database/migrations/033_sprint26_1_logbook_rich_notify.sql');
    const c = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'sn' }); await c.connect();
    const MIG = ROOT + '/database/migrations/037_sprint29_5_logbook_import.sql';
    await c.query("INSERT INTO logbook_notes (property_id, title, start_date, end_date, author_label) VALUES ('default', 'Written in the app', '2026-01-01', '2026-01-01', 'Richie')");
    await c.query("INSERT INTO logbook_notes (property_id, title, start_date, end_date, author_label) VALUES ('other-hotel', 'Other hotel', '2026-01-01', '2026-01-01', 'X')");
    const plan = lib.buildPlan(lib.parseWorkbook(XLSX, workbook({ 'Jan 2026': jan }))).rows;

    await t('MIGRATION 037 adds the two columns + the unique index, runs twice without error, and leaves existing notes alone', async () => {
      const before = (await c.query('SELECT to_jsonb(n) AS j FROM logbook_notes n ORDER BY title')).rows.map(r => r.j); file('sn', MIG); file('sn', MIG);
      const after = (await c.query('SELECT to_jsonb(n) AS j FROM logbook_notes n ORDER BY title')).rows.map(r => r.j);
      assert.deepStrictEqual(after.map(j => ({ ...j, import_key: undefined, import_batch: undefined })), before.map(j => ({ ...j, import_key: undefined, import_batch: undefined })), 'existing rows unchanged');
      assert(after.every(j => j.import_key === null && j.import_batch === null));
      await c.query("INSERT INTO logbook_notes (title, start_date, end_date, import_key) VALUES ('k1','2026-01-01','2026-01-01','dup')");
      await assert.rejects(c.query("INSERT INTO logbook_notes (title, start_date, end_date, import_key) VALUES ('k2','2026-01-01','2026-01-01','dup')"), /uq_logbook_import_key/);
      await c.query("INSERT INTO logbook_notes (property_id, title, start_date, end_date, import_key) VALUES ('other-hotel','k3','2026-01-01','2026-01-01','dup')");   // another property may reuse a key
      await c.query("DELETE FROM logbook_notes WHERE import_key = 'dup'");
    });
    await t('COMMIT imports the plan: published, everyone, all day, NOT needs-resolve, not pinned, no recipients / reads (nobody is notified), author as a plain name, batch + key recorded', async () => {
      const r = await lib.commitPlan(c, plan); assert.deepStrictEqual(r, { inserted: plan.length, skipped: 0 });
      const rows = (await c.query("SELECT * FROM logbook_notes WHERE import_batch = $1 ORDER BY start_date, title", [lib.DEFAULT_BATCH])).rows; assert.strictEqual(rows.length, plan.length);
      assert(rows.every(n => n.status === 'published' && n.audience_all === true && n.audience_departments.length === 0 && n.audience_staff.length === 0 && n.require_ack === false && n.pinned === false && n.show_on_calendar === true));
      assert(rows.every(n => n.start_time === null && n.end_time === null && n.author_user_id === null && n.recipients.length === 0 && n.published_at && n.property_id === 'default'));
      assert.strictEqual((await c.query('SELECT count(*)::int n FROM logbook_reads')).rows[0].n, 0);
      const ny = rows.find(n => n.title === 'Happy new year 2026'); assert.deepStrictEqual([ny.priority, ny.author_label, ny.body, String(ny.start_date.toISOString ? ny.start_date.toISOString().slice(0, 10) : ny.start_date)].slice(0, 3), ['general', 'Wylie', 'To: All']);
      assert.strictEqual(rows.find(n => n.title.startsWith('Cleusia')).priority, 'high');
    });
    await t('the imported note appears under its own day: created / published at noon Pacific on that date, so it sorts with the day it belongs to', async () => {
      const r = (await c.query("SELECT to_char(created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') AS ts, to_char(start_date, 'YYYY-MM-DD') AS d FROM logbook_notes WHERE title = 'Happy new year 2026'")).rows[0];
      assert.deepStrictEqual([r.d, r.ts], ['2026-01-01', '2026-01-01 12:00']);
    });
    await t('RUNNING IT AGAIN adds nothing (same keys are skipped) and changes nothing', async () => {
      const before = (await c.query('SELECT count(*)::int n FROM logbook_notes')).rows[0].n; const r = await lib.commitPlan(c, plan); assert.deepStrictEqual(r, { inserted: 0, skipped: plan.length });
      assert.strictEqual((await c.query('SELECT count(*)::int n FROM logbook_notes')).rows[0].n, before);
    });
    await t('a failure half-way rolls the WHOLE import back (all or nothing)', async () => {
      const before = (await c.query('SELECT count(*)::int n FROM logbook_notes')).rows[0].n;
      const bad = [{ ...plan[0], import_key: 'new-1' }, { ...plan[1], import_key: 'new-2', title: 'x'.repeat(200) }];
      await assert.rejects(lib.commitPlan(c, bad)); assert.strictEqual((await c.query('SELECT count(*)::int n FROM logbook_notes')).rows[0].n, before); assert.strictEqual((await c.query("SELECT count(*)::int n FROM logbook_notes WHERE import_key = 'new-1'")).rows[0].n, 0);
    });
    await t('UNDO removes exactly the imported batch — notes written in the app and other hotels\' notes stay', async () => {
      const r = await lib.undoBatch(c, { batch: lib.DEFAULT_BATCH }); assert.strictEqual(r.removed, plan.length);
      assert.deepStrictEqual((await c.query('SELECT title FROM logbook_notes ORDER BY title')).rows.map(x => x.title), ['Other hotel', 'Written in the app']);
      const again = await lib.commitPlan(c, plan); assert.strictEqual(again.inserted, plan.length, 'after an undo the import can be run again');
    });
    await t('a second property (multi-tenant) gets its own copy without clashing', async () => {
      const r = await lib.commitPlan(c, plan, { property: 'other-hotel' }); assert.strictEqual(r.inserted, plan.length); assert.strictEqual((await lib.undoBatch(c, { property: 'other-hotel' })).removed, plan.length);
      assert.strictEqual((await c.query("SELECT count(*)::int n FROM logbook_notes WHERE property_id = 'default' AND import_batch IS NOT NULL")).rows[0].n, plan.length);
    });
    await c.end();
  } finally { try { sh(`${PGBIN}/pg_ctl -D ${DIR} stop -m fast`); } catch { /* ignore */ } }
  console.log(`\n${pass} tests ran${process.exitCode ? ' — SOME FAILED' : ' — all passed'}`);
})();
