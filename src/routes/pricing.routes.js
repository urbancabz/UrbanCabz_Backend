const express = require('express');
const router = express.Router();
const pricingController = require('../controllers/pricing.controller');
const { requireAuth, requireAdmin } = require('../middlewares/auth.middleware');

// Public route to get settings (for frontend calculation)
router.get('/public', pricingController.getPricingSettings);

// Admin routes
router.get('/', requireAuth, requireAdmin, pricingController.getPricingSettings);
router.put('/', requireAuth, requireAdmin, pricingController.updatePricingSettings);

module.exports = router;
