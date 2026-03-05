// src/services/twilio.service.js
// Lightweight Twilio WhatsApp helper used after successful bookings.
// Make sure you set these env vars in your backend:
// - TWILIO_ACCOUNT_SID
// - TWILIO_AUTH_TOKEN
// - TWILIO_WHATSAPP_FROM (e.g. 'whatsapp:+14155238886')

const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,
  TWILIO_RESET_CONTENT_SID,
} = process.env;

let client = null;

function getClient() {
  if (!client) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      console.warn('Twilio credentials are not configured; WhatsApp notifications are disabled.');
      return null;
    }
    client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return client;
}

function formatWhatsappNumber(phone) {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (trimmed.toLowerCase().startsWith('whatsapp:')) {
    return trimmed;
  }
  if (trimmed.startsWith('+')) {
    return `whatsapp:${trimmed}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // If user stored a 10-digit Indian mobile number, assume +91
  if (digits.length === 10) {
    return `whatsapp:+91${digits}`;
  }

  // Fallback: prefix just '+' and hope it's already full E.164
  return `whatsapp:+${digits}`;
}

/**
 * Send WhatsApp booking confirmation with basic invoice details.
 *
 * @param {Object} params
 * @param {string} params.toPhone - User phone in E.164 format (e.g. +9181xxxxxx).
 * @param {Object} params.booking - Booking record (including user + payments).
 */
async function sendBookingConfirmationWhatsApp({ toPhone, booking }) {
  const cli = getClient();
  if (!cli) return;

  if (!TWILIO_WHATSAPP_FROM) {
    console.warn('TWILIO_WHATSAPP_FROM not set; skipping WhatsApp send.');
    return;
  }

  if (!toPhone) {
    console.warn('No destination phone provided for WhatsApp booking confirmation.');
    return;
  }

  try {
    const userName = booking.user?.name || 'Customer';
    const bookingId = booking.id;
    const pickup = booking.pickup_location;
    const drop = booking.drop_location;

    const scheduledAt = booking.scheduled_at
      ? new Date(booking.scheduled_at)
      : null;

    const whenText = scheduledAt
      ? scheduledAt.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      : 'ASAP';

    const totalAmount = booking.total_amount || 0;

    // Take the first payment as the one we just confirmed
    const primaryPayment = Array.isArray(booking.payments)
      ? booking.payments[0]
      : null;

    const paidAmount = primaryPayment?.amount ?? totalAmount;
    const remainingAmount = Math.max(totalAmount - paidAmount, 0);

    const lines = [
      `Hi ${userName}, 👋`,
      ``,
      `Your Urban Cabz booking #${bookingId} is *confirmed*.`,
      ``,
      `🚖 Trip: ${pickup} ➜ ${drop}`,
      `🕒 Pickup: ${whenText}`,
      ``,
      `💰 Invoice Summary`,
      `• Total Fare: ₹${totalAmount.toFixed(2)}`,
      `• Paid Now: ₹${paidAmount.toFixed(2)}`,
      `• Remaining: ₹${remainingAmount.toFixed(2)}`,
      ``,
      `A cab will be assigned shortly. You will receive driver & vehicle details soon.`,
      ``,
      `Thank you for riding with Urban Cabz!`,
    ];

    const body = lines.join('\n');

    const to = formatWhatsappNumber(toPhone);
    if (!to) {
      console.warn('Unable to format WhatsApp number for booking confirmation.');
      return;
    }

    await cli.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to,
      body,
    });
  } catch (err) {
    console.error('Failed to send WhatsApp booking confirmation:', err);
  }
}

