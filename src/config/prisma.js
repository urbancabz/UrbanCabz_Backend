const { PrismaClient } = require('@prisma/client');

// Supabase free tier: max 10 direct DB connections shared across all services.
// Using the pgbouncer pooler (port 6543) multiplexes many app connections into
// fewer real DB connections, so connection_limit here is the Prisma pool size
// (app-side), not the raw Postgres connection count.
// 10 is safe: leaves headroom for Supabase dashboard, migrations, etc.
const DEFAULT_POOL_TIMEOUT_SECONDS = 120;  // 2 min
const DEFAULT_CONNECTION_LIMIT = 10;        // Safer for Supabase free tier
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

        // Render free tier is IPv6-only. Supabase pooler (pooler.supabase.com) is
        // IPv4-only — so neither port 5432 nor 6543 on the pooler host is reachable
        // from Render free tier. The only free solution is the direct connection host
        // (db.<ref>.supabase.co) which resolves over IPv6.
        //
        // If a pooler URL is detected, rewrite to the direct host automatically.
        if (url.hostname.includes('pooler.supabase.com')) {
            // Extract project ref from username (format: postgres.<ref>) or from the pooler URL pattern
            const usernameParts = decodeURIComponent(url.username).split('.');
            const projectRef = usernameParts.length > 1 ? usernameParts[1] : null;

            if (projectRef) {
                url.hostname = `db.${projectRef}.supabase.co`;
                url.port = '5432';
                url.username = 'postgres';
                // Direct connection does NOT use pgbouncer — remove that param
                url.searchParams.delete('pgbouncer');
                console.warn(`⚠️ Pooler URL detected — auto-switched to direct host db.${projectRef}.supabase.co:5432 (IPv6 compatible for Render free tier).`);
            } else {
                // Fallback: just force port 5432
                url.port = '5432';
                url.searchParams.delete('pgbouncer');
                console.warn('⚠️ Pooler URL detected — switched to port 5432 and removed pgbouncer param.');
            }
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

// ─── ROBUST QUERY WRAPPER ───────────────────────────────────────────────────
/**
 * Executes a prisma query with automatic retries for transient connection errors.
 * Use this for critical operations like registration and booking.
 */
const withRetry = async (fn, maxRetries = 3) => {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const isTransient = err.code === 'P1001' || err.code === 'P2024' || err.code === 'P1008';
            if (!isTransient || i === maxRetries - 1) throw err;
            
            const delay = Math.pow(2, i) * 500; // 500ms, 1000ms, 2000ms
            console.warn(`⚠️ Prisma transient error ${err.code}. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
};

/**
 * Warm up the database connection at startup with aggressive retries.
 */
const warmupDatabase = async (maxAttempts = 8, delayMs = 5000) => {
    console.log('⏳ Warming up database connection...');
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await prisma.pricing_settings.findFirst();
            console.log('✅ Prisma database connection warmed up successfully.');
            return;
        } catch (err) {
            console.warn(`⚠️ Attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms...`);
            if (attempt < maxAttempts) await new Promise(res => setTimeout(res, delayMs));
        }
    }
    console.warn('⚠️ Warm-up failed — continuing anyway');
};

module.exports = prisma;
module.exports.warmupDatabase = warmupDatabase;
module.exports.withRetry = withRetry;
