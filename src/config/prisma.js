const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.NODE_ENV === 'production' ? process.env.DATABASE_URL : process.env.DIRECT_URL
        }
    }
});
module.exports = prisma;