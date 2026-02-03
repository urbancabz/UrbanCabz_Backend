const prisma = require('../config/prisma');

// Get Global Pricing Settings
const getPricingSettings = async (req, res) => {
    try {
        // Fetch first row, or create default if not exists
        let settings = await prisma.pricing_settings.findFirst();

        if (!settings) {
            settings = await prisma.pricing_settings.create({
                data: {
                    min_km_threshold: 100.0,
                    min_km_airport_apply: false,
                    min_km_oneway_apply: false,
                    min_km_roundtrip_apply: false
                }
            });
        }

        res.json({ success: true, data: settings });
    } catch (error) {
        console.error('Error fetching pricing settings:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
};

// Update Global Pricing Settings
const updatePricingSettings = async (req, res) => {
    try {
        const {
            min_km_threshold,
            min_km_airport_apply,
            min_km_oneway_apply,
            min_km_roundtrip_apply
        } = req.body;

        // Find existing to update
        let settings = await prisma.pricing_settings.findFirst();

        if (settings) {
            settings = await prisma.pricing_settings.update({
                where: { id: settings.id },
                data: {
                    ...(min_km_threshold !== undefined && { min_km_threshold: parseFloat(min_km_threshold) }),
                    ...(min_km_airport_apply !== undefined && { min_km_airport_apply: !!min_km_airport_apply }),
                    ...(min_km_oneway_apply !== undefined && { min_km_oneway_apply: !!min_km_oneway_apply }),
                    ...(min_km_roundtrip_apply !== undefined && { min_km_roundtrip_apply: !!min_km_roundtrip_apply })
                }
            });
        } else {
            // Should verify rare edge case where it doesn't exist
            settings = await prisma.pricing_settings.create({
                data: {
                    min_km_threshold: min_km_threshold !== undefined ? parseFloat(min_km_threshold) : 100.0,
                    min_km_airport_apply: !!min_km_airport_apply,
                    min_km_oneway_apply: !!min_km_oneway_apply,
                    min_km_roundtrip_apply: !!min_km_roundtrip_apply
                }
            });
        }

        // Log audit (optional but good)
        await prisma.audit_log.create({
            data: {
                entity_type: 'PRICING',
                entity_id: settings.id,
                action: 'UPDATE',
                new_value: JSON.stringify(settings),
                admin_id: req.user?.id || 0,
                reason: 'Updated global pricing settings'
            }
        });

        res.json({ success: true, data: settings, message: 'Settings updated successfully' });

    } catch (error) {
        console.error('Error updating pricing settings:', error);
        res.status(500).json({ success: false, message: 'Failed to update settings' });
    }
};

module.exports = {
    getPricingSettings,
    updatePricingSettings
};
