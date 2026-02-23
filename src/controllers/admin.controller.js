// src/controllers/admin.controller.js
const prisma = require('../config/prisma');
const cache = require('../utils/cache');

const BOOKINGS_CACHE_TTL = 65; // 65 seconds — survives 60s frontend polling
const { validationResult } = require('express-validator');
const {
  sendTaxiAssignmentWhatsApp,
  sendDriverAssignmentWhatsApp,
} = require('../services/twilio.service');
const emailService = require('../services/email.service');

/**
 * Simple admin auth check using existing user/role model.
 * Assumes middleware has attached req.user with role information.
 */
async function me(req, res) {
  return res.json({ user: req.user });
}

/**
 * Aggregated endpoint to fetch all admin dashboard summary data in one request,
 * preventing connection pool exhaustion from 5-10 parallel queries.
 */
async function getDashboardSync(req, res) {
  try {
    const cacheKey = `admin_dashboard_sync`;

    const dashboardData = await cache.getOrSet(
      cacheKey,
      async () => {
        // Run essential summary queries strictly sequentially to ensure exactly 1 connection per active request
        const totalBookings = await prisma.booking.count();
        const completedBookings = await prisma.booking.count({ where: { status: 'COMPLETED' } });
        const pendingBookings = await prisma.booking.count({ where: { status: 'IN_PROGRESS' } });
        const b2bBookings = await prisma.b2b_booking.count();
        const recentUsers = await prisma.user.findMany({
          take: 5,
          orderBy: { created_at: 'desc' },
          select: { id: true, name: true, email: true, created_at: true }
        });
        const activeDrivers = await prisma.driver.count({ where: { is_active: true } });

        return {
          stats: {
            totalBookings,
            completedBookings,
            pendingBookings,
            b2bBookings,
            activeDrivers
          },
          recentUsers
        };
      },
      BOOKINGS_CACHE_TTL
    );

    return res.json({ success: true, data: dashboardData });
  } catch (err) {
    console.error('Dashboard Sync Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to sync dashboard data' });
  }
}

async function listPaidBookings(req, res) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 100;
    const cacheKey = `admin_bookings_${limit}`;

    const bookings = await cache.getOrSet(
      cacheKey,
      async () => {
        return await prisma.booking.findMany({
          orderBy: { created_at: 'desc' },
          include: {
            user: true,
            payments: true,
            assign_taxis: true,
          },
          take: limit
        });
      },
      BOOKINGS_CACHE_TTL
    );

    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

/**
 * Create or update taxi assignment for a booking.
 * Body: { driverName, driverNumber, cabNumber, cabName }
 */
async function upsertAssignTaxi(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const bookingId = parseInt(req.params.bookingId, 10);
    const {
      driverName,
      driverNumber,
      cabNumber,
      cabName,
      markAssigned = false,
    } = req.body;

    // Ensure booking exists and is paid
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: true },
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Upsert assign_taxi record
    const existing = await prisma.assign_taxi.findFirst({
      where: { booking_id: bookingId },
    });

    let assignment;
    if (existing) {
      assignment = await prisma.assign_taxi.update({
        where: { id: existing.id },
        data: {
          driver_name: driverName,
          driver_number: driverNumber,
          cab_number: cabNumber,
          cab_name: cabName,
        },
      });
    } else {
      assignment = await prisma.assign_taxi.create({
        data: {
          booking_id: bookingId,
          driver_name: driverName,
          driver_number: driverNumber,
          cab_number: cabNumber,
          cab_name: cabName,
        },
      });
    }

    // Automatically send WhatsApp messages and only mark as ASSIGNED if they succeed
    try {
      await sendTaxiAssignmentWhatsApp({
        toPhone: booking.user?.phone,
        booking,
        assignment,
      });

      await sendDriverAssignmentWhatsApp({
        toPhone: assignment.driver_number,
        booking,
        assignment,
      });

      // Send Email to Customer
      if (booking.user && booking.user.email) {
        await emailService.sendDriverAssignedEmail(booking, assignment, booking.user)
          .catch(err => console.error('Failed to send driver assignment email:', err));
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          taxi_assign_status: 'ASSIGNED',
          status: 'IN_PROGRESS', // Auto-start trip when WhatsApp sent successfully
        },
      });
    } catch (notifyErr) {
      console.error('Failed to send WhatsApp assignment messages:', notifyErr);
      return res.status(500).json({
        message:
          'Taxi assignment saved, but WhatsApp messages could not be sent. Please verify Twilio configuration.',
      });
    }

    // Invalidate booking cache so next poll gets fresh data
    cache.invalidate(`admin_bookings_100`);

    return res.status(200).json({
      message: 'Taxi assignment saved successfully',
      assignment,
    });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

