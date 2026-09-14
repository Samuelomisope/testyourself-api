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

  // Near-duplicate (normalized filename / extracted-text similarity) and content-level
  // similarity are deferred to the text-extraction slice, since both need extracted text
  // that doesn't exist yet at this stage of the pipeline.
}