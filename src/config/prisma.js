const { PrismaClient } = require('@prisma/client');

/**
 * Single shared PrismaClient instance.
 * DATABASE_URL is set directly in Render environment variables.
 * No URL manipulation here — what you set in Render is exactly what Prisma uses.
 */
const prisma = new PrismaClient({
    log: ['error'],
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
