const https = require('https');
const fs = require('fs');

const URL = 'https://urbancabz-backend.onrender.com/health';
const INTERVAL_MS = 60 * 1000; // 1 minute
const MAX_RUNTIME_MS = 15 * 60 * 1000; // 15 minutes

const startTime = Date.now();

console.log(`Starting 15-minute monitoring of ${URL}...`);
fs.writeFileSync('monitoring_log.txt', `Monitoring started at ${new Date().toISOString()}\n`);

function checkHealth() {
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_RUNTIME_MS) {
        const msg = `\n✅ 15 minutes elapsed. Website is stable! Stopping monitor.\n`;
        console.log(msg);
        fs.appendFileSync('monitoring_log.txt', msg);
        process.exit(0);
    }

    https.get(URL, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            const logMsg = `[${new Date().toISOString()}] Status: ${res.statusCode} | Body: ${body}\n`;
            fs.appendFileSync('monitoring_log.txt', logMsg);
            if (res.statusCode >= 500) {
                const errMsg = `❌ Error detected! Status ${res.statusCode}. Bug still exists.\n`;
                console.error(errMsg);
                fs.appendFileSync('monitoring_log.txt', errMsg);
            }
        });
    }).on('error', (err) => {
        const errMsg = `[${new Date().toISOString()}] ❌ Network Error: ${err.message}\n`;
        console.error(errMsg);
        fs.appendFileSync('monitoring_log.txt', errMsg);
    });
}

// Initial check
checkHealth();

// Loop
setInterval(checkHealth, INTERVAL_MS);
