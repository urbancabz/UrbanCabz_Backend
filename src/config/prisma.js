// Exact copy from urbancabz_old/BackEnd/BackEnd/urban-cabz-backend/src/config/prisma.js
const { PrismaClient } = require('@prisma/client');

/**
 * Single shared PrismaClient instance.
 * DATABASE_URL is set directly in Render environment variables.
 * No URL manipulation here — what you set in Render is exactly what Prisma uses.
 */
// Render Environment Variable Fix:
// If the user accidentally pasted `DATABASE_URL=...` or wrapped it in quotes `"postgresql://..."`
// inside the Render dashboard, this cleans it up because Prisma fails if it doesn't start with postgresql://.
let safeUrl = process.env.DATABASE_URL || '';
safeUrl = safeUrl.replace(/^DATABASE_URL\s*=\s*/i, '').replace(/^['"`]+|['"`]+$/g, '').trim();
if (safeUrl) {
    process.env.DATABASE_URL = safeUrl; // Ensure internal Prisma engines use the cleaned URL
}

/**
 * Single shared PrismaClient instance.
 * DATABASE_URL is set directly in Render environment variables.
 * No URL manipulation here — what you set in Render is exactly what Prisma uses.
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
