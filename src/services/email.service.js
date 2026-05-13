// src/services/email.service.js
const nodemailer = require('nodemailer');

const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_VERIFY_ON_BOOT } = process.env;

const parsedEmailPort = Number(EMAIL_PORT || 587);

// Create reusable transporter object using SMTP transport
const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: parsedEmailPort,
    secure: parsedEmailPort === 465, // true for 465, false for STARTTLS ports like 587
    requireTLS: parsedEmailPort !== 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
});

// Optional boot-time SMTP check; keep disabled by default on Render
if (EMAIL_VERIFY_ON_BOOT === 'true') {
    transporter.verify(function (error) {
        if (error) {
            console.error('❌ Email Server Connection Error:', error);
        } else {
            console.log('✅ Email Server is ready to take our messages');
        }
    });
}

/**
 * Send a generic email
 */
async function sendEmail({ to, subject, html, text }) {
    if (!EMAIL_USER || !EMAIL_PASS) {
        console.warn('⚠️ Email credentials missing in .env. Email not sent.');
        return { success: false, message: 'Email config missing' };
    }

    try {
        const info = await transporter.sendMail({
            from: `"Urban Cabz" <${EMAIL_USER}>`, // sender address
            to, // list of receivers
            subject, // Subject line
            text, // plain text body
            html, // html body
        });

        console.log('✅ Email sent: %s', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send Welcome Email
 */
async function sendWelcomeEmail(user) {
    const subject = 'Welcome to Urban Cabz! 🚖';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #EAB308;">Welcome to Urban Cabz, ${user.name || 'Traveler'}!</h2>
        <p>We are thrilled to have you on board.</p>
        <p>Urban Cabz offers the most reliable, comfortable, and affordable rides in town.</p>
        <br/>
        <p><strong>Your Account Details:</strong></p>
        <ul>
          <li>Email: ${user.email}</li>
          <li>Phone: ${user.phone || 'Not provided'}</li>
        </ul>
        <br/>
        <p>Need a ride? <a href="https://urbancabz.com" style="color: #EAB308; font-weight: bold;">Book Now</a></p>
        <p>Safe Travels,<br/>The Urban Cabz Team</p>
      </div>
    `;
    return sendEmail({ to: user.email, subject, html });
}

/**
 * Send Booking Confirmation Email
 * @param {object} booking       - Booking record from DB
 * @param {object} user          - User record (name, email)
 * @param {string} [passengerEmail] - Optional override: passenger's entered email
 */
async function sendBookingConfirmation(booking, user, passengerEmail) {
    const recipientEmail = passengerEmail || user.email;
    const recipientName  = booking.passenger_name || user.name || 'Valued Customer';

    const subject = `Booking Confirmed #${booking.id} - Urban Cabz 🚖`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #EAB308, #F97316); padding: 24px; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 22px;">🚖 Urban Cabz</h1>
          <p style="color: #fffbeb; margin: 6px 0 0 0; font-size: 13px;">Your trusted ride partner</p>
        </div>
        <div style="padding: 28px 24px;">
          <h2 style="color: #22c55e; margin-top: 0;">Booking Confirmed! ✅</h2>
          <p>Hi <strong>${recipientName}</strong>,</p>
          <p>Your ride has been successfully booked. Here are your trip details:</p>
          <div style="background: #f9fafb; padding: 18px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #EAB308;">
            <p style="margin: 6px 0;"><strong>📋 Booking ID:</strong> #${booking.id}</p>
            <p style="margin: 6px 0;"><strong>🟢 Pickup:</strong> ${booking.pickup_location}</p>
            ${booking.full_pickup_address ? `<p style="margin: 6px 0;"><strong>📍 Full Address:</strong> ${booking.full_pickup_address}</p>` : ''}
            <p style="margin: 6px 0;"><strong>🔴 Drop:</strong> ${booking.drop_location}</p>
            ${booking.distance_km ? `<p style="margin: 6px 0;"><strong>📏 Est. Distance:</strong> ${booking.distance_km} km</p>` : ''}
            ${booking.scheduled_at ? `<p style="margin: 6px 0;"><strong>🕐 Pickup Time:</strong> ${new Date(booking.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>` : ''}
            <p style="margin: 6px 0;"><strong>💰 Total Fare:</strong> ₹${booking.total_amount}</p>
            <p style="margin: 6px 0;"><strong>💳 Payment:</strong> Cash / UPI to Driver</p>
          </div>
          <p style="color: #6b7280; font-size: 13px;">We will notify you once a driver is assigned to your trip.</p>
          <p style="color: #6b7280; font-size: 13px;">For queries, contact us at <a href="mailto:contact@urbancabz.com" style="color: #EAB308;">contact@urbancabz.com</a></p>
        </div>
        <div style="background: #f3f4f6; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">Safe Travels 🙏 — The Urban Cabz Team</p>
          <p style="margin: 4px 0 0 0; color: #d1d5db; font-size: 11px;">© 2025 Urban Cabz. All rights reserved.</p>
        </div>
      </div>
    `;
    return sendEmail({ to: recipientEmail, subject, html });
}

/**
 * Send Driver Assignment Email to Customer
 */
async function sendDriverAssignedEmail(booking, assignment, user) {
    const subject = `Driver Assigned for Booking #${booking.id} - Urban Cabz`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #4F46E5;">Driver Assigned! 🚕</h2>
        <p>Hi ${user.name},</p>
        <p>A driver has been assigned to your booking.</p>
        
        <div style="background: #fdf2f8; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #fbcfe8;">
            <p><strong>Driver Name:</strong> ${assignment.driver_name}</p>
            <p><strong>Mobile:</strong> <a href="tel:${assignment.driver_number}" style="font-weight:bold; color: #db2777;">${assignment.driver_number}</a></p>
            <p><strong>Cab Number:</strong> ${assignment.cab_number}</p>
            <p><strong>Vehicle:</strong> ${assignment.cab_name}</p>
        </div>

        <p>The driver is on their way to the pickup location.</p>
        <p><strong>Pickup:</strong> ${booking.pickup_location}</p>
        <br/>
        <p>Safe Travels,<br/>The Urban Cabz Team</p>
      </div>
    `;
    return sendEmail({ to: user.email, subject, html });
}

module.exports = {
    sendEmail,
    sendWelcomeEmail,
    sendBookingConfirmation,
    sendDriverAssignedEmail,
};
