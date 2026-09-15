// scripts/check-gns-csp-needs-review.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.studyMaterial.findMany({
    where: { needsReview: true, isDeleted: false },
    select: { title: true },
  });
  const gns = rows.filter((r) => /GNS|CSP/i.test(r.title ?? ''));
  console.log('needsReview rows containing GNS/CSP:', gns.length);
  gns.slice(0, 20).forEach((r) => console.log(' -', r.title));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());