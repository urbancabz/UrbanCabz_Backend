const axios = require('axios');

const API_BASE_URL = 'http://localhost:5050/api/v1';

async function testB2BFlow() {
    console.log('🚀 Starting B2B Flow Backend Verification...');

    try {
        // 1. Login as B2B User
        console.log('\n🔐 Logging in as B2B user...');
        const loginRes = await axios.post(`${API_BASE_URL}/auth/b2b/login`, {
            email: 'karmjoshi992@gmail.com',
            password: 'UrbanCabz123'
        });

        const token = loginRes.data.token;
        console.log('✅ Login successful!');

        // 2. Fetch Company Profile
        console.log('\n🏢 Fetching Company Profile...');
        const profileRes = await axios.get(`${API_BASE_URL}/b2b/company/my`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('✅ Company Profile:', profileRes.data.data.company_name);

        // 3. Fetch Company Bookings
        console.log('\n📅 Fetching Company Bookings...');
        const bookingsRes = await axios.get(`${API_BASE_URL}/bookings/company`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log(`✅ Found ${bookingsRes.data.bookings.length} company bookings.`);

        console.log('\n🏁 Verification complete.');
    } catch (error) {
        console.error('❌ Verification failed:', error.response?.data?.message || error.message);
        if (error.response?.data) {
            console.error('Details:', error.response.data);
        }
    }
}

testB2BFlow();
