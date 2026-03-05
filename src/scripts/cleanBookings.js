// Script to clean all booking-related data
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanBookingData() {
    console.log('🧹 Starting cleanup of all booking-related data...\n');

    try {
        // Delete in order due to foreign key constraints

        // 1. Delete fare adjustments
        const fareAdjustments = await prisma.fare_adjustment.deleteMany({});
        console.log(`✅ Deleted ${fareAdjustments.count} fare adjustments`);

        // 2. Delete booking notes
        const bookingNotes = await prisma.booking_note.deleteMany({});
        console.log(`✅ Deleted ${bookingNotes.count} booking notes`);

        // 3. Delete audit logs (booking related)
        const auditLogs = await prisma.audit_log.deleteMany({
            where: { entity_type: 'BOOKING' }
        });
        console.log(`✅ Deleted ${auditLogs.count} booking audit logs`);

        // 4. Delete taxi assignments
        const taxiAssignments = await prisma.assign_taxi.deleteMany({});
        console.log(`✅ Deleted ${taxiAssignments.count} taxi assignments`);

        // 5. Delete payments
        const payments = await prisma.payment.deleteMany({});
        console.log(`✅ Deleted ${payments.count} payments`);

        // 6. Delete bookings
        const bookings = await prisma.booking.deleteMany({});
        console.log(`✅ Deleted ${bookings.count} bookings`);

        console.log('\n🎉 All booking-related data has been cleaned successfully!');
    } catch (error) {
        console.error('❌ Error cleaning data:', error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanBookingData();
