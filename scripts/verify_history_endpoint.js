const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');

const API_BASE_URL = 'http://localhost:5050/api/v1';
const JWT_SECRET = process.env.JWT_SECRET || 'urbancabz_secret_key_2024';

async function main() {
    console.log("Verifying Customer History Endpoint...");

    // Create a dummy admin token for testing
    const adminToken = jwt.sign(
        { id: 1, role: 'admin' },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
    console.log("Generated Test Admin Token.");

    const userId = 1;
    const url = `${API_BASE_URL}/admin/users/${userId}/bookings?page=1&limit=10`;

    console.log(`Fetching: ${url}`);

    try {
        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            }
        });

        const { data } = response;

        console.log(`Status: ${response.status}`);
        if (data.success) {
            console.log("Success! Data received:");
            console.log(`Total Rides: ${data.data.stats.totalRides}`);
            console.log(`Bookings Count in Page: ${data.data.bookings.length}`);
            if (data.data.bookings.length > 0) {
                console.log("First Booking Sample:", {
                    id: data.data.bookings[0].id,
                    pickup: data.data.bookings[0].pickup_location,
                    status: data.data.bookings[0].status
                });
            }
        } else {
            console.error("Failed:", data.message);
        }

    } catch (error) {
        if (error.response) {
            console.error("API Error:", error.response.status, error.response.data);
        } else {
            console.error("Fetch Error:", error.message);
        }
    }
}

main();
