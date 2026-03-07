// src/controllers/booking.controller.js
const { validationResult } = require('express-validator');
const bookingService = require('../services/booking.services');

// This endpoint assumes payment is already successful.
// In real-life you'll usually call this from a payment webhook or
// from your frontend right after receiving a "payment success" event.
async function getMyBookings(req, res) {
  try {
    const userId = req.user.id;
    const bookings = await bookingService.getMyBookings(userId);
    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

async function getCompanyBookings(req, res) {
  try {
    const userId = req.user.id;
    const { prisma } = require('../config/prisma');

    // Find the company this user belongs to
    const b2bUser = await prisma.b2b_user.findFirst({
      where: { user_id: userId }
    });

    if (!b2bUser) {
      return res.status(403).json({ message: 'User is not associated with a B2B company' });
    }

    const bookings = await bookingService.getCompanyBookings(b2bUser.company_id);
    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

async function createDirectBooking(req, res) {
  try {
    const userId = req.user.id;
    const {
      pickupLocation,
      dropLocation,
      scheduledAt,
      distanceKm,
      estimatedFare,
      totalAmount,
      carModel
    } = req.body;

    console.log(`[Booking] Creating direct booking for user ${userId}, totalAmount: ${totalAmount}`);

    const booking = await bookingService.createDirectBooking({
      userId,
      pickupLocation,
      dropLocation,
      scheduledAt,
      distanceKm,
      estimatedFare,
      totalAmount,
      carModel
    });

    console.log(`[Booking] Direct booking created with ID: ${booking.id}`);

    // Fire-and-forget notifications (WhatsApp + Email)
    try {
      const emailService = require('../services/email.service');
      const { sendBookingConfirmationWhatsApp } = require('../services/twilio.service');

      const user = booking.user;

      // Email Confirmation
      if (user && user.email) {
        emailService.sendBookingConfirmation(booking, user)
          .catch(err => console.error('Failed to send booking email:', err));
      }

      // WhatsApp Confirmation
      const userPhone = user?.phone;
      if (userPhone) {
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

    return res.status(201).json({
      message: 'Booking confirmed successfully',
      booking
    });

  } catch (err) {
    console.error('[Booking] Error creating direct booking:', err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ message });
  }
}

module.exports = {
  getMyBookings,
  getCompanyBookings,
  createDirectBooking
};


