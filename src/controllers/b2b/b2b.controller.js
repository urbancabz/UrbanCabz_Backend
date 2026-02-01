const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const bookingService = require('../../services/booking.services');

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

        const where = {};
        if (status) {
            where.status = status;
        }

        const requests = await prisma.b2b_request.findMany({
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
            }
        });

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
        const { admin_notes } = req.body;
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
                        company_phone: request.contact_phone
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
        const userId = req.user.id;

        const b2bUser = await prisma.b2b_user.findFirst({
            where: { user_id: userId },
            include: {
                company: true
            }
        });

        if (!b2bUser || !b2bUser.company) {
            return res.status(404).json({
                success: false,
                message: 'Company association not found for this user'
            });
        }

        res.json({
            success: true,
            data: b2bUser.company
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

        // Verify B2B association
        const b2bUser = await prisma.b2b_user.findFirst({
            where: { user_id: userId },
            include: { company: true }
        });

        if (!b2bUser || !b2bUser.company) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to make company bookings'
            });
        }

        // Create B2B booking in the dedicated table
        const booking = await prisma.b2b_booking.create({
            data: {
                company_id: b2bUser.company.id,
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

const getCompanyBookings = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user's company
        const b2bUser = await prisma.b2b_user.findFirst({
            where: { user_id: userId },
            include: { company: true }
        });

        if (!b2bUser || !b2bUser.company) {
            return res.status(403).json({
                success: false,
                message: 'Company not found for this user'
            });
        }

        // Fetch all B2B bookings for this company
        const bookings = await prisma.b2b_booking.findMany({
            where: { company_id: b2bUser.company.id },
            orderBy: { created_at: 'desc' },
            include: {
                bookedByUser: {
                    select: { id: true, name: true, email: true }
                },
                assignments: true
            }
        });

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

// ===================== COMPANY FLEET MANAGEMENT =====================

/**
 * @route   GET /api/b2b/companies
 * @desc    Get all verified B2B companies (Admin only)
 * @access  Private/Admin
 */
const getCompanies = async (req, res) => {
    try {
        const companies = await prisma.b2b_company.findMany({
            orderBy: { company_name: 'asc' },
            include: {
                _count: {
                    select: { company_fleet: true }
                }
            }
        });

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

        res.json({ success: true, message: 'Fleet updated successfully', data: assignment });
    } catch (error) {
        console.error('Manage Company Fleet Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update company fleet' });
    }
};

/**
 * @route   GET /api/b2b/my-fleet
 * @desc    Get fleet assigned to current user's company
 * @access  Private/B2B User
 */
const getMyFleet = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user's company
        const b2bUser = await prisma.b2b_user.findFirst({
            where: { user_id: userId },
            include: { company: true }
        });

        if (!b2bUser || !b2bUser.company) {
            return res.status(403).json({ success: false, message: 'Company not found' });
        }

        // Fetch assigned fleet
        const assignedFleet = await prisma.b2b_company_fleet.findMany({
            where: {
                company_id: b2bUser.company.id,
                is_active: true,
                vehicle: { is_active: true } // Ensure base vehicle is also active
            },
            include: {
                vehicle: true
            }
        });

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

        // 1. Fetch Bookings
        const bookings = await prisma.b2b_booking.findMany({
            where: { company_id: companyId },
            orderBy: { created_at: 'desc' },
            include: {
                bookedByUser: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        const payments = await prisma.b2b_payment.findMany({
            where: { company_id: companyId },
            orderBy: { paid_at: 'desc' },
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

        if (!company_id || !amount) {
            return res.status(400).json({ success: false, message: 'Company and amount are required' });
        }

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

        res.json({ success: true, message: 'Payment recorded successfully', data: payment });
    } catch (error) {
        console.error('Record Company Payment Error:', error);
        res.status(500).json({ success: false, message: 'Failed to record payment' });
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
    getCompanies,
    getCompanyFleet,
    manageCompanyFleet,
    getMyFleet,
    getCompanyBookingsForAdmin,
    recordCompanyPayment
};
