const axios = require('axios');

async function testMyFleet() {
    // We need a B2B user token. 
    // I'll check debug_companies.js output to find a B2B user or create one for testing.
    const BASE_URL = 'http://localhost:5050/api/v1';

    try {
        // First, let's look at the database state again to find a valid B2B user
        console.log('Finding B2B user...');
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const b2bUser = await prisma.b2b_user.findFirst({
            include: { user: true }
        });

        if (!b2bUser) {
            console.log('No B2B user found to test with.');
            return;
        }

        console.log(`Testing with user: ${b2bUser.user.email}`);

        // This is a bit complex as we need to login locally. 
        // For debugging, I'll just check the controller logic and run a direct prisma query to see what the API *would* return.

        const companyId = b2bUser.company_id;
        const fleet = await prisma.b2b_company_fleet.findMany({
            where: {
                company_id: companyId,
                is_active: true,
                vehicle: { is_active: true }
            },
            include: { vehicle: true }
        });

        console.log(`Found ${fleet.length} vehicles assigned to company ${companyId}`);
        fleet.forEach(f => {
            console.log(`- ${f.vehicle.name} | Custom Price: ${f.custom_price_per_km}`);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

testMyFleet();
