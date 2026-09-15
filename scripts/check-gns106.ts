// scripts/check-gns106.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.studyMaterial.findMany({
    where: { title: { contains: '106' }, isDeleted: false },
    select: { id: true, title: true, courseId: true, needsReview: true },
  });
  const gns106 = rows.filter((r) => /GNS/i.test(r.title ?? ''));
  console.log(`Found ${gns106.length} GNS 106-ish materials:\n`);
  gns106.forEach((r) =>
    console.log(`- "${r.title}" | courseId: ${r.courseId} | needsReview: ${r.needsReview}`)
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());