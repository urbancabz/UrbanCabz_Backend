/**
 * Pre-Deploy Check Script
 * ========================
 * Run this before EVERY push to GitHub:  npm run pre-deploy
 *
 * Validates that DATABASE_URL, JWT_SECRET, and Prisma schema
 * are all correct before code hits Render production.
 */

const { execSync } = require('child_process');
const path = require('path');

// Load .env.development for local pre-deploy checks
require('dotenv').config({ path: path.resolve(__dirname, '../.env.development') });

console.log('🔍 Running pre-deploy checks...\n');

const checks = [];

// ─── Check 1: DATABASE_URL format ───────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    checks.push('❌ DATABASE_URL must start with postgresql://');
} else {
    console.log('✅ DATABASE_URL format is valid');
}

// ─── Check 2: Port must be 6543 in production ────────────────────────────────
// (Local .env.development may use 5432 — that's fine)
const isProd = process.env.CHECK_PROD === 'true';
if (isProd) {
    if (!dbUrl.includes(':6543')) {
        checks.push('❌ Production DATABASE_URL must use port 6543 (PgBouncer Transaction Pooler)');
    } else {
        console.log('✅ Production port 6543 confirmed');
    }

    if (!dbUrl.includes('pgbouncer=true')) {
        checks.push('❌ Production DATABASE_URL must include pgbouncer=true');
    } else {
        console.log('✅ pgbouncer=true confirmed');
    }

    if (!dbUrl.includes('connection_limit=')) {
        checks.push('❌ Production DATABASE_URL must include connection_limit parameter');
    } else {
        console.log('✅ connection_limit parameter confirmed');
    }
}

// ─── Check 3: JWT_SECRET must exist ──────────────────────────────────────────
if (!process.env.JWT_SECRET) {
    checks.push('❌ JWT_SECRET is missing from .env.development');
} else {
    console.log('✅ JWT_SECRET is set');
}

// ─── Check 4: Prisma schema is valid ─────────────────────────────────────────
try {
    execSync('npx prisma validate', { stdio: 'pipe' });
    console.log('✅ Prisma schema is valid');
} catch (err) {
    checks.push('❌ Prisma schema validation failed — run: npx prisma validate');
}

// ─── Check 5: No syntax errors in key files ───────────────────────────────────
const keyFiles = [
    'src/config/prisma.js',
    'src/server.js',
    'src/app.js',
    'src/controllers/pricing.controller.js',
];

for (const file of keyFiles) {
    try {
        execSync(`node --check ${file}`, { stdio: 'pipe', cwd: path.resolve(__dirname, '..') });
        console.log(`✅ ${file} — no syntax errors`);
    } catch (err) {
        checks.push(`❌ Syntax error in ${file}`);
    }
}

// ─── Results ──────────────────────────────────────────────────────────────────
console.log('\n─── Results ──────────────────────────────────────────────────────');
if (checks.length === 0) {
    console.log('✅ All checks passed — safe to push to GitHub and deploy to Render\n');
    process.exit(0);
} else {
    checks.forEach(c => console.log(c));
    console.log('\n❌ Fix the above issues BEFORE pushing. Do not deploy broken code.\n');
    process.exit(1);
}
