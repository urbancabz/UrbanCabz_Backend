// src/routes/booking.routes.js
const express = require('express');
const { body } = require('express-validator');
const bookingController = require('../controllers/booking.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// DEPRECATED: Standard flow is now payments/verify-and-book
// router.post('/after-payment', ...);

// GET /api/v1/bookings/my
router.get('/my', requireAuth, bookingController.getMyBookings);

// GET /api/v1/bookings/company
router.get('/company', requireAuth, bookingController.getCompanyBookings);

module.exports = router;


