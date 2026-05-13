/**
 * Tests the new rich booking confirmation email with full trip details
 */
require('dotenv').config();
const { sendBookingConfirmation } = require('./src/services/email.service');

const mockBooking = {
    id: 999,
    pickup_location: 'Ahmedabad, Gujarat, India',
    full_pickup_address: 'Flat 204, Sunrise Apartments, Near SG Road',
    drop_location: 'Surat, Gujarat, India',
    distance_km: 265,
    estimated_fare: 3200,
    total_amount: 3200,
    scheduled_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour from now
    passenger_name: 'Karm Joshi',
};

const mockUser = {
    name: 'Karm Joshi',
    email: process.env.EMAIL_USER, // sends to your own inbox
};

// Simulating passenger entering their own email in the form
const passengerEmail = process.env.EMAIL_USER;

console.log('Sending test booking confirmation email to:', passengerEmail);

sendBookingConfirmation(mockBooking, mockUser, passengerEmail)
    .then(result => {
        console.log('✅ Email sent! Message ID:', result.messageId);
    })
    .catch(err => {
        console.error('❌ Failed:', err.message);
    });
