const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const vehicles = [
    {
        name: "Swift Dzire",
        seats: 4,
        base_price_per_km: 13,
        category: "Sedan",
        image_url: "/Dzire.avif",
        description: "Comfortable sedan for city and outstation trips. Features AC and Music System.",
        is_active: true
    },
    {
        name: "Toyota Etios",
        seats: 4,
        base_price_per_km: 14,
        category: "Sedan",
        image_url: "/etios.jpeg",
        description: "Reliable sedan with ample boot space. Features AC and Music System.",
        is_active: true
    },
    {
        name: "Toyota Innova Crysta",
        seats: 7,
        base_price_per_km: 22,
        category: "SUV",
        image_url: "/Inova.jpg",
        description: "Premium SUV for group travel. Spacious, AC, and comfortable seating.",
        is_active: true
    },
    {
        name: "Toyota Innova Hycross",
        seats: 7,
        base_price_per_km: 25,
        category: "SUV",
        image_url: "/Hycross.avif",
        description: "Luxury hybrid SUV with advanced features. Perfect for corporate travel.",
        is_active: true
    },
    {
        name: "Tempo Traveller",
        seats: 12, // Adjusted from mock
        base_price_per_km: 30,
        category: "Van",
        image_url: "/traveller.webp",
        description: "Spacious van for large groups. AC and comfortable push-back seats.",
        is_active: true
    }
];

async function seed() {
    console.log('Seeding fleet vehicles...');

    for (const v of vehicles) {
        const existing = await prisma.fleet_vehicle.findFirst({
            where: { name: v.name }
        });

        if (!existing) {
            await prisma.fleet_vehicle.create({
                data: v
            });
            console.log(`Created: ${v.name}`);
        } else {
            console.log(`Skipped (already exists): ${v.name}`);
        }
    }

    console.log('Seeding completed.');
}

seed()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
