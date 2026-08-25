// scripts/delete-cms-materials.ts
//
// Soft-deletes the CMS 311 materials that couldn't be mapped into the
// School/Program/Course hierarchy. Uses isDeleted=true (not a hard delete)
// so it's reversible and consistent with how the rest of the app treats
// deletion.
//
// USAGE:
//   npx ts-node scripts/delete-cms-materials.ts --dry-run   (lists only)
//   npx ts-node scripts/delete-cms-materials.ts              (actually deletes)

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const materials = await prisma.studyMaterial.findMany({
    where: {
      courseId: null,
      isDeleted: false,
      title: { contains: 'CMS', mode: 'insensitive' },
    },
    select: { id: true, title: true },
  });

  console.log(`Found ${materials.length} CMS material(s):`);
  materials.forEach((m) => console.log(`  ${m.id}  "${m.title}"`));

  if (dryRun) {
    console.log('\n[DRY RUN] Nothing deleted. Re-run without --dry-run to soft-delete these.');
    return;
  }

  for (const m of materials) {
    await prisma.studyMaterial.update({ where: { id: m.id }, data: { isDeleted: true } });
  }
  console.log(`\nSoft-deleted ${materials.length} material(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());