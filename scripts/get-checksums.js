const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', 'src', 'prisma', 'migrations');
fs.readdirSync(base)
  .filter(d => fs.statSync(path.join(base, d)).isDirectory())
  .sort()
  .forEach(m => {
    const sql = fs.readFileSync(path.join(base, m, 'migration.sql'), 'utf8');
    const h = crypto.createHash('sha256').update(sql).digest('hex');
    console.log(m + '|' + h);
  });