/**
 * Get a single booking ticket with assignment and customer details.
 */
async function getBookingTicket(req, res) {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: true,
        payments: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Manually attach assign_taxis to avoid Prisma include errors
    const assignments = await prisma.assign_taxi.findMany({
      where: { booking_id: bookingId },
    });

    return res.json({ booking: { ...booking, assign_taxis: assignments } });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

/**
 * Get completed bookings (for History table view)
 */
async function getCompletedBookings(req, res) {
  try {
    const bookings = await prisma.booking.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { updated_at: 'desc' },
      include: {
        user: true,
        payments: true,
        assign_taxis: true,
      },
      take: req.query.limit ? parseInt(req.query.limit) : 50 // Limit historical data fetch
    });

    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Get cancelled bookings (for Cancelled History table view)
 */
async function getCancelledBookings(req, res) {
  try {
    const bookings = await prisma.booking.findMany({
      where: { status: 'CANCELLED' },
      orderBy: { updated_at: 'desc' },
      include: {
        user: true,
        payments: true,
      },
      take: req.query.limit ? parseInt(req.query.limit) : 50
    });

    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Get pending payment bookings (Razorpay initiated but not completed)
 */
async function getPendingPayments(req, res) {
  try {
    const bookings = await prisma.booking.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        payments: {
          some: {
            status: { in: ['CREATED', 'PENDING'] } // Razorpay order created but not paid
          }
        }
      },
      orderBy: { created_at: 'desc' },
      include: {
        user: true,
        payments: true,
      },
      take: req.query.limit ? parseInt(req.query.limit) : 50
    });

    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * List all B2B bookings for admin dispatch
 */
async function listB2BBookings(req, res) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const cacheKey = `admin_b2b_bookings_${limit}`;

    const bookings = await cache.getOrSet(
      cacheKey,
      async () => {
        return await prisma.b2b_booking.findMany({
          orderBy: { created_at: 'desc' },
          include: {
            company: true,
            bookedByUser: {
              select: { id: true, name: true, email: true, phone: true }
            },
            assignments: true,
          },
          take: limit
        });
      },
      BOOKINGS_CACHE_TTL
    );

    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Assign taxi to a B2B booking
 */
async function upsertB2BAssignTaxi(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const bookingId = parseInt(req.params.bookingId, 10);
    const {
      driverName,
      driverNumber,
      cabNumber,
      cabName,
    } = req.body;

    const booking = await prisma.b2b_booking.findUnique({
      where: { id: bookingId },
      include: { company: true }
    });

    if (!booking) {
      return res.status(404).json({ message: 'B2B Booking not found' });
    }

    // Upsert b2b_assign_taxi
    const existing = await prisma.b2b_assign_taxi.findFirst({
      where: { booking_id: bookingId },
    });

    let assignment;
    if (existing) {
      assignment = await prisma.b2b_assign_taxi.update({
        where: { id: existing.id },
        data: {
          driver_name: driverName,
          driver_number: driverNumber,
          cab_number: cabNumber,
          cab_name: cabName,
        },
      });
    } else {
      assignment = await prisma.b2b_assign_taxi.create({
        data: {
          booking_id: bookingId,
          driver_name: driverName,
          driver_number: driverNumber,
          cab_number: cabNumber,
          cab_name: cabName,
        },
      });
    }

    // Update booking status
    await prisma.b2b_booking.update({
      where: { id: bookingId },
      data: {
        taxi_assign_status: 'ASSIGNED'
      },
    });

    // Invalidate B2B booking cache so next poll gets fresh data
    cache.invalidate(`admin_b2b_bookings_50`);

    return res.status(200).json({
      success: true,
      message: 'B2B Taxi assignment saved successfully',
      assignment,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Mark a B2B booking as paid (offline payment)
 */
// Mark B2B bill as paid (offline)
async function markB2BBillPaid(req, res) {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    // mode and remarks were unused/invalid in schema, ignoring them for now or logging them if needed
    // const { mode, remarks } = req.body; 

    const booking = await prisma.b2b_booking.findUnique({
      where: { id: bookingId }
    });

    if (!booking) {
      return res.status(404).json({ message: 'B2B Booking not found' });
    }

    const updated = await prisma.b2b_booking.update({
      where: { id: bookingId },
      data: {
        status: 'PAID'
      }
    });

    return res.json({
      success: true,
      message: 'B2B Bill marked as paid successfully',
      booking: updated
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update B2B booking status (manual trip lifecycle)
 */
async function updateB2BBookingStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const adminId = req.user?.id || 0;

    const booking = await prisma.b2b_booking.findUnique({ where: { id: parseInt(id) } });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'B2B Booking not found' });
    }

    const updated = await prisma.b2b_booking.update({
      where: { id: parseInt(id) },
      data: { status }
    });

    return res.json({ success: true, data: { booking: updated }, message: `B2B Booking status updated to ${status}` });
  } catch (error) {
    console.error('Error updating B2B booking status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update B2B booking status' });
  }
}

/**
 * Complete B2B trip
 */
async function completeB2BTrip(req, res) {
  try {
    const { id } = req.params;
    const { actual_km, toll_charges, notes } = req.body;

    const booking = await prisma.b2b_booking.findUnique({ where: { id: parseInt(id) } });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'B2B Booking not found' });
    }

    const updated = await prisma.b2b_booking.update({
      where: { id: parseInt(id) },
      data: {
        status: 'COMPLETED',
        actual_km: parseFloat(actual_km) || booking.distance_km,
        extra_charge: parseFloat(toll_charges) || 0
      }
    });

    return res.json({ success: true, data: { booking: updated }, message: 'B2B Trip completed' });
  } catch (error) {
    console.error('Error completing B2B trip:', error);
    return res.status(500).json({ success: false, message: 'Failed to complete B2B trip' });
  }
}

/**
 * Cancel B2B booking
 */
async function cancelB2BBooking(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const booking = await prisma.b2b_booking.findUnique({ where: { id: parseInt(id) } });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'B2B Booking not found' });
    }

    const updated = await prisma.b2b_booking.update({
      where: { id: parseInt(id) },
      data: {
        status: 'CANCELLED',
        cancellation_reason: reason
      }
    });

    return res.json({ success: true, data: { booking: updated }, message: 'B2B Booking cancelled' });
  } catch (error) {
    console.error('Error cancelling B2B booking:', error);
    return res.status(500).json({ success: false, message: 'Failed to cancel B2B booking' });
  }
}

module.exports = {
  me,
  listPaidBookings,
  upsertAssignTaxi,
  getBookingTicket,
  getCompletedBookings,
  getCancelledBookings,
  getPendingPayments,
  listB2BBookings,
  upsertB2BAssignTaxi,
  markB2BBillPaid,
  updateB2BBookingStatus,
  completeB2BTrip,
  cancelB2BBooking,
  getDashboardSync
};
