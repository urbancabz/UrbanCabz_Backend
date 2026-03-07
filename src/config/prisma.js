const { PrismaClient } = require('@prisma/client');

/**
 * Single shared PrismaClient instance.
 * Using a small connection_limit (3) because Supabase free tier allows only 10 connections total.
 * This ensures we don't exhaust the pool when Render is restarting or if multiple tabs are open.
 */
const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('connection_limit')
                ? process.env.DATABASE_URL
                : `${process.env.DATABASE_URL}${process.env.DATABASE_URL && process.env.DATABASE_URL.includes('?') ? '&' : '?'}connection_limit=3&pool_timeout=60`
        }
    }
});

/**
 * Warm up the database connection at startup.
 * Aggressively retries every 8 seconds for up to 40 seconds to allow Supabase to wake up.
 */
const warmupDatabase = async (maxAttempts = 5, delayMs = 8000) => {
    console.log('⏳ Warming up database connection...');
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await prisma.$queryRaw`SELECT 1`;
            console.log('✅ Database connection established.');
            return;
        } catch (err) {
            console.warn(`⚠️ DB Warm-up attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
            if (attempt < maxAttempts) {
                console.log(`⏳ Waiting ${delayMs}ms before retry...`);
                await new Promise(res => setTimeout(res, delayMs));
            }
        }
    }
    console.warn('⚠️ Warm-up failed after max retries — continuing anyway');
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
