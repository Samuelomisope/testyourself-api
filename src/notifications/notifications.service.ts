import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { getPlanDayNumber } from '../ai/study-plan.utils';

const NOTIFICATION_TYPES = new Set(['material', 'marketplace']);

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      message: notification.body,
      type: notification.type,
      read: notification.isRead,
      createdAt: notification.createdAt,
    }));
  }

  async createForUser(userId: string, type: string, message: string) {
    if (!NOTIFICATION_TYPES.has(type) || typeof message !== 'string' || !message.trim() || message.length > 500) {
      throw new BadRequestException('Invalid notification payload.');
    }
    return this.prisma.notification.create({
      data: {
        userId,
        type,
        title: type === 'material' ? 'Study material' : 'Marketplace',
        body: message.trim(),
      },
    });
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    if (!result.count) throw new NotFoundException('Notification not found.');
    return { success: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }

  async notifyActivity(userId: string, eventType: string, payload?: Record<string, string | number | boolean>) {
    const details: Record<string, { title: string; body: string }> = {
      student_completed_material: {
        title: 'Study progress',
        body: 'You completed a study material. Keep up the great work!',
      },
      student_completed_quiz: {
        title: 'Quiz completed',
        body: `You completed a quiz${typeof payload?.score === 'number' ? ` with a score of ${payload.score}%` : ''}.`,
      },
    };
    const content = details[eventType];
    if (!content) return;
    await this.safeCreate(userId, content.title, content.body, 'activity');
  }

  async notifyChatMessage(roomId: string, senderId: string, senderName: string, text: string) {
    try {
      const recipients = await this.prisma.chatRoomMember.findMany({
        where: { roomId, userId: { not: senderId } },
        select: { userId: true },
      });
      const preview = text.trim().slice(0, 100) || 'Sent an attachment';
      await Promise.all(recipients.map(({ userId }) =>
        this.safeCreate(userId, `New message from ${senderName}`, preview, 'chat'),
      ));
    } catch (error) {
      this.logger.warn(`Could not create chat notifications: ${(error as Error).message}`);
    }
  }

  async notifyAiReply(userId: string) {
    await this.safeCreate(userId, 'AI tutor replied', 'Your AI tutor has responded to your question.', 'ai_reply');
  }

  // Send one reminder at 6pm Nigeria time when today's plan still has unfinished tasks.
  @Cron('0 18 * * *', { timeZone: 'Africa/Lagos' })
  async remindAboutIncompletePlans() {
    const now = new Date();
    const nigeriaNow = new Date(now.getTime() + 60 * 60 * 1000);
    nigeriaNow.setUTCHours(0, 0, 0, 0);
    const nigeriaDayStartUtc = new Date(nigeriaNow.getTime() - 60 * 60 * 1000);

    const plans = await this.prisma.studyPlan.findMany({
      where: { active: true },
      select: { id: true, userId: true, subject: true, startDate: true, daysAvailable: true, entries: true, completedTasks: true },
    });

    for (const plan of plans) {
      const day = getPlanDayNumber(plan.startDate, now);
      if (day < 1 || day > plan.daysAvailable) continue;
      const entry = Array.isArray(plan.entries)
        ? (plan.entries as Array<{ day?: number; tasks?: unknown[] }>).find((item) => item.day === day)
        : undefined;
      const tasks = Array.isArray(entry?.tasks) ? entry.tasks : [];
      if (!tasks.length) continue;
      const done = (plan.completedTasks as Record<string, unknown> | null)?.[String(day)];
      const completed = Array.isArray(done) ? new Set(done.filter(Number.isInteger)) : new Set<number>();
      if (completed.size >= tasks.length) continue;

      try {
        const alreadySent = await this.prisma.notification.findFirst({
          where: { userId: plan.userId, type: 'study_plan_reminder', createdAt: { gte: nigeriaDayStartUtc } },
          select: { id: true },
        });
        if (alreadySent) continue;
        await this.prisma.notification.create({
          data: {
            userId: plan.userId,
            title: 'Study plan reminder',
            body: `You still have tasks to complete in today's ${plan.subject} study plan.`,
            type: 'study_plan_reminder',
          },
        });
      } catch (error) {
        this.logger.warn(`Could not create study-plan reminder for ${plan.id}: ${(error as Error).message}`);
      }
    }
  }

  private async safeCreate(userId: string, title: string, body: string, type: string) {
    try {
      await this.prisma.notification.create({ data: { userId, title, body, type } });
    } catch (error) {
      this.logger.warn(`Could not create ${type} notification: ${(error as Error).message}`);
    }
  }
}
