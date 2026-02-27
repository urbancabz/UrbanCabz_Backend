const net = require('net');
const fs = require('fs');

function checkPort(host, port) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host, port, timeout: 5000 });
        socket.on('connect', () => {
            fs.appendFileSync('output.txt', `Port ${port} on ${host} is OPEN\n`);
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            fs.appendFileSync('output.txt', `Port ${port} on ${host} TIMED OUT\n`);
            socket.destroy();
            resolve(false);
        });
        socket.on('error', (err) => {
            fs.appendFileSync('output.txt', `Port ${port} on ${host} ERROR: ${err.message}\n`);
            resolve(false);
        });
    });
}

async function run() {
    fs.writeFileSync('output.txt', ''); // Clear
    const host = 'aws-1-ap-south-1.pooler.supabase.com';
    await checkPort(host, 5432);
    await checkPort(host, 6543);
}

run();
