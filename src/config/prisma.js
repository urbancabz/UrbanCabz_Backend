const { PrismaClient } = require('@prisma/client');

function hardenDatabaseUrl(url) {
    if (!url) return url;
    // Strip existing pool params to avoid conflicts
    let cleanUrl = url
        .replace(/[&?]connection_limit=\d+/g, '')
        .replace(/[&?]pool_timeout=\d+/g, '')
        .replace(/[&?]connect_timeout=\d+/g, '')
        .replace(/[&?]pgbouncer=\w+/g, '');
    const separator = cleanUrl.includes('?') ? '&' : '?';

    // Only use pgbouncer=true if specifically using port 6543 (Supabase connection pooler)
    const isPgBouncer = cleanUrl.includes(':6543') ? '&pgbouncer=true' : '';

    // Set connection limit to 20 as per your requirements
    return `${cleanUrl}${separator}connection_limit=20&pool_timeout=30&connect_timeout=30${isPgBouncer}`;
}

const productionUrl = hardenDatabaseUrl(process.env.DATABASE_URL);
const devUrl = hardenDatabaseUrl(process.env.DIRECT_URL || process.env.DATABASE_URL);

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.NODE_ENV === 'production' ? productionUrl : devUrl
        }
    },
    // Optionally log warnings/errors
    log: ['warn', 'error'],
});

// Maximum 2 retries for warm up
const MAX_RETRIES = 2;

async function warmupDatabase() {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Use prisma.$queryRaw instead of unsupported $queryRawUnsafe
            await prisma.$queryRaw`SELECT 1`;
            console.log('✅ Prisma database connection warmed up successfully.');
            return; // Exit on success
        } catch (error) {
            lastError = error;

            // Fail fast mechanism for pool exhaustion
            if (error.code === 'P2024') {
                console.error(`❌ Prisma pool exhausted (P2024). Failing fast on attempt ${attempt}...`);
                throw error;
            }

            console.warn(`⚠️ Prisma warmup retry ${attempt}/${MAX_RETRIES} failed: ${error.message}`);

            // Wait with a small backoff before retrying
            if (attempt < MAX_RETRIES) {
                const delay = attempt * 1000;
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    console.error('❌ Failed to warm up Prisma database after maximum retries:', lastError?.message);
}

// Trigger warmup asynchronously
warmupDatabase().catch(() => { });

// Handle graceful shutdown to avoid leaking connections
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

// Export a single PrismaClient instance
module.exports = prisma;
