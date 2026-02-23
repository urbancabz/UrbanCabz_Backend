const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const app = require('./app');
const prisma = require('./config/prisma');
const cache = require('./utils/cache');

const PORT = process.env.PORT || 5050;

// ═══════════════════════════════════════════════════════════════
// STARTUP CACHE PRELOAD: Load heavy data into cache so the first
// user request always hits cache and never hammers DB.
// ═══════════════════════════════════════════════════════════════
async function preloadCaches() {
    try {
        console.log('⏳ Preloading caches...');

        // Pricing settings — cached for 5 minutes
        const pricing = await prisma.pricing_settings.findFirst();
        if (pricing) {
            cache.set('pricing_settings', pricing, 300);
            console.log('  ✅ Pricing cache loaded');
        }

        // Active fleet — cached for 2 minutes
        const fleet = await prisma.fleet_vehicle.findMany({
            where: { is_active: true },
            orderBy: { category: 'asc' }
        });
        cache.set('fleet_vehicles_true', fleet, 120);
        cache.set('fleet_vehicles_all', await prisma.fleet_vehicle.findMany({ orderBy: { category: 'asc' } }), 120);
        console.log(`  ✅ Fleet cache loaded (${fleet.length} vehicles)`);

        console.log('✅ All caches preloaded');
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

    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            await prisma.$queryRawUnsafe('SELECT 1');
            console.log('✅ Database connection established.');

            // Preload caches AFTER warmup completes
            await preloadCaches();

            break;
        } catch (err) {
            console.warn(`⚠️  DB warm-up attempt ${attempt}/5 failed: ${err.message}`);
            if (attempt === 5) {
                console.error('❌ Could not connect to database after 5 attempts. Starting server anyway...');
            } else {
                await new Promise(r => setTimeout(r, 3000)); // Wait 3 seconds between retries
            }
        }
    }

    app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}

startServer();
