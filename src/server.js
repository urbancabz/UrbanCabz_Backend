const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const app = require('./app');
const prisma = require('./config/prisma');
const { warmupDatabase, withRetry } = require('./config/prisma');
const cache = require('./utils/cache');

const PORT = process.env.PORT || 5050;

// ═══════════════════════════════════════════════════════════════
// STARTUP CACHE PRELOAD: Load heavy data into cache so the first
// user request always hits cache and never hammers DB.
// ═══════════════════════════════════════════════════════════════
async function preloadCaches() {
    try {
        console.log('⏳ Preloading caches...');

        // Pricing settings — cached for 30 minutes (matches PRICING_CACHE_TTL in controller)
        const pricing = await withRetry(() => prisma.pricing_settings.findFirst(), 'preload:pricing');
        if (pricing) {
            cache.set('pricing_settings', pricing, 30 * 60);
            console.log('  ✅ Pricing cache loaded');
        }

        // Small delay between preload queries to avoid bursting all pool connections at once
        await new Promise(r => setTimeout(r, 500));

        // Active fleet — cached for 2 minutes
        const fleet = await withRetry(() => prisma.fleet_vehicle.findMany({
            where: { is_active: true },
            orderBy: { category: 'asc' }
        }), 'preload:fleet_active');
        cache.set('fleet_vehicles_true', fleet, 120);
        console.log(`  ✅ Active fleet cache loaded (${fleet.length} vehicles)`);

        await new Promise(r => setTimeout(r, 500));

        // All fleet vehicles — cached for 2 minutes
        const allFleet = await withRetry(() => prisma.fleet_vehicle.findMany({
            orderBy: { category: 'asc' }
        }), 'preload:fleet_all');
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
    console.log('⏳ Warming up database connection...');

    try {
        await warmupDatabase();
        console.log('✅ Database connection established.');

        // Preload caches AFTER warmup completes
        await preloadCaches();
    } catch (err) {
        console.error('❌ Could not connect to database during startup. Starting server anyway...');
        console.error(err.message);
    }

    app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}

startServer();
