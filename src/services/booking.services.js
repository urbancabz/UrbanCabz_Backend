// src/services/booking.services.js
const prisma = require('../config/prisma');

/**
 * Create a booking record after payment success.
 * You should call this from your payment gateway webhook / success handler.
 */
async function createBookingAfterPayment({
  userId,
  pickupLocation,
  dropLocation,
  scheduledAt,
  distanceKm,
  estimatedFare,
  totalAmount,
  carModel, // Pass car model
  payment: paymentPayload
}) {
  if (!userId) throw { status: 400, message: 'userId is required' };
  if (!pickupLocation || !dropLocation) {
    throw { status: 400, message: 'pickupLocation and dropLocation are required' };
  }
  if (!totalAmount) {
    throw { status: 400, message: 'totalAmount is required' };
  }

  // Wrap in a transaction so booking + payment are always consistent
  const [booking] = await prisma.$transaction([
    prisma.booking.create({
      data: {
        user_id: userId,
        pickup_location: pickupLocation,
        drop_location: dropLocation,
        scheduled_at: scheduledAt || null,
        distance_km: distanceKm || null,
        estimated_fare: estimatedFare || null,
        total_amount: totalAmount,
        car_model: carModel || null, // Save car model
        status: 'PAID',
        payments: paymentPayload
          ? {
            create: {
              amount: paymentPayload.amount,
              currency: paymentPayload.currency || 'INR',
              status: paymentPayload.status || 'SUCCESS',
              provider: paymentPayload.provider || 'unknown',
              provider_txn_id: paymentPayload.providerTxnId || null
            }
          }
          : undefined
      },
      include: {
        payments: true
      }
    })
  ]);

  return booking;
}

/**
 * Create booking with PENDING_PAYMENT status and payment with PENDING status
 * Called when Razorpay order is created (before payment)
 */
async function createBookingWithPendingPayment({
  userId,
  pickupLocation,
  dropLocation,
  scheduledAt,
  distanceKm,
  estimatedFare,
  totalAmount,
  carModel, // Pass car model
  razorpayOrderId,
  paymentAmount // The actual amount being paid (can be partial)
}) {
  if (!userId) throw { status: 400, message: 'userId is required' };
  if (!pickupLocation || !dropLocation) {
    throw { status: 400, message: 'pickupLocation and dropLocation are required' };
  }
  if (totalAmount === undefined || totalAmount === null) {
    throw { status: 400, message: 'totalAmount is required' };
  }

  // Strictly check for paymentAmount to allow 0 (though unlikely) but handle undefined/null as full payment
  const actualPaymentAmount = (paymentAmount !== undefined && paymentAmount !== null)
    ? paymentAmount
    : totalAmount;
  const remainingAmount = Math.max(0, totalAmount - actualPaymentAmount);

  const booking = await prisma.booking.create({
    data: {
      user_id: userId,
      pickup_location: pickupLocation,
      drop_location: dropLocation,
      scheduled_at: scheduledAt || null,
      distance_km: distanceKm || null,
      estimated_fare: estimatedFare || null,
      total_amount: totalAmount,
      car_model: carModel || null, // Save car model
      status: 'PENDING_PAYMENT',
      payments: {
        create: {
          amount: actualPaymentAmount, // The actual payment amount (could be partial)
          currency: 'INR',
          status: 'PENDING',
          provider: 'razorpay',
          provider_txn_id: razorpayOrderId, // Store order_id temporarily, will update with payment_id later
          remaining_amount: remainingAmount // Calculate remaining amount
        }
      }
    },
    include: {
      payments: true
    }
  });

  return booking;
}

/**
 * Update booking and payment to SUCCESS after payment verification
 * Called when Razorpay payment succeeds
 */
async function updateBookingAfterPaymentSuccess({
  razorpayOrderId,
  razorpayPaymentId
}) {
  // Find payment by razorpay order_id (stored in provider_txn_id initially)
  const payment = await prisma.payment.findFirst({
    where: {
      provider_txn_id: razorpayOrderId,
      status: 'PENDING'
    },
    include: {
      booking: true
    }
  });

  if (!payment) {
    throw { status: 404, message: 'Payment record not found' };
  }

  // Check if payment is full or partial
  const isFullPayment = payment.remaining_amount === 0 || payment.remaining_amount === null;

  // Update payment and booking in transaction
  const [updatedPayment, updatedBooking] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        provider_txn_id: razorpayPaymentId // Update with actual payment_id
      }
    }),
    prisma.booking.update({
      where: { id: payment.booking_id },
      data: {
        // Only mark as PAID if it's a full payment, otherwise keep as PENDING_PAYMENT
        status: isFullPayment ? 'PAID' : 'PENDING_PAYMENT'
      }
    })
  ]);

  // Return booking with updated payment and user details (phone, name, etc.)
  const booking = await prisma.booking.findUnique({
    where: { id: payment.booking_id },
    include: {
      payments: true,
      user: true
    }
  });

  return booking;
}

async function getMyBookings(userId) {
  return prisma.booking.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    include: {
      payments: true
    }
  });
}

module.exports = {
  createBookingAfterPayment,
  createBookingWithPendingPayment,
  updateBookingAfterPaymentSuccess,
  getMyBookings
};