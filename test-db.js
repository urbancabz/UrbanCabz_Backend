const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Attempting to connect to the database...");
        await prisma.$connect();
        console.log("Successfully connected to the database!");

        // Test a simple query
        const userCount = await prisma.user.count();
        console.log(`Database query successful. Total users: ${userCount}`);

    } catch (error) {
        console.error("Database connection failed:");
        console.error(error);
    } finally {
        await prisma.$disconnect();
        console.log("Disconnected.");
    }
}

main();
