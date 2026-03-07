const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

const app = require('./app');
const prisma = require('./config/prisma');
const { warmupDatabase } = require('./config/prisma');
const cache = require('./utils/cache');

const PORT = process.env.PORT || 5050;

async function preloadCaches() {
    // Each query runs strictly one at a time with a 2s gap — avoids pool exhaustion
    // on Supabase free tier (connection_limit=3)
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    try {
        console.log('⏳ Preloading caches...');

        await delay(2000); // let warmup connection settle
        const pricing = await prisma.pricing_settings.findFirst();
        if (pricing) {
            cache.set('pricing_settings', pricing, 30 * 60);
            console.log('  ✅ Pricing cache loaded');
        }

        await delay(2000);
        const fleet = await prisma.fleet_vehicle.findMany({
            where: { is_active: true },
            orderBy: { category: 'asc' }
        });
        cache.set('fleet_vehicles_true', fleet, 120);
        console.log(`  ✅ Active fleet cache loaded (${fleet.length} vehicles)`);

        await delay(2000);
        const allFleet = await prisma.fleet_vehicle.findMany({ orderBy: { category: 'asc' } });
        cache.set('fleet_vehicles_all', allFleet, 120);
        console.log(`  ✅ All fleet cache loaded (${allFleet.length} vehicles)`);

        console.log('✅ All caches preloaded successfully');
    } catch (err) {
        console.warn('⚠️  Cache preload failed, will load on first request:', err.message);
    }
}

console.log('🚀 Starting server initialization...');

// ── Bind port FIRST so Render never kills us for being slow to listen ──────
app.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);

    // Keep-alive ping every 14 min so Render free tier never sleeps
    setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL || 'https://urbancabz-backend.onrender.com';
        fetch(`${url}/health`)
            .then(res => console.log(`Keep-alive ping: ${res.status}`))
            .catch(err => console.error(`Keep-alive ping failed:`, err.message));
    }, 14 * 60 * 1000);
});

// ── Warmup + cache preload in background — does NOT block the port ─────────
warmupDatabase()
    .then(() => preloadCaches())
    .catch(err => {
        // Not fatal — requests still work, cache loads on first hit
        console.warn('⚠️ Background warmup failed:', err.message);
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
