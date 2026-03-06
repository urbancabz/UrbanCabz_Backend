const { withRetry } = require('../../config/prisma');
const prisma = require('../../config/prisma');
const cache = require('../../utils/cache');
const bcrypt = require('bcryptjs');
const bookingService = require('../../services/booking.services');

const B2B_CACHE_TTL = 65; // 65 seconds — fresh enough for admin dashboard, safely outlasts 60s poll

/**
 * Normalize phone: accept +91XXXXXXXXXX or 91XXXXXXXXXX or XXXXXXXXXX
 * Always store as plain 10-digit number for consistency.
 */
function normalizePhone(phone) {
    if (!phone) return phone;
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2); // 919876543210 -> 9876543210
    if (digits.length === 10) return digits;  // already 10 digits, clean
    return String(phone).trim(); // unknown format, keep as-is
}

/**
 * @route   POST /api/b2b/register
 * @desc    Submit B2B company registration request from contact form
 * @access  Public
 */
const registerB2BRequest = async (req, res) => {
    try {
        const { name, company, email, phone, message } = req.body;

        if (!name || !company || !email || !phone) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const existingRequest = await withRetry(() => prisma.b2b_request.findFirst({
            where: { contact_email: email }
        }));

        if (existingRequest) {
            return res.status(400).json({ success: false, message: 'A request with this email already exists' });
        }

        const b2bRequest = await withRetry(() => prisma.b2b_request.create({
            data: {
                contact_name: name,
                contact_email: email,
                contact_phone: normalizePhone(phone),
                company_name: company,
                message: message || null,
                status: 'PENDING'
            }
        }));

        cache.invalidate('all_b2b_requests_PENDING');
        cache.invalidate('all_b2b_requests_undefined');

        res.status(201).json({
            success: true,
            message: 'Registration request submitted successfully!',
            data: { id: b2bRequest.id, company_name: b2bRequest.company_name }
        });

    } catch (error) {
        console.error('B2B Registration Error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit registration request' });
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
                return await withRetry(() => prisma.b2b_request.findMany({
                    where,
                    include: {
                        company: { select: { id: true, company_name: true, company_email: true } }
                    },
                    orderBy: { created_at: 'desc' },
                    take: 50
                }));
            },
            B2B_CACHE_TTL
        );

        res.json({ success: true, data: requests });
    } catch (error) {
        console.error('Get B2B Requests Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch B2B requests' });
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
        const request = await withRetry(() => prisma.b2b_request.findUnique({
            where: { id: parseInt(id) },
            include: { company: true }
        }));

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        res.json({ success: true, data: request });
    } catch (error) {
        console.error('Get B2B Request Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch request details' });
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
        const { address, city, state, pincode } = req.body;
        const adminId = req.user?.id;

        const request = await withRetry(() => prisma.b2b_request.findUnique({
            where: { id: parseInt(id) }
        }));

        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
        if (request.status === 'APPROVED') return res.status(400).json({ success: false, message: 'Request already approved' });

        const result = await prisma.$transaction(async (tx) => {
            let company = await tx.b2b_company.findUnique({ where: { company_email: request.contact_email } });
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

            let b2bRole = await tx.role.findFirst({ where: { name: 'b2b_user' } });
            if (!b2bRole) {
                b2bRole = await tx.role.create({ data: { name: 'b2b_user' } });
            }

            let user = await tx.user.findUnique({ where: { email: request.contact_email } });
            if (user) {
                user = await tx.user.update({
                    where: { id: user.id },
                    data: {
                        role_id: b2bRole.id,
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
                        password_hash: await bcrypt.hash('UrbanCabz123', 10)
                    }
                });
            }

            await tx.b2b_user.create({
                data: { user_id: user.id, company_id: company.id, is_primary: true }
            });

            const updatedRequest = await tx.b2b_request.update({
                where: { id: parseInt(id) },
                data: {
                    status: 'APPROVED',
                    company_id: company.id,
                    reviewed_by: adminId || null,
                    reviewed_at: new Date()
                }
            });

            return { company, user, request: updatedRequest };
        });

        cache.invalidate('all_b2b_requests_PENDING');
        cache.invalidate('all_b2b_requests_undefined');
        cache.invalidate('all_b2b_companies');

        res.json({
            success: true,
            message: 'B2B request approved successfully',
            data: { company: result.company, user: { id: result.user.id, email: result.user.email, name: result.user.name } }
        });

    } catch (error) {
        console.error('Approve B2B Request Error:', error);
        res.status(500).json({ success: false, message: 'Failed to approve request' });
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
        const adminId = req.user?.id;

        const request = await withRetry(() => prisma.b2b_request.findUnique({ where: { id: parseInt(id) } }));
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

        const updatedRequest = await withRetry(() => prisma.b2b_request.update({
            where: { id: parseInt(id) },
            data: {
                status: 'REJECTED',
                reviewed_by: adminId || null,
                reviewed_at: new Date()
            }
        }));

        cache.invalidate(`all_b2b_requests_${request.status}`);
        cache.invalidate('all_b2b_requests_undefined');

        res.json({ success: true, message: 'B2B request rejected', data: updatedRequest });
    } catch (error) {
        console.error('Reject B2B Request Error:', error);
        res.status(500).json({ success: false, message: 'Failed to reject request' });
    }
};

