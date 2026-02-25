// src/routes/b2b.routes.js
const express = require('express');
const router = express.Router();
const b2bController = require('../controllers/b2b/b2b.controller');
const { requireAuth, requireRole, requireAdmin } = require('../middlewares/auth.middleware');

// Public routes
router.post('/register', b2bController.registerB2BRequest);

// Admin-only routes (require admin authentication)
router.get('/requests', requireAuth, requireRole(['admin']), b2bController.getAllB2BRequests);
router.get('/requests/:id', requireAuth, requireRole(['admin']), b2bController.getB2BRequestById);
router.post('/requests/:id/approve', requireAuth, requireRole(['admin']), b2bController.approveB2BRequest);
router.post('/requests/:id/reject', requireAuth, requireRole(['admin']), b2bController.rejectB2BRequest);

// B2B user routes (require B2B authentication)
router.get('/company/my', requireAuth, b2bController.getMyCompanyProfile);
router.get('/company/:id', requireAuth, b2bController.getCompanyById);
router.get('/bookings', requireAuth, b2bController.getCompanyBookings);
router.get('/payments', requireAuth, b2bController.getCompanyPayments);
router.post('/bookings', requireAuth, b2bController.createCreditBooking);

// Company Fleet Management (Admin)
router.get('/companies', requireAuth, requireAdmin, b2bController.getCompanies);
router.get('/companies/:id/fleet', requireAuth, requireAdmin, b2bController.getCompanyFleet);
router.post('/companies/:id/fleet', requireAuth, requireAdmin, b2bController.manageCompanyFleet);
router.get('/companies/:id/bookings', requireAuth, requireAdmin, b2bController.getCompanyBookingsForAdmin);

// Validated payment recording
router.post('/payments', requireAuth, requireAdmin, b2bController.recordCompanyPayment);

// Company CRUD (Admin)
router.post('/companies', requireAuth, requireAdmin, b2bController.createCompany);
router.put('/companies/:id', requireAuth, requireAdmin, b2bController.updateCompany);
router.get('/company/:id/fleet', requireAuth, requireRole(['admin']), b2bController.getCompanyFleet);
router.post('/company/:id/fleet', requireAuth, requireRole(['admin']), b2bController.manageCompanyFleet);
router.delete('/fleet-assignment/:id', requireAuth, requireRole(['admin']), b2bController.removeCompanyFleet);

// B2B User Fleet & Dashboard
router.get('/my-fleet', requireAuth, requireRole(['b2b_user']), b2bController.getMyFleet);
router.get('/dashboard-sync', requireAuth, requireRole(['b2b_user']), b2bController.getDashboardSync);

module.exports = router;
