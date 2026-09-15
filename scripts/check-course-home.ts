// scripts/check-course-home.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const course = await prisma.course.findUnique({
    where: { id: '08f990fd-281f-4d1a-8fcd-2ecb229f49f7' },
    include: { program: { include: { department: { include: { school: true } } } } },
  });
  console.log(course);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());