const axios = require('axios');

const API_BASE_URL = 'http://localhost:5050/api/v1';

async function verifyB2BBookingTable() {
    console.log('🚀 Verifying separate B2B Booking Table logic...');

    try {
        // 1. Login as B2B User
        console.log('\n🔐 Logging in as B2B user...');
        const loginRes = await axios.post(`${API_BASE_URL}/auth/b2b/login`, {
            email: 'karmjoshi992@gmail.com',
            password: 'UrbanCabz123'
        });

        const token = loginRes.data.token;
        console.log('✅ Login successful!');

        // 2. Create a test B2B Booking
        console.log('\n📅 Creating a test B2B Booking...');
        const bookingPayload = {
            pickupLocation: 'Test Pickup Point',
            dropLocation: 'Test Drop Point',
            distanceKm: 15.5,
            totalAmount: 500,
            carModel: 'Swift Dzire',
            scheduledAt: new Date(Date.now() + 86400000).toISOString() // tomorrow
        };

        const createRes = await axios.post(`${API_BASE_URL}/b2b/bookings`, bookingPayload, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (createRes.data.success) {
            console.log('✅ Booking created successfully in B2B table!');
            console.log('Booking Data:', JSON.stringify(createRes.data.data, null, 2));

            // 3. Verify it appears in B2B Bookings list
            console.log('\n🔍 Fetching B2B Bookings list...');
            const listRes = await axios.get(`${API_BASE_URL}/b2b/bookings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const found = listRes.data.data.find(b => b.id === createRes.data.data.id);
            if (found) {
                console.log('✅ Verified: New booking found in company list.');
            } else {
                console.error('❌ Error: Booking not found in company list.');
            }
        } else {
            console.error('❌ Error: Booking creation failed.');
        }

    } catch (error) {
        console.error('❌ Verification failed:', error.response?.data?.message || error.message);
        if (error.response?.data) {
            console.error('Details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

verifyB2BBookingTable();
