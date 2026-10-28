import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { ClassificationRulesService } from './classification-rules.service';
import { TextExtractionService } from './text-extraction.service';
import type { TextExtractionMethod } from './text-extraction.service';
import { AIService } from '../../provider/services/ai.service';

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
    private readonly ai: AIService,
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

    const nearDuplicate = await this.duplicateDetection.findNearDuplicate({
      materialId,
      universityId: material.universityId,
      title: material.title,
      extractedText: extraction.text,
    });
    if (nearDuplicate) {
      const percent = Math.round(nearDuplicate.similarity * 100);
      const reason = `Possible ${nearDuplicate.matchType === 'CONTENT_SIMILARITY' ? 'content' : 'title'} duplicate of "${nearDuplicate.material.title}" (${nearDuplicate.material.id}); similarity ${percent}%. Administrator confirmation is required.`;
      await this.prisma.studyMaterial.update({
        where: { id: materialId },
        data: {
          fileHash,
          ...extractionFields,
          duplicateOfId: nearDuplicate.material.id,
          classificationStatus: 'NEEDS_REVIEW',
          classificationConfidence: percent,
          classificationMethod: 'NEAR_DUPLICATE',
          classificationReason: reason,
          needsReview: true,
        },
      });
      return { materialId, status: 'NEEDS_REVIEW', reason };
    }

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
          duplicateOfId: null,
        },
      });
      this.logger.log(`Auto-organized ${materialId} via course-code rule (${matchedCode.normalized})`);
      return { materialId, status: 'AUTO_ORGANIZED', reason };
    }

    if (ruleResult.outcome === 'AMBIGUOUS') {
      const { candidates, matchedCode } = ruleResult;
      const aiOutcome = await this.tryAiClassification(
        materialId, material.title, sourceText, fileHash, extractionFields, candidates,
        `Course code "${matchedCode.normalized}" matched multiple courses.`,
      );
      if (aiOutcome) return aiOutcome;
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
          duplicateOfId: null,
        },
      });
      return { materialId, status: 'NEEDS_REVIEW', reason };
    }

    // NO_MATCH — use the AI only to suggest a row from a tightly scoped part
    // of this university's real course catalog. AI suggestions always remain
    // in Needs Review; only the deterministic unique-code rule auto-organizes.
    const aiCandidates = await this.rules.findAICandidates(sourceText, material.universityId);
    const aiOutcome = await this.tryAiClassification(
      materialId, material.title, sourceText, fileHash, extractionFields, aiCandidates,
      'No exact course-code match was found.',
    );
    if (aiOutcome) return aiOutcome;

    // No safe database-backed suggestion was available.
    const reason = extraction.likelyScanned
      ? 'No exact course-code match or usable AI suggestion was available; this scanned document needs manual review.'
      : 'No exact course-code match or usable AI suggestion was available; needs manual review.';

    await this.prisma.studyMaterial.update({
      where: { id: materialId },
      data: {
        fileHash,
        ...extractionFields,
        classificationStatus: 'UNABLE_TO_CLASSIFY',
        classificationReason: reason,
        needsReview: true,
        duplicateOfId: null,
      },
    });
    return { materialId, status: 'UNABLE_TO_CLASSIFY', reason };
  }

  private async tryAiClassification(
    materialId: string,
    fileName: string,
    extractedText: string,
    fileHash: string,
    extractionFields: { extractedText: string | null; textExtractionMethod: TextExtractionMethod; needsOcr: boolean },
    candidates: Array<{
      id: string;
      code: string;
      title: string;
      level: string | null;
      semester: string | null;
      program: { name: string; department: { name: string; school: { name: string; code: string } } };
    }>,
    deterministicReason: string,
  ): Promise<ClassificationOutcome | null> {
    if (!candidates.length) return null;

    const labels = candidates.map((course) => ({
      id: course.id,
      label: `${course.id} | ${course.code} — ${course.title} | ${course.program.department.name} | ${course.program.name}`,
    }));
    try {
      const result = await this.ai.classify({
        extractedText,
        fileName,
        candidateOptions: { course: labels.map((item) => item.label) },
      });
      if (!result || !result.course) return null;

      const proposedValue = typeof result.course.value === 'string' ? result.course.value.trim() : '';
      const exact = labels.filter(({ id, label }) => proposedValue === id || proposedValue === label || proposedValue.startsWith(`${id} |`));
      // Some providers return the exact course code/title instead of the option
      // string. Accept those only when they identify one catalog row uniquely.
      const byCode = labels.filter(({ id }) =>
        proposedValue.toLowerCase() === candidates.find((course) => course.id === id)?.code.toLowerCase(),
      );
      const byTitle = labels.filter(({ id }) =>
        proposedValue.toLowerCase() === candidates.find((course) => course.id === id)?.title.toLowerCase(),
      );
      const match = exact.length === 1 ? exact[0]
        : byCode.length === 1 ? byCode[0]
          : byTitle.length === 1 ? byTitle[0] : null;
      const course = match && candidates.find((item) => item.id === match.id);
      const fieldConfidence = result.course.confidence;
      const overallConfidence = result.overallConfidence;
      if (
        !course ||
        typeof fieldConfidence !== 'number' || !Number.isFinite(fieldConfidence) || fieldConfidence < 0 || fieldConfidence > 100 ||
        typeof overallConfidence !== 'number' || !Number.isFinite(overallConfidence) || overallConfidence < 0 || overallConfidence > 100
      ) return null;
      const confidence = Math.min(fieldConfidence, overallConfidence);

      const providerReason = typeof result.reason === 'string' ? result.reason.trim().slice(0, 1200) : '';
      const reason = [
        `AI suggested ${course.code} — ${course.title} (${course.program.department.name} > ${course.program.name}).`,
        `${deterministicReason} This is a suggestion and requires administrator confirmation.`,
        providerReason,
      ].filter(Boolean).join(' ');

      await this.prisma.studyMaterial.update({
        where: { id: materialId },
        data: {
          fileHash,
          ...extractionFields,
          extractedCourseCode: course.code,
          classificationStatus: 'NEEDS_REVIEW',
          classificationConfidence: confidence,
          classificationMethod: 'AI',
          classificationReason: reason,
          needsReview: true,
          duplicateOfId: null,
          // Deliberately do not assign courseId until an admin confirms it.
        },
      });
      return { materialId, status: 'NEEDS_REVIEW', reason };
    } catch (error) {
      this.logger.warn(`AI classification unavailable for ${materialId}: ${(error as Error).message}`);
      return null;
    }
  }
}
