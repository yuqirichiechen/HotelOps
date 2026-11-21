// Sprint 29.1 — admin (manager) and dev sign-in accounts, kept in the database (`login_accounts`, migration 036) so passwords can be changed from the app.
//
// Where a password lives:
//   • BEFORE migration 036 / before a person has a row: admins sign in from server/config/admins.json, dev from DEV_PASSWORD_HASH (the old behaviour, unchanged).
//   • AFTER: the row is the ONLY password that works for that person. An admin from admins.json is copied into the table the first time they sign in (or when dev
//     opens the admin list); the dev row is created the first time dev changes their password. Everything here is request-driven — no timers touch the database.
//   • password_hash (bcrypt) is what sign-in checks. password_enc is an encrypted copy for ADMINS ONLY that the dev role can reveal (same vault + key as staff
//     PINs, server/pinvault.js); without PIN_VIEW_KEY nothing is stored and dev can reset but not read.
// Dependencies are injected so the module is testable on a throwaway Postgres.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ROUNDS = 10, PW_MIN = 8, PW_MAX = 128;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/;
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 4);   // a wrong username costs the same as a wrong password

/** @returns {string|null} the reason a password is not acceptable, or null */
const passwordProblem = (pw, username) => {
  if (typeof pw !== 'string' || !pw) return 'Enter a password.';
  if (pw.length < PW_MIN) return `Use at least ${PW_MIN} characters.`;
  if (pw.length > PW_MAX) return `Use at most ${PW_MAX} characters.`;
  if (pw !== pw.trim()) return 'Remove the spaces at the start or end of the password.';
  if (username && pw.toLowerCase() === String(username).toLowerCase()) return 'The password can’t be the same as the username.';
  return null;
};
const cleanUsername = (u) => { const s = String(u === undefined || u === null ? '' : u).trim(); return USERNAME_RE.test(s) ? s : null; };
const cleanName = (n) => String(n === undefined || n === null ? '' : n).replace(/\s+/g, ' ').trim().slice(0, 100);

/** failures per key within a window (change-password attempts need the current password; this stops guessing with a stolen session) */
const createLimiter = (max, windowMs) => {
  const hits = new Map();
  const prune = (k, now) => { const l = (hits.get(k) || []).filter(t => now - t < windowMs); hits.set(k, l); return l; };
  return {
    check: (k, now = Date.now()) => { const l = prune(k, now); return l.length >= max ? { allowed: false, retryAfterSec: Math.ceil((windowMs - (now - l[0])) / 1000) } : { allowed: true }; },
    fail: (k, now = Date.now()) => { prune(k, now).push(now); },
    clear: (k) => hits.delete(k),
  };
};

const missingTable = (e) => !!e && e.code === '42P01';

/**
 * @param {object} deps
 * @param {{query: Function}} deps.pool
 * @param {() => {username: string, password: string, name?: string}[]} deps.legacyAdmins   admins.json
 * @param {{configured: () => boolean, encrypt: (s: string) => string|null, decrypt: (s: string) => string|null}} deps.vault
 * @param {(username: string, password: string) => Promise<{username: string}|null>} deps.verifyEnvDev   the DEV_PASSWORD_HASH check
 * @param {() => boolean} deps.envDevConfigured
 */
