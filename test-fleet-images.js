const prisma = require('./src/config/prisma');

async function main() {
    const vehicles = await prisma.fleet_vehicle.findMany({
        select: { id: true, name: true, image_url: true }
    });
    console.log(JSON.stringify(vehicles, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
