const prisma = require('../config/prisma');

// ===================== FLEET VEHICLE CRUD =====================

// GET all fleet vehicles
const getFleetVehicles = async (req, res) => {
    try {
        const { activeOnly } = req.query;
        const where = activeOnly === 'true' ? { is_active: true } : {};

        const vehicles = await prisma.fleet_vehicle.findMany({
            where,
            orderBy: { category: 'asc' }
        });

        res.json({ success: true, data: { vehicles } });
    } catch (error) {
        console.error('Error fetching fleet vehicles:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch vehicles' });
    }
};

// GET single fleet vehicle
const getFleetVehicle = async (req, res) => {
    try {
        const { id } = req.params;
        const vehicle = await prisma.fleet_vehicle.findUnique({
            where: { id: parseInt(id) }
        });

        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        res.json({ success: true, data: { vehicle } });
    } catch (error) {
        console.error('Error fetching vehicle:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch vehicle' });
    }
};

// CREATE fleet vehicle
const createFleetVehicle = async (req, res) => {
    try {
        const {
            name, seats, base_price_per_km, category, description, image_url, is_active,
            min_km_threshold, min_km_airport_apply, min_km_oneway_apply, min_km_roundtrip_apply
        } = req.body;

        if (!name || !seats || !base_price_per_km || !category) {
            return res.status(400).json({ success: false, message: 'Name, seats, base_price_per_km, and category are required' });
        }

        const vehicle = await prisma.fleet_vehicle.create({
            data: {
                name,
                seats: parseInt(seats),
                base_price_per_km: parseFloat(base_price_per_km),
                category,
                description: description || null,
                image_url: image_url || null,
                is_active: is_active !== false
            }
        });

        // Log audit trail
        await prisma.audit_log.create({
            data: {
                entity_type: 'FLEET',
                entity_id: vehicle.id,
                action: 'CREATE',
                new_value: JSON.stringify(vehicle),
                admin_id: req.user?.id || 0,
                reason: 'Vehicle added to fleet'
            }
        });

        res.status(201).json({ success: true, data: { vehicle }, message: 'Vehicle created successfully' });
    } catch (error) {
        console.error('Error creating vehicle:', error);
        res.status(500).json({ success: false, message: 'Failed to create vehicle' });
    }
};

// UPDATE fleet vehicle
const updateFleetVehicle = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, seats, base_price_per_km, category, description, image_url, is_active,
            min_km_threshold, min_km_airport_apply, min_km_oneway_apply, min_km_roundtrip_apply
        } = req.body;

        const existing = await prisma.fleet_vehicle.findUnique({ where: { id: parseInt(id) } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        const vehicle = await prisma.fleet_vehicle.update({
            where: { id: parseInt(id) },
            data: {
                ...(name && { name }),
                ...(seats && { seats: parseInt(seats) }),
                ...(base_price_per_km && { base_price_per_km: parseFloat(base_price_per_km) }),
                ...(category && { category }),
                ...(description !== undefined && { description }),
                ...(image_url !== undefined && { image_url }),
                ...(is_active !== undefined && { is_active })
            }
        });

        // Log audit trail
        await prisma.audit_log.create({
            data: {
                entity_type: 'FLEET',
                entity_id: vehicle.id,
                action: 'UPDATE',
                old_value: JSON.stringify(existing),
                new_value: JSON.stringify(vehicle),
                admin_id: req.user?.id || 0,
                reason: 'Vehicle details updated'
            }
        });

        res.json({ success: true, data: { vehicle }, message: 'Vehicle updated successfully' });
    } catch (error) {
        console.error('Error updating vehicle:', error);
        res.status(500).json({ success: false, message: 'Failed to update vehicle' });
    }
};

// DELETE (soft delete) fleet vehicle
const deleteFleetVehicle = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await prisma.fleet_vehicle.findUnique({ where: { id: parseInt(id) } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        // Soft delete - just mark as inactive
        const vehicle = await prisma.fleet_vehicle.update({
            where: { id: parseInt(id) },
            data: { is_active: false }
        });

        // Log audit trail
        await prisma.audit_log.create({
            data: {
                entity_type: 'FLEET',
                entity_id: vehicle.id,
                action: 'DELETE',
                old_value: JSON.stringify(existing),
                admin_id: req.user?.id || 0,
                reason: 'Vehicle deactivated from fleet'
            }
        });

        res.json({ success: true, message: 'Vehicle deactivated successfully' });
    } catch (error) {
        console.error('Error deleting vehicle:', error);
        res.status(500).json({ success: false, message: 'Failed to delete vehicle' });
    }
};

// UPLOAD vehicle image
const uploadVehicleImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image file provided' });
        }

        // Cloudinary returns the URL in req.file.path
        const imageUrl = req.file.path;

        res.json({
            success: true,
            data: { image_url: imageUrl },
            message: 'Image uploaded successfully'
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ success: false, message: 'Failed to upload image' });
    }
};

module.exports = {
    getFleetVehicles,
    getFleetVehicle,
    createFleetVehicle,
    updateFleetVehicle,
    deleteFleetVehicle,
    uploadVehicleImage
};
