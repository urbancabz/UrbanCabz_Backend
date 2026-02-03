const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const email = 'urbancabz@gmail.com';
    const password = 'Urbancabz@03'; // Hardcoded as per request
    const roleName = 'ADMIN';

    console.log(`🚀 Seeding admin user: ${email}`);

    // 1. Ensure ADMIN role exists
    let adminRole = await prisma.role.findUnique({
        where: { name: roleName },
    });

    if (!adminRole) {
        console.log(`Role '${roleName}' not found. Creating...`);
        adminRole = await prisma.role.create({
            data: { name: roleName },
        });
    }
    console.log(`✅ Role ID: ${adminRole.id}`);

    // 2. Hash Password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Create or Update Admin User
    const user = await prisma.user.upsert({
        where: { email: email },
        update: {
            password_hash: passwordHash,
            role_id: adminRole.id,
            name: 'Admin',
        },
        create: {
            email: email,
            password_hash: passwordHash,
            role_id: adminRole.id,
            name: 'Admin',
            phone: '9999999999' // Dummy phone
        },
    });

    console.log(`✅ Admin user created/updated: ID ${user.id}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
