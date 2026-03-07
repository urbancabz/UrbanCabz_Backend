const { prisma } = require('../config/prisma');
const cache = require('../utils/cache');

const PRICING_CACHE_KEY = 'pricing_settings';
const PRICING_CACHE_FALLBACK_KEY = 'pricing_settings_fallback';
const PRICING_CACHE_TTL = 30 * 60; // 30 minutes — pricing rarely changes; long TTL reduces stampede risk
const PRICING_FALLBACK_TTL = 7 * 24 * 60 * 60; // 7 days — keeps service alive through transient DB outages
const PRICING_DB_RETRY_ATTEMPTS = 3;

const DEFAULT_PRICING_SETTINGS = {
    id: 0,
    min_km_threshold: 100.0,
    min_km_airport_apply: false,
    min_km_oneway_apply: false,
    min_km_roundtrip_apply: false,
    service_airport_enabled: true,
    service_oneway_enabled: true,
    service_roundtrip_enabled: true
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientPrismaPoolError = (error) => {
    const code = error?.code;
    return code === 'P2024' || code === 'P1001' || code === 'P1008';
};

const fetchPricingSettingsFromDb = async () => {
    for (let attempt = 1; attempt <= PRICING_DB_RETRY_ATTEMPTS; attempt += 1) {
        try {
            let dbSettings = await prisma.pricing_settings.findFirst();

            if (!dbSettings) {
                dbSettings = await prisma.pricing_settings.create({
                    data: {
                        min_km_threshold: 100.0,
                        min_km_airport_apply: false,
                        min_km_oneway_apply: false,
                        min_km_roundtrip_apply: false,
                        service_airport_enabled: true,
                        service_oneway_enabled: true,
                        service_roundtrip_enabled: true
                    }
                });
            }

            return dbSettings;
        } catch (error) {
            if (!isTransientPrismaPoolError(error) || attempt === PRICING_DB_RETRY_ATTEMPTS) {
                throw error;
            }

            const backoffMs = attempt * 200;
            await sleep(backoffMs);
        }
    }

    return null;
};

// Get Global Pricing Settings (cached - avoids DB hit on every page load)
const getPricingSettings = async (req, res) => {
    try {
        // getOrSet prevents Cache Stampedes by only allowing 1 concurrent DB query
        const settings = await cache.getOrSet(
            PRICING_CACHE_KEY,
            async () => {
                const dbSettings = await fetchPricingSettingsFromDb();
                cache.set(PRICING_CACHE_FALLBACK_KEY, dbSettings, PRICING_FALLBACK_TTL);
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

        // If DB is busy/unreachable, return last known good value from long-lived fallback cache
        const fallback = cache.get(PRICING_CACHE_FALLBACK_KEY) || cache.get(PRICING_CACHE_KEY);
        if (fallback) return res.json({ success: true, data: fallback, stale: true });

        // Final safety-net for production uptime: return default pricing profile.
        return res.json({ success: true, data: DEFAULT_PRICING_SETTINGS, stale: true, fallback: 'default' });
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
        let settings = await fetchPricingSettingsFromDb();

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

        // Invalidate short cache and refresh long-lived fallback immediately with latest value
        cache.invalidate(PRICING_CACHE_KEY);
        cache.set(PRICING_CACHE_FALLBACK_KEY, settings, PRICING_FALLBACK_TTL);

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

        if (isTransientPrismaPoolError(error)) {
            return res.status(503).json({ success: false, message: 'Database busy, please retry in a few seconds' });
        }

        res.status(500).json({ success: false, message: 'Failed to update settings' });
    }
};

module.exports = {
    getPricingSettings,
    updatePricingSettings
};
