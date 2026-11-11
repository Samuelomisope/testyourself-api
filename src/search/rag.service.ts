import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../provider/services/ai.service';

const MAX_CONTEXT_CHARS = 5_000;
const STOP_WORDS = new Set([
  'about', 'after', 'also', 'and', 'are', 'can', 'could', 'does', 'explain', 'find',
  'from', 'give', 'help', 'into', 'make', 'more', 'please', 'show', 'some', 'that',
  'the', 'their', 'them', 'then', 'this', 'what', 'when', 'where', 'which', 'with',
  'would', 'your', 'you', 'concept', 'meaning', 'understand', 'tell', 'describe',
]);

type RetrievedMaterial = {
  id: string;
  title: string;
  courseId: string | null;
  courseCode: string | null;
  extractedText: string | null;
  description: string | null;
};

@Injectable()
export class RagService {
  constructor(private readonly prisma: PrismaService, private readonly ai: AIService) {}

  async ask(userId: string, question: string, courseId?: string) {
    const searchTokens = [...new Set(
      (question.toLowerCase().normalize('NFKC').match(/[a-z0-9]{3,}/g) ?? [])
        .filter((token) => !STOP_WORDS.has(token)),
    )].slice(0, 8);
    if (searchTokens.length === 0) {
      return {
        answer: 'Please include a course or topic name so I can look for relevant UniLib materials.',
        isUncertain: true,
        sources: [],
        retrieval: 'postgres_full_text',
      };
    }
    const ftsQuery = searchTokens.map((token) => `${token}:*`).join(' | ');
    const rows = await this.prisma.$queryRaw(Prisma.sql`
      WITH candidates AS (
        SELECT
          m."id",
          m."title",
          m."courseId",
          c."code" AS "courseCode",
          m."extractedText",
          m."description",
          ts_rank_cd(
            to_tsvector('simple', coalesce(m."title", '') || ' ' || coalesce(m."description", '') || ' ' || coalesce(m."extractedText", '')),
            to_tsquery('simple', ${ftsQuery})
          ) AS rank
        FROM "StudyMaterial" m
        LEFT JOIN "Course" c ON c."id" = m."courseId"
        WHERE m."isDeleted" = false
          AND m."classificationStatus" = 'AUTO_ORGANIZED'
          AND (m."isPublic" = true OR m."userId" = ${userId})
          AND m."classificationStatus" <> 'DUPLICATE'
          AND m."extractedText" IS NOT NULL
          AND length(trim(m."extractedText")) > 0
          AND (${courseId ?? null}::text IS NULL OR m."courseId" = ${courseId ?? null})
          AND to_tsvector('simple', coalesce(m."title", '') || ' ' || coalesce(m."description", '') || ' ' || coalesce(m."extractedText", ''))
              @@ to_tsquery('simple', ${ftsQuery})
      )
      SELECT "id", "title", "courseId", "courseCode", "extractedText", "description"
      FROM candidates
      ORDER BY rank DESC
      LIMIT 5
    `) as RetrievedMaterial[];

    if (rows.length === 0) {
      return {
        answer: 'I could not find a relevant approved UniLib material for that question. Try choosing a course or rephrasing the question.',
        isUncertain: true,
        sources: [],
        retrieval: 'postgres_full_text',
      };
    }

    const chunks = rows.map((row, index) => {
      const text = (row.extractedText || row.description || '').trim();
      let start = 0;
      const lower = text.toLowerCase();
      for (const term of searchTokens) {
        const found = lower.indexOf(term);
        if (found >= 0) { start = Math.max(0, found - 350); break; }
      }
      const excerpt = text.slice(start, start + MAX_CONTEXT_CHARS).trim();
      return {
        materialId: row.id,
        materialTitle: row.title,
        courseId: row.courseId || '',
        chunkText: `Course: ${row.courseCode || 'Unknown'}\nExcerpt: ${excerpt}`,
        chunkIndex: index,
      };
    });

    const response = await this.ai.generate(
      `Answer the student's question using only the supplied UniLib excerpts. Cite relevant excerpts inline as [1], [2], etc. If the excerpts do not answer the question, say that the available materials do not provide enough information. Do not invent facts or citations.\n\nStudent question: ${question}`,
      { chunks },
    );

    return {
      answer: response.text,
      isUncertain: response.isUncertain || chunks.length === 0,
      sources: chunks.map((chunk, index) => ({
        number: index + 1,
        materialId: chunk.materialId,
        title: chunk.materialTitle,
        courseId: chunk.courseId,
      })),
      retrieval: 'postgres_full_text',
      provider: response.providerUsed,
      model: response.modelUsed,
    };
  }
}
