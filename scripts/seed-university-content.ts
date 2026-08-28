// scripts/seed-university-content.ts
//
// Two jobs, both idempotent:
//   1. Backfill `slug` for any University row that doesn't have one yet
//      (slugified from `name`, unless a known override below applies).
//   2. Seed FUTA's real vision / mission / coreValues content — only
//      fills fields that are currently empty, so re-running this is
//      always safe and never clobbers content you've since edited by
//      hand in the admin panel or Neon's SQL editor.
//
// USAGE:
//   npx ts-node scripts/seed-university-content.ts --dry-run
//   npx ts-node scripts/seed-university-content.ts

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Known universities get a short, deliberate slug instead of whatever
// the auto-slugify of their full DB name would produce. Match against
// a substring of the real seeded name (trimmed) so trailing whitespace
// or minor name differences don't break the match.
const SLUG_OVERRIDES: { matchSubstring: string; slug: string }[] = [
  { matchSubstring: 'federal university of technology', slug: 'futa' },
];

function resolveSlug(name: string): string {
  const normalized = name.trim().toLowerCase();
  const override = SLUG_OVERRIDES.find((o) =>
    normalized.includes(o.matchSubstring),
  );
  return override ? override.slug : slugify(name);
}

const FUTA_CONTENT = {
  slug: 'futa',
  establishedYear: 1981,
  tagline:
    "A top-ranking university of technology in Nigeria, and the nation's pride. Since 1981, FUTA has grown across eight schools and more than fifty academic departments — training engineers, scientists and technologists who go on to build the country's future.",
  vision:
    'To be a world class University of Technology and a centre of excellence in training, research and service delivery.',
  mission:
    'To promote technological advancement by providing a conducive environment for research, teaching and learning — engendering products that are technologically oriented, self-reliant and relevant to society.',
  coreValues: JSON.stringify([
    {
      letter: 'I',
      word: 'Integrity',
      desc: 'Credibility, honesty, hard work and dignity in every endeavour.',
    },
    {
      letter: 'C',
      word: 'Creativity',
      desc: 'Creative thinking, innovation and dynamism toward institutional goals.',
    },
    {
      letter: 'A',
      word: 'Accountability',
      desc: 'Practised by every member of the FUTA community.',
    },
    {
      letter: 'R',
      word: 'Rationality',
      desc: 'Seeking the best solution, efficient with shared resources.',
    },
    {
      letter: 'E',
      word: 'Excellence',
      desc: 'Outstanding performance in research, teaching and service.',
    },
  ]),
  sourceUrl: 'https://futa.edu.ng/home/about',
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // --- 1. Backfill slugs for any University missing one ---
  const universities = await prisma.university.findMany();
  for (const u of universities) {
    if (u.slug) continue;
    const slug = resolveSlug(u.name);
    console.log(`Slug backfill: "${u.name}" -> "${slug}"`);
    if (!dryRun) {
      await prisma.university.update({ where: { id: u.id }, data: { slug } });
    }
  }

  // --- 2. Seed FUTA's real content (only fills empty fields) ---
  // Match by the same substring the slug override uses, trimmed and
  // case-insensitive, rather than an exact "FUTA" match against a DB
  // name that's actually the full institution name.
  const futa = universities.find((u) =>
    u.name.trim().toLowerCase().includes('federal university of technology'),
  );

  if (!futa) {
    console.log(
      'No University row found matching "Federal University of Technology" — skipping content seed.',
    );
  } else {
    const data: Record<string, unknown> = {};
    if (!futa.slug) data.slug = FUTA_CONTENT.slug;
    if (!futa.vision) data.vision = FUTA_CONTENT.vision;
    if (!futa.mission) data.mission = FUTA_CONTENT.mission;
    if (!futa.coreValues) data.coreValues = FUTA_CONTENT.coreValues;
    if (!futa.establishedYear) data.establishedYear = FUTA_CONTENT.establishedYear;
    if (!futa.tagline) data.tagline = FUTA_CONTENT.tagline;
    if (!futa.sourceUrl) data.sourceUrl = FUTA_CONTENT.sourceUrl;

    if (Object.keys(data).length === 0) {
      console.log('FUTA content already fully seeded — nothing to do.');
    } else {
      console.log(`FUTA content seed will set: ${Object.keys(data).join(', ')}`);
      if (!dryRun) {
        await prisma.university.update({ where: { id: futa.id }, data });
      }
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] Nothing changed.' : 'Done.'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());