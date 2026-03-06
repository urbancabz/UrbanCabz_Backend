// src/utils/jwt.js
const jwt = require('jsonwebtoken');

// In production JWT_SECRET MUST be set — an empty/default secret means any
// attacker can forge tokens and impersonate any user.
// We crash loudly at startup rather than silently accept a broken config.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set in production. Refusing to start.');
  process.exit(1);
}

const SECRET = process.env.JWT_SECRET || 'dev_only_secret_change_in_production';

function signToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, SECRET, { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
