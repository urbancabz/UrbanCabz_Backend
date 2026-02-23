const prisma = require('../../config/prisma');
const cache = require('../../utils/cache');
const bcrypt = require('bcryptjs');
const bookingService = require('../../services/booking.services');

const B2B_CACHE_TTL = 65; // 65 seconds — fresh enough for admin dashboard, safely outlasts 60s poll

/**
 * @route   POST /api/b2b/register
 * @desc    Submit B2B company registration request from contact form
 * @access  Public
 */
const registerB2BRequest = async (req, res) => {
    try {
        const { name, company, email, phone, message } = req.body;

        // Validate required fields
        if (!name || !company || !email || !phone) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Check if request already exists
        const existingRequest = await prisma.b2b_request.findFirst({
            where: { contact_email: email }
        });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                message: 'A request with this email already exists'
            });
        }

        // Create new B2B request
        const b2bRequest = await prisma.b2b_request.create({
            data: {
                contact_name: name,
                contact_email: email,
                contact_phone: phone,
                company_name: company,
                message: message || null,
                status: 'PENDING'
            }
        });

        // Invalidate B2B requests cache
        cache.invalidate('all_b2b_requests_PENDING');
        cache.invalidate('all_b2b_requests_undefined');

        res.status(201).json({
            success: true,
            message: 'Registration request submitted successfully! Our team will contact you shortly.',
            data: {
                id: b2bRequest.id,
                company_name: b2bRequest.company_name
            }
        });

    } catch (error) {
        console.error('B2B Registration Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit registration request'
        });
    }
};

/**
 * @route   GET /api/b2b/requests
 * @desc    Get all B2B requests (Admin only)
 * @access  Private/Admin
 */
const getAllB2BRequests = async (req, res) => {
    try {
        const { status } = req.query;
        const where = status ? { status } : {};
        const cacheKey = `all_b2b_requests_${status}`;

        const requests = await cache.getOrSet(
            cacheKey,
            async () => {
                return await prisma.b2b_request.findMany({
                    where,
                    include: {
                        company: {
                            select: {
                                id: true,
                                company_name: true,
                                company_email: true
                            }
                        }
                    },
                    orderBy: {
                        created_at: 'desc'
                    },
                    take: 50
                });
            },
            B2B_CACHE_TTL
        );

        res.json({
            success: true,
            data: requests
        });

    } catch (error) {
        console.error('Get B2B Requests Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch B2B requests'
        });
    }
};

/**
 * @route   GET /api/b2b/requests/:id
 * @desc    Get single B2B request details (Admin only)
 * @access  Private/Admin
 */
const getB2BRequestById = async (req, res) => {
    try {
        const { id } = req.params;

        const request = await prisma.b2b_request.findUnique({
            where: { id: parseInt(id) },
            include: {
                company: true
            }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }

        res.json({
            success: true,
            data: request
        });

    } catch (error) {
        console.error('Get B2B Request Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch request details'
        });
    }
};

/**
 * @route   POST /api/b2b/requests/:id/approve
 * @desc    Approve B2B request and create company + user (Admin only)
 * @access  Private/Admin
 */
