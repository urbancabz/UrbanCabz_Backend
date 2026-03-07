const https = require('https');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// ─── CONFIGURATION ───────────────────────────────────────────────────────────
const BASE_URL = 'https://urbancabz-backend.onrender.com';
const JWT_SECRET = 'jHSKjshfKJUBAjh2394234jsdf'; 

const ACTIONS = {
    REGISTER: 20,       
    BOOK_B2C: 20,       
    BOOK_B2B: 20,       
    DASH_B2B: 30,  
    DASH_ADMIN: 10, 
};

const B2C_USER = { id: 31, role: 'customer' };
const B2B_USER = { id: 1, role: 'b2b_user', companyId: 1 };
const ADMIN_USER = { id: 1, role: 'admin' };

const b2cToken = jwt.sign({ userId: B2C_USER.id, role: B2C_USER.role }, JWT_SECRET);
const b2bToken = jwt.sign({ userId: B2B_USER.id, role: B2B_USER.role, companyId: B2B_USER.companyId }, JWT_SECRET);
const adminToken = jwt.sign({ userId: ADMIN_USER.id, role: ADMIN_USER.role }, JWT_SECRET);

// ─── UTILS ───────────────────────────────────────────────────────────────────
function postRequest(path, data, token = null) {
    return new Promise((resolve) => {
        const payload = JSON.stringify(data);
        const options = {
            hostname: 'urbancabz-backend.onrender.com',
            port: 443,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            }
        };
        if (token) options.headers['Authorization'] = `Bearer ${token}`;

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', e => resolve({ status: 'ERROR', body: e.message }));
        req.write(payload);
        req.end();
    });
}

function getRequest(path, token = null) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'urbancabz-backend.onrender.com',
            port: 443,
            path: path,
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        };
        if (token) options.headers['Authorization'] = `Bearer ${token}`;

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', e => resolve({ status: 'ERROR', body: e.message }));
        req.end();
    });
}

// ─── TEST RUNNER ─────────────────────────────────────────────────────────────
async function runExtremeStress() {
    console.log(`⏳ Waiting 20s for Render deployment to fully stabilize...`);
    await new Promise(r => setTimeout(r, 20000));

    console.log(`🔥 INITIALIZING EXTREME STRESS TEST ON: ${BASE_URL}`);
    console.log(`Dispatched actions: Registration(${ACTIONS.REGISTER}), B2C Bookings(${ACTIONS.BOOK_B2C}), B2B Bookings(${ACTIONS.BOOK_B2B}), B2B Dashboard(${ACTIONS.DASH_B2B}), Admin Dashboard(${ACTIONS.DASH_ADMIN})`);
    
    const startTime = Date.now();
    const allPromises = [];

    for (let i = 0; i < ACTIONS.REGISTER; i++) {
        const random = crypto.randomBytes(4).toString('hex');
        allPromises.push(postRequest('/api/v1/auth/register', {
            email: `stress_${random}@test.com`,
            password: 'password123',
            name: `Stress User ${random}`,
            phone: '9999999999'
        }).then(r => ({ type: 'REGISTER', ...r })));
    }

    for (let i = 0; i < ACTIONS.BOOK_B2C; i++) {
        allPromises.push(postRequest('/api/v1/bookings/create', {
            pickupLocation: 'Stress Point A',
            dropLocation: 'Stress Point B',
            totalAmount: 150,
            carModel: 'Sedan'
        }, b2cToken).then(r => ({ type: 'BOOK_B2C', ...r })));
    }

    for (let i = 0; i < ACTIONS.BOOK_B2B; i++) {
        allPromises.push(postRequest('/api/v1/b2b/bookings', {
            pickupLocation: 'B2B Stress A',
            dropLocation: 'B2B Stress B',
            totalAmount: 2000,
            car_model: 'SUV'
        }, b2bToken).then(r => ({ type: 'BOOK_B2B', ...r })));
    }

    for (let i = 0; i < ACTIONS.DASH_B2B; i++) {
        allPromises.push(getRequest('/api/v1/b2b/dashboard-sync', b2bToken).then(r => ({ type: 'DASH_B2B', ...r })));
    }

    for (let i = 0; i < ACTIONS.DASH_ADMIN; i++) {
        allPromises.push(getRequest('/api/v1/admin/dashboard-sync', adminToken).then(r => ({ type: 'DASH_ADMIN', ...r })));
    }

    console.log(`\n⏳ Dispatched ${allPromises.length} concurrent requests...`);
    
    const results = await Promise.all(allPromises);
    const duration = Date.now() - startTime;

    const stats = {};
    results.forEach(r => {
        if (!stats[r.type]) stats[r.type] = { success: 0, fail: 0, errors: [] };
        if (r.status >= 200 && r.status < 300) {
            stats[r.type].success++;
        } else {
            stats[r.type].fail++;
            stats[r.type].errors.push(`Status ${r.status}: ${r.body.substring(0, 80)}`);
        }
    });

    console.log('\n=========================================');
    console.log('       EXTREME STRESS TEST RESULTS       ');
    console.log('=========================================');
    console.log(`Total Time: ${duration}ms`);
    console.log('-----------------------------------------');
    
    for (const [type, data] of Object.entries(stats)) {
        const total = data.success + data.fail;
        const rate = ((data.success / total) * 100).toFixed(1);
        console.log(`${type.padEnd(10)} | Success: ${data.success.toString().padStart(2)} | Fail: ${data.fail.toString().padStart(2)} | Rate: ${rate}%`);
        if (data.fail > 0) {
            console.log(`   └─ Sample Error: ${data.errors[0]}`);
        }
    }
    console.log('=========================================\n');
}

runExtremeStress().catch(console.error);
