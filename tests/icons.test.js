// Sprint 28.8 — the shared icon set.   node tests/icons.test.js "$PWD"
const ROOT = process.argv[2]; process.env.NODE_ENV = 'test'; const assert = require('assert');
const path = require('path'), fs = require('fs'), Module = require('module'); const babel = require(ROOT + '/node_modules/@babel/core');
const cache = new Map(); const load = (file) => { if (cache.has(file)) return cache.get(file); const code = babel.transformFileSync(file, { presets: [[require.resolve(ROOT + '/node_modules/babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false, filename: file }).code;
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m.paths.push(ROOT + '/node_modules'); const orig = m.require.bind(m); cache.set(file, m.exports);
  m.require = (id) => { if (id.endsWith('.css')) return {}; if (id.startsWith('.')) { const p = path.resolve(path.dirname(file), id); return load(fs.existsSync(p + '.js') ? p + '.js' : p); } return orig(id); }; m._compile(code, file); cache.set(file, m.exports); return m.exports; };
const React = require(ROOT + '/node_modules/react'); const { renderToStaticMarkup } = require(ROOT + '/node_modules/react-dom/server');
const IconMod = load(ROOT + '/src/components/shared/Icon.js'); const Icon = IconMod.default, { ICONS, ICON_NAMES, hasIcon } = IconMod;
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.stack.split('\n').slice(0, 4).join(' | ')); process.exitCode = 1; } };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const src = walk(ROOT + '/src').filter(f => f.endsWith('.js'));
const noComments = (text) => text.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

t('every icon is on the same 24 grid, outline, painted with the text colour, decorative by default — so all are the same size', () => {
  assert(ICON_NAMES.length >= 60, 'the set: ' + ICON_NAMES.length);
  for (const n of ICON_NAMES) { const h = renderToStaticMarkup(React.createElement(Icon, { name: n })); assert(/viewBox="0 0 24 24"/.test(h) && /stroke="currentColor"/.test(h) && /fill="none"/.test(h) && /aria-hidden="true"/.test(h) && /width="20" height="20"/.test(h), n + ': ' + h.slice(0, 120)); assert(!/fill="#|stroke="#|<image|<img/.test(h), n + ' has no hard-coded colour'); }
  const big = renderToStaticMarkup(React.createElement(Icon, { name: 'gear', size: 32, stroke: 2, className: 'x' })); assert(/width="32" height="32"/.test(big) && /stroke-width="2"/.test(big) && /class="ic x"/.test(big)); assert(/width="1em" height="1em"/.test(renderToStaticMarkup(React.createElement(Icon, { name: 'gear', size: '1em' }))), 'em sizing for inline use');
  const titled = renderToStaticMarkup(React.createElement(Icon, { name: 'gear', title: 'Settings' })); assert(/role="img"/.test(titled) && /aria-label="Settings"/.test(titled) && !/aria-hidden/.test(titled) && /<title>Settings<\/title>/.test(titled), 'a titled icon is announced');
});
t('an unknown icon name shows a neutral placeholder (dashed square) — never a blank gap — and warns in development', () => {
  const warn = console.warn; let msg = ''; console.warn = (m) => { msg = m; };
  const h = renderToStaticMarkup(React.createElement(Icon, { name: 'does-not-exist' })); console.warn = warn;
  assert(/<rect[^>]*stroke-dasharray/.test(h) && /<svg/.test(h), h); assert(/unknown icon "does-not-exist"/.test(msg), 'dev warning'); assert(!hasIcon('does-not-exist') && hasIcon('gear'));
});
t('ADDING A PAGE: each menu item names an icon that exists, and no two items of one menu share an icon (the shared-icon problem of the PNG days)', () => {
  const menus = { 'AdminShell (nav + dev tools)': ROOT + '/src/shells/AdminShell.js', 'StaffPortalShell': ROOT + '/src/shells/StaffPortalShell.js' };
  for (const [name, f] of Object.entries(menus)) {
    const names = [...noComments(fs.readFileSync(f, 'utf8')).matchAll(/\bview: '[^']+',\s*label: '[^']+',\s*icon: '([a-z-]+)'/g)].map(m => m[1]); assert(names.length >= 4, name + ': found ' + names.length);
    const missing = names.filter(n => !hasIcon(n)); assert.deepStrictEqual(missing, [], name + ': unknown icons ' + missing.join(','));
    const dup = names.filter((n, i) => names.indexOf(n) !== i); assert.deepStrictEqual(dup, [], name + ': shared icons ' + dup.join(','));
  }
});
t('every <Icon name="…"> written in the source (and the icon names kept in data: department chips, visibility options, nav) exists in the set', () => {
  const used = new Set(), where = {};
  for (const f of src) { const text = noComments(fs.readFileSync(f, 'utf8')); if (!/from '[./]+(?:\/[a-z]+)*\/shared\/Icon'|from '\.\/Icon'/.test(text)) continue; for (const m of text.matchAll(/<Icon\s+name="([a-z-]+)"/g)) { used.add(m[1]); (where[m[1]] = where[m[1]] || []).push(path.basename(f)); } for (const m of text.matchAll(/<Icon\s+name=\{[^}]*\?\s*'([a-z-]+)'\s*:\s*'([a-z-]+)'/g)) { used.add(m[1]); used.add(m[2]); } }
  const dept = fs.readFileSync(ROOT + '/src/components/Calendar/atoms/DepartmentChips.js', 'utf8'); for (const m of dept.matchAll(/return '([a-z-]+)';/g)) used.add(m[1]);
  const adm = fs.readFileSync(ROOT + '/src/components/AdminPanel/AdminSettings.js', 'utf8'); for (const m of adm.matchAll(/icon:\s+'([a-z-]+)',/g)) used.add(m[1]);
  assert(used.size >= 40, 'icons in use: ' + used.size); const missing = [...used].filter(n => !hasIcon(n)); assert.deepStrictEqual(missing, [], 'unknown: ' + missing.map(n => n + ' (' + (where[n] || []).join(',') + ')').join(' '));
});
t('NO EMOJI in the interface: the app draws its icons itself (the old emoji and the image icons are gone)', () => {
  const MARKS = ['✓', '✕', '★', '⚑'];   // plain typographic marks (tick / cross in text strings and print tick-boxes, the housekeeping star and flag) — not emoji
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{23E9}-\u{23FA}\u{2B50}\u{231A}\u{231B}\u{2328}\u{23CF}]/u; const bad = [];
  for (const f of src) { if (/\.test\.js$/.test(f)) continue; noComments(fs.readFileSync(f, 'utf8')).split('\n').forEach((l) => { const m = [...l.matchAll(new RegExp(emoji.source, 'gu'))].map(x => x[0]).filter(c => !MARKS.includes(c)); if (m.length) bad.push(path.relative(ROOT, f) + ': ' + m.join('') + ' | ' + l.trim().slice(0, 70)); }); }
  assert.deepStrictEqual(bad, [], 'emoji left');
});
t('the image icons are gone: no /logo/*.png, no <img> or mask icon in the sidebar, mobile bar or More sheet', () => {
  assert(!fs.existsSync(ROOT + '/public/logo'), 'public/logo removed');
  const side = fs.readFileSync(ROOT + '/src/components/Layout/Sidebar.js', 'utf8'); assert(!/iconSrc|\/logo\//.test(side) && !/<img\s+[^>]*icon/i.test(noComments(side)), 'no image icons'); assert((side.match(/<Icon name=\{item\.icon\}/g) || []).length === 3, 'desktop + bottom bar + More sheet use the same component');
  const css = fs.readFileSync(ROOT + '/src/components/Layout/Sidebar.css', 'utf8'); assert(!/mask:|-webkit-mask/.test(css) && !/\.more-sheet-icon img/.test(css));
  assert(/\.ic \{ flex: none;/.test(fs.readFileSync(ROOT + '/src/index.css', 'utf8')), 'icons never shrink in a flex row');
});
console.log(`${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