const approveB2BRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_notes, address, city, state, pincode } = req.body;
        const adminId = req.user?.id; // From auth middleware

        const request = await prisma.b2b_request.findUnique({
            where: { id: parseInt(id) }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }

        if (request.status === 'APPROVED') {
            return res.status(400).json({
                success: false,
                message: 'Request already approved'
            });
        }

        // Use transaction to ensure data consistency
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create or get company
            let company = await tx.b2b_company.findUnique({
                where: { company_email: request.contact_email }
            });

            if (!company) {
                company = await tx.b2b_company.create({
                    data: {
                        company_name: request.company_name,
                        company_email: request.contact_email,
                        company_phone: request.contact_phone,
                        address: address || null,
                        city: city || null,
                        state: state || null,
                        pincode: pincode || null
                    }
                });
            }

            // 2. Get or create B2B role
            let b2bRole = await tx.role.findFirst({
                where: { name: 'b2b_user' }
            });

            if (!b2bRole) {
                b2bRole = await tx.role.create({
                    data: { name: 'b2b_user' }
                });
            }

            // 3. Create or get user account
            let user = await tx.user.findUnique({
                where: { email: request.contact_email }
            });

            if (user) {
                // Update existing user to have B2B role
                user = await tx.user.update({
                    where: { id: user.id },
                    data: {
                        role_id: b2bRole.id,
                        // If they already have a password, they don't need "first login" flow
                        // For B2B flow refinement, we set a default password if they don't have one
                        password_hash: user.password_hash || await bcrypt.hash('UrbanCabz123', 10),
                        is_first_login: user.password_hash ? false : true
                    }
                });
            } else {
                user = await tx.user.create({
                    data: {
                        email: request.contact_email,
                        name: request.contact_name,
                        phone: request.contact_phone,
                        role_id: b2bRole.id,
                        is_first_login: true,
                        password_hash: await bcrypt.hash('UrbanCabz123', 10) // Set default password
                    }
                });
            }

            // 4. Link user to company
            await tx.b2b_user.create({
                data: {
                    user_id: user.id,
                    company_id: company.id,
                    is_primary: true
                }
            });

            // 5. Update request status
            const updatedRequest = await tx.b2b_request.update({
                where: { id: parseInt(id) },
                data: {
                    status: 'APPROVED',
                    company_id: company.id,
                    admin_notes: admin_notes || null,
                    reviewed_by: adminId || null,
                    reviewed_at: new Date()
                }
            });

            return { company, user, request: updatedRequest };
        });

        // Invalidate B2B caches
        cache.invalidate('all_b2b_requests_PENDING');
        cache.invalidate('all_b2b_requests_undefined');
        cache.invalidate('all_b2b_companies');

        res.json({
            success: true,
            message: 'B2B request approved successfully',
            data: {
                company: result.company,
                user: {
                    id: result.user.id,
                    email: result.user.email,
                    name: result.user.name
                }
            }
        });

    } catch (error) {
        console.error('Approve B2B Request Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve request'
        });
    }
};

/**
 * @route   POST /api/b2b/requests/:id/reject
 * @desc    Reject B2B request (Admin only)
 * @access  Private/Admin
 */
const rejectB2BRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_notes } = req.body;
        const adminId = req.user?.id;

        const request = await prisma.b2b_request.findUnique({
            where: { id: parseInt(id) }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }

        const updatedRequest = await prisma.b2b_request.update({
            where: { id: parseInt(id) },
            data: {
                status: 'REJECTED',
                admin_notes: admin_notes || null,
                reviewed_by: adminId || null,
                reviewed_at: new Date()
            }
        });

        // Invalidate B2B requests cache
        cache.invalidate(`all_b2b_requests_${request.status}`);
        cache.invalidate('all_b2b_requests_undefined');

        res.json({
            success: true,
            message: 'B2B request rejected',
            data: updatedRequest
        });

    } catch (error) {
        console.error('Reject B2B Request Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject request'
        });
    }
};

/**
 * @route   GET /api/b2b/company/:id
 * @desc    Get company details
 * @access  Private/B2B User
 */
const getCompanyById = async (req, res) => {
    try {
        const { id } = req.params;

        const company = await prisma.b2b_company.findUnique({
            where: { id: parseInt(id) },
            include: {
                b2bUsers: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                name: true,
                                phone: true
                            }
                        }
                    }
                }
            }
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        res.json({
            success: true,
            data: company
        });

    } catch (error) {
        console.error('Get Company Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch company details'
        });
    }
};

/**
 * @route   GET /api/b2b/company/my
 * @desc    Get current user's company profile
 * @access  Private/B2B User
 */
const getMyCompanyProfile = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) return res.status(403).json({ success: false, message: 'Company not found' });

        const company = await prisma.b2b_company.findUnique({
            where: { id: companyId }
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company profile not found'
            });
        }

        res.json({
            success: true,
            data: company
        });

    } catch (error) {
        console.error('Get My Company Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch company profile'
        });
    }
};

/**
 * @route   POST /api/b2b/bookings
 * @desc    Create a ride booking on company credit (using b2b_booking table)
 * @access  Private/B2B User
 */
