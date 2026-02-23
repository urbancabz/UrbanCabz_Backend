const prisma = require('./src/config/prisma');
const bcrypt = require('bcryptjs');

async function main() {
    try {
        const defaultHash = await bcrypt.hash('UrbanCabz123', 10);

        const updated = await prisma.user.updateMany({
            where: { email: 'kkarm664@gmail.com' },
            data: {
                password_hash: defaultHash,
                is_first_login: true
            }
        });

        console.log(`Updated ${updated.count} users.`);
        console.log('Password for kkarm664@gmail.com has been reset to UrbanCabz123');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
