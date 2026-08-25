// scripts/verify-backfill.ts
//
// Verification script — prints the full chain for materials so you can
// confirm the hierarchy resolves correctly end to end, e.g.:
//   SIMME > Mining Engineering (Dept) > B.Eng Mining Engineering > MNE 201
//
// Updated for the Phase 3 hierarchy: School -> Department -> Program -> Course.
// (Previously walked School -> Program directly; Program no longer has a
// schoolId/school relation — it hangs off Department now.)
//
// NOTE: StudyMaterial.course is a deprecated legacy String field.
// The live relation to Course is StudyMaterial.courseRef.
//
// USAGE:
//   npx ts-node scripts/verify-backfill.ts

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Summary: schools -> departments -> programs -> course counts
  const schools = await prisma.school.findMany({
    include: {
      departments: {
        include: {
          programs: { include: { courses: true } },
        },
      },
    },
  });

  console.log('=== School / Department / Program / Course summary ===\n');
  for (const s of schools) {
    const deptCount = s.departments.length;
    const programCount = s.departments.reduce((sum, d) => sum + d.programs.length, 0);
    const courseCount = s.departments.reduce(
      (sum, d) => sum + d.programs.reduce((pSum, p) => pSum + p.courses.length, 0),
      0,
    );
    console.log(`${s.code} (${s.name}) — ${deptCount} department(s), ${programCount} program(s), ${courseCount} course(s)`);
    for (const d of s.departments) {
      for (const p of d.programs) {
        console.log(`    ${d.name} > ${p.name} (${p.courses.length} course(s))`);
      }
    }
  }

  // Sample chain resolution for a handful of materials
  console.log('\n=== Sample material chain resolution ===\n');
  const sampleMaterials = await prisma.studyMaterial.findMany({
    take: 10,
    include: {
      courseRef: {
        include: {
          program: {
            include: {
              department: { include: { school: true } },
            },
          },
        },
      },
    },
  });

  for (const m of sampleMaterials) {
    const chain = m.courseRef
      ? `${m.courseRef.program.department.school.code} > ${m.courseRef.program.department.name} (Dept) > ${m.courseRef.program.name} > ${m.courseRef.code}`
      : '(no course linked)';
    console.log(`  ${m.title ?? m.id}: ${chain}`);
  }

  console.log(`\nDone. Verified ${sampleMaterials.length} sample material(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());