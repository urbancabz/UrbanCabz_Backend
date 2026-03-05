// src/routes/payment.routes.js
const express = require('express');
const { body } = require('express-validator');
const paymentController = require('../controllers/payment.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// Create Razorpay order
router.post(
  '/create-order',
  requireAuth,
  [
    body('amount').isFloat({ gt: 0 }),
    body('pickupLocation').isString().notEmpty(),
    body('dropLocation').isString().notEmpty(),
    body('totalAmount').isFloat({ gt: 0 }),
    body('scheduledAt').optional().isISO8601(),
    body('distanceKm').optional().isFloat({ gt: 0 }),
    body('estimatedFare').optional().isFloat({ gt: 0 })
  ],
  paymentController.createRazorpayOrder
);

// Verify payment and update booking
router.post(
  '/verify-and-book',
  requireAuth,
  [
    body('razorpay_order_id').isString().notEmpty(),
    body('razorpay_payment_id').isString().notEmpty(),
    body('razorpay_signature').isString().notEmpty()
  ],
  paymentController.verifyPaymentAndCreateBooking
);

module.exports = router;


