/**
 * find-mismapped-faculty.ts
 *
 * Diagnoses study materials affected by the UploadModal.jsx bug where the
 * course code was sent under the "faculty" field and "course" was never
 * sent at all. Read-only — makes no changes.
 *
 * Signature of an affected row:
 *   - course is null/empty (the field was never sent from the frontend)
 *   - faculty looks like a course code (e.g. "CHM 101", "MEE301") rather
 *     than a faculty/school name (e.g. "Physical Sciences", "ENGINEERING")
 *   - courseRef is null (create() never set it, so every single-file
 *     upload through the buggy form has this — bulk zip uploads are
 *     unaffected, they don't go through this code path)
 *
 * Run with:  npx ts-node scripts/find-mismapped-faculty.ts
 * (adjust the run command to match however you invoke the other check-*.ts
 * scripts in this repo — e.g. via `ts-node`, `tsx`, or a package.json script)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Matches things like "CHM 101", "MEE301", "GST 201", "CSC-201" —
// a short letter prefix followed by (optionally separated) digits.
// Faculty/school names ("Physical Sciences", "ENGINEERING", "SIMME")
// won't match this.
const COURSE_CODE_PATTERN = /^[A-Za-z]{2,5}[\s-]?\d{3}$/;

async function main() {
  const candidates = await prisma.studyMaterial.findMany({
    where: {
      course: null,
      faculty: { not: null },
      courseRef: null,
    },
    select: {
      id: true,
      title: true,
      faculty: true,
      department: true,
      level: true,
      semester: true,
      course: true,
      needsReview: true,
      createdAt: true,
      user: { select: { displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const affected = candidates.filter(
    (m) => m.faculty && COURSE_CODE_PATTERN.test(m.faculty.trim()),
  );

  const uncertain = candidates.filter(
    (m) => m.faculty && !COURSE_CODE_PATTERN.test(m.faculty.trim()),
  );

  console.log(`\nScanned ${candidates.length} materials with course=null, courseRef=null, faculty set.\n`);

  console.log(`=== Likely affected (faculty looks like a course code): ${affected.length} ===`);
  for (const m of affected) {
    console.log(
      `  [${m.id}] "${m.title}" — faculty="${m.faculty}" dept="${m.department}" ` +
      `level=${m.level} sem=${m.semester} needsReview=${m.needsReview} ` +
      `uploader=${m.user?.displayName ?? 'unknown'} (${m.createdAt.toISOString().slice(0, 10)})`
    );
  }

  console.log(`\n=== Uncertain — course=null but faculty doesn't match a course-code pattern: ${uncertain.length} ===`);
  console.log(`(Review manually — could be legitimate faculty names, or a code pattern this regex misses.)`);
  for (const m of uncertain) {
    console.log(
      `  [${m.id}] "${m.title}" — faculty="${m.faculty}" dept="${m.department}" ` +
      `level=${m.level} sem=${m.semester}`
    );
  }

  console.log(`\nNothing was modified. To fix a batch once you've confirmed the list, you can use the`);
  console.log(`existing PATCH /study-material/bulk endpoint (studyMaterialService.bulkUpdate) with the`);
  console.log(`correct { faculty, course } pairs per id — or per-record via the Edit UI now that the`);
  console.log(`upload form itself is fixed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());