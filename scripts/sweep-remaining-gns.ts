// scripts/sweep-remaining-gns.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[\s-]+/g, '');
}

// code -> known courseId (fill in GNS 106; others resolved dynamically below)
const KNOWN_COURSE_IDS: Record<string, string> = {
  'GNS 106': '08f990fd-281f-4d1a-8fcd-2ecb229f49f7',
};

const CODES_TO_SWEEP = ['GNS 101', 'GNS 102', 'GNS 103', 'GNS 106', 'CSP 201'];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const materials = await prisma.studyMaterial.findMany({
    where: { courseId: null, isDeleted: false },
    select: { id: true, title: true },
  });

  let linked = 0;
  for (const code of CODES_TO_SWEEP) {
    const courseId =
      KNOWN_COURSE_IDS[code] ??
      (await prisma.course.findFirst({ where: { code } }))?.id;

    if (!courseId) {
      console.warn(`No Course row for ${code} — skipping`);
      continue;
    }

    for (const m of materials) {
      if (!m.title) continue;
      const decoded = m.title.replace(/%20/g, ' ');
      if (!normalizeCode(decoded).includes(normalizeCode(code))) continue;

      console.log(`${dryRun ? '[DRY RUN] Would link' : 'Linking'} "${m.title}" → ${code}`);
      if (!dryRun) {
        await prisma.studyMaterial.update({
          where: { id: m.id },
          data: { courseId, needsReview: false },
        });
      }
      linked++;
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] Would link' : 'Linked'} ${linked} materials total`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());