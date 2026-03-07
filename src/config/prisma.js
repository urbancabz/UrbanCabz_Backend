const { PrismaClient } = require('@prisma/client');

/**
 * Ensures the DATABASE_URL has the necessary parameters for Supabase/Prisma.
 * Forcefully sets connection_limit=3 to avoid P2024 on Supabase Free Tier.
 */
function buildPrismaUrl(url) {
    if (!url) return url;
    let newUrl = url.trim();
    
    // 1. Remove any existing connection_limit or pool_timeout to force our stable values
    newUrl = newUrl.replace(/([?&])connection_limit=\d+/g, '');
    newUrl = newUrl.replace(/([?&])pool_timeout=\d+/g, '');
    
    // 2. Add stable parameters
    const params = [];
    if (newUrl.includes(':6543') && !newUrl.includes('pgbouncer=true')) {
        params.push('pgbouncer=true');
    }
    if (!newUrl.includes('sslmode=')) {
        params.push('sslmode=require');
    }
    
    // Force these values regardless of what's in the environment string
    params.push('connection_limit=3');
    params.push('pool_timeout=60'); 
    
    // 3. Clean up the URL and append params
    newUrl = newUrl.replace(/[?&]$/, ''); // Remove trailing ? or &
    newUrl += (newUrl.includes('?') ? '&' : '?') + params.join('&');
    
    // Remove double && if any were created
    newUrl = newUrl.replace(/&&+/g, '&');
    
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