/**
 * @route   GET /api/b2b/company/:id
 */
const getCompanyById = async (req, res) => {
    try {
        const { id } = req.params;
        const cacheKey = `b2b:company:${id}`;

        const company = await cache.getOrSet(
            cacheKey,
            async () => {
                return await withRetry(() => prisma.b2b_company.findUnique({
                    where: { id: parseInt(id) },
                    include: {
                        b2bUsers: {
                            include: {
                                user: { select: { id: true, email: true, name: true, phone: true } }
                            }
                        }
                    }
                }));
            },
            B2B_CACHE_TTL
        );

        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
        res.json({ success: true, data: company });
    } catch (error) {
        console.error('Get Company Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company details' });
    }
};

/**
 * @route   GET /api/b2b/company/my
 */
const getMyCompanyProfile = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) return res.status(403).json({ success: false, message: 'Company not found' });

        const cacheKey = `b2b:my_company:${companyId}`;
        const company = await cache.getOrSet(
            cacheKey,
            async () => {
                return await withRetry(() => prisma.b2b_company.findUnique({ where: { id: companyId } }));
            },
            B2B_CACHE_TTL
        );

        if (!company) return res.status(404).json({ success: false, message: 'Company profile not found' });
        res.json({ success: true, data: company });
    } catch (error) {
        console.error('Get My Company Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company profile' });
    }
};

/**
 * @route   POST /api/b2b/bookings
 */
const createCreditBooking = async (req, res) => {
    try {
        const userId = req.user.id;
        const bookingData = req.body;
        const companyId = req.user.companyId;

        if (!companyId) return res.status(403).json({ success: false, message: 'Company not found' });

        const carModel = bookingData.carModel || bookingData.car_model || null;

        const booking = await withRetry(() => prisma.b2b_booking.create({
            data: {
                company_id: companyId,
                booked_by: userId,
                pickup_location: bookingData.pickupLocation || bookingData.pickup_location,
                drop_location: bookingData.dropLocation || bookingData.drop_location,
                scheduled_at: bookingData.scheduledAt ? new Date(bookingData.scheduledAt) : null,
                distance_km: bookingData.distanceKm || bookingData.distance_km || null,
                estimated_fare: bookingData.estimatedFare || bookingData.estimated_fare || null,
                total_amount: bookingData.totalAmount || bookingData.total_amount,
                car_model: carModel,
                status: 'CONFIRMED',
                taxi_assign_status: 'NOT_ASSIGNED'
            }
        }));

        res.status(201).json({ success: true, message: 'Booking confirmed on company credit', data: booking });
    } catch (error) {
        console.error('Create Credit Booking Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to create booking' });
    }
};

