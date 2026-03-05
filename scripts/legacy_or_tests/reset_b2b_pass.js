const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function resetPassword() {
    const email = 'karmjoshi992@gmail.com';
    const password = 'UrbanCabz123';
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
        where: { email },
        data: {
            password_hash: hashedPassword,
            is_first_login: false
        }
    });

    console.log(`✅ Password for ${email} reset to ${password}`);
    await prisma.$disconnect();
}

resetPassword();
