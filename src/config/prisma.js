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
// Prisma v6 uses $extends instead of $use middleware
// ═══════════════════════════════════════════════════════════════
const RETRYABLE_CODES = new Set(['P2024', 'P2010', 'P1017', 'P1001', 'P1002']);
const MAX_RETRIES = 3;

async function retryOperation(operation, args, query) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await query(args);
        } catch (error) {
            lastError = error;
            const code = error?.code || error?.errorCode;
            const isRetryable = RETRYABLE_CODES.has(code) ||
                error?.constructor?.name === 'PrismaClientInitializationError' ||
                (error?.message && error.message.includes('connection pool'));

            if (!isRetryable || attempt === MAX_RETRIES) {
                throw error;
            }

            const delay = Math.min(500 * Math.pow(2, attempt - 1), 4000);
            console.warn(
                `⚠️  Prisma retry ${attempt}/${MAX_RETRIES} | ${operation} | wait ${delay}ms | ${code || error.constructor?.name}`
            );

            await new Promise(r => setTimeout(r, delay));

            // Force-reconnect to kill stale TCP connections
            try {
                await basePrisma.$disconnect();
                await basePrisma.$connect();
            } catch (reconnectErr) {
                console.warn('⚠️  Reconnect failed:', reconnectErr.message);
            }
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
            const code = error?.code || error?.errorCode;
            const isRetryable = RETRYABLE_CODES.has(code) ||
                error?.constructor?.name === 'PrismaClientInitializationError' ||
                (error?.message && error.message.includes('connection pool'));

            if (!isRetryable || attempt === maxRetries) throw error;

            const delay = Math.min(500 * Math.pow(2, attempt - 1), 4000);
            console.warn(`⚠️  withRetry ${attempt}/${maxRetries} after ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));

            try {
                await basePrisma.$disconnect();
                await basePrisma.$connect();
            } catch (_) { }
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