const createCreditBooking = async (req, res) => {
    try {
        const userId = req.user.id;
        const bookingData = req.body;
        const companyId = req.user.companyId;

        if (!companyId) {
            return res.status(403).json({
                success: false,
                message: 'Company not found'
            });
        }

        // Create B2B booking in the dedicated table
        const booking = await prisma.b2b_booking.create({
            data: {
                company_id: companyId,
                booked_by: userId,
                pickup_location: bookingData.pickupLocation,
                drop_location: bookingData.dropLocation,
                scheduled_at: bookingData.scheduledAt ? new Date(bookingData.scheduledAt) : null,
                distance_km: bookingData.distanceKm || null,
                estimated_fare: bookingData.estimatedFare || null,
                total_amount: bookingData.totalAmount,
                car_model: bookingData.carModel || null,
                status: 'CONFIRMED',
                taxi_assign_status: 'NOT_ASSIGNED'
            }
        });

        res.status(201).json({
            success: true,
            message: 'Booking confirmed on company credit',
            data: booking
        });

    } catch (error) {
        console.error('Create Credit Booking Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create booking'
        });
    }
};

const getCompanyPayments = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) return res.status(403).json({ success: false, message: 'Company not found' });

        const cacheKey = `company_payments_${companyId}`;

        // Fetch all Ledger Payments for this company (Cached)
        const payments = await cache.getOrSet(
            cacheKey,
            async () => {
                return await prisma.b2b_payment.findMany({
                    where: { company_id: companyId },
                    orderBy: { paid_at: 'desc' },
                    take: 50
                });
            },
            B2B_CACHE_TTL
        );

        // Fetch all B2B bookings to calculate summary stats
        const bookings = await prisma.b2b_booking.findMany({
            where: { company_id: companyId },
            take: 100 // Limit for summary calc
        });

        // Calculate Billing Summary
        let totalBilled = 0;
        let totalPaid = 0;

        bookings.forEach(b => {
            totalBilled += parseFloat(b.total_amount) || 0;
        });

        payments.forEach(p => {
            totalPaid += parseFloat(p.amount) || 0;
        });

        const billingSummary = {
            totalBilled,
            totalPaid,
            outstanding: totalBilled - totalPaid,
            totalBookings: bookings.length
        };

        res.json({
            success: true,
            data: {
                payments,
                billingSummary
            }
        });

    } catch (error) {
        console.error('Get My Company Payments Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payment history'
        });
    }
};

const getCompanyBookings = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) return res.status(403).json({ success: false, message: 'Company not found' });

        const cacheKey = `company_bookings_${companyId}`;

        // Fetch all B2B bookings for this company (cached)
        const bookings = await cache.getOrSet(
            cacheKey,
            async () => {
                return await prisma.b2b_booking.findMany({
                    where: { company_id: companyId },
                    orderBy: { created_at: 'desc' },
                    include: {
                        bookedByUser: {
                            select: { id: true, name: true, email: true }
                        },
                        assignments: true
                    },
                    take: 50
                });
            },
            B2B_CACHE_TTL
        );

        res.json({
            success: true,
            data: bookings
        });

    } catch (error) {
        console.error('Get Company Bookings Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch company bookings'
        });
    }
};

/**
 * @route   GET /api/b2b/dashboard-sync
 * @desc    Aggregate Company Profile, Bookings, Payment Stats, and Fleet for the Dashboard mount payload
 * @access  Private/B2B User
 */
const getDashboardSync = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) return res.status(403).json({ success: false, message: 'Company not found' });

        // 1. Get user's company (blocking dependency)
        const company = await prisma.b2b_company.findUnique({ where: { id: companyId } });
        if (!company) return res.status(403).json({ success: false, message: 'Company details not found' });

        // 2. Fetch dependencies purely sequentially to strictly bound DB connection concurrency to 1 per request
        // Bookings (Cached)
        const bookingsRes = await cache.getOrSet(
            `company_bookings_${companyId}`,
            async () => await prisma.b2b_booking.findMany({
                where: { company_id: companyId },
                orderBy: { created_at: 'desc' },
                include: { bookedByUser: { select: { id: true, name: true, email: true } }, assignments: true },
                take: 50
            }),
            B2B_CACHE_TTL
        );

        // Payments (Cached)
        const paymentsRes = await cache.getOrSet(
            `company_payments_${companyId}`,
            async () => await prisma.b2b_payment.findMany({
                where: { company_id: companyId },
                orderBy: { paid_at: 'desc' },
                take: 50
            }),
            B2B_CACHE_TTL
        );

        // Fleet (Live, small query)
        const fleetRes = await prisma.b2b_company_fleet.findMany({
            where: { company_id: companyId, is_active: true },
            include: { vehicle: true }
        });

        // 3. Calculate lightweight billing summary locally without extra DB hits
        let totalBilled = 0;
        let totalPaid = 0;
        bookingsRes.forEach(b => { totalBilled += parseFloat(b.total_amount) || 0; });
        paymentsRes.forEach(p => { totalPaid += parseFloat(p.amount) || 0; });

        res.json({
            success: true,
            data: {
                company: company,
                bookings: bookingsRes,
                payments: paymentsRes,
                billingSummary: {
                    totalBilled,
                    totalPaid,
                    outstanding: totalBilled - totalPaid,
                    totalBookings: bookingsRes.length
                },
                fleet: fleetRes.map(item => ({
                    ...item.vehicle,
                    base_price_per_km: item.custom_price_per_km
                }))
            }
        });

    } catch (error) {
        console.error('B2B Dashboard Sync Error:', error);
        res.status(500).json({ success: false, message: 'Failed to synthesize dashboard data' });
    }
};

