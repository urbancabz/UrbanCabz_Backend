const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugCompanies() {
    try {
        console.log('--- Database Dump ---');
        const companies = await prisma.b2b_company.findMany();
        console.log('COMPANIES:', companies.length);
        console.table(companies.map(c => ({ id: c.id, name: c.company_name, email: c.company_email })));

        const requests = await prisma.b2b_request.findMany();
        console.log('\nREQUESTS:', requests.length);
        console.table(requests.map(r => ({ id: r.id, company: r.company_name, status: r.status, email: r.contact_email })));

        const b2bUsers = await prisma.b2b_user.findMany({
            include: { company: true, user: true }
        });
        console.log('\nB2B USERS (Mappings):', b2bUsers.length);
        console.table(b2bUsers.map(bu => ({
            userId: bu.user_id,
            companyId: bu.company_id,
            company: bu.company.company_name,
            user: bu.user.email
        })));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugCompanies();
