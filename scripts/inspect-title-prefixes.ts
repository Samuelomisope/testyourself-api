// scripts/inspect-title-prefixes.ts
//
// Purpose: since `course` and `department` are null on nearly all
// unmigrated materials, the real course code lives inside `title`
// (inconsistently formatted: "BIO 103", "MNE%20201", "MTS 201 note by...").
// This script extracts a probable course-code prefix from each title and
// counts how often each prefix appears, so we can build an accurate
// PREFIX_TO_SCHOOL_CODE map before touching the real backfill script.
//
// Read-only — makes no changes to the database.
//
// USAGE:
//   npx ts-node scripts/inspect-title-prefixes.ts

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Matches a course-code-like token anywhere in the title, e.g.
// "BIO 103", "MNE%20201" (after decoding), "MTS201", "CVE 202B"
const COURSE_CODE_IN_TITLE = /\b([A-Z]{2,4})\s?(\d{3}[A-Z]?)\b/i;

function extractCourseCode(rawTitle: string): { prefix: string; code: string } | null {
  const decoded = rawTitle.replace(/%20/g, ' ');
  const match = decoded.match(COURSE_CODE_IN_TITLE);
  if (!match) return null;
  return {
    prefix: match[1].toUpperCase(),
    code: `${match[1].toUpperCase()} ${match[2].toUpperCase()}`,
  };
}

async function main() {
  const materials = await prisma.studyMaterial.findMany({
    where: { courseId: null, isDeleted: false },
    select: { id: true, title: true, faculty: true },
  });

  console.log(`Scanning ${materials.length} materials without courseId.\n`);

  const prefixCounts = new Map<string, number>();
  const exampleTitleByPrefix = new Map<string, string>();
  let noMatch = 0;
  const noMatchExamples: string[] = [];

  for (const m of materials) {
    if (!m.title) {
      noMatch++;
      continue;
    }
    const extracted = extractCourseCode(m.title);
    if (!extracted) {
      noMatch++;
      if (noMatchExamples.length < 15) noMatchExamples.push(m.title);
      continue;
    }
    prefixCounts.set(extracted.prefix, (prefixCounts.get(extracted.prefix) ?? 0) + 1);
    if (!exampleTitleByPrefix.has(extracted.prefix)) {
      exampleTitleByPrefix.set(extracted.prefix, m.title);
    }
  }

  console.log(`Titles with an extractable course code: ${materials.length - noMatch}`);
  console.log(`Titles with NO extractable course code: ${noMatch}\n`);

  console.log('--- Distinct prefixes found (sorted by frequency) ---');
  [...prefixCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([prefix, count]) => {
      console.log(`  ${prefix.padEnd(6)} x${count.toString().padEnd(4)} e.g. "${exampleTitleByPrefix.get(prefix)}"`);
    });

  console.log('\n--- Sample titles with NO extractable course code (up to 15) ---');
  noMatchExamples.forEach((t) => console.log(`  "${t}"`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
  