// ===================== COMPANY FLEET MANAGEMENT =====================

/**
 * @route   GET /api/b2b/companies
 * @desc    Get all verified B2B companies (Admin only)
 * @access  Private/Admin
 */
const getCompanies = async (req, res) => {
    try {
        const cacheKey = 'all_b2b_companies';
        const companies = await cache.getOrSet(
            cacheKey,
            async () => {
                return await prisma.b2b_company.findMany({
                    orderBy: { company_name: 'asc' },
                    include: {
                        _count: {
                            select: { company_fleet: true }
                        }
                    },
                    take: 50
                });
            },
            B2B_CACHE_TTL
        );

        res.json({ success: true, data: companies });
    } catch (error) {
        console.error('Get Companies Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch companies' });
    }
};

/**
 * @route   GET /api/b2b/companies/:id/fleet
 * @desc    Get fleet assigned to a company (Admin only)
 * @access  Private/Admin
 */
const getCompanyFleet = async (req, res) => {
    try {
        const { id } = req.params;

        const fleet = await prisma.b2b_company_fleet.findMany({
            where: { company_id: parseInt(id) },
            include: {
                vehicle: true
            }
        });

        res.json({ success: true, data: fleet });
    } catch (error) {
        console.error('Get Company Fleet Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company fleet' });
    }
};

/**
 * @route   POST /api/b2b/companies/:id/fleet
 * @desc    Assign vehicle or update price for company
 * @access  Private/Admin
 */
const manageCompanyFleet = async (req, res) => {
    try {
        const { id } = req.params;
        const { fleet_vehicle_id, custom_price_per_km, is_active } = req.body;

        if (!fleet_vehicle_id || !custom_price_per_km) {
            return res.status(400).json({ success: false, message: 'Vehicle ID and price are required' });
        }

        // Upsert: Create if not exists, update if exists
        const assignment = await prisma.b2b_company_fleet.upsert({
            where: {
                company_id_fleet_vehicle_id: {
                    company_id: parseInt(id),
                    fleet_vehicle_id: parseInt(fleet_vehicle_id)
                }
            },
            update: {
                custom_price_per_km: parseFloat(custom_price_per_km),
                is_active: is_active !== undefined ? is_active : true
            },
            create: {
                company_id: parseInt(id),
                fleet_vehicle_id: parseInt(fleet_vehicle_id),
                custom_price_per_km: parseFloat(custom_price_per_km),
                is_active: true
            }
        });

        // Invalidate company fleet caches
        cache.invalidate('all_b2b_companies');

        res.json({ success: true, message: 'Fleet updated successfully', data: assignment });
    } catch (error) {
        console.error('Manage Company Fleet Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update company fleet' });
    }
};

/**
 * @route   DELETE /api/b2b/fleet-assignment/:id
 * @desc    Remove a vehicle assignment from a company
 * @access  Private/Admin
 */
const removeCompanyFleet = async (req, res) => {
    try {
        const { id } = req.params;

        const assignment = await prisma.b2b_company_fleet.findUnique({
            where: { id: parseInt(id) }
        });

        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }

        await prisma.b2b_company_fleet.delete({
            where: { id: parseInt(id) }
        });

        res.json({ success: true, message: 'Vehicle removed from company fleet' });
    } catch (error) {
        console.error('Remove Company Fleet Error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove vehicle assignment' });
    }
};

/**
 * @route   GET /api/b2b/my-fleet
 * @desc    Get fleet assigned to current user's company
 * @access  Private/B2B User
 */
