const { PrismaClient } = require('@prisma/client');

// Parse connection_limit from DATABASE_URL for heartbeat sizing
const CONNECTION_LIMIT = (() => {
    const url = process.env.DATABASE_URL || '';
    const match = url.match(/connection_limit=(\d+)/);
    return match ? parseInt(match[1]) : 10;
})();

const basePrisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.NODE_ENV === 'production'
                ? process.env.DATABASE_URL
                : process.env.DIRECT_URL || process.env.DATABASE_URL
        }
    },
    log: ['warn', 'error'],
});

// ═══════════════════════════════════════════════════════════════
// GLOBAL RETRY via $extends — Auto-retries ALL queries on P2024
// IMPORTANT: We do NOT call $disconnect/$connect in the retry loop!
// That tears down the entire engine and kills all in-flight queries.
// Instead, we just wait with exponential backoff and let Prisma's
// internal pool naturally recover stale connections.
// ═══════════════════════════════════════════════════════════════
const MAX_RETRIES = 3;

function isRetryableError(error) {
    const code = error?.code || error?.errorCode;
    if (['P2024', 'P2010', 'P1017', 'P1001', 'P1002'].includes(code)) return true;
    const name = error?.constructor?.name || '';
    if (name === 'PrismaClientInitializationError') return true;
    const msg = error?.message || '';
    if (msg.includes('connection pool') || msg.includes('Engine is not yet connected')) return true;
    return false;
}

async function retryOperation(operation, args, query) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await query(args);
        } catch (error) {
            lastError = error;
            if (!isRetryableError(error) || attempt === MAX_RETRIES) {
                throw error;
            }
            const delay = Math.min(1000 * attempt, 5000); // 1s, 2s, 3s
            console.warn(
                `⚠️  Prisma retry ${attempt}/${MAX_RETRIES} | ${operation} | wait ${delay}ms | ${error?.constructor?.name}`
            );
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

// Build retry handlers for all common Prisma operations
const retryAllOperations = {};
const PRISMA_OPERATIONS = [
    'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow',
    'findMany', 'create', 'createMany', 'update', 'updateMany',
    'upsert', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy'
];

PRISMA_OPERATIONS.forEach(op => {
    retryAllOperations[op] = ({ model, operation, args, query }) =>
        retryOperation(`${model}.${operation}`, args, query);
});

const prisma = basePrisma.$extends({
    query: {
        $allModels: retryAllOperations
    }
});

// ═══════════════════════════════════════════════════════════════
// withRetry — For raw queries ($queryRawUnsafe) and non-model ops
// ═══════════════════════════════════════════════════════════════
async function withRetry(fn, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (!isRetryableError(error) || attempt === maxRetries) throw error;
            const delay = Math.min(1000 * attempt, 5000);
            console.warn(`⚠️  withRetry ${attempt}/${maxRetries} after ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

// ═══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN — Prevents connection leaks on Render restarts
// ═══════════════════════════════════════════════════════════════
process.on('SIGINT', async () => {
    await basePrisma.$disconnect();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    await basePrisma.$disconnect();
    process.exit(0);
});

// ═══════════════════════════════════════════════════════════════
// HEARTBEAT — Prevents silent TCP drops by cross-region NAT firewalls
// Touches ALL connections in the pool every 2 minutes
// ═══════════════════════════════════════════════════════════════
const heartbeatInterval = setInterval(() => {
    Promise.allSettled(
        Array.from({ length: CONNECTION_LIMIT }).map(() =>
            basePrisma.$queryRawUnsafe('SELECT 1')
        )
    ).catch(() => { });
}, 2 * 60 * 1000);

if (heartbeatInterval.unref) heartbeatInterval.unref();

module.exports = prisma;
module.exports.withRetry = withRetry;
