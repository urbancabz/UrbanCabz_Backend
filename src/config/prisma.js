const { PrismaClient } = require('@prisma/client');

const DEFAULT_POOL_TIMEOUT_SECONDS = 60;
const DEFAULT_CONNECTION_LIMIT = 8;

function buildPrismaUrl() {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) return undefined;

    try {
        const url = new URL(rawUrl);

        const poolTimeout = process.env.PRISMA_POOL_TIMEOUT || DEFAULT_POOL_TIMEOUT_SECONDS;
        url.searchParams.set('pool_timeout', String(poolTimeout));

        // Force a conservative default for Render to avoid exhausting DB connections.
        // Only PRISMA_CONNECTION_LIMIT can override this default.
        const connectionLimit = process.env.PRISMA_CONNECTION_LIMIT || DEFAULT_CONNECTION_LIMIT;
        url.searchParams.set('connection_limit', String(connectionLimit));

        return url.toString();
    } catch {
        // Fall back to raw URL if parsing fails for any reason.
        return rawUrl;
    }
}

const prismaUrl = buildPrismaUrl();

const prisma = new PrismaClient({
    log: ['error'],
    ...(prismaUrl ? { datasources: { db: { url: prismaUrl } } } : {}),
});

/**
 * Warm up the database connection at startup.
 * A single lightweight query to verify the pool is ready before traffic arrives.
 * Logs a warning and continues if it fails — the server will still start.
 */
const warmupDatabase = async () => {
    console.log('⏳ Warming up database connection...');
    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Prisma database connection warmed up successfully.');
    } catch (err) {
        console.warn('⚠️ Warm-up failed, continuing anyway:', err.message);
    }
};

// Graceful shutdown — release DB connections cleanly
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

// Default export = prisma client (backward compatible with all existing requires)
module.exports = prisma;
module.exports.warmupDatabase = warmupDatabase;
