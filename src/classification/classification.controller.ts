import { Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificationService } from './services/classification.service';
import { UploadService } from '../upload/upload.service';
import { ClassificationJobsService } from './classification-jobs.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('admin/classification')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ClassificationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classificationService: ClassificationService,
    private readonly uploadService: UploadService,
    private readonly jobs: ClassificationJobsService,
  ) {}

  @Post('jobs')
  startBulkJob(@CurrentUser() user: AuthUser) {
    return this.jobs.startPendingJob(user.sub);
  }

  @Get('jobs/latest')
  getLatestActiveJob() {
    return this.jobs.getLatestActiveJob();
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.jobs.getJob(id);
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
