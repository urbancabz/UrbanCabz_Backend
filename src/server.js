const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

// Force session pooler (port 5432) — Render blocks port 6543 (transaction pooler)
// But only do this on Render/production. Local development should use the preferred port.
if (process.env.RENDER && process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace(':6543', ':5432').replace('?pgbouncer=true', '').replace('&pgbouncer=true', '').split('&connection_limit')[0].split('&pool_timeout')[0].split('&connect_timeout')[0];
}
if (process.env.RENDER && process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.DIRECT_URL.replace(':6543', ':5432').replace('?pgbouncer=true', '').replace('&pgbouncer=true', '').split('&connection_limit')[0].split('&pool_timeout')[0].split('&connect_timeout')[0];
}
const app = require('./app');
const prisma = require('./config/prisma');
const { warmupDatabase } = require('./config/prisma');
const cache = require('./utils/cache');

const PORT = process.env.PORT || 5050;

// ═══════════════════════════════════════════════════════════════
// STARTUP CACHE PRELOAD: Load heavy data into cache so the first
// user request always hits cache and never hammers DB.
// Queries are sequential with staggered delays to prevent
// connection burst during cold start.
// ═══════════════════════════════════════════════════════════════
async function preloadCaches() {
    try {
        console.log('⏳ Preloading caches...');

        // Pricing settings — cached for 30 minutes (matches PRICING_CACHE_TTL in controller)
        const pricing = await prisma.pricing_settings.findFirst();
        if (pricing) {
            cache.set('pricing_settings', pricing, 30 * 60);
            console.log('  ✅ Pricing cache loaded');
        }

        // Stagger queries to avoid connection burst on startup
        await new Promise(r => setTimeout(r, 500));

        // Active fleet — cached for 2 minutes
        const fleet = await prisma.fleet_vehicle.findMany({
            where: { is_active: true },
            orderBy: { category: 'asc' }
        });
        cache.set('fleet_vehicles_true', fleet, 120);
        console.log(`  ✅ Active fleet cache loaded (${fleet.length} vehicles)`);

        await new Promise(r => setTimeout(r, 500));

        // All fleet vehicles — cached for 2 minutes
        const allFleet = await prisma.fleet_vehicle.findMany({ orderBy: { category: 'asc' } });
        cache.set('fleet_vehicles_all', allFleet, 120);
        console.log(`  ✅ All fleet cache loaded (${allFleet.length} vehicles)`);

        console.log('✅ All caches preloaded successfully');
    } catch (err) {
        console.warn('⚠️  Cache preload failed, will load on first request:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// WARM-UP: Establish a DB connection BEFORE accepting any traffic.
// On Render free tier, Supabase's pooler can take 10-30 seconds
// to wake up. If we accept requests before the pool is ready,
// every single request queues against the pool simultaneously
// and they ALL timeout at 20 seconds, crashing the server.
// ═══════════════════════════════════════════════════════════════
async function startServer() {
    try {
        await warmupDatabase();

        // Preload caches AFTER warmup completes
        await preloadCaches();
    } catch (err) {
        console.error('❌ Could not connect to database during startup. Starting server anyway...');
        console.error(err.message);
    }

    app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}

startServer();
