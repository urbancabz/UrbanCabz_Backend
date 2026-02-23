const prisma = require('./src/config/prisma');
const bcrypt = require('bcryptjs');

async function main() {
    try {
        const users = await prisma.user.findMany({
            where: { role: { name: 'b2b_user' } },
            select: { id: true, email: true, password_hash: true }
        });

        for (const user of users) {
            console.log(`\nEmail: ${user.email}`);
            if (user.password_hash) {
                const matchesDefault = await bcrypt.compare('UrbanCabz123', user.password_hash);
                console.log(`Matches 'UrbanCabz123'? ${matchesDefault}`);

                const matchesAdmin = await bcrypt.compare('Urbancabz@03', user.password_hash);
                console.log(`Matches 'Urbancabz@03'? ${matchesAdmin}`);
            }
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
