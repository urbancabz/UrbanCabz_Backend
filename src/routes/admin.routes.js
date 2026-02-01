// src/routes/admin.routes.js
const express = require('express');
const { body } = require('express-validator');
const adminController = require('../controllers/admin.controller');
const driverController = require('../controllers/driver.controller');
const lifecycleController = require('../controllers/bookingLifecycle.controller');
const { requireAuth, requireAdmin } = require('../middlewares/auth.middleware');

const router = express.Router();

// Simple check for current admin user
router.get('/me', requireAuth, requireAdmin, adminController.me);

// List all paid bookings (tickets) for admin
router.get('/bookings', requireAuth, requireAdmin, adminController.listPaidBookings);

// Get single booking ticket (with assignment + customer details)
router.get('/bookings/:bookingId', requireAuth, requireAdmin, adminController.getBookingTicket);

// Create/update taxi assignment for a booking
router.post(
  '/bookings/:bookingId/assign-taxi',
  requireAuth,
  requireAdmin,
  [
    body('driverName').isString().notEmpty(),
    body('driverNumber').isString().notEmpty(),
    body('cabNumber').isString().notEmpty(),
    body('cabName').isString().notEmpty(),
  ],
  adminController.upsertAssignTaxi
);

// ===================== BOOKING LIFECYCLE ROUTES =====================

// Update booking status (manual trip lifecycle)
router.patch(
  '/bookings/:id/status',
  requireAuth,
  requireAdmin,
  [
    body('status').isString().isIn(['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'PAID', 'PENDING_PAYMENT']).withMessage('Invalid status'),
    body('reason').optional().isString()
  ],
  lifecycleController.updateBookingStatus
);

// Complete trip with fare adjustments (extra KM, tolls, waiting)
router.post(
  '/bookings/:id/complete',
  requireAuth,
  requireAdmin,
  [
    body('actual_km').isFloat({ min: 0 }).withMessage('Actual KM must be a positive number'),
    body('toll_charges').optional().isFloat({ min: 0 }).withMessage('Toll charges must be positive'),
    body('rate_per_km').optional().isFloat({ min: 0 }).withMessage('Rate per KM must be positive')
  ],
  lifecycleController.completeTrip
);

// Cancel booking with reason
router.post(
  '/bookings/:id/cancel',
  requireAuth,
  requireAdmin,
  [
    body('reason').isString().notEmpty().withMessage('Cancellation reason is required')
  ],
  lifecycleController.cancelBooking
);

// Internal notes for a booking
router.get('/bookings/:id/notes', requireAuth, requireAdmin, lifecycleController.getBookingNotes);
router.post('/bookings/:id/notes', requireAuth, requireAdmin, lifecycleController.addBookingNote);

// ===================== HISTORY & PENDING ROUTES =====================

// Get completed bookings (History table view)
router.get('/history/completed', requireAuth, requireAdmin, adminController.getCompletedBookings);

// Get cancelled bookings (Cancelled History table view)
router.get('/history/cancelled', requireAuth, requireAdmin, adminController.getCancelledBookings);

// Get pending payment bookings (incomplete Razorpay transactions)
router.get('/pending-payments', requireAuth, requireAdmin, adminController.getPendingPayments);

// ===================== B2B DISPATCH ROUTES =====================

// List all B2B bookings
router.get('/b2b-bookings', requireAuth, requireAdmin, adminController.listB2BBookings);

// Assign taxi to a B2B booking
router.post(
  '/b2b-bookings/:bookingId/assign-taxi',
  requireAuth,
  requireAdmin,
  [
    body('driverName').isString().notEmpty(),
    body('driverNumber').isString().notEmpty(),
    body('cabNumber').isString().notEmpty(),
    body('cabName').isString().notEmpty(),
  ],
  adminController.upsertB2BAssignTaxi
);

// Mark B2B bill as paid (offline)
router.post(
  '/b2b-bookings/:bookingId/mark-paid',
  requireAuth,
  requireAdmin,
  [
    body('mode').isString().notEmpty(),
    body('remarks').optional().isString()
  ],
  adminController.markB2BBillPaid
);

// B2B Lifecycle
router.patch('/b2b-bookings/:id/status', requireAuth, requireAdmin, adminController.updateB2BBookingStatus);
router.post('/b2b-bookings/:id/complete', requireAuth, requireAdmin, adminController.completeB2BTrip);
router.post('/b2b-bookings/:id/cancel', requireAuth, requireAdmin, adminController.cancelB2BBooking);

// ===================== DRIVER REGISTRY ROUTES =====================
router.get('/drivers', requireAuth, requireAdmin, driverController.getDrivers);
router.get('/drivers/:id', requireAuth, requireAdmin, driverController.getDriver);
router.post(
  '/drivers',
  requireAuth,
  requireAdmin,
  [
    body('name').isString().notEmpty(),
    body('phone').isString().notEmpty(),
  ],
  driverController.createDriver
);
router.put(
  '/drivers/:id',
  requireAuth,
  requireAdmin,
  driverController.updateDriver
);
router.delete('/drivers/:id', requireAuth, requireAdmin, driverController.deleteDriver);

module.exports = router;


