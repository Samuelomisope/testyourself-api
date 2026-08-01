// scripts/auto-categorize-materials.ts
//
// One-off CLI script — run with: npx ts-node scripts/auto-categorize-materials.ts
// Auto-fills department / level / semester / faculty (course code) on
// StudyMaterial records that are missing them, using:
//   1. A lookup table built from your already-correctly-tagged files
//   2. Regex course-code extraction from title/description
//   3. AI fallback (Claude) for anything left, gated by a confidence threshold
//
// Nothing is applied below CONFIDENCE_THRESHOLD — those rows are only logged.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COURSE_CODE_REGEX = /([A-Z]{2,4})\s?(\d{3})/;
const CONFIDENCE_THRESHOLD = 0.8;

const LEVEL_FROM_CODE = (num: string) => num[0] + '00'; // "301" -> "300"

type Tag = { department: string; level: string; semester: string; faculty: string };

async function buildLookupFromExisting(): Promise<Map<string, Tag>> {
  const tagged = await prisma.studyMaterial.findMany({
    where: {
      department: { not: null },
      level: { not: null },
      semester: { not: null },
      faculty: { not: null },
    },
    select: { department: true, level: true, semester: true, faculty: true },
  });

  // faculty (course code) -> most common tag combo seen for it
  const counts = new Map<string, Map<string, number>>();
  for (const t of tagged) {
    const code = t.faculty!.toUpperCase().replace(/\s+/g, ' ').trim();
    const key = JSON.stringify(t);
    if (!counts.has(code)) counts.set(code, new Map());
    const m = counts.get(code)!;
    m.set(key, (m.get(key) || 0) + 1);
  }

  const lookup = new Map<string, Tag>();
  for (const [code, m] of counts) {
    let best: string | null = null;
    let bestCount = 0;
    for (const [key, c] of m) {
      if (c > bestCount) { best = key; bestCount = c; }
    }
    if (best) lookup.set(code, JSON.parse(best));
  }
  return lookup;
}

function extractCourseCode(text: string): string | null {
  const match = text.match(COURSE_CODE_REGEX);
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}

async function classifyWithAI(
  title: string,
  description: string,
  knownDepartments: string[],
  levelHint: string | null,
) {
  const hintLine = levelHint
    ? `\nA course-code pattern in the title suggests this is likely ${levelHint} level — use that unless the text clearly says otherwise.`
    : '';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `You are classifying a Nigerian university study-material file.
Title: "${title}"
Description: "${description || '(none)'}"
Known departments seen on this platform so far: ${JSON.stringify(knownDepartments)}${hintLine}

Guess: department (pick from known list if it plausibly matches, else propose one), level (100-500), semester ("first" or "second"), and faculty (the course code, e.g. "CHM 101", if inferable — else null).
Respond ONLY with JSON, no markdown, no prose:
{"department": "...", "level": "...", "semester": "...", "faculty": "..." or null, "confidence": 0.0-1.0}`,
        },
      ],
    }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text ?? '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return { confidence: 0 };
  }
}

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (DRY_RUN) console.log('🧪 DRY RUN — no database writes will be made.\n');

  const lookup = await buildLookupFromExisting();
  const knownDepartments = [...new Set([...lookup.values()].map((t) => t.department))];
  console.log(`Built lookup table from ${lookup.size} known course codes.`);
  console.log(`Known departments: ${knownDepartments.join(', ')}`);

  const untagged = await prisma.studyMaterial.findMany({
    where: {
      OR: [{ department: null }, { level: null }, { semester: null }, { faculty: null }],
    },
  });
  console.log(`Found ${untagged.length} files needing categorization.\n`);

  let autoTagged = 0;
  let needsReview = 0;

  for (const file of untagged) {
    const searchText = `${file.title} ${file.description || ''}`;
    const extractedCode = extractCourseCode(searchText.toUpperCase());

    let tag: Tag | null = null;
    let confidence = 0;
    let source = '';

    if (extractedCode && lookup.has(extractedCode)) {
      tag = lookup.get(extractedCode)!;
      confidence = 1.0;
      source = 'lookup';
    } else {
      const levelHint = extractedCode ? LEVEL_FROM_CODE(extractedCode.match(/\d{3}/)![0]) : null;
      const aiResult = await classifyWithAI(file.title, file.description || '', knownDepartments, levelHint);
      if (aiResult.confidence >= CONFIDENCE_THRESHOLD) {
        tag = {
          department: aiResult.department,
          level: aiResult.level,
          semester: aiResult.semester,
          faculty: aiResult.faculty,
        };
        confidence = aiResult.confidence;
        source = 'ai';
      } else {
        confidence = aiResult.confidence ?? 0;
      }
    }

    if (tag && confidence >= CONFIDENCE_THRESHOLD) {
      console.log(`✅ [${source}] "${file.title}" -> ${tag.department} / ${tag.level}L / ${tag.semester} / ${tag.faculty}`);
      if (!DRY_RUN) {
        await prisma.studyMaterial.update({
          where: { id: file.id },
          data: {
            department: file.department ?? tag.department,
            level: file.level ?? tag.level,
            semester: file.semester ?? tag.semester,
            faculty: file.faculty ?? tag.faculty,
            needsReview: false,
          },
        });
      }
      autoTagged++;
    } else {
      console.log(`⚠️  Needs manual review: "${file.title}" (confidence ${confidence})`);
      if (!DRY_RUN) {
        await prisma.studyMaterial.update({
          where: { id: file.id },
          data: { needsReview: true },
        });
      }
      needsReview++;
    }
  }

  console.log(`\nDone. Auto-tagged: ${autoTagged}. Needs review: ${needsReview}.`);
  if (DRY_RUN) console.log('(Nothing was written — re-run without --dry-run to apply.)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());