const getCompanyPayments = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) return res.status(403).json({ success: false, message: 'Company not found' });

        const [payments, bookings] = await Promise.all([
            cache.getOrSet(`company_payments_${companyId}`, 
                () => withRetry(() => prisma.b2b_payment.findMany({
                    where: { company_id: companyId },
                    orderBy: { paid_at: 'desc' },
                    take: 50
                })), B2B_CACHE_TTL),
            cache.getOrSet(`b2b:company_bookings_billing:${companyId}`,
                () => withRetry(() => prisma.b2b_booking.findMany({
                    where: { company_id: companyId },
                    take: 100
                })), B2B_CACHE_TTL)
        ]);

        let totalBilled = 0;
        let totalPaid = 0;
        bookings.forEach(b => { totalBilled += parseFloat(b.total_amount) || 0; });
        payments.forEach(p => { totalPaid += parseFloat(p.amount) || 0; });

        res.json({
            success: true,
            data: { payments, billingSummary: { totalBilled, totalPaid, outstanding: totalBilled - totalPaid, totalBookings: bookings.length } }
        });
    } catch (error) {
        console.error('Get My Company Payments Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payment history' });
    }
};

const getCompanyBookings = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) return res.status(403).json({ success: false, message: 'Company not found' });

        const bookings = await cache.getOrSet(`company_bookings_${companyId}`,
            () => withRetry(() => prisma.b2b_booking.findMany({
                where: { company_id: companyId },
                orderBy: { created_at: 'desc' },
                include: { bookedByUser: { select: { id: true, name: true, email: true } }, assignments: true },
                take: 50
            })), B2B_CACHE_TTL);

        res.json({ success: true, data: bookings });
    } catch (error) {
        console.error('Get Company Bookings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company bookings' });
    }
};

/**
 * @route   GET /api/b2b/dashboard-sync
 * Aggregated B2B Dashboard payload.
 * Refactored to use parallel queries with individual retries.
 */
const getDashboardSync = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) return res.status(403).json({ success: false, message: 'Company not found' });

        const [company, bookingsRes, paymentsRes, fleetRes] = await Promise.all([
            cache.getOrSet(`b2b:company:${companyId}`,
                () => withRetry(() => prisma.b2b_company.findUnique({ where: { id: companyId } })), B2B_CACHE_TTL),
            cache.getOrSet(`company_bookings_${companyId}`,
                () => withRetry(() => prisma.b2b_booking.findMany({
                    where: { company_id: companyId },
                    orderBy: { created_at: 'desc' },
                    include: { bookedByUser: { select: { id: true, name: true, email: true } }, assignments: true },
                    take: 50
                })), B2B_CACHE_TTL),
            cache.getOrSet(`company_payments_${companyId}`,
                () => withRetry(() => prisma.b2b_payment.findMany({
                    where: { company_id: companyId },
                    orderBy: { paid_at: 'desc' },
                    take: 50
                })), B2B_CACHE_TTL),
            cache.getOrSet(`b2b:my_fleet:${companyId}`,
                () => withRetry(() => prisma.b2b_company_fleet.findMany({
                    where: { company_id: companyId, is_active: true },
                    include: { vehicle: true }
                })), B2B_CACHE_TTL)
        ]);

        if (!company) return res.status(403).json({ success: false, message: 'Company details not found' });

        let totalBilled = 0;
        let totalPaid = 0;
        bookingsRes.forEach(b => { totalBilled += parseFloat(b.total_amount) || 0; });
        paymentsRes.forEach(p => { totalPaid += parseFloat(p.amount) || 0; });

        res.json({
            success: true,
            data: {
                company,
                bookings: bookingsRes,
                payments: paymentsRes,
                billingSummary: { totalBilled, totalPaid, outstanding: totalBilled - totalPaid, totalBookings: bookingsRes.length },
                fleet: fleetRes.map(item => ({ ...item.vehicle, base_price_per_km: item.custom_price_per_km }))
            }
        });

    } catch (error) {
        console.error('B2B Dashboard Sync Error:', error);
        res.status(500).json({ success: false, message: 'Failed to synthesize dashboard data', debug: error.message });
    }
};

/**
 * @route   GET /api/b2b/companies
 * @desc    Get all verified B2B companies (Admin only)
 */
const getCompanies = async (req, res) => {
    try {
        const companies = await cache.getOrSet('all_b2b_companies',
            () => withRetry(() => prisma.b2b_company.findMany({
                orderBy: { company_name: 'asc' },
                include: { _count: { select: { company_fleet: true } } },
                take: 50
            })), B2B_CACHE_TTL);

        res.json({ success: true, data: companies });
    } catch (error) {
        console.error('Get Companies Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch companies' });
    }
};

