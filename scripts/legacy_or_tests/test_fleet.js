const axios = require('axios');

async function testPublicFleet() {
    const API_URL = 'http://localhost:5050/api/v1/fleet/public?activeOnly=true';
    console.log('Testing endpoint:', API_URL);

    try {
        const response = await axios.get(API_URL);
        if (response.data.success) {
            console.log('SUCCESS: Fetched fleet.');
            const vehicles = response.data.data.vehicles;
            console.log(`Total Vehicles: ${vehicles.length}`);
            vehicles.forEach(v => {
                console.log(`- ${v.name} (${v.category}) | Price: ${v.base_price_per_km}`);
            });
        } else {
            console.log('FAILED:', response.data.message);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testPublicFleet();
