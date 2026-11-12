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
t('the Dev view bar is on-brand: one dark navy bar for every view, the view shown by an accent colour (gold Dev, teal Manager, copper Front desk) — no purple / teal / amber banners', () => {
  const dv = fs.readFileSync(ROOT + '/src/pages/Dev/DevPages.css', 'utf8'); const tail = dv.slice(dv.indexOf('Sprint 28.2 — the Dev view bar'));
  for (const x of [/\.dvb\.is-full \{ --dvb-accent: #dfc184/, /\.dvb\.is-manager \{ --dvb-accent: #5fd0c2/, /\.dvb\.is-frontdesk \{ --dvb-accent: #f0a35e/, /\.dvb-switch button\.on \{ background: var\(--dvb-accent\)/, /\.dvb \{ background: linear-gradient\(90deg, #0c1c31/]) assert(x.test(tail), String(x));
  assert(!/#5b21b6|#7c3aed|#0f766e|#b45309/.test(tail.replace(/\/\*[\s\S]*?\*\//g, '')), 'the old banner colours are not re-used');
});
t('the scene background (navy waves + gold curves / rice + gold) is on every shell: the app pages and the Clock in door; the tokens are defined for both', () => {
  const ia = fs.readFileSync(ROOT + '/src/inntrioApp.css', 'utf8');
  assert(/\.app-shell, \.clockin-shell \{/.test(ia) && /\[data-theme="dark"\] \.app-shell, \[data-theme="dark"\] \.clockin-shell \{/.test(ia) && /:root:not\(\[data-theme="light"\]\) \.app-shell, :root:not\(\[data-theme="light"\]\) \.clockin-shell \{/.test(ia));
  assert(/\.clockin-shell \{ background: var\(--ia-curves\) center \/ cover no-repeat fixed, var\(--ia-page\); \}/.test(ia)); assert(/\.app-shell \.app-main \{ background: var\(--ia-curves\)/.test(ia));
});
console.log(`\n${pass} passed`); process.exit(process.exitCode || 0);
