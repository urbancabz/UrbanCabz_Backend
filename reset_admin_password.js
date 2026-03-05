require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
    const email = 'urbancabz03@gmail.com';
    const newPassword = 'Urbancabz@03';

    // Find the exact user
    const user = await prisma.user.findFirst({
        where: {
            email: {
                equals: email,
                mode: 'insensitive'
            }
        }
    });

    if (!user) {
        console.log(`User not found with email: ${email}`);
        return;
    }

    console.log(`Found user: ${user.email} (ID: ${user.id}). Updating password...`);

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
        where: { id: user.id },
        data: { password_hash: passwordHash }
    });

    console.log('Password updated successfully!');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
