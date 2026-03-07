const net = require('net');

const HOST = 'db.lbkbntmwimonghcctvtl.supabase.co';
const PORTS = [5432, 6543];

console.log(`Checking connectivity to ${HOST}...`);

function checkPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        const start = Date.now();
        
        socket.setTimeout(5000);
        
        socket.on('connect', () => {
            console.log(`✅ Port ${port} is reachable! (Time: ${Date.now() - start}ms)`);
            socket.destroy();
            resolve(true);
        });
        
        socket.on('timeout', () => {
            console.log(`❌ Port ${port} connection timed out.`);
            socket.destroy();
            resolve(false);
        });
        
        socket.on('error', (err) => {
            console.log(`❌ Port ${port} error: ${err.message}`);
            socket.destroy();
            resolve(false);
        });
        
        socket.connect(port, HOST);
    });
}

async function runTests() {
    for (const port of PORTS) {
        await checkPort(port);
    }
}

runTests();
