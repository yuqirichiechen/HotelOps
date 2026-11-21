#!/usr/bin/env node
// Sprint 29.5 — one-time import of the Excel "Shift notes for 2026" into the Log Book.
//
//   node server/scripts/import-shift-notes.js "database/shiftnotes/Shift notes for 2026.xlsx"
//        PREVIEW (the default): reads the workbook, prints what it would do and writes a review file (a CSV, default: your temp folder — it holds guest names, so it is NOT written
//        into the project). Touches no database.
//   ... --commit           really import (needs migration 037; uses DATABASE_URL from server/.env). One transaction; running it again adds nothing.
//   ... --undo --commit    remove everything this tool imported (the batch), nothing else.
// Options: --no-merge (keep every day's repeat as its own note) · --out file.csv · --batch name · --property key · --date-shift "April=-1,May=-1" (move a sheet's dates by N days)
const path = require('path'), os = require('os'), fs = require('fs');
const lib = require('./shiftNotesImport');
const args = process.argv.slice(2); const flag = (n) => args.includes(n); const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const file = args.find(a => !a.startsWith('--') && a.toLowerCase().endsWith('.xlsx'));

(async () => {
  const property = opt('--property', 'default'), batch = opt('--batch', lib.DEFAULT_BATCH);
  if (flag('--undo')) {
    if (!flag('--commit')) { console.log(`Would remove every note of batch "${batch}" for property "${property}". Add --commit to do it.`); return; }
    const client = await connect(); try { const r = await lib.undoBatch(client, { property, batch }); console.log(`Removed ${r.removed} imported note(s) (batch "${batch}").`); } finally { await client.end(); } return;
  }
  if (!file) { console.error('Give the workbook, e.g.  node server/scripts/import-shift-notes.js "database/shiftnotes/Shift notes for 2026.xlsx"'); process.exit(2); }
  let XLSX; try { XLSX = require('xlsx'); } catch { console.error('The "xlsx" package is missing — run `npm install` in the project folder first.'); process.exit(2); }
  const dateShift = {}; String(opt('--date-shift', '')).split(',').filter(Boolean).forEach(p => { const [k, v] = p.split('='); if (k && Number.isInteger(+v)) dateShift[k.trim()] = +v; });
  const wb = XLSX.readFile(file); const parsed = lib.parseWorkbook(XLSX, wb, { dateShift }); const { rows, summary } = lib.buildPlan(parsed, { merge: !flag('--no-merge'), batch });
  const out = opt('--out', path.join(os.tmpdir(), `shift-notes-preview-${Date.now()}.csv`)); fs.writeFileSync(out, lib.toCsv(rows));
  console.log(`Read ${summary.read} notes from ${parsed.stats.sheets} month sheets (${parsed.stats.junkSkipped} junk cell(s) skipped${parsed.stats.orphanAuthors ? `, ${parsed.stats.orphanAuthors} author name(s) with no note` : ''}).`);
  console.log(`→ ${summary.notes} Log Book notes (${summary.high} High priority, ${summary.general} General)${flag('--no-merge') ? '' : `; ${summary.mergedGroups} repeated-daily notes became one multi-day note each, folding away ${summary.folded}`}.`);
  console.log(`  ${summary.noAuthor} have no author ("${lib.UNKNOWN_AUTHOR}") · ${summary.flagged} are flagged for a look (dates / authors) — see the "flags" column.`);
  console.log('  Per month:', Object.entries(summary.perMonth).map(([k, v]) => `${k}: ${v}`).join(' · '));
  parsed.warnings.forEach(w => console.log('  WARNING:', w));
  console.log(`Review file: ${out}`);
  if (!flag('--commit')) { console.log('\nThis was a PREVIEW — nothing was imported. Check the review file, then add --commit.'); return; }
  const client = await connect();
  try { const r = await lib.commitPlan(client, rows, { property }); console.log(`\nImported ${r.inserted} note(s); ${r.skipped} already existed and were skipped. Batch: "${batch}" (undo with --undo --commit).`); } finally { await client.end(); }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

async function connect() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (server/.env).'); process.exit(2); }
  const { Client } = require('pg'); const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await client.connect(); return client;
}
