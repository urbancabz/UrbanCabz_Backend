const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
require('dotenv').config();

async function testUploadEndpoint() {
    try {
        // 1. Login as Admin to get Token
        console.log("Logging in as admin...");
        const loginRes = await axios.post('http://localhost:5050/api/v1/auth/login', {
            email: 'urbancabz03@gmail.com',
            password: 'Urbancabz@03'
        });

        const token = loginRes.data.token || loginRes.data.data?.token;
        if (!token) throw new Error("Token missing! Response: " + JSON.stringify(loginRes.data));
        console.log("Admin Token Received!");

        // 2. Upload dummy image
        console.log("Uploading dummy image to backend endpoint...");
        const formData = new FormData();
        formData.append('image', fs.createReadStream('dummy.png'));

        const uploadRes = await axios.post('http://localhost:5050/api/v1/fleet/upload-image', formData, {
            headers: {
                ...formData.getHeaders(),
                Authorization: `Bearer ${token}`
            }
        });

        console.log("Upload Success! Response:");
        console.log(JSON.stringify(uploadRes.data, null, 2));

    } catch (error) {
        console.error("Endpoint Error:");
        if (error.response) {
            console.error(error.response.status, error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

testUploadEndpoint();
