import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StudyMaterial } from '@prisma/client';

@Injectable()
export class DuplicateDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  /** SHA-256 over raw file bytes. Cheapest, highest-confidence duplicate signal — run this first. */
  computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Exact-duplicate lookup. Scoped globally (not per-university) on purpose — the same
   * PDF re-uploaded under a different university record is still worth surfacing to an
   * admin, even though it won't auto-merge across universities.
   */
  async findExactDuplicate(fileHash: string): Promise<StudyMaterial | null> {
    return this.prisma.studyMaterial.findFirst({
      where: {
        fileHash,
        isDeleted: false,
      },
      orderBy: { createdAt: 'asc' }, // treat the earliest upload as canonical
    });
  }

  /**
   * Detect likely re-uploads without making a destructive decision. Candidates
   * are limited to the same university; the caller flags them for admin review.
   */
  async findNearDuplicate(input: {
    materialId: string;
    universityId: string;
    title: string;
    extractedText: string;
  }): Promise<{ material: Pick<StudyMaterial, 'id' | 'title'>; similarity: number; matchType: 'NEAR_FILENAME' | 'CONTENT_SIMILARITY' } | null> {
    const stopWords = new Set(['assignment', 'course', 'document', 'lecture', 'material', 'notes', 'past', 'question', 'questions', 'solution', 'study', 'test']);
    const tokens = [...new Set((input.title.toLowerCase().match(/[a-z0-9]{5,}/g) ?? [])
      .filter((token) => !stopWords.has(token)))].slice(0, 4);
    if (!tokens.length) return null;

    const candidates = await this.prisma.studyMaterial.findMany({
      where: {
        universityId: input.universityId,
        isDeleted: false,
        classificationStatus: { not: 'DUPLICATE' },
        id: { not: input.materialId },
        OR: tokens.flatMap((token) => [
          { title: { contains: token, mode: 'insensitive' as const } },
        ]),
      },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const titleTokens = this.tokens(input.title);
    const sourceShingles = this.shingles(input.extractedText);
    let best: { material: Pick<StudyMaterial, 'id' | 'title'>; similarity: number; matchType: 'NEAR_FILENAME' | 'CONTENT_SIMILARITY' } | null = null;
    const possibleContentMatches: Array<{ id: string; title: string; titleSimilarity: number }> = [];

    for (const candidate of candidates) {
      const candidateTitleTokens = this.tokens(candidate.title);
      const titleSimilarity = this.jaccard(titleTokens, candidateTitleTokens);
      if (input.extractedText.length >= 300 && candidateTitleTokens.size >= 3 && titleSimilarity >= 0.3) {
        possibleContentMatches.push({ id: candidate.id, title: candidate.title, titleSimilarity });
      }
      const isTitleMatch = titleTokens.size >= 3 && titleSimilarity >= 0.88;
      if (isTitleMatch && (!best || titleSimilarity > best.similarity)) {
        best = {
          material: { id: candidate.id, title: candidate.title },
          similarity: titleSimilarity,
          matchType: 'NEAR_FILENAME',
        };
      }
    }

    // Load extracted bodies only for a small set of filename-near candidates;
    // this avoids pulling many large documents into memory for each upload.
    if (possibleContentMatches.length && input.extractedText.length >= 300) {
      const shortlist = possibleContentMatches
        .sort((a, b) => b.titleSimilarity - a.titleSimilarity)
        .slice(0, 20);
      const bodies = await this.prisma.studyMaterial.findMany({
        where: { id: { in: shortlist.map((item) => item.id) } },
        select: { id: true, extractedText: true },
      });
      const bodyById = new Map<string, string>(bodies.map((item) => [item.id, item.extractedText ?? '']));
      for (const candidate of shortlist) {
        const body = bodyById.get(candidate.id)?.slice(0, 12_000) ?? '';
        if (body.length < 300) continue;
        const similarity = this.jaccard(sourceShingles, this.shingles(body));
        if (similarity >= 0.9 && (!best || similarity > best.similarity)) {
          best = {
            material: { id: candidate.id, title: candidate.title },
            similarity,
            matchType: 'CONTENT_SIMILARITY',
          };
        }
      }
    }

    return best;
  }

  private tokens(text: string): Set<string> {
    return new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  }

  private shingles(text: string): Set<string> {
    const words = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
    const result = new Set<string>();
    for (let i = 0; i <= words.length - 3; i++) result.add(words.slice(i, i + 3).join(' '));
    return result;
  }

  private jaccard(left: Set<string>, right: Set<string>): number {
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    for (const value of left) if (right.has(value)) intersection++;
    return intersection / (left.size + right.size - intersection);
  }

  // Near-duplicate (normalized filename / extracted-text similarity) and content-level
  // Content similarity is checked only among a bounded set of title-related candidates.
  // that doesn't exist yet at this stage of the pipeline.
}
