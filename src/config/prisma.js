// Fix 1: Exact Prisma config provided by user, augmented with a Proxy at the very end to prevent controller crash.

const { PrismaClient } = require('@prisma/client');

// Ensure the connection string forces long timeouts so Render has time to wake Supabase
const getOptimizedUrl = () => {
    let url = process.env.DATABASE_URL || '';
    if (url && !url.includes('connect_timeout')) {
        url += url.includes('?') ? '&' : '?';
        url += 'connect_timeout=60&pool_timeout=60&socket_timeout=60';
    }
    return url;
};

const createPrismaClient = () => {
    return new PrismaClient({
        log: ['error', 'warn'],
        datasources: {
            db: { url: getOptimizedUrl() }
        }
    });
};

let prisma = global.prisma ?? createPrismaClient();
global.prisma = prisma;

let isReconnecting = false;

const reconnectPrisma = async () => {
    if (isReconnecting) {
        await new Promise(r => setTimeout(r, 15000));
        return prisma;
    }
    isReconnecting = true;
    try { await prisma.$disconnect(); } catch (_) { }
    await new Promise(r => setTimeout(r, 15000));

    prisma = createPrismaClient();
    global.prisma = prisma;
    for (let i = 0; i < 5; i++) {
        try {
            await prisma.$queryRaw`SELECT 1`;
            console.log('✅ Prisma reconnected!');
            isReconnecting = false;
            return prisma;
        } catch (_) {
            await new Promise(r => setTimeout(r, 5000 * (i + 1)));
        }
    }
    isReconnecting = false;
    return prisma;
};

const withRetry = async (operation, retries = 5) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await operation(prisma);
        } catch (error) {
            const isConnError =
                error.code === 'P1001' ||
                error.code === 'P1002' ||
                error.message?.includes("Can't reach database") ||
                error.message?.includes("connection pool");
            if (isConnError && attempt < retries) {
                console.warn(`⚠️ DB error attempt ${attempt}/${retries}, reconnecting...`);
                prisma = await reconnectPrisma();
                continue;
            }
            throw error;
        }
    }
};

const warmupDatabase = async () => {
    console.log('⏳ Warming up database connection...');
    for (let i = 0; i < 5; i++) {
        try {
            await prisma.$queryRaw`SELECT 1`;
            console.log('✅ Database warmed up successfully!');
            return;
        } catch (_) {
            console.warn(`⏳ DB not ready (${i + 1}/5), retrying in 5s...`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
    console.warn('⚠️ DB warmup failed — will retry on first request');
};

const proxiedPrisma = new Proxy({}, {
    get(target, prop) {
        const currentPrisma = prisma;
        if (prop.startsWith('_') || prop === 'then' || prop === 'catch') return Reflect.get(currentPrisma, prop);
        if (prop.startsWith('$') && prop !== '$disconnect' && typeof currentPrisma[prop] === 'function') {
            return async (...args) => await withRetry((p) => currentPrisma[prop](...args));
        }
        const model = Reflect.get(currentPrisma, prop);
        if (!model || typeof model !== 'object') return model;
        return new Proxy(model, {
            get(modelTarget, modelProp) {
                const method = Reflect.get(modelTarget, modelProp);
                if (typeof method !== 'function') return method;
                return async (...args) => await withRetry((p) => method.apply(modelTarget, args));
            }
        });
    }
});

// ✅ CommonJS export — ALL functions exported here
module.exports = { prisma: proxiedPrisma, reconnectPrisma, withRetry, warmupDatabase };
