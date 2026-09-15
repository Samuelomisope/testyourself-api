// scripts/backfill-shared-courses.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SHARED_COURSE_CODES = [
  'GNS 101', 'MTS 101', 'CHE 101', 'CHE 103', 'PHY 103', 'PHY 107', 'MEE 101', 'CVE 105',
  'GNS 102', 'GNS 103', 'GNS 106', 'MTS 102', 'MTS 104', 'CHE 102', 'CHE 104', 'PHY 102', 'PHY 108', 'MEE 102',
  'CHE 205', 'CSC 201', 'CSP 201', 'MEE 201', 'MNE 201', 'MME 201', 'MEE 207',
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const targetPrograms = await prisma.program.findMany({
    where: { department: { school: { code: { in: ['SIMME', 'SESE'] } } } },
  });

  let linked = 0;
  for (const code of SHARED_COURSE_CODES) {
    const course = await prisma.course.findFirst({ where: { code } });
    if (!course) {
      console.warn(`No Course row for ${code} yet — run backfill-general-studies.ts first if this is a GNS/CSP code`);
      continue;
    }

    for (const program of targetPrograms) {
      if (program.id === course.programId) continue;
      const exists = await prisma.programCourse.findUnique({
        where: { programId_courseId: { programId: program.id, courseId: course.id } },
      });
      if (exists) continue;

     console.log(`${dryRun ? '[DRY RUN] ' : ''}Link ${code} → ${program.name}`);
if (!dryRun) {
  await prisma.programCourse.create({ data: { programId: program.id, courseId: course.id } });
}
linked++;
    }
  }

  console.log(`${dryRun ? '[DRY RUN] Would create' : 'Created'} ${linked} ProgramCourse links`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());