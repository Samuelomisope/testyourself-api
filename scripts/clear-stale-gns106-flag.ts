// scripts/clear-stale-gns106-flag.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const stale = await prisma.studyMaterial.findMany({
    where: { courseId: { not: null }, needsReview: true },
    select: { id: true, title: true, courseId: true },
  });

  const gns106Stale = stale.filter((m) => /GNS\s?106/i.test(m.title ?? ''));
  console.log(`Found ${gns106Stale.length} GNS 106 materials with stale needsReview=true`);

  for (const m of gns106Stale) {
    console.log(`${dryRun ? '[DRY RUN] Would clear' : 'Clearing'} flag: "${m.title}"`);
    if (!dryRun) {
      await prisma.studyMaterial.update({ where: { id: m.id }, data: { needsReview: false } });
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());