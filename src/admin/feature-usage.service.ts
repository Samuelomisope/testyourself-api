import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FEATURES } from '../common/feature-keys';

export const USAGE_WINDOWS = [7, 30, 90] as const;

/**
 * Where each section's real actions are already stored. Every name below is a fixed constant written here, never user
 * input, which is why it is safe to place them in the query text. Each line yields (feature, uid) for one action.
 */
const ACTION_SOURCES: string[] = [
  `SELECT 'library' AS feature, "userId" AS uid FROM "StudyMaterial" WHERE "createdAt" >= $1 AND "isDeleted" = false`,
  `SELECT 'ai_tools', "userId" FROM "AiGeneration" WHERE "createdAt" >= $1`,
  `SELECT 'ai_tools', cs."userId" FROM "ChatMessage" m JOIN "ChatSession" cs ON cs."id" = m."sessionId" WHERE m."createdAt" >= $1 AND m."role" = 'user'`,
  `SELECT 'ai_tools', "studentId" FROM "AskUniLibQuery" WHERE "createdAt" >= $1`,
  `SELECT 'classroom', s."userId" FROM "ClassroomTurn" t JOIN "ClassroomSession" s ON s."id" = t."sessionId" WHERE t."createdAt" >= $1 AND t."role" = 'STUDENT'`,
  `SELECT 'classroom', "userId" FROM "ClassroomAttempt" WHERE "createdAt" >= $1`,
  `SELECT 'flashcards', "userId" FROM "FlashcardReviewLog" WHERE "reviewedAt" >= $1`,
  `SELECT 'flashcards', "userId" FROM "FlashcardDeck" WHERE "createdAt" >= $1`,
  `SELECT 'study_plan', "userId" FROM "StudyPlan" WHERE "createdAt" >= $1`,
  `SELECT 'chat', "senderId" FROM "Message" WHERE "createdAt" >= $1`,
  `SELECT 'marketplace', "userId" FROM "MarketplaceItem" WHERE "createdAt" >= $1`,
  `SELECT 'novels', "userId" FROM "NovelReview" WHERE "createdAt" >= $1`,
  `SELECT 'novels', "authorId" FROM "Novel" WHERE "createdAt" >= $1`,
  `SELECT 'premium', "userId" FROM "PremiumPayment" WHERE "createdAt" >= $1`,
];

const PREMIUM = `u."isPremium" = true AND (u."premiumUntil" IS NULL OR u."premiumUntil" > NOW())`;

export type FeatureUsageRow = {
  key: string;
  label: string;
  /** Real actions recorded (a lesson turn, a flashcard review, an upload...). */
  actions: number;
  /** Different people who did at least one. */
  users: number;
  premiumUsers: number;
  /** Times the section was opened, from the visit counter. */
  visits: number;
  /** Different people who opened it. */
  visitors: number;
  premiumVisitors: number;
};

@Injectable()
export class FeatureUsageService {
  constructor(private readonly db: PrismaService) {}

  /** Accepts only the three supported windows so the query never receives a free-form number. */
  static window(days: unknown): number {
    const n = Number(days);
    return (USAGE_WINDOWS as readonly number[]).includes(n) ? n : 30;
  }

  async report(daysInput?: unknown) {
    const days = FeatureUsageService.window(daysInput);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceDay = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));

    const actionsSql = `SELECT x.feature AS feature, COUNT(*)::int AS actions, COUNT(DISTINCT x.uid)::int AS users, COUNT(DISTINCT x.uid) FILTER (WHERE ${PREMIUM})::int AS "premiumUsers" FROM (${ACTION_SOURCES.join(' UNION ALL ')}) x LEFT JOIN "User" u ON u."id" = x.uid GROUP BY x.feature`;
    const visitsSql = `SELECT v."feature" AS feature, COALESCE(SUM(v."count"), 0)::int AS visits, COUNT(DISTINCT v."userId")::int AS visitors, COUNT(DISTINCT v."userId") FILTER (WHERE ${PREMIUM})::int AS "premiumVisitors" FROM "FeatureVisit" v JOIN "User" u ON u."id" = v."userId" WHERE v."day" >= $1::date GROUP BY v."feature"`;
    const coverageSql = `SELECT MIN("day") AS "firstDay" FROM "FeatureVisit"`;

    const [actions, visits, coverage] = await Promise.all([
      this.db.$queryRawUnsafe<Array<{ feature: string; actions: number; users: number; premiumUsers: number }>>(actionsSql, since),
      this.db.$queryRawUnsafe<Array<{ feature: string; visits: number; visitors: number; premiumVisitors: number }>>(visitsSql, sinceDay),
      this.db.$queryRawUnsafe<Array<{ firstDay: Date | null }>>(coverageSql),
    ]);

    const byAction = new Map(actions.map((r) => [r.feature, r]));
    const byVisit = new Map(visits.map((r) => [r.feature, r]));
    const rows: FeatureUsageRow[] = FEATURES.map((f) => ({
      key: f.key,
      label: f.label,
      actions: Number(byAction.get(f.key)?.actions ?? 0),
      users: Number(byAction.get(f.key)?.users ?? 0),
      premiumUsers: Number(byAction.get(f.key)?.premiumUsers ?? 0),
      visits: Number(byVisit.get(f.key)?.visits ?? 0),
      visitors: Number(byVisit.get(f.key)?.visitors ?? 0),
      premiumVisitors: Number(byVisit.get(f.key)?.premiumVisitors ?? 0),
    }));
    // Most opened first; sections nobody opened fall back to real actions, then to the name.
    rows.sort((a, b) => b.visitors - a.visitors || b.visits - a.visits || b.users - a.users || b.actions - a.actions || a.label.localeCompare(b.label));

    const firstDay = coverage[0]?.firstDay ? new Date(coverage[0].firstDay).toISOString().slice(0, 10) : null;
    return { days, since: since.toISOString(), visitsTrackedSince: firstDay, features: rows };
  }
}