/**
 * @route   GET /api/b2b/companies/:id/fleet
 */
const getCompanyFleet = async (req, res) => {
    try {
        const { id } = req.params;
        const fleet = await cache.getOrSet(`b2b:company_fleet:${id}`,
            () => withRetry(() => prisma.b2b_company_fleet.findMany({
                where: { company_id: parseInt(id) },
                include: { vehicle: true }
            })), B2B_CACHE_TTL);

        res.json({ success: true, data: fleet });
    } catch (error) {
        console.error('Get Company Fleet Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company fleet' });
    }
};

/**
 * @route   POST /api/b2b/companies/:id/fleet
 */
const manageCompanyFleet = async (req, res) => {
    try {
        const { id } = req.params;
        const { fleet_vehicle_id, custom_price_per_km, is_active } = req.body;

        if (!fleet_vehicle_id || !custom_price_per_km) {
            return res.status(400).json({ success: false, message: 'Vehicle ID and price are required' });
        }

        const assignment = await withRetry(() => prisma.b2b_company_fleet.upsert({
            where: {
                company_id_fleet_vehicle_id: { company_id: parseInt(id), fleet_vehicle_id: parseInt(fleet_vehicle_id) }
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
        }));

        cache.invalidate('all_b2b_companies');
        cache.invalidate(`b2b:company_fleet:${id}`);
        cache.invalidate(`b2b:my_fleet:${id}`);

        res.json({ success: true, message: 'Fleet updated successfully', data: assignment });
    } catch (error) {
        console.error('Manage Company Fleet Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update company fleet' });
    }
};

/**
 * @route   DELETE /api/b2b/fleet-assignment/:id
 */
const removeCompanyFleet = async (req, res) => {
    try {
        const { id } = req.params;
        const assignment = await withRetry(() => prisma.b2b_company_fleet.findUnique({ where: { id: parseInt(id) } }));

        if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

        await withRetry(() => prisma.b2b_company_fleet.delete({ where: { id: parseInt(id) } }));

        cache.invalidate(`b2b:company_fleet:${assignment.company_id}`);
        cache.invalidate(`b2b:my_fleet:${assignment.company_id}`);
        cache.invalidate('all_b2b_companies');

        res.json({ success: true, message: 'Vehicle removed from company fleet' });
    } catch (error) {
        console.error('Remove Company Fleet Error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove vehicle assignment' });
    }
};

/**
 * @route   GET /api/b2b/my-fleet
 */
const getMyFleet = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        if (!companyId) return res.status(403).json({ success: false, message: 'Company not found' });

        const vehicles = await cache.getOrSet(`b2b:my_fleet:${companyId}`,
            async () => {
                const assignedFleet = await withRetry(() => prisma.b2b_company_fleet.findMany({
                    where: { company_id: companyId, is_active: true },
                    include: { vehicle: true }
                }));
                return assignedFleet.map(item => ({ ...item.vehicle, base_price_per_km: item.custom_price_per_km }));
            }, B2B_CACHE_TTL);

        res.json({ success: true, data: { vehicles } });
    } catch (error) {
        console.error('Get My Fleet Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch fleet' });
    }
};

const getCompanyBookingsForAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = parseInt(id);

        const [bookings, payments] = await Promise.all([
            cache.getOrSet(`admin_company_bookings_${companyId}`,
                () => withRetry(() => prisma.b2b_booking.findMany({
                    where: { company_id: companyId },
                    orderBy: { created_at: 'desc' },
                    include: { bookedByUser: { select: { id: true, name: true, email: true } } },
                    take: 50
                })), B2B_CACHE_TTL),
            cache.getOrSet(`b2b:company_payments_admin:${companyId}`,
                () => withRetry(() => prisma.b2b_payment.findMany({
                    where: { company_id: companyId },
                    orderBy: { paid_at: 'desc' },
                    take: 50
                })), B2B_CACHE_TTL)
        ]);

        let totalBilled = 0;
        let totalPaid = 0;
        bookings.forEach(b => { totalBilled += parseFloat(b.total_amount) || 0; });
        payments.forEach(p => { totalPaid += parseFloat(p.amount) || 0; });

        const billingSummary = { totalBilled, totalPaid, outstanding: totalBilled - totalPaid, totalBookings: bookings.length };
        const monthlyBreakdown = {};

        bookings.forEach(b => {
            const date = new Date(b.created_at);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyBreakdown[key]) monthlyBreakdown[key] = { count: 0, billed: 0, paid: 0 };
            monthlyBreakdown[key].count++;
            monthlyBreakdown[key].billed += parseFloat(b.total_amount) || 0;
        });

        payments.forEach(p => {
            const date = new Date(p.paid_at);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyBreakdown[key]) monthlyBreakdown[key] = { count: 0, billed: 0, paid: 0 };
            monthlyBreakdown[key].paid += parseFloat(p.amount) || 0;
        });

        res.json({ success: true, data: { bookings, payments, billingSummary, monthlyBreakdown } });
    } catch (error) {
        console.error('Get Company Bookings (Admin) Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company bookings' });
    }
};

