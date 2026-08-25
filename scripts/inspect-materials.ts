import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sample = await prisma.studyMaterial.findMany({
    where: { courseId: null, isDeleted: false },
    select: {
      id: true,
      title: true,
      faculty: true,
      department: true,
      course: true,
      level: true,
      semester: true,
    },
    take: 10,
  });
  console.log(JSON.stringify(sample, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());