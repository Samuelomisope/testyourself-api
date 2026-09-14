import { Controller, Post, Param, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificationService } from './services/classification.service';
import { UploadService } from '../upload/upload.service';

@Controller('admin/classification')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ClassificationController {
  private readonly logger = new Logger(ClassificationController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classificationService: ClassificationService,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * Temporary synchronous test harness for validating this slice against the existing
   * 300+ materials. NOT the real bulk pipeline — that's the async job-queue slice
   * (BullMQ worker, progress reporting, retries) described in the spec. This just proves
   * out the rules engine's hit rate before that infrastructure gets built.
   *
   * NOTE: this static route MUST be declared before the ':id' route below — Nest matches
   * routes in declaration order, and ':id' would otherwise swallow "bulk-test" as if it
   * were a material id.
   */
  @Post('bulk-test')
  async classifyAllPending() {
    const pending = await this.prisma.studyMaterial.findMany({
      where: { classificationStatus: 'PENDING', isDeleted: false },
    });

    const results = { autoOrganized: 0, needsReview: 0, unableToClassify: 0, duplicates: 0, failed: 0 };

    for (const material of pending) {
      try {
        const fileBuffer = await this.downloadFile(material.fileUrl);
        const outcome = await this.classificationService.classifyMaterial(material.id, fileBuffer, material.fileType);
        switch (outcome.status) {
          case 'AUTO_ORGANIZED':
            results.autoOrganized++;
            break;
          case 'NEEDS_REVIEW':
            results.needsReview++;
            break;
          case 'UNABLE_TO_CLASSIFY':
            results.unableToClassify++;
            break;
          case 'DUPLICATE':
            results.duplicates++;
            break;
        }
      } catch (err) {
        this.logger.error(`Classification failed for ${material.id}: ${err.message}`);
        results.failed++;
      }
    }

    return { processed: pending.length, ...results };
  }

  /** Re-run the deterministic classifier against one existing material. */
  @Post(':id')
  async classifyOne(@Param('id') id: string) {
    const material = await this.prisma.studyMaterial.findUniqueOrThrow({ where: { id } });
    const fileBuffer = await this.downloadFile(material.fileUrl);
    return this.classificationService.classifyMaterial(id, fileBuffer, material.fileType);
  }

  private async downloadFile(fileUrl: string): Promise<Buffer> {
    return this.uploadService.downloadFile(fileUrl);
  }
}