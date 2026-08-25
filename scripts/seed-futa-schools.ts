// scripts/seed-futa-schools.ts
//
// Creates FUTA's School records. Safe to re-run — uses upsert on
// (universityId, code), so running it twice won't create duplicates.
//
// USAGE:
//   npx ts-node scripts/seed-futa-schools.ts
//
// PREREQUISITE: a University row with shortName "FUTA" must already exist.
// If you're not sure, this script will tell you and exit safely.

import 'dotenv/config'; // load .env explicitly — prisma.config.ts's dotenv loading only applies to `prisma` CLI commands, not standalone ts-node scripts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Source: FUTA's own school pages + cross-checked news/admissions sources, Aug 2026.
// "College of Health Sciences" uses label "College" since it doesn't call itself a School.
const FUTA_SCHOOLS = [
  { code: 'SIMME', name: 'School of Infrastructure, Minerals and Manufacturing Engineering', label: 'School' },
  { code: 'SESE', name: 'School of Electrical and Systems Engineering', label: 'School' },
  { code: 'SLIT', name: 'School of Logistics and Innovation Technology', label: 'School' },
  { code: 'SPS', name: 'School of Physical Sciences', label: 'School' },
  { code: 'SEMS', name: 'School of Earth and Mineral Sciences', label: 'School' },
  { code: 'SAAT', name: 'School of Agriculture and Agricultural Technology', label: 'School' },
  { code: 'SOC', name: 'School of Computing', label: 'School' },
  { code: 'SLS', name: 'School of Life Sciences', label: 'School' },
  { code: 'SET', name: 'School of Environmental Technology', label: 'School' },
  { code: 'CHS', name: 'College of Health Sciences', label: 'College' },
];

async function main() {
  const futa = await prisma.university.findFirst({
    where: { shortName: 'FUTA' },
  });

  if (!futa) {
    console.error(
      'No University found with shortName "FUTA". Create that row first (or update this script to match your actual University.name), then re-run.',
    );
    process.exit(1);
  }

  console.log(`Seeding schools for FUTA (universityId: ${futa.id})...\n`);

  for (const s of FUTA_SCHOOLS) {
    const school = await prisma.school.upsert({
      where: { universityId_code: { universityId: futa.id, code: s.code } },
      update: { name: s.name, label: s.label },
      create: {
        universityId: futa.id,
        code: s.code,
        name: s.name,
        label: s.label,
      },
    });
    console.log(`  ✓ ${school.code} — ${school.name}`);
  }

  console.log(`\nDone. ${FUTA_SCHOOLS.length} schools seeded/updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());