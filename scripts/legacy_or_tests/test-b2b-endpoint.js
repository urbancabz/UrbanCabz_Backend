const http = require('http');

const payload = JSON.stringify({
    name: "Test User",
    company: "Test Company",
    email: "test-" + Date.now() + "@example.com",
    phone: "1234567890",
    message: "Hello world"
});

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/v1/b2b/register',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length
    }
};

const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log('Headers:', res.headers);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Body:', data);
    });
});

req.on('error', (error) => {
    console.error('Error:', error.message);
});

req.write(payload);
req.end();
