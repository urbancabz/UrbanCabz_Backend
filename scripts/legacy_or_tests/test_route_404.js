const axios = require('axios');

const API_BASE_URL = 'http://localhost:5050/api/v1';

async function testB2BBookingRoute() {
    console.log('🚀 Testing B2B Booking Route...');

    try {
        // 1. Login as B2B User
        console.log('\n🔐 Logging in as B2B user...');
        const loginRes = await axios.post(`${API_BASE_URL}/auth/b2b/login`, {
            email: 'karmjoshi992@gmail.com',
            password: 'UrbanCabz123'
        });

        const token = loginRes.data.token;
        console.log('✅ Login successful!');

        // 2. Try POST /b2b/bookings (even with empty body, we want to see if it 404s or 400s/500s)
        console.log('\n📅 Sending POST to /api/v1/b2b/bookings...');
        try {
            const res = await axios.post(`${API_BASE_URL}/b2b/bookings`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('✅ Route found! Status:', res.status);
        } catch (err) {
            if (err.response) {
                console.log(`📡 Server responded with ${err.response.status}`);
                console.log('Data:', err.response.data);
                if (err.response.status === 404) {
                    console.error('❌ Confirming: Route NOT FOUND (404)');
                } else {
                    console.log('✅ Route likely exists (not a 404)');
                }
            } else {
                console.error('❌ Request failed:', err.message);
            }
        }

    } catch (error) {
        console.error('❌ Setup failed:', error.response?.data?.message || error.message);
    }
}

testB2BBookingRoute();
