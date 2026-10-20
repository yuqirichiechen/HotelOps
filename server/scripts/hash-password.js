#!/usr/bin/env node
// Prints a bcrypt hash for DEV_PASSWORD_HASH (Koyeb env var). Usage: node server/scripts/hash-password.js "any password"
// Any non-empty string is accepted (use something short while debugging, then replace it with a long one and redeploy).
const bcrypt = require('bcryptjs');
const pw = process.argv[2];
if (!pw) { console.error('Usage: node server/scripts/hash-password.js "<password>"'); process.exit(1); }
if (pw.length < 12) console.error('(note: short password — fine for debugging, replace it before you rely on this in production)');
console.log(bcrypt.hashSync(pw, 12));
