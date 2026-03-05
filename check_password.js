require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
    const users = await prisma.user.findMany({
        where: {
            email: {
                contains: 'urbancabz03@gmail.com',
                mode: 'insensitive'
            }
        },
        include: { role: true }
    });

    console.log(`Found ${users.length} users.`);

    for (const user of users) {
        console.log(`--- User: ${user.email} (Role: ${user.role?.name}) ---`);
        const passwordsToTest = [
            'Urbancabz@03',
            'urbancabz@03',
            'UrbanCabz@03',
            'Urbancabz03',
            'urbancabz03',
            'Urbancabz@03 ', // trailing space
            ' Urbancabz@03'  // leading space
        ];

        for (const pw of passwordsToTest) {
            const match = await bcrypt.compare(pw, user.password_hash);
            console.log(`Match for '${pw}': ${match}`);
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