const getMyFleet = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) return res.status(403).json({ success: false, message: 'Company not found' });

        // Fetch assigned fleet
        console.log("[B2B Fleet] Fetching for company ID:", companyId);

        const assignedFleet = await prisma.b2b_company_fleet.findMany({
            where: {
                company_id: companyId,
                is_active: true
            },
            include: {
                vehicle: true
            }
        });

        console.log("[B2B Fleet] Found vehicles:", assignedFleet.length);
        if (assignedFleet.length === 0) {
            // Debug: Check total assignments
            const totalAssignments = await prisma.b2b_company_fleet.findMany({
                where: { company_id: companyId }
            });
            console.log("[B2B Fleet] Total assignments (ignoring active):", totalAssignments.length);
            totalAssignments.forEach(a => {
                console.log(`  - Vehicle ID: ${a.fleet_vehicle_id}, is_active: ${a.is_active}`);
            });
        }

        // Transform to match public fleet structure but with custom price
        const vehicles = assignedFleet.map(item => ({
            ...item.vehicle,
            base_price_per_km: item.custom_price_per_km // Override price
        }));

        res.json({ success: true, data: { vehicles } });

    } catch (error) {
        console.error('Get My Fleet Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch fleet' });
    }
};

/**
 * @route   GET /api/b2b/companies/:id/bookings
         * @desc    Get all bookings and billing stats for a specific company (Admin only)
         * @access  Private/Admin
         */
const getCompanyBookingsForAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = parseInt(id);
        const cacheKey = `admin_company_bookings_${companyId}`;

        // 1. Fetch Bookings (Cached)
        const bookings = await cache.getOrSet(
            cacheKey,
            async () => {
                return await prisma.b2b_booking.findMany({
                    where: { company_id: companyId },
                    orderBy: { created_at: 'desc' },
                    include: {
                        bookedByUser: {
                            select: { id: true, name: true, email: true }
                        }
                    },
                    take: 50
                });
            },
            B2B_CACHE_TTL
        );

        const payments = await prisma.b2b_payment.findMany({
            where: { company_id: companyId },
            orderBy: { paid_at: 'desc' },
            take: 50
        });

        // Calculate Billing Summary
        let totalBilled = 0;
        let totalPaid = 0;

        bookings.forEach(b => {
            totalBilled += parseFloat(b.total_amount) || 0;
        });

        payments.forEach(p => {
            totalPaid += parseFloat(p.amount) || 0;
        });

        const billingSummary = {
            totalBilled,
            totalPaid,
            outstanding: totalBilled - totalPaid,
            totalBookings: bookings.length
        };

        // Monthly Breakdown
        const monthlyBreakdown = {};

        // Track billed
        bookings.forEach(b => {
            const date = new Date(b.created_at);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!monthlyBreakdown[key]) {
                monthlyBreakdown[key] = { count: 0, billed: 0, paid: 0 };
            }

            monthlyBreakdown[key].count++;
            monthlyBreakdown[key].billed += parseFloat(b.total_amount) || 0;
        });

        // Track paid (ledger)
        payments.forEach(p => {
            const date = new Date(p.paid_at);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!monthlyBreakdown[key]) {
                monthlyBreakdown[key] = { count: 0, billed: 0, paid: 0 };
            }

            monthlyBreakdown[key].paid += parseFloat(p.amount) || 0;
        });

        res.json({
            success: true,
            data: {
                bookings,
                payments,
                billingSummary,
                monthlyBreakdown
            }
        });

    } catch (error) {
        console.error('Get Company Bookings (Admin) Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company bookings' });
    }
};

/**
 * @route   POST /api/b2b/payments
 * @desc    Record a ledger payment for a company (Admin only)
 * @access  Private/Admin
 */
const recordCompanyPayment = async (req, res) => {
    try {
        const { company_id, amount, payment_mode, reference_no, notes } = req.body;
        const adminId = req.user?.id;

        const VALID_MODES = ['CASH', 'CHEQUE', 'UPI', 'BANK_TRANSFER', 'OTHER'];

        if (!company_id) return res.status(400).json({ success: false, message: 'Company ID is required' });
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
        if (!payment_mode || !VALID_MODES.includes(payment_mode)) return res.status(400).json({ success: false, message: `Payment mode must be one of: ${VALID_MODES.join(', ')}` });

        // Verify company exists
        const company = await prisma.b2b_company.findUnique({ where: { id: parseInt(company_id) } });
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

        const payment = await prisma.b2b_payment.create({
            data: {
                company_id: parseInt(company_id),
                amount: parseFloat(amount),
                payment_mode,
                reference_no: reference_no || null,
                notes: notes || null,
                created_by: adminId || null
            }
        });

        // Invalidate payments cache
        cache.invalidate(`company_payments_${company_id}`);
        cache.invalidate(`admin_company_bookings_${company_id}`);

        res.json({ success: true, message: 'Payment recorded successfully', data: payment });
    } catch (error) {
        console.error('Record Company Payment Error:', error);
        res.status(500).json({ success: false, message: 'Failed to record payment' });
    }
};

