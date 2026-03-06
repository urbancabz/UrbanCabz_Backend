const { PrismaClient } = require('@prisma/client');

const DEFAULT_POOL_TIMEOUT_SECONDS = 120;
const DEFAULT_CONNECTION_LIMIT = 20;
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 15;

function applyNumericParam(url, key, envValue, defaultValue, minValue) {
    const fromEnv = envValue !== undefined && envValue !== null && String(envValue).trim() !== '';

    if (fromEnv) {
        const parsed = Number.parseInt(String(envValue), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            url.searchParams.set(key, String(parsed));
            return;
        }
    }

    const existing = url.searchParams.get(key);
    if (existing) {
        const parsedExisting = Number.parseInt(existing, 10);
        if (Number.isFinite(parsedExisting) && parsedExisting >= minValue) {
            return;
        }
    }

    url.searchParams.set(key, String(defaultValue));
}

function buildPrismaUrl() {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) return undefined;

    try {
        const url = new URL(rawUrl);

        applyNumericParam(
            url,
            'pool_timeout',
            process.env.PRISMA_POOL_TIMEOUT,
            DEFAULT_POOL_TIMEOUT_SECONDS,
            60
        );

        applyNumericParam(
            url,
            'connection_limit',
            process.env.PRISMA_CONNECTION_LIMIT,
            DEFAULT_CONNECTION_LIMIT,
            10
        );

        applyNumericParam(
            url,
            'connect_timeout',
            process.env.PRISMA_CONNECT_TIMEOUT,
            DEFAULT_CONNECT_TIMEOUT_SECONDS,
            10
        );

        // Supabase pooler benefits from explicit pgbouncer mode for Prisma.
        if (!url.searchParams.get('pgbouncer')) {
            url.searchParams.set('pgbouncer', 'true');
        }

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
