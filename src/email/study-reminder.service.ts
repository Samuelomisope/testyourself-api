import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { getPlanDayNumber } from '../ai/study-plan.utils';
import { EmailService } from './email.service';
import { signUnsubscribeToken, unsubscribeUrl } from './unsubscribe-token';

export type ReminderCandidate = { userId: string; planSubject?: string; planRemaining: number; dueCards: number };

const MIN_GAP_MS = 20 * 60 * 60 * 1000; // at most one reminder a day
const RECENTLY_ACTIVE_MS = 6 * 60 * 60 * 1000; // someone who studied this afternoon does not need a nudge
const SEND_SPACING_MS = 600; // Resend allows about 2 requests a second

/** Most to do first, so the daily cap is spent on the people it helps most. */
export function rankCandidates(candidates: ReminderCandidate[]): ReminderCandidate[] {
  return [...candidates].sort((a, b) => (b.planRemaining + b.dueCards) - (a.planRemaining + a.dueCards));
}

export function dailyCap(): number {
  const value = Number(process.env.REMINDER_EMAIL_DAILY_CAP);
  return Number.isInteger(value) && value > 0 ? value : 80;
}

@Injectable()
export class StudyReminderService {
  private readonly logger = new Logger(StudyReminderService.name);

  constructor(private readonly prisma: PrismaService, private readonly email: EmailService, private readonly jwt: JwtService) {}

  // One database wake-up a day, shortly after the in-app plan reminder at 18:00.
  @Cron('10 18 * * *', { timeZone: 'Africa/Lagos' })
  async sendDailyReminders() {
    if (process.env.REMINDER_EMAILS_ENABLED === 'false') return;
    try {
      const now = new Date();
      const candidates = await this.findCandidates(now);
      const chosen = rankCandidates(candidates).slice(0, dailyCap());
      let sent = 0;
      for (const candidate of chosen) {
        if (await this.sendOne(candidate, now)) sent++;
        await new Promise((resolve) => setTimeout(resolve, SEND_SPACING_MS));
      }
      this.logger.log(`Study reminder emails: ${sent} sent, ${candidates.length - chosen.length} over the daily cap`);
    } catch (error) {
      this.logger.error(`Study reminder run failed: ${(error as Error).message}`);
    }
  }

  async findCandidates(now: Date): Promise<ReminderCandidate[]> {
    const byUser = new Map<string, ReminderCandidate>();
    const entry = (userId: string) => {
      let c = byUser.get(userId);
      if (!c) { c = { userId, planRemaining: 0, dueCards: 0 }; byUser.set(userId, c); }
      return c;
    };

    const plans = await this.prisma.studyPlan.findMany({
      where: { active: true },
      select: { userId: true, subject: true, startDate: true, daysAvailable: true, entries: true, completedTasks: true },
    });
    for (const plan of plans) {
      const day = getPlanDayNumber(plan.startDate, now);
      if (day < 1 || day > plan.daysAvailable) continue;
      const today = Array.isArray(plan.entries) ? (plan.entries as Array<{ day?: number; tasks?: unknown[] }>).find((e) => e.day === day) : undefined;
      const tasks = Array.isArray(today?.tasks) ? today.tasks.length : 0;
      if (!tasks) continue;
      const done = (plan.completedTasks as Record<string, unknown> | null)?.[String(day)];
      const completed = Array.isArray(done) ? new Set(done.filter(Number.isInteger)).size : 0;
      const remaining = tasks - completed;
      if (remaining <= 0) continue;
      const c = entry(plan.userId);
      if (remaining > c.planRemaining) { c.planRemaining = remaining; c.planSubject = plan.subject; }
    }

    const due = await this.prisma.flashcardProgress.groupBy({ by: ['userId'], where: { nextReviewDate: { lte: now } }, _count: { _all: true } });
    for (const row of due) entry(row.userId).dueCards = row._count._all;

    if (!byUser.size) return [];
    const eligible = await this.prisma.user.findMany({
      where: {
        id: { in: [...byUser.keys()] },
        emailReminders: true,
        isBanned: false,
        lastActiveAt: { lt: new Date(now.getTime() - RECENTLY_ACTIVE_MS) },
        OR: [{ lastReminderEmailAt: null }, { lastReminderEmailAt: { lt: new Date(now.getTime() - MIN_GAP_MS) } }],
      },
      select: { id: true },
    });
    return eligible.map((u) => byUser.get(u.id)!).filter(Boolean);
  }

  private async sendOne(candidate: ReminderCandidate, now: Date): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: candidate.userId }, select: { email: true, displayName: true } });
      if (!user?.email) return false;
      // Record first: if sending then fails we skip the person today rather than risk emailing them twice.
      await this.prisma.user.update({ where: { id: candidate.userId }, data: { lastReminderEmailAt: now } });
      await this.email.sendStudyReminder(user.email, {
        displayName: user.displayName,
        plan: candidate.planSubject && candidate.planRemaining > 0 ? { subject: candidate.planSubject, remaining: candidate.planRemaining } : null,
        dueCards: candidate.dueCards,
        unsubscribeUrl: unsubscribeUrl(signUnsubscribeToken(this.jwt, candidate.userId)),
      });
      return true;
    } catch (error) {
      this.logger.warn(`Reminder email failed for a user: ${(error as Error).message}`);
      return false;
    }
  }
}