/**
 * @route   POST /api/b2b/companies
 * @desc    Admin manually creates a new company + user
 * @access  Private/Admin
 */
const createCompany = async (req, res) => {
    try {
        const { company_name, company_email, company_phone, address, city, state, pincode, gst_number } = req.body;

        if (!company_name || !company_email || !company_phone) {
            return res.status(400).json({ success: false, message: 'Company name, email, and phone are required' });
        }

        // Check if company email already exists
        const existingCompany = await prisma.b2b_company.findUnique({ where: { company_email } });
        if (existingCompany) {
            return res.status(400).json({ success: false, message: 'Company with this email already exists' });
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create company
            const company = await tx.b2b_company.create({
                data: {
                    company_name,
                    company_email,
                    company_phone,
                    address: address || null,
                    city: city || null,
                    state: state || null,
                    pincode: pincode || null,
                    gst_number: gst_number || null
                }
            });

            // 2. Ensure B2B role exists
            let b2bRole = await tx.role.findFirst({ where: { name: 'b2b_user' } });
            if (!b2bRole) {
                b2bRole = await tx.role.create({ data: { name: 'b2b_user' } });
            }

            // 3. Create or Update User
            let user = await tx.user.findUnique({ where: { email: company_email } });
            if (!user) {
                const hashedPassword = await bcrypt.hash('UrbanCabz123', 10);
                user = await tx.user.create({
                    data: {
                        email: company_email,
                        name: company_name, // Default user name to company name
                        phone: company_phone,
                        role_id: b2bRole.id,
                        is_first_login: true,
                        password_hash: hashedPassword
                    }
                });
            } else {
                // If user exists, ensure they have B2B role if not admin
                // (Strictly speaking we might want to be careful here, but for now we essentially 'upgrade' them or ensuring mapping)
                if (user.role_id !== b2bRole.id) {
                    // logic to handle existing users? 
                    // For now, let's just proceed to link them.
                }
            }

            // 4. Link User to Company
            await tx.b2b_user.create({
                data: {
                    user_id: user.id,
                    company_id: company.id,
                    is_primary: true
                }
            });

            return company;
        });

        // Invalidate companies list
        cache.invalidate('all_b2b_companies');

        res.status(201).json({ success: true, message: 'Company created manually', data: result });
    } catch (error) {
        console.error('Create Company Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create company' });
    }
};

/**
 * @route   PUT /api/b2b/companies/:id
 * @desc    Admin updates company details
 * @access  Private/Admin
 */
const updateCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const { company_name, company_email, company_phone, address, city, state, pincode, gst_number } = req.body;

        const company = await prisma.b2b_company.findUnique({ where: { id: parseInt(id) } });
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

        // If email is changing, check uniqueness
        if (company_email && company_email !== company.company_email) {
            const existing = await prisma.b2b_company.findUnique({ where: { company_email } });
            if (existing) return res.status(400).json({ success: false, message: 'Email already in use by another company' });
        }

        const updated = await prisma.b2b_company.update({
            where: { id: parseInt(id) },
            data: {
                company_name,
                company_email,
                company_phone,
                address,
                city,
                state,
                pincode,
                gst_number
            }
        });

        // Invalidate company list
        cache.invalidate('all_b2b_companies');

        res.json({ success: true, message: 'Company details updated', data: updated });
    } catch (error) {
        console.error('Update Company Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update company' });
    }
};

module.exports = {
    registerB2BRequest,
    getAllB2BRequests,
    getB2BRequestById,
    approveB2BRequest,
    rejectB2BRequest,
    getCompanyById,
    getMyCompanyProfile,
    createCreditBooking,
    getCompanyBookings,
    getCompanyPayments,
    getCompanies,
    getCompanyFleet,
    manageCompanyFleet,
    removeCompanyFleet,
    getMyFleet,
    getDashboardSync,
    getCompanyBookingsForAdmin,
    recordCompanyPayment,
    createCompany,
    updateCompany
};
