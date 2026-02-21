const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.NODE_ENV === 'production'
                ? process.env.DATABASE_URL
                : process.env.DIRECT_URL || process.env.DATABASE_URL
        }
    },
    log: ['warn', 'error'],
});

// Gracefully disconnect Prisma when server shuts down (prevents connection leaks on Render restarts)
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

module.exports = prisma;
