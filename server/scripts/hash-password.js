#!/usr/bin/env node
// Prints a bcrypt hash for DEV_PASSWORD_HASH (Koyeb env var). Usage: node server/scripts/hash-password.js "your long password"
// Keep the password out of shell history if you can:  read -s P; node server/scripts/hash-password.js "$P"
const bcrypt = require('bcryptjs');
const pw = process.argv[2];
if (!pw || pw.length < 12) { console.error('Usage: node server/scripts/hash-password.js "<password of at least 12 characters>"'); process.exit(1); }
console.log(bcrypt.hashSync(pw, 12));