async function sendPasswordResetOtpWhatsApp({ toPhone, otp, expiryMinutes = 5 }) {
  const cli = getClient();
  if (!cli) return;

  if (!TWILIO_WHATSAPP_FROM) {
    console.warn('TWILIO_WHATSAPP_FROM not set; skipping WhatsApp OTP send.');
    return;
  }

  const to = formatWhatsappNumber(toPhone);
  if (!to) {
    console.warn('Unable to format WhatsApp number for password reset OTP.');
    return;
  }

  try {
    console.log('🔔 Sending WhatsApp OTP via Twilio:', {
      from: TWILIO_WHATSAPP_FROM,
      to,
      contentSid: TWILIO_RESET_CONTENT_SID || null,
    });
    if (TWILIO_RESET_CONTENT_SID) {
      // Use approved WhatsApp template with variables
      const contentVariables = JSON.stringify({
        // Your Twilio template uses {{1}} – send OTP into variable "1"
        1: otp,
      });

      await cli.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to,
        contentSid: TWILIO_RESET_CONTENT_SID,
        contentVariables,
      });
    } else {
      // Fallback to simple text body (sandbox / non-template mode)
      const minutesText = expiryMinutes === 1 ? '1 minute' : `${expiryMinutes} minutes`;
      const body = [
        'Urban Cabz password reset request.',
        '',
        `OTP: *${otp}*`,
        `Valid for ${minutesText}.`,
        '',
        'Do not share this code with anyone.',
      ].join('\n');

      await cli.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to,
        body,
      });
    }
  } catch (err) {
    console.error('Failed to send WhatsApp password reset OTP:', err);
  }
}

/**
 * Send WhatsApp to customer with taxi and driver details.
 */
async function sendTaxiAssignmentWhatsApp({ toPhone, booking, assignment }) {
  const cli = getClient();
  if (!cli) return;

  if (!TWILIO_WHATSAPP_FROM) {
    console.warn('TWILIO_WHATSAPP_FROM not set; skipping WhatsApp send.');
    return;
  }

  if (!toPhone) {
    console.warn('No destination phone provided for WhatsApp taxi assignment.');
    return;
  }

  try {
    const lines = [
      `*Urban Cabz Booking Confirmation* 🚖`,
      `Booking ID: #${booking.id}`,
      `Trip: ${booking.pickup_location} ➜ ${booking.drop_location}`,
      `------------------`,
      `Vehicle: ${assignment.cab_name} (${assignment.cab_number})`,
      `Driver: ${assignment.driver_name} (${assignment.driver_number})`,
      `------------------`,
      `Thank you for choosing Urban Cabz!`,
    ];

    const body = lines.join('\n');
    const to = formatWhatsappNumber(toPhone);
    if (!to) return;

    await cli.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to,
      body,
    });
  } catch (err) {
    console.error('Failed to send WhatsApp taxi assignment:', err);
  }
}

/**
 * Send WhatsApp to driver with trip details.
 */
async function sendDriverAssignmentWhatsApp({ toPhone, booking, assignment }) {
  const cli = getClient();
  if (!cli) return;

  if (!TWILIO_WHATSAPP_FROM) {
    console.warn('TWILIO_WHATSAPP_FROM not set; skipping WhatsApp send.');
    return;
  }

  if (!toPhone) {
    console.warn('No destination phone provided for WhatsApp driver assignment.');
    return;
  }

  try {
    // Calculate due amount
    const total = booking.total_amount || 0;
    const paid = (booking.payments || []).reduce((sum, p) =>
      (p.status === 'SUCCESS' || p.status === 'PAID') ? sum + (p.amount || 0) : sum, 0
    );
    const due = Math.max(0, total - paid);

    const lines = [
      `*New Trip Assignment* 🚨`,
      `Booking ID: #${booking.id}`,
      `Customer: ${booking.user?.name} (${booking.user?.phone})`,
      `From: ${booking.pickup_location}`,
      `To: ${booking.drop_location}`,
      `Fare to Collect: ₹${due}`,
      `------------------`,
      `Please contact the customer for pickup.`,
    ];

    const body = lines.join('\n');
    const to = formatWhatsappNumber(toPhone);
    if (!to) return;

    await cli.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to,
      body,
    });
  } catch (err) {
    console.error('Failed to send WhatsApp driver assignment:', err);
  }
}

module.exports = {
  sendBookingConfirmationWhatsApp,
  sendPasswordResetOtpWhatsApp,
  sendTaxiAssignmentWhatsApp,
  sendDriverAssignmentWhatsApp,
};





