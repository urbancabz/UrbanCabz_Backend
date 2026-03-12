const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  console.log('Checking for legacy [DEACTIVATED] strings...');
  const companies = await prisma.b2b_company.findMany();
  let count = 0;
  for (const c of companies) {
    if (c.company_name.toUpperCase().startsWith('[DEACTIVATED]')) {
      const cleanName = c.company_name.replace(/^\[DEACTIVATED\]\s*/i, '');
      await prisma.b2b_company.update({
        where: { id: c.id },
        data: { 
          company_name: cleanName,
          is_active: false
        }
      });
      console.log(`Cleaned legacy name: ${cleanName} (Set is_active=false)`);
      count++;
    }
  }
  console.log(`Finished checking. Repaired ${count} legacy entries.`);
}

fix().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
