// src/middlewares/auth.middleware.js
const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/prisma');

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });

    const token = auth.split(' ')[1];
    const payload = verifyToken(token); // throws if invalid
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, include: { role: true }});
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role?.name || null
    };
    return next();
  } catch (err) {
    console.error('auth middleware err', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
