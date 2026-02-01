const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listB2BUsers() {
    const users = await prisma.user.findMany({
        where: {
            role: { name: 'b2b_user' }
        },
        include: {
            role: true,
            b2bUsers: {
                include: {
                    company: true
                }
            }
        }
    });

    console.log('B2B Users Found:', users.length);
    users.forEach(u => {
        console.log(`- Email: ${u.email}, Name: ${u.name}, First Login: ${u.is_first_login}`);
        u.b2bUsers.forEach(bu => {
            console.log(`  - Company: ${bu.company.company_name} (ID: ${bu.company.id})`);
        });
    });

    await prisma.$disconnect();
}

listB2BUsers();
