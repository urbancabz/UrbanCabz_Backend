// src/routes/booking.routes.js
const express = require('express');
const { body } = require('express-validator');
const bookingController = require('../controllers/booking.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// POST /api/v1/bookings/after-payment
// Body:
// {
//   pickupLocation: string,
//   dropLocation: string,
//   scheduledAt?: string (ISO date),
//   distanceKm?: number,
//   estimatedFare?: number,
//   totalAmount: number,
//   payment?: {
//     amount: number,
//     currency?: string,
//     status?: string,
//     provider?: string,
//     providerTxnId?: string
//   }
// }
router.post(
  '/after-payment',
  requireAuth,
  [
    body('pickupLocation').isString().notEmpty().withMessage('Pickup location is required'),
    body('dropLocation').isString().notEmpty().withMessage('Drop location is required'),
    body('totalAmount').isFloat({ gt: 0 }).withMessage('Total amount must be greater than 0'),
    body('scheduledAt').optional().isISO8601().withMessage('Invalid date format'),
    body('distanceKm').optional().isFloat({ min: 0 }).withMessage('Distance must be positive'),
    body('carModel').optional().isString().withMessage('Car model must be a string')
  ],
  bookingController.createBookingAfterPayment
);

// GET /api/v1/bookings/my
router.get('/my', requireAuth, bookingController.getMyBookings);

module.exports = router;


