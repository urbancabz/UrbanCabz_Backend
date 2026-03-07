const { PrismaClient } = require('@prisma/client');

// Use DATABASE_URL exactly as set in the environment — all params already embedded in the URL.
const createPrismaClient = () => new PrismaClient({ log: ['error', 'warn'] });

let prisma = global.prisma ?? createPrismaClient();
global.prisma = prisma;

let isReconnecting = false;

const reconnectPrisma = async () => {
    if (isReconnecting) {
        await new Promise(r => setTimeout(r, 15000));
        return;
    }
    isReconnecting = true;
    try { await prisma.$disconnect(); } catch (_) {}
    await new Promise(r => setTimeout(r, 5000));
    prisma = createPrismaClient();
    global.prisma = prisma;
    isReconnecting = false;
};

const withRetry = async (fn, retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isConnErr =
                err.code === 'P1001' || err.code === 'P1002' ||
                err.message?.includes("Can't reach database") ||
                err.message?.includes("connection pool") ||
                err.message?.includes("Timed out fetching");
            if (isConnErr && attempt < retries) {
                console.warn(`⚠️ Prisma transient error ${err.code}. Retrying in ${attempt * 500}ms... (Attempt ${attempt}/${retries})`);
                await new Promise(r => setTimeout(r, attempt * 500));
                if (attempt === 2) await reconnectPrisma();
                continue;
            }
            throw err;
        }
    }
};

const warmupDatabase = async () => {
    console.log('⏳ Warming up database connection...');
    for (let i = 0; i < 8; i++) {
        try {
            await prisma.$queryRaw`SELECT 1`;
            console.log('✅ Database warmed up successfully!');
            return;
        } catch (_) {
            console.warn(`⏳ DB not ready (${i + 1}/8), retrying in 5s...`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
    console.warn('⚠️ DB warmup timed out — will retry on first request');
};

// Proxy always reads the current `prisma` variable (handles reconnects transparently)
const proxiedPrisma = new Proxy({}, {
    get(_, prop) {
        const p = prisma;
        if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
        if (typeof p[prop] === 'function') {
            return (...args) => withRetry(() => p[prop](...args));
        }
        const model = p[prop];
        if (!model || typeof model !== 'object') return model;
        return new Proxy(model, {
            get(modelTarget, modelProp) {
                const method = modelTarget[modelProp];
                if (typeof method !== 'function') return method;
                return (...args) => withRetry(() => method.apply(modelTarget, args));
            }
        });
    }
});

module.exports = { prisma: proxiedPrisma, reconnectPrisma, withRetry, warmupDatabase };
