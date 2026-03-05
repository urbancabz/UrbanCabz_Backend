// src/services/email.service.js
const nodemailer = require('nodemailer');

const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT == 465, // true for 465, false for other ports
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
});

// Verify connection configuration
transporter.verify(function (error, success) {
    if (error) {
        console.error('❌ Email Server Connection Error:', error);
    } else {
        console.log('✅ Email Server is ready to take our messages');
    }
});

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
 */
async function sendBookingConfirmation(booking, user) {
    const subject = `Booking Confirmed #${booking.id} - Urban Cabz`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #22c55e;">Booking Confirmed! ✅</h2>
        <p>Hi ${user.name},</p>
        <p>Your ride has been successfully booked.</p>
        
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Booking ID:</strong> #${booking.id}</p>
            <p><strong>Pickup:</strong> ${booking.pickup_location}</p>
            <p><strong>Drop:</strong> ${booking.drop_location}</p>
            <p><strong>Estimated Fare:</strong> ₹${booking.estimated_fare}</p>
        </div>

        <p>We will notify you once a driver is assigned.</p>
        <br/>
        <p>Safe Travels,<br/>The Urban Cabz Team</p>
      </div>
    `;
    return sendEmail({ to: user.email, subject, html });
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
