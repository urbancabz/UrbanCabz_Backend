const { PrismaClient } = require('@prisma/client');

// ═══════════════════════════════════════════════════════════════
// DATABASE URL HARDENING
// Supabase's PgBouncer aggressively kills idle connections (~60s).
// We override pool parameters in the URL to ensure:
//   - connection_limit=5  → Don't fight Supabase pooler for slots
//   - pool_timeout=30     → More time for cold pooler to respond
//   - pgbouncer=true      → Tell Prisma to use PgBouncer-compatible mode
//   - connect_timeout=30  → Allow time for sleeping DB to wake
// ═══════════════════════════════════════════════════════════════
function hardenDatabaseUrl(url) {
    if (!url) return url;
    // Strip existing pool params to avoid conflicts
    let cleanUrl = url
        .replace(/[&?]connection_limit=\d+/g, '')
        .replace(/[&?]pool_timeout=\d+/g, '')
        .replace(/[&?]connect_timeout=\d+/g, '')
        .replace(/[&?]pgbouncer=\w+/g, '');
    const separator = cleanUrl.includes('?') ? '&' : '?';
    return `${cleanUrl}${separator}connection_limit=5&pool_timeout=30&connect_timeout=30&pgbouncer=true`;
}

const productionUrl = hardenDatabaseUrl(process.env.DATABASE_URL);
const devUrl = hardenDatabaseUrl(process.env.DIRECT_URL || process.env.DATABASE_URL);

const basePrisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.NODE_ENV === 'production' ? productionUrl : devUrl
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
    // P2010 (Raw query failed), P1017 (Server closed connection), P1001 (Can't reach db), P1002 (Timeout)
    // Removed P2024 (Pool exhaustion) from retries because retrying a full pool just multiplies the queue length
    if (['P2010', 'P1017', 'P1001', 'P1002'].includes(code)) return true;
    const name = error?.constructor?.name || '';
    if (name === 'PrismaClientInitializationError') return true;
    const msg = error?.message || '';
    // Removed 'connection pool' from here as well to fail fast instead of clogging the queue
    if (msg.includes('Engine is not yet connected')) return true;
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
// HEARTBEAT — Prevents Supabase PgBouncer from killing idle connections.
// Supabase drops idle connections after ~60 seconds.
// Ping every 30 seconds to keep at least one connection alive.
// POOL-AWARE: Skip the ping if the pool is under pressure to avoid
// competing with real requests during load spikes.
// ═══════════════════════════════════════════════════════════════
const concurrencyLimiter = require('../middlewares/concurrency.middleware');
const heartbeatInterval = setInterval(() => {
    // Skip heartbeat if pool is under pressure (3+ active requests out of 4 max)
    if (concurrencyLimiter.getActiveCount && concurrencyLimiter.getActiveCount() >= 3) {
        return;
    }
    basePrisma.$queryRawUnsafe('SELECT 1').catch(() => { });
}, 30 * 1000); // 30 seconds

if (heartbeatInterval.unref) heartbeatInterval.unref();

module.exports = prisma;
module.exports.withRetry = withRetry;
