// Sprint 24.4 — "PIN vault": an ENCRYPTED copy of a staff PIN that only the dev role can reveal.
//
// Staff PINs are still verified against the one-way bcrypt hash (users.pin_hash) — nothing about sign-in changes. The encrypted copy
// (users.pin_enc, migration 031) exists only so a dev can look a PIN up (staff page → "Reveal PIN"; every reveal is audit-logged).
// Managers (admin) can never read it: the reveal route is requireRole('dev') and the value is never part of any other response.
//
// AES-256-GCM; the key is derived from the env var PIN_VIEW_KEY (any secret of 16+ characters; changing it makes stored copies
// unreadable, which just shows "not viewable" until the person's next PIN sign-in re-stores them). Without the env var nothing is stored.
const crypto = require('crypto');

const SALT = 'hotelops-pin-view-v1';
let cachedFor = null, cachedKey = null;

const secret = () => (process.env.PIN_VIEW_KEY || '').trim();
const configured = () => secret().length >= 16;
const key = () => {
  const s = secret();
  if (cachedFor !== s) { cachedKey = crypto.scryptSync(s, SALT, 32); cachedFor = s; }
  return cachedKey;
};

/** @returns {string|null} "v1.<iv>.<tag>.<ciphertext>" (base64url), or null when no key is configured */
function encryptPin(pin) {
  if (!configured()) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(pin), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

/** @returns {string|null} the PIN, or null when it can't be read (no key, wrong key, damaged value) */
function decryptPin(blob) {
  if (!configured() || typeof blob !== 'string') return null;
  try {
    const [v, iv, tag, ct] = blob.split('.');
    if (v !== 'v1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

module.exports = { encryptPin, decryptPin, configured };
