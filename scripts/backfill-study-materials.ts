// scripts/backfill-study-materials.ts
//
// v2 — rewritten after discovering `course` and `department` are NULL on
// nearly all live rows. The real course code lives inside `title` in
// inconsistent formats ("BIO 103", "MNE%20201", "EEE203PQ", "PHY-107-...").
// School is resolved from the extracted course-code PREFIX (e.g. "EEE"),
// not from `department`, since department doesn't exist in this dataset.
//
// SAFE BY DESIGN (unchanged from v1):
// - Only touches materials where courseId IS NULL — never overwrites an
//   already-linked material.
// - Dry run first — nothing written until you review + confirm the mapping.
// - Anything that can't be confidently resolved is flagged needsReview=true
//   instead of being force-fit — surfaces in your admin panel for triage.
//
// WHAT'S NEW IN v2:
// - Course code is extracted from `title`, not `course` (which is null).
// - Extraction requires a WHITELIST match (KNOWN_COURSE_PREFIXES) to avoid
//   false positives like "All 202..." matching as a fake course code.
// - Regex fixed to handle "EEE203PQ" (no space, letter suffix touching
//   digits) and "PHY-107-2011..." (hyphen separator) — v1's regex missed both.
// - GENERAL_SERVICE_PREFIXES (GNS, GST, CSP, and anything else you add) are
//   explicitly flagged needsReview rather than guessed into a School, since
//   they're cross-faculty courses with no single owning School.
// - Program name is derived from PREFIX_TO_PROGRAM_NAME (since there's no
//   real department string to canonicalize anymore).
//
// USAGE (same as before):
//   1. npx ts-node scripts/backfill-study-materials.ts --dry-run
//   2. Review the unmapped-prefix list, edit COURSE_PREFIX_TO_SCHOOL_CODE
//      and PREFIX_TO_PROGRAM_NAME below as needed.
//   3. npx ts-node scripts/backfill-study-materials.ts   (real run)
//   4. Re-run --dry-run to confirm 0 unmapped remain.
//   5. Review created Program/Course rows — course `title` fields are
//      placeholders (same as the code) and should get real titles later.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// STEP 1: prefix -> School code. Fill in / correct freely — this is your
// call, not a guess to trust blindly.
const COURSE_PREFIX_TO_SCHOOL_CODE: Record<string, string> = {
  // Engineering — SIMME / SESE
  EEE: 'SESE', // Electrical/Electronics Engineering
  MEE: 'SIMME', // Mechanical Engineering
  MNE: 'SIMME', // Mining Engineering
  CVE: 'SIMME', // Civil Engineering
  AGE: 'SIMME', // Agricultural & Environmental Engineering
  MME: 'SIMME', // Metallurgical & Materials Engineering
  CHE: 'SIMME', // Chemical Engineering (confirmed: NOT the service chem course)

  // Service courses with a real owning School
  CHEM: 'SPS', // General Chemistry (School of Physical Sciences)
  PHY: 'SPS', // Physics
  MTS: 'SPS', // Mathematics
  BIO: 'SLS', // Biology (School of Life Sciences)
  CSC: 'SOC', // Computer Science (School of Computing)

  // CMS: unresolved — what course is this? Add once known.
};

// Course-code prefixes that are confirmed cross-faculty/general courses with
// no single owning School. These get needsReview=true (not guessed) so they
// surface for manual triage rather than being silently mismapped.
const GENERAL_SERVICE_PREFIXES = new Set(['GNS', 'GST', 'CSP']);

// Display name for the Program created under each School. Extend alongside
// COURSE_PREFIX_TO_SCHOOL_CODE.
const PREFIX_TO_PROGRAM_NAME: Record<string, string> = {
  EEE: 'Electrical/Electronics Engineering',
  MEE: 'Mechanical Engineering',
  MNE: 'Mining Engineering',
  CVE: 'Civil Engineering',
  AGE: 'Agricultural & Environmental Engineering',
  MME: 'Metallurgical & Materials Engineering',
  CHE: 'Chemical Engineering',
  CHEM: 'Chemistry',
  PHY: 'Physics',
  MTS: 'Mathematics',
  BIO: 'Biology',
  CSC: 'Computer Science',
};

