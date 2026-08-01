const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.APP_DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const result = await prisma.studyMaterial.updateMany({
    where: {},
    data: { faculty: 'ENGINEERING' },
  });
  console.log(`Updated ${result.count} materials.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());