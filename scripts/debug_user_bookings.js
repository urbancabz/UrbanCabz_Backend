const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Debugging User Bookings...");

    // 1. Get all users and their booking counts
    const users = await prisma.user.findMany({
        include: {
            bookings: true,
            _count: {
                select: { bookings: true }
            }
        }
    });

    console.log(`Found ${users.length} users.`);

    for (const u of users) {
        if (u._count.bookings > 0) {
            console.log(`User ID: ${u.id}, Name: ${u.name}, RoleID: ${u.role_id}, Bookings Count: ${u._count.bookings}`);
            // List first few booking IDs
            const bookingIds = u.bookings.map(b => b.id).slice(0, 5);
            console.log(`  -> Booking IDs: ${bookingIds.join(', ')}...`);
        }
    }

    // 2. Check strict count aggregation vs relation count
    console.log("\n--- Checking raw counts via aggregation ---");
    for (const u of users) {
        const count = await prisma.booking.count({
            where: { user_id: u.id }
        });
        if (count > 0) {
            console.log(`User ID ${u.id}: prisma.booking.count() = ${count}`);
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
