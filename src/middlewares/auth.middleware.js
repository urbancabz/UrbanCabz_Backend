// src/middlewares/auth.middleware.js
const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/prisma');
const { withRetry } = require('../config/prisma');

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });

    const token = auth.split(' ')[1];
    const payload = verifyToken(token); // throws if invalid

    // Wrapped in withRetry to survive transient P2024 pool exhaustion
    const user = await withRetry(() =>
      prisma.user.findUnique({ where: { id: payload.userId }, include: { role: true } })
    );
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role?.name || null
    };
    return next();
  } catch (err) {
    // Distinguish DB errors from auth errors
    const code = err?.code || err?.errorCode;
    if (code === 'P2024' || code === 'P2010' || code === 'P1017' || code === 'P1001') {
      console.error('🔴 Auth middleware DB unavailable:', err.message);
      return res.status(503).json({ message: 'Service temporarily unavailable. Please try again.' });
    }
    console.error('auth middleware err', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.user) {
      console.warn('⛔ requireRole: No user in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const userRole = (req.user.role || '').toUpperCase();
    const allowed = roles.map((r) => r.toUpperCase());

    if (!allowed.includes(userRole)) {
      console.warn(`⛔ Forbidden: User role '${userRole}' not in [${allowed}]`);
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

const requireAdmin = requireRole(['ADMIN', 'admin']);

module.exports = { requireAuth, requireRole, requireAdmin };
