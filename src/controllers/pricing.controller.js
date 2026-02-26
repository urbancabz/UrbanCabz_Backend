const prisma = require('../config/prisma');
const { withRetry } = require('../config/prisma');
const cache = require('../utils/cache');

const PRICING_CACHE_KEY = 'pricing_settings';
const PRICING_CACHE_TTL = 30 * 60; // 30 minutes — pricing rarely changes; long TTL reduces stampede risk

// Get Global Pricing Settings (cached - avoids DB hit on every page load)
const getPricingSettings = async (req, res) => {
    try {
        // getOrSet prevents Cache Stampedes by only allowing 1 concurrent DB query
        const settings = await cache.getOrSet(
            PRICING_CACHE_KEY,
            async () => {
                let dbSettings = await withRetry(
                    () => prisma.pricing_settings.findFirst(),
                    'pricing_settings.findFirst'
                );

                if (!dbSettings) {
                    dbSettings = await withRetry(() => prisma.pricing_settings.create({
                        data: {
                            min_km_threshold: 100.0,
                            min_km_airport_apply: false,
                            min_km_oneway_apply: false,
                            min_km_roundtrip_apply: false,
                            service_airport_enabled: true,
                            service_oneway_enabled: true,
                            service_roundtrip_enabled: true
                        }
                    }), 'pricing_settings.create');
                }
                return dbSettings;
            },
            PRICING_CACHE_TTL
        );

        // Prevent BROWSER caching so dynamic frontend mounting always gets the real DB toggle state
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        return res.json({ success: true, data: settings });
    } catch (error) {
        console.error('Error fetching pricing settings:', error);

        // If DB is busy, return last cached value if available
        const stale = cache.get(PRICING_CACHE_KEY);
        if (stale) return res.json({ success: true, data: stale, stale: true });

        return res.status(503).json({ success: false, message: 'Pricing temporarily unavailable' });
    }
};

// Update Global Pricing Settings
const updatePricingSettings = async (req, res) => {
    try {
        const {
            min_km_threshold,
            min_km_airport_apply,
            min_km_oneway_apply,
            min_km_roundtrip_apply,
            service_airport_enabled,
            service_oneway_enabled,
            service_roundtrip_enabled
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
                    ...(min_km_roundtrip_apply !== undefined && { min_km_roundtrip_apply: !!min_km_roundtrip_apply }),
                    ...(service_airport_enabled !== undefined && { service_airport_enabled: !!service_airport_enabled }),
                    ...(service_oneway_enabled !== undefined && { service_oneway_enabled: !!service_oneway_enabled }),
                    ...(service_roundtrip_enabled !== undefined && { service_roundtrip_enabled: !!service_roundtrip_enabled })
                }
            });
        } else {
            settings = await prisma.pricing_settings.create({
                data: {
                    min_km_threshold: min_km_threshold !== undefined ? parseFloat(min_km_threshold) : 100.0,
                    min_km_airport_apply: !!min_km_airport_apply,
                    min_km_oneway_apply: !!min_km_oneway_apply,
                    min_km_roundtrip_apply: !!min_km_roundtrip_apply,
                    service_airport_enabled: service_airport_enabled !== undefined ? !!service_airport_enabled : true,
                    service_oneway_enabled: service_oneway_enabled !== undefined ? !!service_oneway_enabled : true,
                    service_roundtrip_enabled: service_roundtrip_enabled !== undefined ? !!service_roundtrip_enabled : true
                }
            });
        }

        // Invalidate the cache so the next GET fetches fresh data from DB
        cache.invalidate(PRICING_CACHE_KEY);

        // Log audit
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
