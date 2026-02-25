const { PrismaClient } = require('@prisma/client');

function hardenDatabaseUrl(url) {
    if (!url) return url;

    // Strip existing pool/ssl params to avoid conflicts.
    const cleanUrl = url
        .replace(/[&?]connection_limit=\d+/g, '')
        .replace(/[&?]pool_timeout=\d+/g, '')
        .replace(/[&?]connect_timeout=\d+/g, '')
        .replace(/[&?]pgbouncer=\w+/g, '')
        .replace(/[&?]statement_cache_size=\d+/g, '')
        .replace(/[&?]sslmode=[^&]+/g, '')
        .replace(/\?&/, '?')
        .replace(/[?&]$/, '');
    const separator = cleanUrl.includes('?') ? '&' : '?';

    // Supabase session pooler + Prisma-safe settings.
    return `${cleanUrl}${separator}connection_limit=5&pool_timeout=20&connect_timeout=15&pgbouncer=true&statement_cache_size=0&sslmode=require`;
}

const productionUrl = hardenDatabaseUrl(process.env.DATABASE_URL);
const devUrl = hardenDatabaseUrl(process.env.DIRECT_URL || process.env.DATABASE_URL);

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.NODE_ENV === 'production' ? productionUrl : devUrl
        }
    },
    log: ['warn', 'error'],
});

// ═══════════════════════════════════════════════════════════════
// P2024 RETRY WRAPPER
// Auto-retries any database operation that fails with P2024
// (connection pool timeout) using exponential backoff.
// Usage: const result = await withRetry(() => prisma.user.findUnique({ ... }));
// ═══════════════════════════════════════════════════════════════
const MAX_RETRY_ATTEMPTS = 3;

async function withRetry(fn, label = 'db-op') {
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (error.code === 'P2024' && attempt < MAX_RETRY_ATTEMPTS) {
                const delay = attempt * 500 + Math.random() * 300; // 500-800ms, 1000-1300ms
                console.warn(`⚠️ P2024 retry ${attempt}/${MAX_RETRY_ATTEMPTS} for ${label} — waiting ${Math.round(delay)}ms`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw error;
        }
    }
}

// Maximum 2 retries for warm up
const MAX_WARMUP_RETRIES = 2;

async function warmupDatabase() {
    let lastError;
    for (let attempt = 1; attempt <= MAX_WARMUP_RETRIES; attempt++) {
        try {
            await prisma.$queryRaw`SELECT 1`;
            console.log('✅ Prisma database connection warmed up successfully.');
            return;
        } catch (error) {
            lastError = error;
            if (error.code === 'P2024') {
                console.error(`❌ Prisma pool exhausted (P2024). Failing fast on attempt ${attempt}...`);
                throw error;
            }
            console.warn(`⚠️ Prisma warmup retry ${attempt}/${MAX_WARMUP_RETRIES} failed: ${error.message}`);
            if (attempt < MAX_WARMUP_RETRIES) {
                await new Promise(r => setTimeout(r, attempt * 1000));
            }
        }
    }
    console.error('❌ Failed to warm up Prisma database after maximum retries:', lastError?.message);
}

// Warmup is triggered externally from server.js — do not auto-run here.

// Handle graceful shutdown to avoid leaking connections
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

// Export prisma client and helpers
module.exports = prisma;
module.exports.withRetry = withRetry;
module.exports.warmupDatabase = warmupDatabase;
