// src/controllers/booking.controller.js
const { validationResult } = require('express-validator');
const bookingService = require('../services/booking.services');

/**
 * Handle direct booking creation (cash to driver)
 */
async function createDirectBooking(req, res) {
  try {
    let userId = req.user?.id;
    const {
      pickupLocation,
      dropLocation,
      scheduledAt,
      distanceKm,
      estimatedFare,
      totalAmount,
      carModel,
      passengerDetails
    } = req.body;

    if (!pickupLocation || !dropLocation || totalAmount === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!userId) {
      if (!passengerDetails || !passengerDetails.phone) {
        return res.status(400).json({ success: false, message: 'Passenger details (phone) required for guest booking' });
      }

      const prisma = require('../config/prisma');
      let user = await prisma.user.findFirst({
        where: { phone: passengerDetails.phone }
      });

      if (!user && passengerDetails.email) {
        user = await prisma.user.findFirst({
          where: { email: passengerDetails.email }
        });
      }

      if (!user) {
        user = await prisma.user.create({
          data: {
            name: passengerDetails.name || 'Guest User',
            phone: passengerDetails.phone,
            email: passengerDetails.email || `${passengerDetails.phone}@guest.urbancabz.com`,
            is_verified: false
          }
        });
      }
      userId = user.id;
      // Make sure req.user is available for the email service later
      req.user = user;
    }

    const booking = await bookingService.createDirectBooking({
      userId,
      pickupLocation,
      dropLocation,
      scheduledAt,
      distanceKm,
      estimatedFare,
      totalAmount,
      carModel,
      passengerDetails
    });

    // Send confirmation email to the passenger's entered email (preferred) or user account email
    const emailService = require('../services/email.service');
    const passengerEmail = passengerDetails?.email;
    emailService.sendBookingConfirmation(booking, req.user, passengerEmail).catch(e => console.error('Email Error:', e));

    return res.status(201).json({ success: true, booking });
  } catch (err) {
    console.error('[createDirectBooking error]', err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    return res.status(status).json({ success: false, message });
  }
}

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
    const prisma = require('../config/prisma');

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

module.exports = {
  createDirectBooking,
  getMyBookings,
  getCompanyBookings
};


