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

        // ─── ROBUST PORT UPGRADE ─────────────────────────────────────────────
        // Supabase poolers (.pooler.supabase.com) support both 5432 and 6543.
        // Prisma Client + high concurrency on Render MUST use 6543 (Transaction mode).
        // 5432 is Session mode and frequently fails with P1001 when sessions exhaust.
        if (url.hostname.includes('.pooler.supabase.com') && url.port === '5432') {
            console.warn('⚠️ DETECTED SUPABASE SESSION MODE (Port 5432). Upgrading to Transaction Mode (Port 6543) for stability.');
            url.port = '6543';
        }

        // ─── ESSENTIAL PARAMETERS ───────────────────────────────────────────
        // Transaction poolers require pgbouncer=true to work correctly with Prisma
        if (url.port === '6543' && !url.searchParams.get('pgbouncer')) {
            url.searchParams.set('pgbouncer', 'true');
        }

        // Supabase/Render require SSL
        if (!url.searchParams.get('sslmode')) {
            url.searchParams.set('sslmode', 'require');
        }

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
            30 // Increased for better stability on cold starts
        );


        return url.toString();
    } catch {
        console.error('❌ Failed to parse DATABASE_URL. Check Render env value formatting.');
        console.error(`ℹ️ Received DATABASE_URL (redacted): ${redactDatabaseUrlForLogs(normalizedUrl)}`);
        return normalizedUrl;
    }
}
const prismaUrl = buildPrismaUrl();

// ─── SINGLETON PRISMA CLIENT ───────────────────────────────────────────────
const prismaClientSingleton = () => {
    return new PrismaClient({
        log: ['error'],
        datasources: {
            db: { url: buildPrismaUrl() } // dynamically evaluate just in case
        }
    });
};

globalThis.prismaGlobal = globalThis.prismaGlobal ?? prismaClientSingleton();
let prisma = globalThis.prismaGlobal; // Use let so we can recreate it

let isReconnecting = false; // prevents multiple simultaneous reconnects

/**
 * Force Prisma to close the connection pool and discard stale connections.
 * Waits 15 seconds to allow Supabase to fully wake up before recreating.
 */
const reconnectPrisma = async () => {
    if (isReconnecting) {
        console.log('⏳ Reconnect already in progress, waiting 15s...');
        await new Promise(r => setTimeout(r, 15000));
        return prisma;
    }

    isReconnecting = true;
    console.warn('🔄 Reconnecting Prisma Client (clearing stale pool)...');
    try { await prisma.$disconnect(); } catch (e) { }

    // Wait 15s for Supabase to fully wake up (Singapore → Mumbai latency)
    console.log('⏳ Waiting 15s for Supabase to wake up...');
    await new Promise(r => setTimeout(r, 15000));

    prisma = prismaClientSingleton();
    globalThis.prismaGlobal = prisma;

    for (let i = 0; i < 5; i++) {
        try {
            await prisma.$queryRaw`SELECT 1`;
            console.log('✅ Prisma reconnected successfully!');
            isReconnecting = false;
            return prisma;
        } catch (err) {
            console.warn(`⏳ DB not ready yet... (${i + 1}/5)`);
            await new Promise(r => setTimeout(r, 5000 * (i + 1)));
        }
    }

    isReconnecting = false;
    throw new Error('❌ Could not reconnect to Supabase after multiple attempts');
};

// ─── ROBUST QUERY WRAPPER ───────────────────────────────────────────────────
/**
 * Executes a prisma query with automatic retries for transient connection errors.
 * Use this for critical operations like registration and booking.
 */
const withRetry = async (fn, maxRetries = 5) => {
    for (let i = 1; i <= maxRetries; i++) {
        try {
            // we pass current `prisma` to `fn` just in case, though the proxy handles it too
            return await fn(prisma);
        } catch (err) {
            const isConnError =
                err.code === 'P1001' ||
                err.code === 'P1002' ||
                err.message?.includes("Can't reach database") ||
                err.message?.includes("connection pool") ||
                err.code === 'P2024' ||
                err.code === 'P1008';

            if (!isConnError || i === maxRetries) {
                if (isConnError) {
                    console.error(`❌ Prisma transient error ${err.code || 'unknown'} exhausted all ${maxRetries} retries.`);
                }
                throw err;
            }

            console.warn(`⚠️ DB error attempt ${i}/${maxRetries} (Code: ${err.code || 'Unknown'})`);
            // Attempt to recover the connection pool, then loop again
            await reconnectPrisma();
        }
    }
};

/**
 * Warm up the database connection at startup with aggressive retries.
 */
const warmupDatabase = async (maxAttempts = 5, delayMs = 5000) => {
    console.log('⏳ Warming up database connection (SELECT 1)...');
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await prisma.$queryRaw`SELECT 1`;
            console.log('✅ Prisma database connection warmed up successfully.');
            return;
        } catch (err) {
            console.warn(`⚠️ DB Warm-up attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms...`);
            if (attempt < maxAttempts) await new Promise(res => setTimeout(res, delayMs));
        }
    }
    console.warn('⚠️ Warm-up failed — continuing anyway');
};

/**
 * ─── PRISMA GLOBAL PROXY ────────────────────────────────────────────────────
 * Automatically wraps ALL database calls (.findUnique, .create, etc.) with
 * the withRetry logic so we don't need to manually rewrite 70+ controller lines.
 */
const proxiedPrisma = new Proxy({}, {
    get(target, prop) {
        // ALWAYS dereference the fresh dynamically recreated prisma instance
        const currentPrisma = prisma;

        // Skip private or un-proxyable Prisma fields
        if (prop.startsWith('_') || prop === 'then' || prop === 'catch') {
            return Reflect.get(currentPrisma, prop);
        }

        // If it's a top-level command like $queryRaw or $transaction, wrap it
        if (prop.startsWith('$') && prop !== '$disconnect' && prop !== '$connect' && typeof currentPrisma[prop] === 'function') {
            return async (...args) => {
                return await withRetry(() => currentPrisma[prop](...args));
            };
        }

        // Get the model (e.g. prisma.user)
        const model = Reflect.get(currentPrisma, prop);
        if (!model || typeof model !== 'object') return model;

        // Proxy the model's methods (e.g. prisma.user.findMany)
        return new Proxy(model, {
            get(modelTarget, modelProp) {
                const method = Reflect.get(modelTarget, modelProp);
                if (typeof method !== 'function') return method;

                return async (...args) => {
                    return await withRetry(() => method.apply(modelTarget, args));
                };
            }
        });
    }
});

module.exports = proxiedPrisma;
module.exports.warmupDatabase = warmupDatabase;
module.exports.withRetry = withRetry;
module.exports.reconnectPrisma = reconnectPrisma;
