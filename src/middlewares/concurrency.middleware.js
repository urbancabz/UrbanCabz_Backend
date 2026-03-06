/**
 * Concurrency Limiter Middleware
 * 
 * Limits the number of requests that can hit the database simultaneously.
 * If all slots are busy, new requests wait in a FIFO queue instead of
 * blasting the Prisma connection pool and causing P2024 timeouts.
 *
 * MAX_CONCURRENT must be LESS than the Prisma connection_limit (8)
 * to leave room for heartbeat + system queries.
 */
// Pool is 10 (set in DATABASE_URL connection_limit=10, via Supabase pgbouncer).
// We cap at 8 to leave 2 slots free for Prisma internals, warmup, and admin queries.
// This prevents P2024 "connection pool exhausted" under burst traffic.
const MAX_CONCURRENT = 8;
const MAX_QUEUE = 100; // Queue up to 100 waiting requests before returning 503

let activeCount = 0;
const queue = [];

function drainQueue() {
    while (queue.length > 0 && activeCount < MAX_CONCURRENT) {
        const { nextRes, nextNext } = queue.shift();
        activeCount++;

        const onFinish = () => {
            activeCount--;
            drainQueue();
        };

        // Guard against double-fire: 'finish' and 'close' can both emit
        let released = false;
        const safeRelease = () => {
            if (!released) {
                released = true;
                onFinish();
            }
        };

        nextRes.on('finish', safeRelease);
        nextRes.on('close', safeRelease);
        nextNext();
    }
}

function concurrencyLimiter(req, res, next) {
    if (activeCount < MAX_CONCURRENT) {
        activeCount++;

        let released = false;
        const onFinish = () => {
            if (!released) {
                released = true;
                activeCount--;
                drainQueue();
            }
        };

        res.on('finish', onFinish);
        res.on('close', onFinish);
        return next();
    }

    if (queue.length >= MAX_QUEUE) {
        return res.status(503).json({
            success: false,
            message: 'Server is busy. Please try again in a few seconds.'
        });
    }

    queue.push({ nextReq: req, nextRes: res, nextNext: next });
}

// Export activeCount getter so heartbeat can check pool pressure
concurrencyLimiter.getActiveCount = () => activeCount;

module.exports = concurrencyLimiter;
