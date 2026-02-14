// src/controllers/user.controller.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * @route   GET /api/admin/users
 * @desc    Get all users (Admin only)
 * @access  Private/Admin
 */
const listUsers = async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        const where = {
            role: {
                name: { not: 'b2b_user' }
            }
        };

        if (search) {
            where.AND = [
                {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { phone: { contains: search, mode: 'insensitive' } }
                    ]
                }
            ];
        }

        const users = await prisma.user.findMany({
            where,
            skip: parseInt(skip),
            take: parseInt(limit),
            orderBy: { created_at: 'desc' },
            include: {
                role: true,
                b2bUsers: {
                    include: {
                        company: true
                    }
                },
                _count: {
                    select: { bookings: true }
                }
            }
        });

        const total = await prisma.user.count({ where });

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('List Users Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
};

/**
 * @route   GET /api/admin/users/:id
 * @desc    Get single user details (Admin only)
 * @access  Private/Admin
 */
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) },
            include: {
                role: true,
                bookings: {
                    orderBy: { created_at: 'desc' },
                    take: 5
                }
            }
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, data: user });
    } catch (error) {
        console.error('Get User Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch user' });
    }
};

/**
 * @route   PUT /api/admin/users/:id
 * @desc    Update user details (Admin only)
 * @access  Private/Admin
 */
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, role_id } = req.body;

        const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check email uniqueness if changed
        if (email && email !== user.email) {
            const existing = await prisma.user.findUnique({ where: { email } });
            if (existing) {
                return res.status(400).json({ success: false, message: 'Email already in use' });
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id: parseInt(id) },
            data: {
                name,
                email,
                phone,
                role_id: role_id ? parseInt(role_id) : undefined
            }
        });

        res.json({ success: true, message: 'User updated successfully', data: updatedUser });
    } catch (error) {
        console.error('Update User Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
};

/**
 * @route   GET /api/admin/users/:id/bookings
 * @desc    Get bookings for a specific user (Admin only)
 * @access  Private/Admin
 */
const getUserBookings = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const userId = parseInt(id);
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        console.log(`[getUserBookings] Request for UserID: ${userId} (Page: ${pageNum}, Limit: ${limitNum})`);

        // Stats: Total spent & Total rides
        const totalRides = await prisma.booking.count({ where: { user_id: userId } });
        console.log(`[getUserBookings] Total Rides Count: ${totalRides}`);

        const totalSpentAggregate = await prisma.booking.aggregate({
            where: {
                user_id: userId,
                status: 'COMPLETED'
            },
            _sum: {
                total_amount: true
            }
        });
        console.log(`[getUserBookings] Total Spent Aggregate:`, totalSpentAggregate._sum);

        // Fetch paginated bookings
        const bookings = await prisma.booking.findMany({
            where: { user_id: userId },
            skip: skip,
            take: limitNum,
            orderBy: { created_at: 'desc' },
            include: {
                payments: true,
                assign_taxis: true
            }
        });
        console.log(`[getUserBookings] Bookings fetched on this page: ${bookings.length}`);

        res.json({
            success: true,
            data: {
                bookings,
                stats: {
                    totalRides,
                    totalSpent: totalSpentAggregate._sum.total_amount || 0
                },
                pagination: {
                    total: totalRides,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(totalRides / limitNum)
                }
            }
        });
    } catch (error) {
        console.error('Get User Bookings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch user bookings' });
    }
};

module.exports = {
    listUsers,
    getUserById,
    updateUser,
    getUserBookings
};
