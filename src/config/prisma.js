const { PrismaClient } = require('@prisma/client');

// Supabase free tier: max 10 direct DB connections shared across all services.
// Using the pgbouncer pooler (port 6543) multiplexes many app connections into
// fewer real DB connections, so connection_limit here is the Prisma pool size
// (app-side), not the raw Postgres connection count.
// 10 is safe: leaves headroom for Supabase dashboard, migrations, etc.
const DEFAULT_POOL_TIMEOUT_SECONDS = 120;  // Wait up to 2 min for a pool slot
const DEFAULT_CONNECTION_LIMIT = 10;        // Prisma app-side pool (via pgbouncer)
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 30; // TCP connect timeout

const POSTGRES_PROTOCOL_REGEX = /^postgres(?:ql)?:\/\//i;
const DATABASE_URL_PREFIX_REGEX = /^DATABASE_URL\s*=\s*/i;

function normalizeDatabaseUrl(rawValue) {
    if (rawValue === undefined || rawValue === null) return undefined;

    let value = String(rawValue).trim();
    if (!value) return undefined;

    // Common Render misconfiguration: pasting "DATABASE_URL=..." into the value box.
    value = value.replace(DATABASE_URL_PREFIX_REGEX, '').trim();

    // Remove wrapping quotes/backticks if present.
    value = value.replace(/^['"`]+|['"`]+$/g, '').trim();

    return value || undefined;
}

function redactDatabaseUrlForLogs(urlValue) {
    if (!urlValue || !POSTGRES_PROTOCOL_REGEX.test(urlValue)) return 'INVALID_DATABASE_URL';

    try {
        const parsed = new URL(urlValue);
        const username = parsed.username ? `${parsed.username}:***@` : '';
        return `${parsed.protocol}//${username}${parsed.host}${parsed.pathname}`;
    } catch {
        return 'INVALID_DATABASE_URL';
    }
}

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
    const rawEnvUrl = process.env.DATABASE_URL;
    const normalizedUrl = normalizeDatabaseUrl(rawEnvUrl);
    if (!normalizedUrl) return undefined;

    if (normalizedUrl !== String(rawEnvUrl).trim()) {
        console.warn('⚠️ DATABASE_URL had extra prefix/quotes/whitespace. Auto-normalized before Prisma init.');
    }

    if (!POSTGRES_PROTOCOL_REGEX.test(normalizedUrl)) {
        console.error('❌ Invalid DATABASE_URL protocol. It must start with postgresql:// or postgres://');
        console.error(`ℹ️ Received DATABASE_URL (redacted): ${redactDatabaseUrlForLogs(normalizedUrl)}`);
        return normalizedUrl;
    }

    // Keep process env normalized so Prisma internals that read env directly see the fixed value.
    process.env.DATABASE_URL = normalizedUrl;

    try {
        const url = new URL(normalizedUrl);

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

        // Supabase pooler benefits from explicit pgbouncer mode for Prisma,
        // BUT only when using the transaction-mode port (6543).
        // If we are forced to port 5432 (session mode), pgbouncer=true can cause errors.
        if (url.port === '6543' && !url.searchParams.get('pgbouncer')) {
            url.searchParams.set('pgbouncer', 'true');
        }

        return url.toString();
    } catch {
        console.error('❌ Failed to parse DATABASE_URL. Check Render env value formatting.');
        console.error(`ℹ️ Received DATABASE_URL (redacted): ${redactDatabaseUrlForLogs(normalizedUrl)}`);
        return normalizedUrl;
    }
}

const prismaUrl = buildPrismaUrl();

const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: prismaUrl,
        }
    }
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
