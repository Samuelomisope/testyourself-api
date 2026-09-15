// scripts/fix-gns106.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const updated = dryRun
    ? null
    : await prisma.course.update({
        where: { id: '08f990fd-281f-4d1a-8fcd-2ecb229f49f7' },
        data: { title: 'Logic and Philosophy' },
      });
  console.log(dryRun ? '[DRY RUN] Would update GNS 106 title' : 'Updated:', updated ?? '');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());