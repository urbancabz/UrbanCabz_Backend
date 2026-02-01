// src/middlewares/rate-limit.middleware.js

const stores = new Map();

/**
 * A very simple in-memory rate limiter to avoid adding new dependencies 
 * like express-rate-limit if not strictly necessary.
 * For production, use a Redis-backed store.
 */
function rateLimit({ windowMs, max, message }) {
    return (req, res, next) => {
        const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        const now = Date.now();

        if (!stores.has(key)) {
            stores.set(key, { count: 1, resetTime: now + windowMs });
            return next();
        }

        const record = stores.get(key);

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + windowMs;
            return next();
        }

        record.count++;

        if (record.count > max) {
            return res.status(429).json({
                message: message || 'Too many requests, please try again later.'
            });
        }

        next();
    };
}

module.exports = rateLimit;
