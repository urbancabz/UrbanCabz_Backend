const { PrismaClient } = require('@prisma/client');

/**
 * Ensures the DATABASE_URL has the necessary parameters for Supabase/Prisma.
 * Forcefully sets connection_limit=3 to avoid P2024 on Supabase Free Tier.
 */
function buildPrismaUrl(url) {
    if (!url) return url;
    let newUrl = url.trim();

    // 1. Remove any existing connection parameters to force our stable values
    newUrl = newUrl.replace(/([?&])connection_limit=\d+/g, '');
    newUrl = newUrl.replace(/([?&])pool_timeout=\d+/g, '');
    newUrl = newUrl.replace(/([?&])connect_timeout=\d+/g, '');

    // 2. Add stable parameters
    const params = [];
    if (newUrl.includes(':6543') && !newUrl.includes('pgbouncer=true')) {
        params.push('pgbouncer=true');
    }
    if (!newUrl.includes('sslmode=')) {
        params.push('sslmode=require');
    }

    // Optimization for Render -> Singapore Supabase
    params.push('connection_limit=10'); // Increase from 3 to 10 for more headroom
    params.push('pool_timeout=40');     // Wait up to 40s for a connection from the pool
    params.push('connect_timeout=30');  // Wait up to 30s for the initial handshake

    // 3. Clean up the URL and append params
    newUrl = newUrl.replace(/[?&]$/, ''); // Remove trailing ? or &
    newUrl += (newUrl.includes('?') ? '&' : '?') + params.join('&');

    // Remove double && if any were created
    newUrl = newUrl.replace(/&&+/g, '&');

    // Log obfuscated URL for debugging
    const obfuscated = newUrl.replace(/:([^@]+)@/, ':****@');
    console.log(`📡 Prisma configured with URL: ${obfuscated}`);

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

            // Helpful diagnostics for local developers
            if (err.message.includes('Can\'t reach database server')) {
                console.error('\n❌ LOCAL CONNECTIVITY ERROR DETECTED:');

                if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes(':5432')) {
                    console.error('⚠️  YOUR DATABASE_URL IS USING PORT 5432 (Session Pooler).');
                    console.error('⚠️  Prisma works most reliably with the Transaction Pooler (Port 6543).');
                    console.error('👉 Please update your .env to use the URL provided in the Supabase Dashboard -> Settings -> Database -> Connection string (Node.js/Prisma -> Transaction Mode).');
                }

                console.error('1. Check if your public IP is whitelisted in Supabase Settings -> Database -> Network Restriction.');
                console.error('2. Ensure port 5432 or 6543 isn\'t blocked by your ISP or Firewall.');
                console.error('3. Check if your database is "Paused" in the Supabase Dashboard.\n');
            }

            if (attempt < maxAttempts) {
                console.log(`⏳ Waiting ${delayMs}ms before retry...`);
                await new Promise(res => setTimeout(res, delayMs));
            }
        }
    }
    console.error('❌ FATAL: Could not connect to database after maximum retries.');
    throw new Error('Database connection failed - please whitelist your IP in the Supabase dashboard.');
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
