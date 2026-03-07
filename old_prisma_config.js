const { PrismaClient } = require('@prisma/client');

/**
 * Single shared PrismaClient instance.
 * DATABASE_URL is set directly in Render environment variables.
 * No URL manipulation here ΓÇö what you set in Render is exactly what Prisma uses.
 */
const prisma = new PrismaClient({
    log: ['error'],
});

/**
 * Warm up the database connection at startup.
 * A single lightweight query to verify the pool is ready before traffic arrives.
 * Logs a warning and continues if it fails ΓÇö the server will still start.
 */
const warmupDatabase = async () => {
    console.log('ΓÅ│ Warming up database connection...');
    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('Γ£à Prisma database connection warmed up successfully.');
    } catch (err) {
        console.warn('ΓÜá∩╕Å Warm-up failed, continuing anyway:', err.message);
    }
};

// Graceful shutdown ΓÇö release DB connections cleanly
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