function createAccounts({ pool, legacyAdmins, vault, verifyEnvDev, envDevConfigured }) {
  const limiter = createLimiter(5, 15 * 60 * 1000);
  const getRow = async (kind, username) => (await pool.query('SELECT * FROM login_accounts WHERE kind = $1 AND lower(username) = lower($2)', [kind, username])).rows[0] || null;
  const encOf = (pw) => (vault && vault.configured() ? vault.encrypt(pw) : null);
  const legacyMatch = (username, password) => (legacyAdmins() || []).find(a => a && typeof a.username === 'string' && a.username.toLowerCase() === String(username || '').toLowerCase() && typeof a.password === 'string' && same(a.password, password || '')) || null;

  async function importOne(l) {
    const hash = await bcrypt.hash(l.password, ROUNDS);
    await pool.query(
      `INSERT INTO login_accounts (kind, username, display_name, password_hash, password_enc, created_by) VALUES ('admin', $1, $2, $3, $4, 'admins.json') ON CONFLICT DO NOTHING`,
      [l.username, cleanName(l.name) || l.username, hash, encOf(l.password)]);
  }
  /** copies every admins.json admin that has no row yet into the table; returns how many were added */
  async function importLegacy() {
    let n = 0;
    for (const l of (legacyAdmins() || [])) {
      if (!l || !cleanUsername(l.username) || typeof l.password !== 'string' || !l.password) continue;
      if (await getRow('admin', l.username)) continue;
      await importOne(l); n += 1;
    }
    return n;
  }

  /** @returns {Promise<{username: string, name: string}|null>} */
  async function verifyAdmin(username, password) {
    let row;
    try { row = await getRow('admin', username); }
    catch (e) {
      if (!missingTable(e)) throw e;
      const l = legacyMatch(username, password); return l ? { username: l.username, name: l.name || l.username } : null;   // migration 036 not applied yet: the old behaviour
    }
    if (row) {
      const ok = await bcrypt.compare(String(password || ''), row.password_hash);
      return ok && row.active ? { username: row.username, name: row.display_name || row.username } : null;
    }
    const l = legacyMatch(username, password);
    if (!l) { await bcrypt.compare(String(password || ''), DUMMY_HASH); return null; }
    await importOne(l);   // first sign-in since 036: the file's admin becomes a database account (from now on only the row's password works)
    const created = await getRow('admin', l.username);
    return created && created.active ? { username: created.username, name: created.display_name || created.username } : null;
  }

  async function devRow() { try { return (await pool.query("SELECT * FROM login_accounts WHERE kind = 'dev' LIMIT 1")).rows[0] || null; } catch (e) { if (missingTable(e)) return null; throw e; } }
  /** dev sign-in: the database password once dev has changed it, the environment one until then */
  async function verifyDev(username, password) {
    const row = await devRow();
    if (!row) return verifyEnvDev(username, password);
    const ok = await bcrypt.compare(String(password || ''), row.password_hash); const u = same(String(username || '').toLowerCase(), row.username.toLowerCase());
    return ok && u ? { username: row.username } : null;
  }
  const devAvailable = async () => envDevConfigured() || !!(await devRow());

  /** @returns {Promise<{ok: true} | {error: 'invalid'|'rate'|'wrong_current'|'same'|'unavailable', message: string, retryAfterSec?: number}>} */
  async function changePassword({ kind, username, current, next }) {
    const bad = passwordProblem(next, username); if (bad) return { error: 'invalid', message: bad };
    const key = `${kind}:${String(username).toLowerCase()}`; const gate = limiter.check(key);
    if (!gate.allowed) return { error: 'rate', message: 'Too many wrong attempts. Try again later.', retryAfterSec: gate.retryAfterSec };
    let verified;
    try { verified = kind === 'dev' ? await verifyDev(username, current) : await verifyAdmin(username, current); }
    catch (e) { if (missingTable(e)) return { error: 'unavailable', message: 'Password changes are not available yet — apply migration 036.' }; throw e; }
    if (!verified) { limiter.fail(key); return { error: 'wrong_current', message: 'The current password is not right.' }; }
    if (same(current, next)) return { error: 'same', message: 'The new password must be different from the current one.' };
    const hash = await bcrypt.hash(next, ROUNDS);
    try {
      if (kind === 'dev') {
        const upd = await pool.query("UPDATE login_accounts SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE kind = 'dev'", [hash]);
        if (!upd.rowCount) await pool.query("INSERT INTO login_accounts (kind, username, display_name, password_hash, password_changed_at, created_by) VALUES ('dev', $1, 'Dev', $2, NOW(), 'self')", [verified.username, hash]);
      } else {
        await pool.query("UPDATE login_accounts SET password_hash = $1, password_enc = $2, password_changed_at = NOW(), updated_at = NOW() WHERE kind = 'admin' AND lower(username) = lower($3)", [hash, encOf(next), verified.username]);
      }
    } catch (e) { if (missingTable(e)) return { error: 'unavailable', message: 'Password changes are not available yet — apply migration 036.' }; throw e; }
    limiter.clear(key);
    return { ok: true };
  }

  // ── dev: manage admin accounts ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const pub = (r) => ({ account_id: r.account_id, username: r.username, name: r.display_name || r.username, active: r.active, has_password_copy: !!r.password_enc, password_changed_at: r.password_changed_at, created_at: r.created_at, created_by: r.created_by });
  async function listAdmins() { await importLegacy(); return (await pool.query("SELECT * FROM login_accounts WHERE kind = 'admin' ORDER BY lower(username)")).rows.map(pub); }
  async function createAdmin({ username, name, password, by }) {
    const u = cleanUsername(username); if (!u) return { error: 'invalid', message: 'The username needs 3–40 letters, numbers, dots, dashes or underscores.' };
    const bad = passwordProblem(password, u); if (bad) return { error: 'invalid', message: bad };
    try {
      const { rows } = await pool.query("INSERT INTO login_accounts (kind, username, display_name, password_hash, password_enc, password_changed_at, created_by) VALUES ('admin', $1, $2, $3, $4, NOW(), $5) RETURNING *",
        [u, cleanName(name) || u, await bcrypt.hash(password, ROUNDS), encOf(password), String(by || '').slice(0, 80)]);
      return { ok: true, account: pub(rows[0]) };
    } catch (e) { if (e && e.code === '23505') return { error: 'taken', message: 'That username is already used.' }; throw e; }
  }
  const adminById = async (id) => (/^[0-9a-f-]{36}$/i.test(String(id)) ? (await pool.query("SELECT * FROM login_accounts WHERE kind = 'admin' AND account_id = $1", [id])).rows[0] : null) || null;
  async function resetAdminPassword(id, password) {
    const row = await adminById(id); if (!row) return { error: 'not_found', message: 'Admin not found.' };
    const bad = passwordProblem(password, row.username); if (bad) return { error: 'invalid', message: bad };
    await pool.query('UPDATE login_accounts SET password_hash = $1, password_enc = $2, password_changed_at = NOW(), updated_at = NOW() WHERE account_id = $3', [await bcrypt.hash(password, ROUNDS), encOf(password), id]);
    limiter.clear(`admin:${row.username.toLowerCase()}`);
    return { ok: true, account: pub(await adminById(id)) };
  }
  async function updateAdmin(id, { name, active }) {
    const row = await adminById(id); if (!row) return { error: 'not_found', message: 'Admin not found.' };
    const sets = [], params = [];
    if (name !== undefined) { const n = cleanName(name); if (!n) return { error: 'invalid', message: 'A name is needed.' }; params.push(n); sets.push(`display_name = $${params.length}`); }
    if (active !== undefined) { if (typeof active !== 'boolean') return { error: 'invalid', message: 'active must be true or false.' }; params.push(active); sets.push(`active = $${params.length}`); }
    if (!sets.length) return { error: 'invalid', message: 'Nothing to update.' };
    params.push(id); await pool.query(`UPDATE login_accounts SET ${sets.join(', ')}, updated_at = NOW() WHERE account_id = $${params.length}`, params);
    return { ok: true, account: pub(await adminById(id)) };
  }
  /** @returns {Promise<{ok: true, password: string|null, reason?: string, username?: string}|{error: 'not_found'}>} */
  async function revealAdmin(id) {
    const row = await adminById(id); if (!row) return { error: 'not_found', message: 'Admin not found.' };
    if (!vault || !vault.configured()) return { ok: true, password: null, reason: 'not_configured', username: row.username };
    const pw = row.password_enc ? vault.decrypt(row.password_enc) : null;
    return pw ? { ok: true, password: pw, username: row.username } : { ok: true, password: null, reason: 'not_stored', username: row.username };
  }

  return { verifyAdmin, verifyDev, devAvailable, changePassword, listAdmins, createAdmin, resetAdminPassword, updateAdmin, revealAdmin, importLegacy };
}

module.exports = { createAccounts, passwordProblem, cleanUsername, cleanName, createLimiter, PW_MIN, PW_MAX };
