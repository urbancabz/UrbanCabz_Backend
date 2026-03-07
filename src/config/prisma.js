const { PrismaClient } = require('@prisma/client');

/**
 * Single shared PrismaClient instance.
 * DATABASE_URL is set directly in Render environment variables.
 * No URL manipulation here — what you set in Render is exactly what Prisma uses.
 */
const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});

/**
 * Warm up the database connection at startup.
 * A single lightweight query to verify the pool is ready before traffic arrives.
 * Logs a warning and continues if it fails — the server will still start.
 */
const warmupDatabase = async (maxAttempts = 5, delayMs = 5000) => {
    console.log('⏳ Warming up database connection (SELECT 1)...');
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await prisma.$queryRaw`SELECT 1`;
            console.log('✅ Prisma database connection warmed up successfully.');
            return;
        } catch (err) {
            console.warn(`⚠️ DB Warm-up attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms...: ${err.message}`);
            if (attempt < maxAttempts) await new Promise(res => setTimeout(res, delayMs));
        }
    }
    console.warn('⚠️ Warm-up failed — continuing anyway');
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
