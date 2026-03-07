const net = require('net');

const host = 'aws-1-ap-south-1.pooler.supabase.com';
const ports = [5432, 6543];

function testPort(port) {
    return new Promise((resolve) => {
        console.log(`Testing ${host}:${port}...`);
        const socket = new net.Socket();
        const start = Date.now();

        socket.setTimeout(5000);

        socket.on('connect', () => {
            console.log(`✅ ${port} is OPEN (took ${Date.now() - start}ms)`);
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            console.log(`❌ ${port} TIMEOUT`);
            socket.destroy();
            resolve(false);
        });

        socket.on('error', (err) => {
            console.log(`❌ ${port} ERROR: ${err.message}`);
            resolve(false);
        });

        socket.connect(port, host);
    });
}

async function run() {
    for (const port of ports) {
        await testPort(port);
    }
}

run();
