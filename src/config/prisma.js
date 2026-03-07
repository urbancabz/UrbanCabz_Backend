const { PrismaClient } = require('@prisma/client');

let safeUrl = process.env.DATABASE_URL || '';
// Strip accidental quotes or prefixes from Render dashboard
safeUrl = safeUrl.replace(/^DATABASE_URL\s*=\s*/i, '').replace(/^['"`]+|['"`]+$/g, '').trim();

if (safeUrl) {
    try {
        const urlObj = new URL(safeUrl);
        urlObj.searchParams.set('connection_limit', '3'); // Strict limit to prevent P2024 pool drops on Supabase free tier
        urlObj.searchParams.set('pool_timeout', '60');
        urlObj.searchParams.set('connect_timeout', '60');
        urlObj.searchParams.set('pgbouncer', 'true');
        safeUrl = urlObj.toString();
        process.env.DATABASE_URL = safeUrl; // Update internally for schema.prisma
    } catch (e) {
        console.warn('⚠️ Could not parse DATABASE_URL to inject timeout parameters.', e.message);
    }
}

/**
 * Single shared PrismaClient instance.
 * Parameters injected safely at runtime, keeping the rest of the codebase pure.
 */
const prisma = new PrismaClient({
    log: ['error'],
    datasources: safeUrl ? { db: { url: safeUrl } } : undefined
});

/**
 * Warm up the database connection at startup.
 * A single lightweight query to verify the pool is ready before traffic arrives.
 * Logs a warning and continues if it fails — the server will still start.
 */
const warmupDatabase = async () => {
    console.log('⏳ Warming up database connection...');
    for (let i = 0; i < 8; i++) {
        try {
            await prisma.$queryRaw`SELECT 1`;
            console.log('✅ Prisma database connection warmed up successfully.');
            return;
        } catch (err) {
            console.warn(`⏳ DB not ready (${i + 1}/8), retrying in 5s... [${err.code || 'timeout'}]`);
            // Wait 5 seconds before trying again
            await new Promise(r => setTimeout(r, 5000));
        }
    }
    console.warn('⚠️ Warm-up failed completely after 40 seconds. Server will start, but first requests may fail.');
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
