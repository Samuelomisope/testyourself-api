import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { ClassificationService } from './services/classification.service';

const MAX_BULK_ITEMS = 500;
const MAX_ATTEMPTS = 3;

type ClaimedItem = { id: string; jobId: string; materialId: string; attempts: number };

@Injectable()
export class ClassificationJobsService {
  private readonly logger = new Logger(ClassificationJobsService.name);
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly classification: ClassificationService,
    private readonly upload: UploadService,
  ) {}

  async startPendingJob(requestedById: string) {
    const now = new Date();
    const jobId = await this.prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(1145131635) AS locked
      `;
      if (!lock?.locked) {
        throw new ConflictException('Another classification job is being started. Try again shortly.');
      }
      const activeJob = await tx.classificationJob.findFirst({
        where: { status: { in: ['QUEUED', 'PROCESSING'] } },
        select: { id: true },
      });
      if (activeJob) throw new ConflictException('A classification job is already running. Check its progress before starting another.');

      const pending = await tx.studyMaterial.findMany({
        where: { classificationStatus: 'PENDING', isDeleted: false },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: MAX_BULK_ITEMS + 1,
      });
      if (pending.length > MAX_BULK_ITEMS) {
        throw new BadRequestException(`A classification job can process at most ${MAX_BULK_ITEMS} materials. Run a job, then start another.`);
      }
      const job = await tx.classificationJob.create({
        data: {
          requestedById,
          totalItems: pending.length,
          status: pending.length ? 'QUEUED' : 'COMPLETED',
          completedAt: pending.length ? null : now,
        },
      });
      if (pending.length) {
        await tx.classificationJobItem.createMany({
          data: pending.map(({ id: materialId }) => ({
            jobId: job.id,
            materialId,
            createdAt: now,
            updatedAt: now,
          })),
        });
      }
      return job.id;
    });
    return this.getJob(jobId);
  }

  async getLatestActiveJob() {
    const job = await this.prisma.classificationJob.findFirst({
      where: { status: { in: ['QUEUED', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return job ? this.getJob(job.id) : null;
  }

  async getJob(id: string) {
    const job = await this.prisma.classificationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Classification job not found.');
    const items = await this.prisma.classificationJobItem.findMany({
      where: { jobId: id },
      select: { status: true, classificationOutcome: true },
    });
    const itemStates = { queued: 0, processing: 0, completed: 0, failed: 0 };
    const outcomes = { autoOrganized: 0, needsReview: 0, unableToClassify: 0, duplicates: 0, skipped: 0 };
    for (const item of items) {
      if (item.status === 'QUEUED') itemStates.queued++;
      else if (item.status === 'PROCESSING') itemStates.processing++;
      else if (item.status === 'COMPLETED') itemStates.completed++;
      else if (item.status === 'FAILED') itemStates.failed++;
      if (item.classificationOutcome === 'AUTO_ORGANIZED') outcomes.autoOrganized++;
      else if (item.classificationOutcome === 'NEEDS_REVIEW') outcomes.needsReview++;
      else if (item.classificationOutcome === 'UNABLE_TO_CLASSIFY') outcomes.unableToClassify++;
      else if (item.classificationOutcome === 'DUPLICATE') outcomes.duplicates++;
      else if (item.classificationOutcome === 'SKIPPED') outcomes.skipped++;
    }
    const processed = itemStates.completed + itemStates.failed;
    return {
      ...job,
      processed,
      progressPercent: job.totalItems ? Math.round((processed / job.totalItems) * 100) : 100,
      itemStates,
      outcomes,
    };
  }

  @Cron('*/5 * * * * *')
  async pollQueue() {
    if (this.polling) return;
    this.polling = true;
    try {
      const item = await this.claimNextItem();
      if (item) await this.processItem(item);
    } catch (error) {
      this.logger.error(`Classification worker poll failed: ${(error as Error).message}`);
    } finally {
      this.polling = false;
    }
  }

  private async claimNextItem(): Promise<ClaimedItem | null> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedItem[]>`
        WITH next_item AS (
          SELECT "id"
          FROM "ClassificationJobItem"
          WHERE ("status" = 'QUEUED' AND "availableAt" <= NOW())
             OR ("status" = 'PROCESSING' AND "startedAt" < NOW() - INTERVAL '10 minutes')
          ORDER BY "availableAt" ASC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "ClassificationJobItem" AS item
        SET "status" = 'PROCESSING',
            "attempts" = item."attempts" + 1,
            "startedAt" = NOW(),
            "updatedAt" = NOW()
        FROM next_item
        WHERE item."id" = next_item."id"
        RETURNING item."id", item."jobId", item."materialId", item."attempts"
      `;
      const item = rows[0] ?? null;
      if (item) {
        await tx.classificationJob.update({
          where: { id: item.jobId },
          data: { status: 'PROCESSING', startedAt: new Date() },
        });
      }
      return item;
    });
  }

  private async processItem(item: ClaimedItem) {
    try {
      if (item.attempts > MAX_ATTEMPTS) {
        throw new Error('Worker lease expired after the maximum number of attempts.');
      }
      const material = await this.prisma.studyMaterial.findUnique({
        where: { id: item.materialId },
        select: { id: true, fileUrl: true, fileType: true, isDeleted: true },
      });
      if (!material || material.isDeleted) {
        await this.finishItem(item, 'COMPLETED', 'SKIPPED');
        return;
      }
      const buffer = await this.upload.downloadFile(material.fileUrl);
      const result = await this.classification.classifyMaterial(material.id, buffer, material.fileType);
      await this.finishItem(item, 'COMPLETED', result.status);
    } catch (error) {
      const message = (error as Error).message.slice(0, 1000);
      const terminal = item.attempts >= MAX_ATTEMPTS;
      const delaySeconds = Math.min(60, 10 * 2 ** Math.max(0, item.attempts - 1));
      await this.prisma.classificationJobItem.update({
        where: { id: item.id },
        data: {
          status: terminal ? 'FAILED' : 'QUEUED',
          lastError: message,
          availableAt: new Date(Date.now() + delaySeconds * 1000),
          finishedAt: terminal ? new Date() : null,
          updatedAt: new Date(),
        },
      });
      this.logger.warn(`Classification item ${item.id} attempt ${item.attempts} failed: ${message}`);
      await this.refreshJob(item.jobId);
    }
  }

  private async finishItem(item: ClaimedItem, status: string, outcome: string) {
    await this.prisma.classificationJobItem.update({
      where: { id: item.id },
      data: { status, classificationOutcome: outcome, lastError: null, finishedAt: new Date(), updatedAt: new Date() },
    });
    await this.refreshJob(item.jobId);
  }

  private async refreshJob(jobId: string) {
    const statuses = await this.prisma.classificationJobItem.findMany({
      where: { jobId },
      select: { status: true },
    });
    const terminalCount = statuses.filter((item) => item.status === 'COMPLETED' || item.status === 'FAILED').length;
    const allFinished = terminalCount === statuses.length;
    const anyFailed = statuses.some((item) => item.status === 'FAILED');
    await this.prisma.classificationJob.update({
      where: { id: jobId },
      data: {
        status: allFinished ? (anyFailed ? 'FAILED' : 'COMPLETED') : 'PROCESSING',
        completedAt: allFinished ? new Date() : null,
      },
    });
  }
}
