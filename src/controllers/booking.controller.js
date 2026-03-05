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
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

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
  getMyBookings,
  getCompanyBookings
};


