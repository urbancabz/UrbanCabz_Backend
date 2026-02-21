const { PrismaClient } = require('@prisma/client');

async function testConnection(urlInfo, url) {
    const prisma = new PrismaClient({
        datasources: { db: { url } },
    });

    try {
        console.log(`Attempting connection: ${urlInfo}`);
        await prisma.$connect();
        console.log(`[SUCCESS] Connected to ${urlInfo}`);
        const count = await prisma.user.count();
        console.log(`Found ${count} users.`);
    } catch (error) {
        console.error(`[FAILED] Connection to ${urlInfo}:`);
        console.error(error.message);
    } finally {
        await prisma.$disconnect();
    }
}

async function main() {
    const urlTransactionPooler = "postgresql://postgres.lbkbntmwimonghcctvtl:Urbancabz%4003@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1";
    const urlSessionPooler = "postgresql://postgres.lbkbntmwimonghcctvtl:Urbancabz%4003@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";

    await testConnection("Transaction Pooler", urlTransactionPooler);
    await testConnection("Session Pooler", urlSessionPooler);
}

main();
