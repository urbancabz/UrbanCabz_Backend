/**
 * Simple in-memory cache with TTL (Time To Live) support.
 * Use this for data that is frequently read but rarely changes
 * (e.g. pricing settings, service toggles, fleet data etc.)
 *
 * Usage:
 *   const cache = require('../utils/cache');
 *   cache.set('key', data, 300); // cache for 5 minutes
 *   const data = cache.get('key'); // returns null if expired/missing
 *   cache.invalidate('key');       // force-clear a cached item
 */

const store = new Map();
const inFlight = new Map(); // Tracks ongoing promises to prevent Cache Stampede

/**
 * Store a value in the cache.
 * @param {string} key - Unique cache key
 * @param {*} value - Value to store
 * @param {number} ttlSeconds - Time to live in seconds (default: 5 minutes)
 */
function set(key, value, ttlSeconds = 300) {
    store.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
    });
}

/**
 * Retrieve a value from the cache. Returns null if missing or expired.
 * @param {string} key
 * @returns {*|null}
 */
function get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
    }
    return entry.value;
}

/**
 * Retrieve a value from the cache, OR run the fetch function if missing.
 * Prevents multiple concurrent requests from hitting the DB identically (Cache Stampede).
 */
async function getOrSet(key, fetchFn, ttlSeconds = 300) {
    // 1. Check if already cached
    const cached = get(key);
    if (cached !== null) return cached;

    // 2. Check if a request is already in-flight for this key
    if (inFlight.has(key)) {
        return await inFlight.get(key);
    }

    // 3. Otherwise, create the Promise and track it
    const promise = (async () => {
        try {
            const result = await fetchFn();
            set(key, result, ttlSeconds);
            return result;
        } finally {
            inFlight.delete(key);
        }
    })();

    inFlight.set(key, promise);
    return await promise;
}

/**
 * Explicitly remove a cached item (e.g. after an admin update).
 * @param {string} key
 */
function invalidate(key) {
    store.delete(key);
}

/**
 * Clear the entire cache.
 */
function flush() {
    store.clear();
    inFlight.clear();
}

module.exports = { set, get, getOrSet, invalidate, delete: invalidate, flush };
