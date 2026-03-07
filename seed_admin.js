const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const email = 'urbancabz03@gmail.com';
    const password = 'Urbancabz@03';

    console.log(`Hashing password for ${email}...`);
    const password_hash = await bcrypt.hash(password, 10);

    // Ensure admin role exists
    console.log('Ensuring admin role exists...');
    let adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
    if (!adminRole) {
        adminRole = await prisma.role.create({ data: { name: 'admin' } });
        console.log('Created admin role.');
    } else {
        console.log('Admin role already exists.');
    }

    // Ensure user exists
    console.log('Ensuring user exists...');
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        user = await prisma.user.create({
            data: {
                email,
                password_hash,
                name: 'Admin',
                is_verified: true,
                is_first_login: false,
                role_id: adminRole.id
            }
        });
        console.log(`Created admin user successfully: ${email}`);
    } else {
        // update password and role just in case
        user = await prisma.user.update({
            where: { email },
            data: {
                password_hash,
                role_id: adminRole.id,
                is_verified: true,
                is_first_login: false
            }
        });
        console.log(`Updated existing user to admin: ${email}`);
    }
}

main()
    .catch(e => {
        console.error('Error seeding admin user:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
