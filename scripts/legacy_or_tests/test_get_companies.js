const axios = require('axios');

async function testGetCompanies() {
    const API_URL = 'http://localhost:5050/api/v1/b2b/companies';

    // We need an admin token. Let's try to get one if possible, or just check the route existence.
    console.log('Testing endpoint:', API_URL);

    try {
        // Since we can't easily get a real token here without login, 
        // we at least check if the server is responding (expecting 401/403 if it works, or 500/broken if it doesn't)
        const response = await axios.get(API_URL);
        console.log('Response:', response.data);
    } catch (error) {
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);
            if (error.response.status === 401 || error.response.status === 403) {
                console.log('SUCCESS: Route is protected and responding (not throwing middleware error).');
            } else {
                console.log('ERROR: Unexpected status code.');
            }
        } else {
            console.error('ERROR (Connection failed):', error.message);
        }
    }
}

testGetCompanies();
