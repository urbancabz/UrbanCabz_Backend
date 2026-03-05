const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth.middleware');
const { uploadFleetImage } = require('../middlewares/upload.middleware');
const {
    getFleetVehicles,
    getFleetVehicle,
    createFleetVehicle,
    updateFleetVehicle,
    deleteFleetVehicle,
    uploadVehicleImage
} = require('../controllers/fleet.controller');

// Public route - get active vehicles for customer booking page
router.get('/public', getFleetVehicles);

// Admin routes - require authentication
router.get('/', requireAuth, requireAdmin, getFleetVehicles);
router.get('/:id', requireAuth, requireAdmin, getFleetVehicle);
router.post('/', requireAuth, requireAdmin, createFleetVehicle);
router.put('/:id', requireAuth, requireAdmin, updateFleetVehicle);
router.delete('/:id', requireAuth, requireAdmin, deleteFleetVehicle);

// Image upload route
router.post('/upload-image', requireAuth, requireAdmin, uploadFleetImage.single('image'), uploadVehicleImage);

module.exports = router;
