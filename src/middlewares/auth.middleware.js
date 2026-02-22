// src/middlewares/auth.middleware.js
const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/prisma');
const cache = require('../utils/cache');

const AUTH_CACHE_TTL = 60; // Cache valid users for 60 seconds

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });

    const token = auth.split(' ')[1];
    const payload = verifyToken(token); // throws if invalid

    const cacheKey = `auth_user_${payload.userId}`;

    // getOrSet prevents Cache Stampedes by only allowing 1 concurrent DB query per user,
    // while all other concurrent requests await that same Promise.
    // No retry wrapper — under pool pressure, fail fast with 503 instead of
    // holding a pool slot for 6+ seconds of backoff retries.
    const reqUser = await cache.getOrSet(
      cacheKey,
      async () => {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          include: { role: true }
        });

        if (!user) throw new Error('UnauthorizedUserFetch');

        return {
          id: user.id,
          email: user.email,
          role: user.role?.name || null
        };
      },
      AUTH_CACHE_TTL
    );

    req.user = reqUser;
    return next();
  } catch (err) {
    if (err.message === 'UnauthorizedUserFetch') {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    // Distinguish JWT errors from DB/Server errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // If it's a database connection issue or Prisma error, it falls here instead of falsely reporting an invalid token
    console.error('🔴 Auth middleware DB/Server error:', err.message || err);
    return res.status(503).json({ message: 'Service temporarily unavailable. Please try again.' });
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