// Whitelist gate for extraction — only prefixes listed here (mapped or not)
// are accepted as real course codes. Anything else found by the regex is
// ignored, preventing false positives like "All 202..." from matching.
// Includes GENERAL_SERVICE_PREFIXES + CMS (unresolved) + anything mapped above.
const KNOWN_COURSE_PREFIXES = new Set([
  ...Object.keys(COURSE_PREFIX_TO_SCHOOL_CODE),
  ...GENERAL_SERVICE_PREFIXES,
  'CMS', // unresolved — still whitelisted so it's flagged needsReview, not silently dropped
]);

// Matches a course-code-like token in a title: letters + optional
// space/hyphen + 3 digits, NOT immediately followed by another digit
// (guards against matching into a longer number like "20242025").
// Trailing letters (e.g. "203PQ", "200L") are fine and ignored.
const COURSE_CODE_IN_TITLE = /\b([A-Za-z]{2,4})[\s-]?(\d{3})(?!\d)/;

function extractCourseCode(rawTitle: string): { prefix: string; code: string } | null {
  const decoded = rawTitle.replace(/%20/g, ' ');
  const match = decoded.match(COURSE_CODE_IN_TITLE);
  if (!match) return null;
  const prefix = match[1].toUpperCase();
  if (!KNOWN_COURSE_PREFIXES.has(prefix)) return null; // reject unknown "words that look like codes"
  return { prefix, code: `${prefix} ${match[2]}` };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const materials = await prisma.studyMaterial.findMany({
    where: { courseId: null, isDeleted: false },
    select: { id: true, universityId: true, title: true },
  });

  console.log(`Found ${materials.length} materials without courseId.\n`);

  const unmapped = new Map<string, number>();
  let migrated = 0;
  let flaggedNoCourse = 0;
  let flaggedGeneralService = 0;

     for (const m of materials) {
    const extracted = m.title ? extractCourseCode(m.title) : null;

    if (!extracted) {
      if (!dryRun) {
        await prisma.studyMaterial.update({ where: { id: m.id }, data: { needsReview: true } });
      }
      flaggedNoCourse++;
      continue;
    }

    if (GENERAL_SERVICE_PREFIXES.has(extracted.prefix)) {
      if (!dryRun) {
        await prisma.studyMaterial.update({ where: { id: m.id }, data: { needsReview: true } });
      }
      flaggedGeneralService++;
      continue;
    }

    const schoolCode = COURSE_PREFIX_TO_SCHOOL_CODE[extracted.prefix];
    if (!schoolCode) {
      const key = `prefix="${extracted.prefix}" example_title="${m.title}"`;
      unmapped.set(key, (unmapped.get(key) ?? 0) + 1);
      continue;
    }

    if (dryRun) {
      migrated++;
      continue;
    }

    const school = await prisma.school.upsert({
      where: { universityId_code: { universityId: m.universityId, code: schoolCode } },
      update: {},
      create: { universityId: m.universityId, code: schoolCode, name: schoolCode },
    });

    const departmentName = PREFIX_TO_PROGRAM_NAME[extracted.prefix] ?? extracted.prefix;

    let department = await prisma.department.findFirst({
      where: { schoolId: school.id, name: departmentName },
    });
    if (!department) {
      department = await prisma.department.create({
        data: { schoolId: school.id, name: departmentName },
      });
    }

    let program = await prisma.program.findFirst({ where: { departmentId: department.id } });
    if (!program) {
      program = await prisma.program.create({ data: { departmentId: department.id, name: departmentName } });
    }

    let course = await prisma.course.findFirst({ where: { programId: program.id, code: extracted.code } });
    if (!course) {
      course = await prisma.course.create({
        data: { programId: program.id, code: extracted.code, title: extracted.code },
      });
    }

    await prisma.studyMaterial.update({ where: { id: m.id }, data: { courseId: course.id } });
    migrated++;
  }

  console.log(`${dryRun ? '[DRY RUN] Would migrate' : 'Migrated'}: ${migrated}`);
  console.log(`Flagged needsReview (no extractable course code): ${flaggedNoCourse}`);
  console.log(`Flagged needsReview (general/cross-faculty course): ${flaggedGeneralService}`);
  if (unmapped.size > 0) {
    console.log(`\n${unmapped.size} distinct combo(s) NOT migrated — add to COURSE_PREFIX_TO_SCHOOL_CODE and re-run:`);
    [...unmapped.entries()].sort((a, b) => b[1] - a[1]).forEach(([combo, count]) => console.log(`  (${count}x) ${combo}`));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());