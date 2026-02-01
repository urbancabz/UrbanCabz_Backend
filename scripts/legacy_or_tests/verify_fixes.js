async function runVerification() {
    const BASE_URL = 'http://localhost:3000/api/v1';
    console.log('--- STARTING VERIFICATION: RATE LIMITING ---');

    const LOGIN_PAYLOAD = {
        email: 'hacker@example.com',
        password: 'wrong_password'
    };

    console.log('[*] Attempting 10 fast login requests (Limit is 5 per 15 mins)...');

    for (let i = 1; i <= 10; i++) {
        const res = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(LOGIN_PAYLOAD)
        });

        console.log(`[Request ${i}] Status: ${res.status}`);
        if (res.status === 429) {
            console.log('[!!!] RATE LIMITING IS WORKING [!!!]');
            const data = await res.json();
            console.log('[+] Server Response:', data.message);
            break;
        }
        await new Promise(r => setTimeout(r, 100)); // small delay
    }

    console.log('\n--- STARTING VERIFICATION: ERROR SANITIZATION ---');
    // Trigger a 404 on a non-existent route
    console.log('[*] Hitting a non-existent route to check for info leakage...');
    const res404 = await fetch(`${BASE_URL}/non-existent-route`);
    console.log('[+] Status:', res404.status);
    const data404 = await res404.text();
    console.log('[+] Response (First 50 chars):', data404.substring(0, 50));

    if (data404.toLowerCase().includes('prisma') || data404.toLowerCase().includes('node_modules')) {
        console.log('[!!!] ERROR: INFO LEAKAGE DETECTED [!!!]');
    } else {
        console.log('[+] Error response seems sanitized.');
    }
}

runVerification();
