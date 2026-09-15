import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { ClassificationRulesService } from './classification-rules.service';
import { TextExtractionService } from './text-extraction.service';

// Reconcile this with whatever UploadService already validates on the way into R2 —
// duplicated here only so ClassificationService can run standalone in bulk-reprocess jobs
// where the file is being re-read rather than freshly uploaded.
const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
]);

// Legacy materials sometimes have a bare extension in `fileType` instead of
// a real MIME string. Accept both shapes rather than rejecting old data.
const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  document: 'application/msword',
  presentation: 'application/vnd.ms-powerpoint',
  image: 'image/jpeg',
  video: 'video/mp4',
};

export interface ClassificationOutcome {
  materialId: string;
  status: 'AUTO_ORGANIZED' | 'NEEDS_REVIEW' | 'UNABLE_TO_CLASSIFY' | 'DUPLICATE';
  reason: string;
}

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly duplicateDetection: DuplicateDetectionService,
    private readonly rules: ClassificationRulesService,
    private readonly textExtraction: TextExtractionService,
  ) {}
validateFile(mimeType: string): { valid: boolean; reason?: string; normalizedMimeType?: string } {
  const normalized = SUPPORTED_MIME_TYPES.has(mimeType)
    ? mimeType
    : EXTENSION_TO_MIME[mimeType.toLowerCase().replace(/^\./, '')];

  if (!normalized) {
    return { valid: false, reason: `Unsupported file type: ${mimeType}` };
  }
  return { valid: true, normalizedMimeType: normalized };
}

  /**
   * Runs the deterministic (no-AI) slice of the Phase 3 pipeline against one material:
   * validate -> exact-duplicate check -> course-code rule -> persist outcome.
   *
   * `fileBuffer` is required for hashing. `sourceText` is what the rules engine searches
   * for a course code — for now that's the material's title/filename; once text
   * extraction + OCR land, extracted body text gets appended here too.
   */
  async classifyMaterial(materialId: string, fileBuffer: Buffer, mimeType: string): Promise<ClassificationOutcome> {
    const material = await this.prisma.studyMaterial.findUniqueOrThrow({
      where: { id: materialId },
    });

    const validation = this.validateFile(mimeType);
    if (!validation.valid) {
      await this.prisma.studyMaterial.update({
        where: { id: materialId },
        data: {
          classificationStatus: 'UNABLE_TO_CLASSIFY',
          classificationReason: validation.reason,
        },
      });
      return { materialId, status: 'UNABLE_TO_CLASSIFY', reason: validation.reason! };
    }

    const fileHash = this.duplicateDetection.computeHash(fileBuffer);
    const existingDuplicate = await this.duplicateDetection.findExactDuplicate(fileHash);

    if (existingDuplicate && existingDuplicate.id !== materialId) {
      const reason = `Exact file-hash match against existing material "${existingDuplicate.title}" (${existingDuplicate.id})`;
      await this.prisma.studyMaterial.update({
        where: { id: materialId },
        data: {
          fileHash,
          classificationStatus: 'DUPLICATE',
          classificationReason: reason,
          duplicateOfId: existingDuplicate.id,
          needsReview: true, // never auto-delete — surface it for admin confirmation
        },
      });
      return { materialId, status: 'DUPLICATE', reason };
    }

    const extraction = await this.textExtraction.extractText(fileBuffer, validation.normalizedMimeType!);
    const sourceText = [material.title, extraction.text].filter(Boolean).join(' ');

    // Extraction metadata is worth persisting even on NEEDS_REVIEW / UNABLE_TO_CLASSIFY
    // outcomes below — it's reused later for OCR routing and RAG chunking, so every
    // branch's update() now includes these three fields alongside its own status fields.
    const extractionFields = {
      extractedText: extraction.text || null,
      textExtractionMethod: extraction.method,
      needsOcr: extraction.likelyScanned,
    };

    const ruleResult = await this.rules.classifyByCourseCode(sourceText, material.universityId);

    if (ruleResult.outcome === 'RESOLVED') {
      const { course, matchedCode } = ruleResult;
      const reason = `Course code "${matchedCode.normalized}" matched exactly one course: ${course.title} (${course.program.department.school.name} > ${course.program.department.name} > ${course.program.name})`;

      await this.prisma.studyMaterial.update({
        where: { id: materialId },
        data: {
          fileHash,
          ...extractionFields,
          courseId: course.id,
          extractedCourseCode: matchedCode.raw,
          classificationStatus: 'AUTO_ORGANIZED',
          classificationConfidence: 100,
          classificationMethod: 'RULE_COURSE_CODE',
          classificationReason: reason,
          needsReview: false,
        },
      });
      this.logger.log(`Auto-organized ${materialId} via course-code rule (${matchedCode.normalized})`);
      return { materialId, status: 'AUTO_ORGANIZED', reason };
    }

    if (ruleResult.outcome === 'AMBIGUOUS') {
      const { candidates, matchedCode } = ruleResult;
      const optionsList = candidates
        .map((c) => `${c.title} [${c.program.department.school.name} > ${c.program.department.name} > ${c.program.name}]`)
        .join('; ');
      const reason = `Course code "${matchedCode.normalized}" matched ${candidates.length} courses — needs a human or AI pick: ${optionsList}`;

      await this.prisma.studyMaterial.update({
        where: { id: materialId },
        data: {
          fileHash,
          ...extractionFields,
          extractedCourseCode: matchedCode.raw,
          classificationStatus: 'NEEDS_REVIEW',
          classificationMethod: 'RULE_AMBIGUOUS',
          classificationReason: reason,
          needsReview: true,
        },
      });
      return { materialId, status: 'NEEDS_REVIEW', reason };
    }

    // NO_MATCH — no course code found even after including extracted text.
    const reason = extraction.likelyScanned
      ? 'No course code found; this looks like a scanned document with no extractable text layer — needs OCR (not yet implemented).'
      : 'No course code found in title or extracted text; AI classification is not yet implemented.';

    await this.prisma.studyMaterial.update({
      where: { id: materialId },
      data: {
        fileHash,
        ...extractionFields,
        classificationStatus: 'UNABLE_TO_CLASSIFY',
        classificationReason: reason,
        needsReview: true,
      },
    });
    return { materialId, status: 'UNABLE_TO_CLASSIFY', reason };
  }
}