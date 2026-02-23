const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const app = require('./app');
const prisma = require('./config/prisma');

const PORT = process.env.PORT || 5050;

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

            // At server startup — pre-load pricing into cache AFTER warmup completes
            const { getPricingSettings } = require('./controllers/pricing.controller');
            // Do NOT call it here — let it load lazily on first request

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
