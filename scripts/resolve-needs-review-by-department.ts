// scripts/resolve-needs-review-by-department.ts
//
// Second-pass triage for materials that survived backfill-study-materials.ts v2
// (no extractable course code from title) but DO have a usable legacy
// `department` string. Only handles the small set of department values that
// map unambiguously to a known School — everything else is left untouched
// for manual resolution in NeedsReviewPanel.
//
// SAFE BY DESIGN:
// - Only touches materials where courseId IS NULL and needsReview IS true.
// - Dry run first — nothing written until you review + confirm.
// - Creates a Program-level placeholder Course ("Unspecified") per
//   Department, since there's no course code to attach — these will still
//   need a real course assigned later, but at least group correctly in the
//   browse tree instead of sitting fully unclassified.
//
// USAGE:
//   1. npx ts-node scripts/resolve-needs-review-by-department.ts --dry-run
//   2. npx ts-node scripts/resolve-needs-review-by-department.ts

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Only department strings with an unambiguous single-School mapping.
// Deliberately excludes vague values like "ENGINEERING" or
// "PAST QUESTIONS (ENGINEERING)" — those span multiple Schools/Departments
// and would be a guess, not a resolution.
const DEPARTMENT_STRING_TO_SCHOOL_CODE: Record<string, string> = {
  'MINING ENGINEERING': 'SIMME',
  'Agricultural & Environmental Engineering': 'SIMME',
  'Computer Engineering': 'SESE',
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const materials = await prisma.studyMaterial.findMany({
    where: { courseId: null, needsReview: true, isDeleted: false },
    select: { id: true, universityId: true, title: true, department: true },
  });

  console.log(`Found ${materials.length} needsReview materials without courseId.\n`);

  let resolved = 0;
  let skipped = 0;

  for (const m of materials) {
    const dept = m.department?.trim();
    const schoolCode = dept ? DEPARTMENT_STRING_TO_SCHOOL_CODE[dept] : undefined;

    if (!schoolCode) {
      skipped++;
      continue;
    }

    console.log(`  → "${m.title}" [dept="${dept}"] => School ${schoolCode}`);

    if (dryRun) {
      resolved++;
      continue;
    }

    const school = await prisma.school.findUnique({
      where: { universityId_code: { universityId: m.universityId, code: schoolCode } },
    });
    if (!school) {
      console.warn(`    ! School ${schoolCode} not found for university ${m.universityId} — skipping`);
      skipped++;
      continue;
    }

    let department = await prisma.department.findFirst({
      where: { schoolId: school.id, name: dept! },
    });
    if (!department) {
      department = await prisma.department.create({
        data: { schoolId: school.id, name: dept! },
      });
    }

    let program = await prisma.program.findFirst({ where: { departmentId: department.id } });
    if (!program) {
      program = await prisma.program.create({ data: { departmentId: department.id, name: dept! } });
    }

    // Placeholder course — no code available from title or department string.
    // Flag stays needsReview=true so it still surfaces for someone to attach
    // a real course later; this pass only fixes the School/Department/Program
    // grouping so it shows up correctly in the browse tree instead of vanishing.
    let course = await prisma.course.findFirst({
      where: { programId: program.id, code: 'UNSPECIFIED' },
    });
    if (!course) {
      course = await prisma.course.create({
        data: { programId: program.id, code: 'UNSPECIFIED', title: 'Unspecified course' },
      });
    }

    await prisma.studyMaterial.update({
      where: { id: m.id },
      data: { courseId: course.id }, // needsReview left true intentionally
    });
    resolved++;
  }

  console.log(`\n${dryRun ? '[DRY RUN] Would resolve' : 'Resolved'}: ${resolved}`);
  console.log(`Skipped (no confident department match): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());