import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { isFeatureKey } from '../common/feature-keys';

@Injectable()
export class FeatureVisitService {
  constructor(private readonly db: PrismaService) {}

  /** Counts one visit to a section for this person today. Only a known section name is accepted. */
  async record(userId: string, feature: unknown): Promise<void> {
    if (!isFeatureKey(feature)) throw new BadRequestException('Unknown section.');
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await this.db.$executeRaw`INSERT INTO "FeatureVisit" ("id", "userId", "feature", "day", "count", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${userId}, ${feature}, ${day}, 1, NOW(), NOW()) ON CONFLICT ("userId", "feature", "day") DO UPDATE SET "count" = "FeatureVisit"."count" + 1, "updatedAt" = NOW()`;
  }
}
