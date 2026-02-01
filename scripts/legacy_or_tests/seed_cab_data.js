const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const cabBookingVehicles = [
    {
        name: "Swift Dzire",
        seats: 4,
        bags: 2,
        base_price_per_km: 13,
        vehicle_type: "Sedan",
        image_url: "/Dzire.avif",
        is_active: true
    },
    {
        name: "Toyota Etios",
        seats: 4,
        bags: 2,
        base_price_per_km: 13,
        vehicle_type: "Sedan",
        image_url: "/etios.jpeg",
        is_active: true
    },
    {
        name: "Toyota Innova Crysta",
        seats: 7,
        bags: 4,
        base_price_per_km: 22,
        vehicle_type: "SUV",
        image_url: "/Inova.jpg",
        is_active: true
    },
    {
        name: "Toyota Innova hycross",
        seats: 7,
        bags: 4,
        base_price_per_km: 25,
        vehicle_type: "SUV",
        image_url: "/Hycross.avif",
        is_active: true
    },
    {
        name: "Tempo traveler",
        seats: 6,
        bags: 3,
        base_price_per_km: 30,
        vehicle_type: "LCV",
        image_url: "traveller.webp",
        is_active: true
    },
];

async function seedFleet() {
    console.log('--- Seeding Fleet from CabBooking.jsx ---');

    for (const vehicle of cabBookingVehicles) {
        // Upsert to ensure we don't create duplicates if run multiple times
        const exists = await prisma.fleet_vehicle.findFirst({
            where: { name: vehicle.name }
        });

        if (exists) {
            console.log(`Skipping existing: ${vehicle.name}`);
            // Optional: Update with valid image_url/price if needed
            await prisma.fleet_vehicle.update({
                where: { id: exists.id },
                data: {
                    base_price_per_km: vehicle.base_price_per_km,
                    image_url: vehicle.image_url,
                    seats: vehicle.seats,
                    category: vehicle.vehicle_type
                }
            });
        } else {
            console.log(`Creating: ${vehicle.name}`);
            await prisma.fleet_vehicle.create({
                data: {
                    name: vehicle.name,
                    category: vehicle.vehicle_type,
                    base_price_per_km: vehicle.base_price_per_km,
                    seats: vehicle.seats,
                    image_url: vehicle.image_url,
                    is_active: true
                }
            });
        }
    }
    console.log('--- Seed Complete ---');
}

seedFleet()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
