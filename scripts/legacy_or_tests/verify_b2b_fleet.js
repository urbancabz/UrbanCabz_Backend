const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyB2BFleet() {
    console.log('--- Starting B2B Fleet Verification ---');

    try {
        // 1. Get a B2B Company
        console.log('1. Fetching a B2B Company...');
        let company = await prisma.b2b_company.findFirst();

        if (!company) {
            console.log('No company found. Creating test company...');
            company = await prisma.b2b_company.create({
                data: {
                    company_name: "Test Fleet Corp",
                    company_email: "fleet@test.com",
                    company_phone: "1234567890"
                }
            });
        }
        console.log(`Using Company: ${company.company_name} (ID: ${company.id})`);

        // 2. Get a Vehicle
        console.log('2. Fetching a Global Fleet Vehicle...');
        const vehicle = await prisma.fleet_vehicle.findFirst({
            where: { is_active: true }
        });

        if (!vehicle) {
            console.error('No active vehicles found in global fleet! Please seed fleet first.');
            return;
        }
        console.log(`Using Vehicle: ${vehicle.name} (ID: ${vehicle.id}) | Base Price: ${vehicle.base_price_per_km}`);

        // 3. Assign Vehicle to Company with Custom Price
        console.log('3. Assigning Vehicle to Company with Custom Price...');
        const customPrice = vehicle.base_price_per_km + 5; // Add 5 to base price

        const assignment = await prisma.b2b_company_fleet.upsert({
            where: {
                company_id_fleet_vehicle_id: {
                    company_id: company.id,
                    fleet_vehicle_id: vehicle.id
                }
            },
            update: {
                custom_price_per_km: customPrice,
                is_active: true
            },
            create: {
                company_id: company.id,
                fleet_vehicle_id: vehicle.id,
                custom_price_per_km: customPrice,
                is_active: true
            }
        });
        console.log(`Assigned! Custom Price: ${assignment.custom_price_per_km}`);

        // 4. Verify "My Fleet" logic
        console.log('4. Verifying "My Fleet" fetching logic...');
        const assignedFleet = await prisma.b2b_company_fleet.findMany({
            where: {
                company_id: company.id,
                is_active: true
            },
            include: {
                vehicle: true
            }
        });

        if (assignedFleet.length > 0) {
            console.log('SUCCESS: Retrieved assigned fleet!');
            assignedFleet.forEach(item => {
                const effectivePrice = item.custom_price_per_km;
                console.log(`- ${item.vehicle.name}: Custom Price ${effectivePrice} (Base ${item.vehicle.base_price_per_km})`);

                if (effectivePrice === customPrice) {
                    console.log('  -> Price Verification PASSED');
                } else {
                    console.error('  -> Price Verification FAILED');
                }
            });
        } else {
            console.error('FAILED: No fleet returned for company.');
        }

    } catch (error) {
        console.error('Verification Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verifyB2BFleet();
