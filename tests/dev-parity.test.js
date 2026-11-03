// Sprint 24.4 — "dev sees everything": a guard against the bug class where a check written for managers (role/type === 'admin') silently excludes the
// dev role. Every such check in the client and the server must also mention dev on the same line (or be on the short, reviewed allow-list below).
//   node tests/dev-parity.test.js "$PWD"
const ROOT = process.argv[2]; const fs = require('fs'), path = require('path'), assert = require('assert');
const walk = (d, out = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.name === 'node_modules' || f.name === 'build') continue; const p = path.join(d, f.name); if (f.isDirectory()) walk(p, out); else if (/\.js$/.test(f.name)) out.push(p); } return out; };
const CHECK = /(role|type)\s*(===|!==|==|!=)\s*['"]admin['"]/;
// reviewed: these never decide what a dev may do (route guards that treat dev explicitly nearby, the login-mode id, comments)
const ALLOW = [/RequireRole/, /isAdmin\s*=\s*user\.role === 'admin'/, /\(user && user\.role === 'admin'\) \?/, /role !== 'admin';\s*$/];
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ', n); } catch (e) { console.log('  FAIL', n, '\n      ', e.message); process.exitCode = 1; } };
const scan = (files, label) => t(label + ': every admin check also covers dev', () => {
  const bad = [];
  for (const f of files) fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (!CHECK.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line) || /\bdev\b/.test(line) || ALLOW.some(r => r.test(line))) return;
    bad.push(`${path.relative(ROOT, f)}:${i + 1}  ${line.trim().slice(0, 130)}`);
  });
  assert.strictEqual(bad.length, 0, '\n       ' + bad.join('\n       '));
});
scan(walk(path.join(ROOT, 'src')), 'client');
scan([path.join(ROOT, 'server/server.js'), path.join(ROOT, 'server/auth.js')], 'server');
t('auth.js: every requireRole("admin") route also admits dev (ROLE_IMPLIES)', () => { const a = fs.readFileSync(path.join(ROOT, 'server/auth.js'), 'utf8'); assert(/ROLE_IMPLIES\s*=\s*\{\s*dev:\s*\['admin'\]/.test(a)); });
console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
