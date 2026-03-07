const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

// Use the DATABASE_URL as provided in the environment. 
// We previously forced port 5432 on Render, but logs show 5432 is failing 
// while 6543 (Transaction Mode) handled 100+ concurrent requests successfully.
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
// to wake up. We wait for a successful ping before binding to the port.
// ═══════════════════════════════════════════════════════════════
console.log('🚀 Starting server initialization...');

warmupDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`✅ Server listening on ${PORT}`);
            preloadCaches().catch(err => {
                console.warn('⚠️ Background cache preload failed:', err.message);
            });

            // Keep-alive mechanism to prevent Render from sleeping (free tier sleeps after 15 mins)
            setInterval(() => {
                const url = process.env.RENDER_EXTERNAL_URL || 'https://urbancabz-backend.onrender.com';
                console.log(`PINGING self at ${url}/health to prevent sleep...`);
                fetch(`${url}/health`)
                    .then(res => console.log(`Keep-alive ping successful: ${res.status}`))
                    .catch(err => console.error(`Keep-alive ping failed:`, err.message));
            }, 14 * 60 * 1000); // 14 minutes
        });
    })
    .catch(err => {
        console.error('❌ FATAL: Database warmup failed completely after max retries.', err);
        process.exit(1);
    });

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────────────
const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 ${signal} received. Closing database connections gracefully...`);
    try {
        await prisma.$disconnect();
        console.log('✅ Prisma disconnected successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during database disconnect:', err.message);
        process.exit(1);
    }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
