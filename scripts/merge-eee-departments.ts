// scripts/merge-eee-departments.ts
//
// Merges the duplicate EEE Department rows under SESE created by the
// Phase 2 program->department migration:
//   "Electrical Electronic Engineering"   (1 course)  <- duplicate, gets merged away
//   "Electrical/Electronics Engineering"  (7 courses) <- canonical, kept
//
// For each course under the duplicate program:
//   - If the canonical program already has a course with the same `code`
//     (this is the case for EEE 206), move the duplicate course's
//     StudyMaterial rows onto the existing canonical course, then delete
//     the duplicate course row.
//   - Otherwise, just reassign the course's programId onto the canonical
//     program directly (no collision, safe as a plain update).
// Then deletes the now-empty duplicate Program and Department.
//
// Safe/idempotent: does nothing if the duplicate name is already gone.
//
// USAGE:
//   npx ts-node scripts/merge-eee-departments.ts --dry-run
//   npx ts-node scripts/merge-eee-departments.ts

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SCHOOL_CODE = 'SESE';
const DUPLICATE_DEPT_NAME = 'Electrical Electronic Engineering';
const CANONICAL_DEPT_NAME = 'Electrical/Electronics Engineering';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const school = await prisma.school.findFirst({ where: { code: SCHOOL_CODE } });
  if (!school) {
    console.log(`School ${SCHOOL_CODE} not found. Nothing to do.`);
    return;
  }

  const duplicateDept = await prisma.department.findFirst({
    where: { schoolId: school.id, name: DUPLICATE_DEPT_NAME },
    include: { programs: { include: { courses: { include: { studyMaterials: true } } } } },
  });

  const canonicalDept = await prisma.department.findFirst({
    where: { schoolId: school.id, name: CANONICAL_DEPT_NAME },
    include: { programs: { include: { courses: { include: { studyMaterials: true } } } } },
  });

  if (!duplicateDept) {
    console.log(`No duplicate department "${DUPLICATE_DEPT_NAME}" found under ${SCHOOL_CODE}. Nothing to do.`);
    return;
  }
  if (!canonicalDept) {
    console.log(`Canonical department "${CANONICAL_DEPT_NAME}" not found under ${SCHOOL_CODE}. Aborting — check names.`);
    return;
  }
  if (!canonicalDept.programs.length) {
    console.log(`Canonical department has no Program yet. Aborting — expected a Program from Phase 2.`);
    return;
  }

  const canonicalProgram = canonicalDept.programs[0];

  console.log(`Duplicate:  "${duplicateDept.name}" (${duplicateDept.programs.length} program(s))`);
  for (const p of duplicateDept.programs) {
    console.log(`  -> Program "${p.name}" with ${p.courses.length} course(s)`);
  }
  console.log(`Canonical:  "${canonicalDept.name}" -> Program "${canonicalProgram.name}" (${canonicalProgram.courses.length} course(s) currently)`);

  for (const dupProgram of duplicateDept.programs) {
    console.log(`\nProcessing ${dupProgram.courses.length} course(s) from "${dupProgram.name}"`);

    for (const dupCourse of dupProgram.courses) {
      // Re-fetch canonical course list each time in case earlier iterations changed it
      const existingCanonicalCourse = await prisma.course.findFirst({
        where: { programId: canonicalProgram.id, code: dupCourse.code },
      });

      if (existingCanonicalCourse) {
        console.log(
          `  - ${dupCourse.code} "${dupCourse.title}": COLLISION with existing canonical course (id ${existingCanonicalCourse.id}). ` +
          `Moving ${dupCourse.studyMaterials.length} StudyMaterial row(s) onto it, then deleting duplicate course.`,
        );

        if (!dryRun) {
          await prisma.studyMaterial.updateMany({
            where: { courseId: dupCourse.id },
            data: { courseId: existingCanonicalCourse.id },
          });
          await prisma.course.delete({ where: { id: dupCourse.id } });
        }
      } else {
        console.log(
          `  - ${dupCourse.code} "${dupCourse.title}": no collision. Reassigning programId to canonical program.`,
        );

        if (!dryRun) {
          await prisma.course.update({
            where: { id: dupCourse.id },
            data: { programId: canonicalProgram.id },
          });
        }
      }
    }

    if (!dryRun) {
      // Program should now have zero courses left under it — safe to delete.
      await prisma.program.delete({ where: { id: dupProgram.id } });
    }
  }

  if (!dryRun) {
    await prisma.department.delete({ where: { id: duplicateDept.id } });
    console.log(`\nDeleted duplicate department "${DUPLICATE_DEPT_NAME}".`);
  }

  console.log(`\n${dryRun ? '[DRY RUN] Nothing changed.' : 'Done.'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());