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
}

module.exports = { set, get, invalidate, flush };