const recordCompanyPayment = async (req, res) => {
    try {
        const { company_id, amount, payment_mode, reference_no, notes } = req.body;
        const adminId = req.user?.id;
        const VALID_MODES = ['CASH', 'CHEQUE', 'UPI', 'BANK_TRANSFER', 'OTHER'];

        if (!company_id) return res.status(400).json({ success: false, message: 'Company ID is required' });
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
        if (!payment_mode || !VALID_MODES.includes(payment_mode)) return res.status(400).json({ success: false, message: `Payment mode must be one of: ${VALID_MODES.join(', ')}` });

        const company = await withRetry(() => prisma.b2b_company.findUnique({ where: { id: parseInt(company_id) } }));
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

        const payment = await withRetry(() => prisma.b2b_payment.create({
            data: {
                company_id: parseInt(company_id),
                amount: parseFloat(amount),
                payment_mode,
                reference_no: reference_no || null,
                notes: notes || null,
                created_by: adminId || null
            }
        }));

        cache.invalidate(`company_payments_${company_id}`);
        cache.invalidate(`admin_company_bookings_${company_id}`);
        cache.invalidate(`b2b:company_payments_admin:${company_id}`);
        cache.invalidate(`b2b:company_bookings_billing:${company_id}`);

        res.json({ success: true, message: 'Payment recorded successfully', data: payment });
    } catch (error) {
        console.error('Record Company Payment Error:', error);
        res.status(500).json({ success: false, message: 'Failed to record payment' });
    }
};

const createCompany = async (req, res) => {
    try {
        const { company_name, company_email, company_phone, address, city, state, pincode, gst_number } = req.body;

        if (!company_name || !company_email || !company_phone) {
            return res.status(400).json({ success: false, message: 'Company name, email, and phone are required' });
        }

        const existingCompany = await withRetry(() => prisma.b2b_company.findUnique({ where: { company_email } }));
        if (existingCompany) return res.status(400).json({ success: false, message: 'Company with this email already exists' });

        const result = await prisma.$transaction(async (tx) => {
            const company = await tx.b2b_company.create({
                data: { company_name, company_email, company_phone, address, city, state, pincode, gst_number }
            });

            let b2bRole = await tx.role.findFirst({ where: { name: 'b2b_user' } });
            if (!b2bRole) b2bRole = await tx.role.create({ data: { name: 'b2b_user' } });

            let user = await tx.user.findUnique({ where: { email: company_email } });
            if (!user) {
                user = await tx.user.create({
                    data: {
                        email: company_email,
                        name: company_name,
                        phone: company_phone,
                        role_id: b2bRole.id,
                        is_first_login: true,
                        password_hash: await bcrypt.hash('UrbanCabz123', 10)
                    }
                });
            }

            await tx.b2b_user.create({ data: { user_id: user.id, company_id: company.id, is_primary: true } });
            return company;
        });

        cache.invalidate('all_b2b_companies');
        res.status(201).json({ success: true, message: 'Company created manually', data: result });
    } catch (error) {
        console.error('Create Company Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create company' });
    }
};

const updateCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body;

        const company = await withRetry(() => prisma.b2b_company.findUnique({ where: { id: parseInt(id) } }));
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

        const updated = await withRetry(() => prisma.b2b_company.update({
            where: { id: parseInt(id) },
            data: payload
        }));

        cache.invalidate('all_b2b_companies');
        cache.invalidate(`b2b:company:${id}`);
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
