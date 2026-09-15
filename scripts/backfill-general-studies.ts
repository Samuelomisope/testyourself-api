import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[\s-]+/g, '');
}

const GENERAL_STUDIES_COURSES: Record<string, string> = {
  'GNS 101': 'Use of English I',
  'GNS 102': 'Use of English II',
  'GNS 103': 'Library, Study Skills and Information Communication Technology',
  'CSP 201': 'General Agriculture (Theory)',
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // Assumes single-university setup for now — adjust if you need per-university GS schools
  const university = await prisma.university.findFirstOrThrow();

  console.log(`${dryRun ? '[DRY RUN] Would create' : 'Creating'} General Studies School/Department/Program for ${university.name}`);

  let school = await prisma.school.findFirst({
    where: { universityId: university.id, code: 'SGS' },
  });
  if (!school && !dryRun) {
    school = await prisma.school.create({
      data: { universityId: university.id, code: 'SGS', name: 'School of General Studies' },
    });
  }

  let department = school
    ? await prisma.department.findFirst({ where: { schoolId: school.id, name: 'General Studies' } })
    : null;
  if (!department && !dryRun && school) {
    department = await prisma.department.create({
      data: { schoolId: school.id, name: 'General Studies' },
    });
  }

  let program = department
    ? await prisma.program.findFirst({ where: { departmentId: department.id } })
    : null;
  if (!program && !dryRun && department) {
    program = await prisma.program.create({
      data: { departmentId: department.id, name: 'General Studies' },
    });
  }

 let migrated = 0;
for (const [code, title] of Object.entries(GENERAL_STUDIES_COURSES)) {
  console.log(`${dryRun ? '[DRY RUN] Would create' : 'Creating'} Course ${code} — ${title}`);

  const course = dryRun
    ? null
    : await prisma.course.upsert({
        where: { programId_code: { programId: program!.id, code } },
        update: {},
        create: { programId: program!.id, code, title },
      });

  const prefix = code.split(' ')[0];
  const materials = await prisma.studyMaterial.findMany({
    where: { courseId: null, isDeleted: false, title: { contains: prefix } },
  });

  let matchedForCode = 0;
  for (const m of materials) {
    const decoded = m.title!.replace(/%20/g, ' ');
 if (!normalizeCode(decoded).includes(normalizeCode(code))) continue;
    matchedForCode++;

    if (!dryRun) {
      await prisma.studyMaterial.update({
        where: { id: m.id },
        data: { courseId: course!.id, needsReview: false },
      });
    }
  }

  console.log(`  ${dryRun ? '[DRY RUN] Would link' : 'Linked'} ${matchedForCode} materials for ${code}`);
  migrated += matchedForCode;
}

console.log(`\n${dryRun ? '[DRY RUN] Would link' : 'Linked'} ${migrated} materials total`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());