/**
 * Request Deduplication Middleware
 *
 * If 5 simultaneous GET requests hit the same endpoint, only 1 DB query runs
 * and all 5 get the same response. This cuts connection pool pressure under
 * multi-tab / multi-user burst load.
 *
 * KEY SCOPING (critical for security):
 *   - Authenticated requests: key = userId + url  → each user gets their own data
 *   - Public requests:        key = url only
 *
 * Only applies to GET requests — mutations always pass through.
 */

const inFlight = new Map();

// Safety net: auto-remove stale entries so memory doesn't leak if a response
// never fires (e.g. connection dropped before res.json).
const STALE_TIMEOUT_MS = 10_000;

const dedupe = (req, res, next) => {
  if (req.method !== 'GET') return next();

  // Include userId so authenticated users never share each other's responses.
  // req.user is set by auth middleware (if present). Falls back to empty string
  // for public routes so they still benefit from deduplication.
  const userId = (req.user && req.user.userId) ? String(req.user.userId) : '';
  const key = `${userId}:${req.originalUrl}`;

  if (inFlight.has(key)) {
    inFlight.get(key).promise
      .then((data) => {
        if (data && data.__dedupe_failed) {
          if (!res.headersSent) next();
          return;
        }
        if (!res.headersSent) res.json(data);
      })
      .catch(() => {
        if (!res.headersSent) next();
      });
    return;
  }

  let resolve;
  const promise = new Promise((r) => { resolve = r; });

  const timer = setTimeout(() => {
    inFlight.delete(key);
    resolve({ __dedupe_failed: true });
  }, STALE_TIMEOUT_MS);

  inFlight.set(key, { promise, timer });

  const originalJson = res.json.bind(res);
  res.json = (data) => {
    clearTimeout(timer);
    resolve(data);
    inFlight.delete(key);
    return originalJson(data);
  };

  const cleanup = () => {
    clearTimeout(timer);
    resolve({ __dedupe_failed: true });
    inFlight.delete(key);
  };

  res.on('close', cleanup);
  res.on('error', cleanup);

  next();
};

module.exports = dedupe;
