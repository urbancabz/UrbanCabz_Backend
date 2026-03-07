const { PrismaClient } = require('@prisma/client');

/**
 * Ensures the DATABASE_URL has the necessary parameters for Supabase/Prisma.
 */
function buildPrismaUrl(url) {
    if (!url) return url;
    let newUrl = url.trim();
    
    // Base parameters for Supabase stability
    const params = [];
    if (newUrl.includes(':6543') && !newUrl.includes('pgbouncer=true')) {
        params.push('pgbouncer=true');
    }
    if (!newUrl.includes('sslmode=')) {
        params.push('sslmode=require');
    }
    
    // CRITICAL: Lower connection limit for Supabase Free Tier (Max 10 total)
    // We use 3 to leave room for migrations, dashboard, and Render zero-downtime deploys.
    if (!newUrl.includes('connection_limit=')) {
        params.push('connection_limit=3');
    }
    if (!newUrl.includes('pool_timeout=')) {
        params.push('pool_timeout=60'); // 60 seconds wait instead of 10
    }
    
    if (params.length > 0) {
        newUrl += (newUrl.includes('?') ? '&' : '?') + params.join('&');
    }
    
    return newUrl;
}

const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: buildPrismaUrl(process.env.DATABASE_URL)
        }
    }
});

/**
 * Warm up the database connection at startup.
 * Supabase free tier can take 20-30 seconds to wake up.
 * We retry every 5 seconds for up to 10 attempts (50 seconds total).
 */
const warmupDatabase = async (maxAttempts = 10, delayMs = 5000) => {
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
    console.error('❌ FATAL: Could not connect to database after maximum retries.');
    throw new Error('Database connection failed');
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
