// scripts/audit-legacy-faculty-materials.ts
//
// Counts StudyMaterial rows that have no `courseRef` set — these are the
// ones falling back to the legacy flat `faculty` string in the
// StudyMaterial.jsx grouping logic (courseRef?.program?.department?.school?.name
// || faculty || "Uncategorized School"), which is why old names like
// "SEET" (FUTA's pre-split School of Engineering and Engineering
// Technology, since split into SIMME/SESE) still show up as their own
// tree branch.
//
// Breaks results down by faculty string, and cross-references how many
// of each group are already flagged needsReview vs not — since some of
// these might just be missed by the original backfill rather than
// genuinely unresolvable.
//
// USAGE:
//   npx ts-node scripts/audit-legacy-faculty-materials.ts

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const withoutCourseRef = await prisma.studyMaterial.findMany({
    where: { courseRef: null, isDeleted: false },
    select: {
      id: true,
      title: true,
      faculty: true,
      department: true,
      course: true,
      needsReview: true,
    },
  });

  console.log(`Total materials with no courseRef (falling back to legacy fields): ${withoutCourseRef.length}\n`);

  const byFaculty = new Map<string, { total: number; needsReview: number; notFlagged: number }>();

  for (const m of withoutCourseRef) {
    const key = m.faculty || '(no faculty set)';
    if (!byFaculty.has(key)) byFaculty.set(key, { total: 0, needsReview: 0, notFlagged: 0 });
    const entry = byFaculty.get(key)!;
    entry.total++;
    if (m.needsReview) entry.needsReview++;
    else entry.notFlagged++;
  }

  console.log('Breakdown by legacy faculty string:');
  console.log('-----------------------------------');
  const sorted = [...byFaculty.entries()].sort((a, b) => b[1].total - a[1].total);
  for (const [faculty, stats] of sorted) {
    console.log(
      `${faculty.padEnd(35)} total: ${String(stats.total).padStart(4)}  ` +
      `needsReview: ${String(stats.needsReview).padStart(4)}  ` +
      `NOT flagged: ${String(stats.notFlagged).padStart(4)}`,
    );
  }

  const seetOnly = withoutCourseRef.filter((m) => (m.faculty || '').trim().toUpperCase() === 'SEET');
  if (seetOnly.length > 0) {
    console.log(`\n"SEET" specifically: ${seetOnly.length} material(s).`);
    const deptBreakdown = new Map<string, number>();
    for (const m of seetOnly) {
      const dept = m.department || '(no department set)';
      deptBreakdown.set(dept, (deptBreakdown.get(dept) || 0) + 1);
    }
    console.log('By department (useful for deciding SIMME vs SESE reassignment):');
    for (const [dept, count] of [...deptBreakdown.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${dept.padEnd(35)} ${count}`);
    }
  }

  const totalNeedsReview = await prisma.studyMaterial.count({ where: { needsReview: true, isDeleted: false } });
  console.log(`\nFor reference — total needsReview across the whole DB (including materials WITH a courseRef): ${totalNeedsReview}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());