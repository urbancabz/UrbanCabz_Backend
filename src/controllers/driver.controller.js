const prisma = require('../config/prisma');

// ===================== DRIVER REGISTRY CRUD =====================

// GET all drivers
const getDrivers = async (req, res) => {
    try {
        const { activeOnly } = req.query;
        const where = activeOnly === 'true' ? { is_active: true } : {};

        const drivers = await prisma.driver.findMany({
            where,
            orderBy: { name: 'asc' }
        });

        res.json({ success: true, data: { drivers } });
    } catch (error) {
        console.error('Error fetching drivers:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch drivers' });
    }
};

// GET single driver
const getDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const driver = await prisma.driver.findUnique({
            where: { id: parseInt(id) }
        });

        if (!driver) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        res.json({ success: true, data: { driver } });
    } catch (error) {
        console.error('Error fetching driver:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch driver' });
    }
};

// CREATE driver
const createDriver = async (req, res) => {
    try {
        const { name, phone, license_no, is_active } = req.body;

        if (!name || !phone) {
            return res.status(400).json({ success: false, message: 'Name and phone are required' });
        }

        // Check for existing phone
        const existing = await prisma.driver.findUnique({ where: { phone } });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Driver with this phone already exists' });
        }

        const driver = await prisma.driver.create({
            data: {
                name,
                phone,
                license_no: license_no || null,
                is_active: is_active !== false
            }
        });

        // Log audit trail
        await prisma.audit_log.create({
            data: {
                entity_type: 'USER', // Using USER as there's no DRIVER entity type in audit_log enum/logic usually, but let's check audit_log schema
                entity_id: driver.id,
                action: 'CREATE',
                new_value: JSON.stringify(driver),
                admin_id: req.user?.id || 0,
                reason: 'Driver added to registry'
            }
        });

        res.status(201).json({ success: true, data: { driver }, message: 'Driver registered successfully' });
    } catch (error) {
        console.error('Error creating driver:', error);
        res.status(500).json({ success: false, message: 'Failed to create driver' });
    }
};

// UPDATE driver
const updateDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, license_no, is_active } = req.body;

        const existing = await prisma.driver.findUnique({ where: { id: parseInt(id) } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        // If phone is changing, check for duplicates
        if (phone && phone !== existing.phone) {
            const conflict = await prisma.driver.findUnique({ where: { phone } });
            if (conflict) {
                return res.status(400).json({ success: false, message: 'Another driver with this phone already exists' });
            }
        }

        const driver = await prisma.driver.update({
            where: { id: parseInt(id) },
            data: {
                ...(name && { name }),
                ...(phone && { phone }),
                ...(license_no !== undefined && { license_no }),
                ...(is_active !== undefined && { is_active })
            }
        });

        // Log audit trail
        await prisma.audit_log.create({
            data: {
                entity_type: 'USER',
                entity_id: driver.id,
                action: 'UPDATE',
                old_value: JSON.stringify(existing),
                new_value: JSON.stringify(driver),
                admin_id: req.user?.id || 0,
                reason: 'Driver details updated'
            }
        });

        res.json({ success: true, data: { driver }, message: 'Driver updated successfully' });
    } catch (error) {
        console.error('Error updating driver:', error);
        res.status(500).json({ success: false, message: 'Failed to update driver' });
    }
};

// DELETE (soft delete) driver
const deleteDriver = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await prisma.driver.findUnique({ where: { id: parseInt(id) } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        // Soft delete - just mark as inactive
        const driver = await prisma.driver.update({
            where: { id: parseInt(id) },
            data: { is_active: false }
        });

        // Log audit trail
        await prisma.audit_log.create({
            data: {
                entity_type: 'USER',
                entity_id: driver.id,
                action: 'DELETE',
                old_value: JSON.stringify(existing),
                admin_id: req.user?.id || 0,
                reason: 'Driver deactivated'
            }
        });

        res.json({ success: true, message: 'Driver deactivated successfully' });
    } catch (error) {
        console.error('Error deleting driver:', error);
        res.status(500).json({ success: false, message: 'Failed to delete driver' });
    }
};

module.exports = {
    getDrivers,
    getDriver,
    createDriver,
    updateDriver,
    deleteDriver
};
