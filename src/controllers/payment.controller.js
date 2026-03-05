// src/controllers/payment.controller.js
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const { createOrder } = require('../services/payment.razorpay');
const bookingService = require('../services/booking.services');
const { sendBookingConfirmationWhatsApp } = require('../services/twilio.service');
const emailService = require('../services/email.service');

// POST /api/v1/payments/create-order
async function createRazorpayOrder(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const {
      amount, // Payment amount (can be partial or full)
      currency = 'INR',
      // Booking details
      pickupLocation,
      dropLocation,
      scheduledAt,
      distanceKm,
      estimatedFare,
      totalAmount, // Total booking amount
      carModel // Extract carModel
    } = req.body;

    console.log(`[Payment] Creating order for user ${userId}, amount: ${amount}, totalAmount: ${totalAmount}`);

    // Validate: payment amount should not exceed total amount
    if (amount > totalAmount) {
      return res.status(400).json({
        message: 'Payment amount cannot exceed total booking amount'
      });
    }

    // Create Razorpay order
    const order = await createOrder({
      amount,
      currency,
      receipt: `user_${userId}_${Date.now()}`
    });

    console.log(`[Payment] Razorpay order created: ${order.id}`);

    // Create booking with PENDING_PAYMENT status and payment with PENDING status
    const booking = await bookingService.createBookingWithPendingPayment({
      userId,
      pickupLocation,
      dropLocation,
      scheduledAt,
      distanceKm,
      estimatedFare,
      totalAmount,
      carModel, // Pass carModel
      razorpayOrderId: order.id,
      paymentAmount: amount // Pass the actual payment amount (can be partial)
    });

    console.log(`[Payment] Booking created with ID: ${booking.id}, Payment ID: ${booking.payments[0]?.id}`);

    return res.status(201).json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      bookingId: booking.id,
      paymentId: booking.payments[0]?.id
    });
  } catch (err) {
    console.error('[Payment] Error creating Razorpay order:', err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

// POST /api/v1/payments/verify-and-book
async function verifyPaymentAndCreateBooking(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      // Razorpay payload
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    console.log(`[Payment] Verifying payment - Order ID: ${razorpay_order_id}, Payment ID: ${razorpay_payment_id}`);

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('[Payment] Invalid signature for payment:', razorpay_payment_id);
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    // Update existing booking and payment to SUCCESS status
    const booking = await bookingService.updateBookingAfterPaymentSuccess({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id
    });

    console.log(`[Payment] Payment verified successfully - Booking ID: ${booking.id}`);

    // Fire-and-forget notifications (WhatsApp + Email)
    try {
      const user = booking.user;

      // Email Confirmation
      if (user && user.email) {
        emailService.sendBookingConfirmation(booking, user)
          .catch(err => console.error('Failed to send booking email:', err));
      }

      // WhatsApp Confirmation (keep existing logic if intended)
      const userPhone = user?.phone;
      if (userPhone) {
        // Ensure phone is in E.164 format (+91...) before using in production
        sendBookingConfirmationWhatsApp({
          toPhone: userPhone,
          booking,
        }).catch(err => console.error('Failed to send WhatsApp:', err));
      } else {
        console.warn('Booking user has no phone number; skipping WhatsApp confirmation.');
      }
    } catch (notifyErr) {
      console.error('Error scheduling notifications:', notifyErr);
    }

    return res.status(200).json({
      message: 'Payment verified and booking confirmed',
      booking
    });
  } catch (err) {
    console.error('[Payment] Error verifying payment:', err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

module.exports = {
  createRazorpayOrder,
  verifyPaymentAndCreateBooking
};