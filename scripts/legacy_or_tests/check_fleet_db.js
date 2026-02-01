const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkFleet() {
    try {
        const allVehicles = await prisma.fleet_vehicle.findMany();
        console.log('Total vehicles:', allVehicles.length);
        console.log('Vehicles:', JSON.stringify(allVehicles, null, 2));

        const activeVehicles = await prisma.fleet_vehicle.findMany({
            where: { is_active: true }
        });
        console.log('Active vehicles:', activeVehicles.length);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkFleet();
