// src/middlewares/auth.middleware.js
const { verifyToken } = require('../utils/jwt');
const cache = require('../utils/cache');

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = auth.split(' ')[1];

    // verifyToken throws if invalid/expired
    const payload = verifyToken(token);

    // Directly assign user from the verified JWT payload.
    // This completely eliminates the need for a database lookup on every request.
    req.user = {
      id: payload.userId,
      role: payload.role || null,
      companyId: payload.companyId || null
    };

    // FAST CACHE INTERCEPTION FOR DEACTIVATED B2B COMPANIES
    if (req.user.companyId) {
      const deactivatedSet = cache.get('deactivated_companies') || new Set();
      if (deactivatedSet.has(req.user.companyId)) {
        return res.status(401).json({ message: 'Account deactivated. Please contact support.' });
      }
    }

    return next();
  } catch (err) {
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

async function optionalAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return next();
    }

    const token = auth.split(' ')[1];
    const payload = verifyToken(token);

    req.user = {
      id: payload.userId,
      role: payload.role || null,
      companyId: payload.companyId || null
    };

    if (req.user.companyId) {
      const deactivatedSet = cache.get('deactivated_companies') || new Set();
      if (deactivatedSet.has(req.user.companyId)) {
        return res.status(401).json({ message: 'Account deactivated. Please contact support.' });
      }
    }
    return next();
  } catch (err) {
    return next();
  }
}

module.exports = { requireAuth, requireRole, requireAdmin, optionalAuth };
