/**
 * ============================================================
 *   URBAN CABZ — HANDOVER DATA CLEANUP SCRIPT
 * ============================================================
 * 
 * This script DELETES all operational/transactional data
 * so the platform is clean for the new owner.
 *
 * ✅ KEEPS:
 *   - fleet_vehicle       (your cars / cab types)
 *   - driver              (driver registry)
 *   - pricing_settings    (fare configuration)
 *   - role                (system roles)
 *   - b2b_company_fleet   (company-specific vehicle pricing)
 *
 * ❌ REMOVES:
 *   - All bookings (B2C + B2B)
 *   - All payments
 *   - All taxi dispatch assignments
 *   - All customers / users (except admin)
 *   - All B2B companies + their users
 *   - All B2B invoices + payments
 *   - All B2B partner requests
 *   - All booking notes, fare adjustments, audit logs
 *   - All OTP records
 *   - All company-specific fleet pricing (b2b_company_fleet)
 *     since the companies are deleted too
 *
 * ⚠️  THIS CANNOT BE UNDONE. Make sure you have a DB backup.
 * ============================================================
 */

require('dotenv').config();
const prisma = require('./src/config/prisma');

async function cleanup() {
    console.log('\n============================================================');
    console.log('   URBAN CABZ — HANDOVER CLEANUP');
    console.log('============================================================\n');
    console.log('⚠️  Starting data wipe. This cannot be undone.\n');

    try {
        // ── Step 1: Dependent tables first (children before parents) ──

        console.log('🗑️  Deleting B2B taxi assignments...');
        const b2bAssign = await prisma.b2b_assign_taxi.deleteMany({});
        console.log(`   ✅ Deleted ${b2bAssign.count} B2B taxi assignments\n`);

        console.log('🗑️  Deleting B2B bookings...');
        const b2bBookings = await prisma.b2b_booking.deleteMany({});
        console.log(`   ✅ Deleted ${b2bBookings.count} B2B bookings\n`);

        console.log('🗑️  Deleting B2B invoices...');
        const b2bInvoices = await prisma.b2b_invoice.deleteMany({});
        console.log(`   ✅ Deleted ${b2bInvoices.count} B2B invoices\n`);

        console.log('🗑️  Deleting B2B payments...');
        const b2bPayments = await prisma.b2b_payment.deleteMany({});
        console.log(`   ✅ Deleted ${b2bPayments.count} B2B payments\n`);

        console.log('🗑️  Deleting B2B partner requests...');
        const b2bRequests = await prisma.b2b_request.deleteMany({});
        console.log(`   ✅ Deleted ${b2bRequests.count} B2B requests\n`);

        console.log('🗑️  Deleting company-specific fleet pricing...');
        const companyFleet = await prisma.b2b_company_fleet.deleteMany({});
        console.log(`   ✅ Deleted ${companyFleet.count} company fleet entries\n`);

        console.log('🗑️  Deleting B2B users...');
        const b2bUsers = await prisma.b2b_user.deleteMany({});
        console.log(`   ✅ Deleted ${b2bUsers.count} B2B user links\n`);

        console.log('🗑️  Deleting B2B companies...');
        const b2bCompanies = await prisma.b2b_company.deleteMany({});
        console.log(`   ✅ Deleted ${b2bCompanies.count} B2B companies\n`);

        // ── Step 2: B2C bookings and related ──

        console.log('🗑️  Deleting taxi dispatch assignments (B2C)...');
        const assignTaxis = await prisma.assign_taxi.deleteMany({});
        console.log(`   ✅ Deleted ${assignTaxis.count} B2C taxi assignments\n`);

        console.log('🗑️  Deleting booking notes...');
        const bookingNotes = await prisma.booking_note.deleteMany({});
        console.log(`   ✅ Deleted ${bookingNotes.count} booking notes\n`);

        console.log('🗑️  Deleting fare adjustments...');
        const fareAdj = await prisma.fare_adjustment.deleteMany({});
        console.log(`   ✅ Deleted ${fareAdj.count} fare adjustments\n`);

        console.log('🗑️  Deleting payments (B2C)...');
        const payments = await prisma.payment.deleteMany({});
        console.log(`   ✅ Deleted ${payments.count} payments\n`);

        console.log('🗑️  Deleting B2C bookings...');
        const bookings = await prisma.booking.deleteMany({});
        console.log(`   ✅ Deleted ${bookings.count} B2C bookings\n`);

        // ── Step 3: Audit logs and OTPs ──

        console.log('🗑️  Deleting audit logs...');
        const auditLogs = await prisma.audit_log.deleteMany({});
        console.log(`   ✅ Deleted ${auditLogs.count} audit logs\n`);

        console.log('🗑️  Deleting OTP records...');
        const otps = await prisma.passwordResetOtp.deleteMany({});
        console.log(`   ✅ Deleted ${otps.count} OTP records\n`);

        // ── Step 4: Users (keep admin) ──

        console.log('🗑️  Deleting all customers (non-admin users)...');
        // Keep only ADMIN role users — find admin role id first
        const adminRole = await prisma.role.findFirst({ where: { name: { in: ['ADMIN', 'admin', 'Admin'] } } });
        
        let deletedUsers;
        if (adminRole) {
            deletedUsers = await prisma.user.deleteMany({
                where: { role_id: { not: adminRole.id } }
            });
            console.log(`   ✅ Deleted ${deletedUsers.count} customer accounts (admin accounts preserved)\n`);
        } else {
            // No admin role found — delete ALL users (be explicit)
            deletedUsers = await prisma.user.deleteMany({});
            console.log(`   ✅ Deleted ${deletedUsers.count} user accounts\n`);
        }

        // ── Done ──

        console.log('============================================================');
        console.log('   ✅ CLEANUP COMPLETE!');
        console.log('');
        console.log('   PRESERVED (untouched):');
        console.log('   ✅ fleet_vehicle   (your cars)');
        console.log('   ✅ driver          (driver registry)');
        console.log('   ✅ pricing_settings (fare config)');
        console.log('   ✅ role            (system roles)');
        if (adminRole) {
            console.log('   ✅ Admin user accounts');
        }
        console.log('');
        console.log('   The platform is now clean and ready for the new owner.');
        console.log('============================================================\n');

    } catch (err) {
        console.error('\n❌ Error during cleanup:', err.message);
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

cleanup();
