const axios = require('axios');

async function testRoutes() {
    const BASE = 'http://localhost:5050';
    const routes = ['/health', '/api/v1/b2b/requests', '/api/v1/b2b/companies'];

    for (const route of routes) {
        const url = BASE + route;
        console.log(`\n--- Testing: ${url} ---`);
        try {
            const resp = await axios.get(url);
            console.log('Status: SUCCESS', resp.status);
            console.log('Data:', JSON.stringify(resp.data));
        } catch (err) {
            if (err.response) {
                console.log('Status:', err.response.status);
                console.log('Data:', JSON.stringify(err.response.data));
            } else {
                console.log('Error:', err.message);
            }
        }
    }
}

testRoutes();
