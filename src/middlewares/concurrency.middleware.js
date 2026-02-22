/**
 * Concurrency Limiter Middleware
 * 
 * Limits the number of requests that can hit the database simultaneously.
 * If all slots are busy, new requests wait in a FIFO queue instead of
 * blasting the Prisma connection pool and causing P2024 timeouts.
 *
 * This acts as a "load balancer" between incoming HTTP requests
 * and the limited Prisma connection pool.
 */
const MAX_CONCURRENT = 8; // Leave 2 connections free for heartbeat/admin
const MAX_QUEUE = 50;     // Don't queue more than 50 requests

let activeCount = 0;
const queue = [];

function concurrencyLimiter(req, res, next) {
    if (activeCount < MAX_CONCURRENT) {
        activeCount++;
        const onFinish = () => {
            activeCount--;
            if (queue.length > 0) {
                const { nextReq, nextRes, nextNext } = queue.shift();
                activeCount++;
                const onNextFinish = () => {
                    activeCount--;
                    if (queue.length > 0) {
                        const queued = queue.shift();
                        concurrencyLimiter(queued.nextReq, queued.nextRes, queued.nextNext);
                    }
                };
                nextRes.on('finish', onNextFinish);
                nextRes.on('close', onNextFinish);
                nextNext();
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

module.exports = concurrencyLimiter;
