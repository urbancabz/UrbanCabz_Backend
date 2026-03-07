const fs = require('fs');
const path = require('path');
function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) results = results.concat(walk(file));
        else if (file.endsWith('.js')) results.push(file);
    });
    return results;
}
const files = [...walk('src/controllers'), ...walk('src/routes'), 'src/app.js'];
let updated = 0;
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    const newContent = content.replace(/const\s+\{\s*prisma\s*\}\s*=\s*require\((['"])(.*?\/config\/prisma)\1\);/g, "const prisma = require('$2');");
    if (content !== newContent) {
        fs.writeFileSync(f, newContent);
        updated++;
    }
});
console.log(`Reverted ${updated} files to default exports.`);
