// scripts/check-university-keys.ts
//
// Verifies that every University row in the DB has a shortName/name that
// EXACTLY matches a `name` key in the frontend's universities.js —
// getUniversity() does `u.name === name`, a strict, case-sensitive
// string match, so anything off by case/whitespace/spelling will
// silently fail to resolve a faculty roster on the frontend even
// though the backend filter and university link work fine.
//
// USAGE:
//   npx ts-node scripts/check-university-keys.ts

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Keep this in sync with the `name` keys in universities.js (UNIVERSITY_NAMES).
// Not imported directly since universities.js is a frontend ESM module —
// duplicating the list here keeps this script dependency-free.
const UNIVERSITY_NAMES = [
  'FUTA',
  'OAU',
  'UNILAG',
  'UI',
  'ABU',
  'UNIBEN',
  'UNIPORT',
  'LASU',
];

function checkMatch(key: string): { exact: boolean; caseInsensitiveMatch: string | null } {
  if (UNIVERSITY_NAMES.includes(key)) {
    return { exact: true, caseInsensitiveMatch: null };
  }
  const ciMatch = UNIVERSITY_NAMES.find(
    (n) => n.toLowerCase() === key.toLowerCase(),
  );
  return { exact: false, caseInsensitiveMatch: ciMatch ?? null };
}

async function main() {
  const universities = await prisma.university.findMany({
    select: { id: true, name: true, shortName: true, slug: true },
    orderBy: { name: 'asc' },
  });

  console.log(`Checking ${universities.length} University row(s) against universities.js...\n`);

  let okCount = 0;
  let issueCount = 0;

  for (const u of universities) {
    // Same precedence StudyMaterial.jsx uses when setting universityFilter:
    // match.shortName || match.name
    const key = u.shortName || u.name;
    const result = checkMatch(key);

    if (result.exact) {
      console.log(`OK       "${key}" (slug: ${u.slug ?? 'none'})`);
      okCount++;
    } else if (result.caseInsensitiveMatch) {
      console.log(
        `MISMATCH "${key}" (slug: ${u.slug ?? 'none'}) — close to "${result.caseInsensitiveMatch}" ` +
        `but not an exact match. getUniversity() is case-sensitive and will return undefined.`,
      );
      issueCount++;
    } else {
      console.log(
        `NO MATCH "${key}" (slug: ${u.slug ?? 'none'}) — not found in universities.js at all. ` +
        `The chip in StudyMaterial.jsx will select this university, but getUniversity() ` +
        `will return undefined, so selectedUniversityData will be null and the full faculty ` +
        `roster (including empty faculties) won't render — only faculties with existing files will show.`,
      );
      issueCount++;
    }
  }

  console.log(`\n${okCount} matched exactly, ${issueCount} with issues.`);
  if (issueCount > 0) {
    console.log('Fix mismatches by updating either the DB shortName/name or the universities.js "name" field so they match exactly.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());