import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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