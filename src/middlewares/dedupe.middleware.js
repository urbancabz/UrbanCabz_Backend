/**
 * Request Deduplication Middleware
 * 
 * If 5 simultaneous GET requests hit the same endpoint (e.g. /admin/dashboard-sync),
 * only 1 DB query runs and all 5 get the same response.
 * 
 * This dramatically reduces connection pool pressure under multi-user/multi-tab load.
 * 
 * Only applies to GET requests — mutations (POST/PUT/DELETE) always pass through.
 */

const inFlight = new Map();

// Auto-cleanup stale entries after 10 seconds to prevent memory leaks
const STALE_TIMEOUT = 10_000;

const dedupe = (req, res, next) => {
    if (req.method !== 'GET') return next();

    const key = req.originalUrl;

    // If an identical request is already in-flight, piggyback on its promise
    if (inFlight.has(key)) {
        inFlight.get(key).promise
            .then(data => {
                if (!res.headersSent) res.json(data);
            })
            .catch(() => {
                if (!res.headersSent) next();
            });
        return;
    }

    // Create a deferred promise for this request
    let resolve, reject;
    const promise = new Promise((r, rj) => { resolve = r; reject = rj; });

    // Safety: auto-cleanup after 10s in case response never fires
    const timer = setTimeout(() => {
        inFlight.delete(key);
        reject(new Error('Dedupe timeout'));
    }, STALE_TIMEOUT);

    inFlight.set(key, { promise, timer });

    // Intercept res.json to capture the response data
    const originalJson = res.json.bind(res);
    res.json = (data) => {
        clearTimeout(timer);
        resolve(data);
        inFlight.delete(key);
        return originalJson(data);
    };

    // Handle errors/aborts
    const cleanup = () => {
        clearTimeout(timer);
        reject(new Error('Response closed'));
        inFlight.delete(key);
    };

    res.on('close', cleanup);
    res.on('error', cleanup);

    next();
};

module.exports = dedupe;
