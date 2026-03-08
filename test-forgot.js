async function testPasswordReset() {
    const url = 'http://localhost:5050/api/v1/auth/password/forgot';
    const body = {
        email: 'urbancabz03@gmail.com',
        otpTo: 'urbancabz03@gmail.com'
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        console.log('Status:', res.status);
        const text = await res.json();
        console.log('Response:', text);
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

testPasswordReset();
