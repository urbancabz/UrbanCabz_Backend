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

// HEARTBEAT: Prevent silent TCP connection drops by cross-region NAT firewalls (Render SG -> Supabase IN)
// This aggressively touches up to 5 connections in the pool every 2 minutes.
setInterval(() => {
    Promise.allSettled(
        Array.from({ length: 5 }).map(() =>
            prisma.$queryRawUnsafe('SELECT 1')
        )
    ).catch(() => { });
}, 2 * 60 * 1000); // 2 minutes

module.exports = prisma;
