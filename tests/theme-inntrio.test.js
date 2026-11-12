// Sprint 28.2 — the whole signed-in app wears the Inntrio palette: theme.css has the SAME re-toned tokens in all four places (light default, [data-theme=light],
// system-dark, [data-theme=dark]) with readable contrast, the Dev bar is on-brand, and the scene background covers every shell.   node tests/theme-inntrio.test.js "$PWD"
const ROOT = process.argv[2]; const assert = require('assert'); const fs = require('fs');
const css = fs.readFileSync(ROOT + '/src/theme.css', 'utf8');
const blockAt = (startIdx) => { const j = css.indexOf('{', startIdx); const k = css.indexOf('}', j); const o = {}; css.slice(j + 1, k).replace(/(--[a-z-]+):\s*([^;]+);/g, (_, n, v) => { o[n] = v.trim(); }); return o; };
const light = blockAt(css.indexOf(':root {')), lightExplicit = blockAt(css.indexOf('[data-theme="light"] {')), dark = blockAt(css.indexOf('[data-theme="dark"] {')), darkSys = blockAt(css.indexOf(':root:not([data-theme="light"]) {'));
const lum = (hex) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const KEYS = ['--bg-base', '--bg-surface', '--bg-surface-alt', '--bg-raised', '--bg-sidebar', '--brand-text', '--brand-bg', '--brand-hover', '--accent', '--accent-alt', '--accent-bg', '--text-primary', '--text-secondary', '--text-muted', '--text-faint', '--text-lightest', '--border', '--border-light', '--border-mid'];
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 3).join(' | ')); process.exitCode = 1; } };
t('the four theme blocks agree: both light blocks carry the same tokens, both dark blocks carry the same tokens (explicit toggle and system setting look identical)', () => {
  for (const k of KEYS) { assert(light[k], 'light ' + k); assert.strictEqual(light[k], lightExplicit[k], 'light blocks differ on ' + k); assert.strictEqual(dark[k], darkSys[k], 'dark blocks differ on ' + k); }
});
t('light = rice white + gold: warm surfaces, navy text, gold accent; dark = navy + steel blue; none of the old Chakra grays / blues are left in the key tokens', () => {
  assert.deepStrictEqual([light['--bg-base'], light['--bg-surface'], light['--text-primary'], light['--accent'], light['--accent-alt']], ['#f7f2e6', '#fffdf8', '#0f2540', '#c9a05a', '#9a6f2a']);
  assert.deepStrictEqual([dark['--bg-base'], dark['--bg-surface'], dark['--text-primary'], dark['--brand-bg'], dark['--accent']], ['#0b1828', '#12263d', '#f4f6fb', '#2f5f94', '#63b3ed']);
  for (const old of ['#f0f4f8', '#2d3748', '#e2e8f0', '#0f1923', '#182434', '#2d4058']) for (const blk of [light, dark]) assert(!KEYS.some(k => blk[k] && blk[k].toLowerCase() === old), old);
  assert.strictEqual(light['--bg-sidebar'], dark['--bg-sidebar'], 'the phone bottom nav / More sheet stay navy in both themes (their icons are white)');
});
t('contrast is readable: primary + secondary text ≥ 4.5:1 and muted ≥ 3.4:1 on the page and on cards, in both themes; the primary button text (white) on the brand colour ≥ 4.5:1; the gold accent text on cards ≥ 3.5:1', () => {
  for (const [name, th] of [['light', light], ['dark', dark]]) for (const bg of ['--bg-base', '--bg-surface', '--bg-surface-alt']) {
    assert(ratio(th['--text-primary'], th[bg]) >= 4.5, `${name} primary on ${bg}: ${ratio(th['--text-primary'], th[bg]).toFixed(2)}`); assert(ratio(th['--text-secondary'], th[bg]) >= 4.5, `${name} secondary on ${bg}`); assert(ratio(th['--text-muted'], th[bg]) >= 3.4, `${name} muted on ${bg}: ${ratio(th['--text-muted'], th[bg]).toFixed(2)}`); }
  assert(ratio('#ffffff', light['--brand-bg']) >= 4.5 && ratio('#ffffff', dark['--brand-bg']) >= 4.5, 'white on the primary button colour');
  assert(ratio(light['--accent-alt'], light['--bg-surface']) >= 3.5, 'gold text on a light card'); assert(ratio(dark['--accent'], dark['--bg-surface']) >= 4.5, 'accent on a dark card');
});
t('the Dev view bar follows the theme (28.3): rice-white bar with navy text in light mode, dark navy glass in dark mode (explicit toggle AND system setting); the view is shown by an accent colour per theme; none of the old purple / teal / amber banner rules are left', () => {
  const dv = fs.readFileSync(ROOT + '/src/pages/Dev/DevPages.css', 'utf8'); const tail = dv.slice(dv.indexOf('Sprint 28.2 / 28.3 — the Dev view bar'));
  assert(/\.dvb \{\s*--dvb-bg: linear-gradient\(90deg, #fbf6e9/.test(tail) && /--dvb-fg: #0f2540/.test(tail), 'light default'); assert(/\[data-theme="dark"\] \.dvb \{ --dvb-bg: linear-gradient\(90deg, #0c1c31/.test(tail), 'explicit dark'); assert(/prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \.dvb \{ --dvb-bg: linear-gradient\(90deg, #0c1c31/.test(tail), 'system dark');
  for (const x of [/\.dvb\.is-full \{ --dvb-accent: #d8b266/, /\.dvb\.is-manager \{ --dvb-accent: #4fb9ac/, /\.dvb\.is-frontdesk \{ --dvb-accent: #e8955a/, /\[data-theme="dark"\] \.dvb\.is-full \{ --dvb-accent: #dfc184/, /\.dvb-switch button\.on[^{]*\{ background: var\(--dvb-accent\)/, /background: var\(--dvb-bg\)/]) assert(x.test(tail), String(x));
  assert(!/#5b21b6|#7c3aed|#0f766e|#b45309|#d97706|#0d9488/.test(dv.replace(/\/\*[\s\S]*?\*\//g, '')), 'the old banner colours are gone from the whole file — they out-ranked the theme rules (28.3 bug: bar stayed dark in light mode)');
});
t('the page text colour (28.3 root cause): body sets color: var(--text-primary), so elements without their own colour are not browser-black on the dark theme; each theme block sets color-scheme so native controls match', () => {
  const idx = fs.readFileSync(ROOT + '/src/index.css', 'utf8'); assert(/body \{[^}]*color: var\(--text-primary\);/.test(idx));
  assert.deepStrictEqual([...css.matchAll(/color-scheme: (light|dark);/g)].map(m => m[1]), ['light', 'dark', 'dark', 'light'], 'light default, system-dark, explicit dark, explicit light');
});
t('dark-mode audit fixes (28.3): pale hard-coded panels get dark ones, light-theme text colours are lightened on dark, solid primary controls use the primary blue; every rule exists for BOTH the explicit toggle and the system setting', () => {
  const df = fs.readFileSync(ROOT + '/src/darkFixes.css', 'utf8'); const blk = df.slice(df.indexOf('Sprint 28.3 — dark-mode audit fixes'));
  for (const sel of ['.fb-infotip-pop', '.fc-note-card', '.fc-svc-row', '.adm-overdue-row.adm-overdue-row-closed', '.sp-pill-running', '.hk-rc-iptag', '.hk-btn-primary', '.lb-btn-primary', '.hk-seg button.on', '.entry-edit-conflict', '.home-auto-close-warning']) { assert(blk.includes(`:root[data-theme="dark"] ${sel}`) || blk.includes(`:root[data-theme="dark"] ${sel.split(',')[0]}`), 'explicit: ' + sel); assert(blk.includes(`:root:not([data-theme="light"]) ${sel}`) || blk.includes(`:root:not([data-theme="light"]) ${sel.split(',')[0]}`), 'system: ' + sel); }
  assert(/\.fb-infotip-pop \{ background:var\(--bg-surface\); \}/.test(blk)); assert(/\.hk-btn-primary[^{]*\{ background:var\(--brand-bg\);color:#fff; \}/.test(blk));
  const all = require('child_process').execSync(`grep -rnE "(^|[ ;{])color:\\s*var\\(--accent[,)]" "${ROOT}/src" --include=*.css || true`, { encoding: 'utf8', shell: '/bin/bash' }).split('\n').filter(l => l && !/Sidebar\.css|inntrioApp\.css|pages\/Login\//.test(l)); assert.deepStrictEqual(all, [], 'gold --accent is a FILL colour; text uses --accent-alt (gold #c9a05a on a light card is ~2.4:1)');
  assert(/\.adm-working-clockout \{[^}]*color: var\(--danger-hover\)/.test(fs.readFileSync(ROOT + '/src/pages/AdminHome/AdminHome.css', 'utf8')), 'Clock out button readable on dark');
  assert(/\.rx-audit mark \{[^}]*color: #1a202c/.test(fs.readFileSync(ROOT + '/src/components/Forecasting/ResnList.css', 'utf8')), 'highlighted audit-log matches keep dark text');
});
t('the scene background (navy waves + gold curves / rice + gold) is on every shell: the app pages and the Clock in door; the tokens are defined for both', () => {
  const ia = fs.readFileSync(ROOT + '/src/inntrioApp.css', 'utf8');
  assert(/\.app-shell, \.clockin-shell \{/.test(ia) && /\[data-theme="dark"\] \.app-shell, \[data-theme="dark"\] \.clockin-shell \{/.test(ia) && /:root:not\(\[data-theme="light"\]\) \.app-shell, :root:not\(\[data-theme="light"\]\) \.clockin-shell \{/.test(ia));
  assert(/\.clockin-shell \{ background: var\(--ia-curves\) center \/ cover no-repeat fixed, var\(--ia-page\); \}/.test(ia)); assert(/\.app-shell \.app-main \{ background: var\(--ia-curves\)/.test(ia));
});
console.log(`\n${pass} passed`); process.exit(process.exitCode || 0);
