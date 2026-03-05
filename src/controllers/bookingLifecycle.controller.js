const prisma = require('../config/prisma');

// ===================== BOOKING LIFECYCLE MANAGEMENT =====================

/**
 * Update booking status (manual trip lifecycle)
 * Validates state transitions and creates audit logs
 */
const updateBookingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;
        const adminId = req.user?.id || 0;

        const booking = await prisma.booking.findUnique({ where: { id: parseInt(id) } });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const oldStatus = booking.status;
        const validTransitions = {
            'PAID': ['IN_PROGRESS', 'CANCELLED'],
            'IN_PROGRESS': ['COMPLETED', 'CANCELLED'],
            'PENDING_PAYMENT': ['PAID', 'CANCELLED', 'IN_PROGRESS'], // Allow starting trip if partial payment
        };

        if (!validTransitions[oldStatus]?.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot transition from ${oldStatus} to ${status}`
            });
        }

        const updated = await prisma.booking.update({
            where: { id: parseInt(id) },
            data: { status }
        });

        // Create audit log
        await prisma.audit_log.create({
            data: {
                entity_type: 'BOOKING',
                entity_id: booking.id,
                action: 'STATUS_CHANGE',
                old_value: JSON.stringify({ status: oldStatus }),
                new_value: JSON.stringify({ status }),
                admin_id: adminId,
                reason: reason || `Status changed from ${oldStatus} to ${status}`
            }
        });

        res.json({ success: true, data: { booking: updated }, message: `Booking status updated to ${status}` });
    } catch (error) {
        console.error('Error updating booking status:', error);
        res.status(500).json({ success: false, message: 'Failed to update booking status' });
    }
};

/**
 * Complete trip with extra KM calculation
 * Calculates additional fare based on actual vs estimated distance
 */
const completeTrip = async (req, res) => {
    try {
        const { id } = req.params;
        const { actual_km, rate_per_km, toll_charges, notes } = req.body;
        const adminId = req.user?.id || 0;

        const booking = await prisma.booking.findUnique({
            where: { id: parseInt(id) },
            include: { payments: true }
        });

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (booking.status !== 'IN_PROGRESS' && booking.status !== 'PAID') {
            return res.status(400).json({ success: false, message: 'Trip must be in progress or paid to complete' });
        }

        const estimatedKm = booking.distance_km || 0;
        const actualKm = parseFloat(actual_km) || estimatedKm;
        const extraKm = Math.max(0, actualKm - estimatedKm);
        const pricePerKm = parseFloat(rate_per_km) || 12; // Default rate
        const extraKmCharge = extraKm * pricePerKm;
        const tollAmount = parseFloat(toll_charges) || 0;

        // Calculate new total
        const adjustments = extraKmCharge + tollAmount;
        const newTotal = booking.total_amount + adjustments;

        // Update booking with new fields
        const updated = await prisma.booking.update({
            where: { id: parseInt(id) },
            data: {
                status: 'COMPLETED',
                total_amount: newTotal,
                distance_km: estimatedKm, // Keep original estimate
                actual_km: actualKm,
                extra_km: extraKm,
                extra_charge: adjustments // Total of all extra charges
            }
        });

        // Create fare adjustments records
        const adjustmentRecords = [];
        if (extraKmCharge > 0) {
            adjustmentRecords.push({
                booking_id: booking.id,
                type: 'EXTRA_KM',
                amount: extraKmCharge,
                description: `Extra ${extraKm.toFixed(1)} km @ ₹${pricePerKm}/km`,
                admin_id: adminId
            });
        }
        if (tollAmount > 0) {
            adjustmentRecords.push({
                booking_id: booking.id,
                type: 'TOLL',
                amount: tollAmount,
                description: 'Toll charges',
                admin_id: adminId
            });
        }

        if (adjustmentRecords.length > 0) {
            await prisma.fare_adjustment.createMany({ data: adjustmentRecords });
        }

        // Create audit log
        await prisma.audit_log.create({
            data: {
                entity_type: 'BOOKING',
                entity_id: booking.id,
                action: 'STATUS_CHANGE',
                old_value: JSON.stringify({ status: booking.status, total_amount: booking.total_amount }),
                new_value: JSON.stringify({ status: 'COMPLETED', total_amount: newTotal, adjustments }),
                admin_id: adminId,
                reason: notes || 'Trip completed with fare adjustment'
            }
        });

        res.json({
            success: true,
            data: {
                booking: updated,
                adjustments: {
                    extra_km: extraKm,
                    extra_km_charge: extraKmCharge,
                    toll_charges: tollAmount,
                    total_adjustments: adjustments,
                    new_total: newTotal
                }
            },
            message: 'Trip completed successfully'
        });
    } catch (error) {
        console.error('Error completing trip:', error);
        res.status(500).json({ success: false, message: 'Failed to complete trip' });
    }
};

/**
 * Cancel booking with reason and audit trail
 */
const cancelBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user?.id || 0;

        if (!reason) {
            return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
        }

        const booking = await prisma.booking.findUnique({ where: { id: parseInt(id) } });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
            return res.status(400).json({ success: false, message: `Cannot cancel a ${booking.status} booking` });
        }

        const oldStatus = booking.status;
        const updated = await prisma.booking.update({
            where: { id: parseInt(id) },
            data: {
                status: 'CANCELLED',
                cancellation_reason: reason
            }
        });

        // Create audit log
        await prisma.audit_log.create({
            data: {
                entity_type: 'BOOKING',
                entity_id: booking.id,
                action: 'CANCEL',
                old_value: JSON.stringify({ status: oldStatus }),
                new_value: JSON.stringify({ status: 'CANCELLED' }),
                admin_id: adminId,
                reason
            }
        });

        res.json({ success: true, data: { booking: updated }, message: 'Booking cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling booking:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel booking' });
    }
};

/**
 * Add internal note to a booking
 */
const addBookingNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const adminId = req.user?.id || 0;

        if (!content) {
            return res.status(400).json({ success: false, message: 'Note content is required' });
        }

        const booking = await prisma.booking.findUnique({ where: { id: parseInt(id) } });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const note = await prisma.booking_note.create({
            data: {
                booking_id: parseInt(id),
                admin_id: adminId,
                content
            }
        });

        res.status(201).json({ success: true, data: { note }, message: 'Note added successfully' });
    } catch (error) {
        console.error('Error adding note:', error);
        res.status(500).json({ success: false, message: 'Failed to add note' });
    }
};

/**
 * Get booking notes
 */
const getBookingNotes = async (req, res) => {
    try {
        const { id } = req.params;

        const notes = await prisma.booking_note.findMany({
            where: { booking_id: parseInt(id) },
            orderBy: { created_at: 'desc' }
        });

        res.json({ success: true, data: { notes } });
    } catch (error) {
        console.error('Error fetching notes:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notes' });
    }
};

module.exports = {
    updateBookingStatus,
    completeTrip,
    cancelBooking,
    addBookingNote,
    getBookingNotes
};
