/**
 * Backfill School.admissionRequirement with each FUTA school's
 * official <code>.futa.edu.ng site.
 *
 * NOTE: Despite the field name, these are each school's official
 * "About" site (e.g. simme.futa.edu.ng), not a literal admission-
 * requirements page — FUTA doesn't publish those per school, only
 * university-wide at admissions.futa.edu.ng. The footer that
 * surfaces this field should be labeled accordingly (e.g. "School
 * websites" / "Learn more"), not "Admission requirements".
 *
 * Idempotent: safe to re-run. Only updates schools whose code
 * matches one in SCHOOL_LINKS below; every other school is left
 * untouched. Skips a school if admissionRequirement is already set
 * to the same value (no-op update either way, but logged as skipped
 * for clarity).
 *
 * Usage:
 *   npx ts-node backfill-school-links.ts --dry-run
 *   npx ts-node backfill-school-links.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SCHOOL_LINKS: Record<string, string> = {
  SIMME: 'https://simme.futa.edu.ng/',
  SAAT: 'https://saat.futa.edu.ng/',
  SESE: 'https://sese.futa.edu.ng/',
  SPS: 'https://sps.futa.edu.ng/',
  SLS: 'https://sls.futa.edu.ng/',
  SEMS: 'https://sems.futa.edu.ng/',
  SET: 'https://set.futa.edu.ng/',
  SOC: 'https://soc.futa.edu.ng/',
  SLIT: 'https://slit.futa.edu.ng/',
  CHS: 'https://chs.futa.edu.ng/',
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const schools = await prisma.school.findMany({
    where: { code: { in: Object.keys(SCHOOL_LINKS) } },
    select: { id: true, code: true, name: true, admissionRequirement: true },
  });

  const foundCodes = new Set(schools.map((s) => s.code));
  const missingCodes = Object.keys(SCHOOL_LINKS).filter((c) => !foundCodes.has(c));

  if (missingCodes.length > 0) {
    console.warn(
      `⚠ No School row found for code(s): ${missingCodes.join(', ')} — check these match your DB's code values exactly.`,
    );
  }

  let updated = 0;
  let skipped = 0;

  for (const school of schools) {
    const url = SCHOOL_LINKS[school.code];
    if (school.admissionRequirement === url) {
      console.log(`- ${school.code} already set to ${url}, skipping`);
      skipped++;
      continue;
    }

    console.log(
      `${dryRun ? '[dry-run] would update' : '✓ updating'} ${school.code} (${school.name}) → ${url}`,
    );

    if (!dryRun) {
      await prisma.school.update({
        where: { id: school.id },
        data: { admissionRequirement: url },
      });
    }
    updated++;
  }

  console.log(
    `\nDone. ${updated} ${dryRun ? 'would be updated' : 'updated'}, ${skipped} already correct, ${missingCodes.length} code(s) not found.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });