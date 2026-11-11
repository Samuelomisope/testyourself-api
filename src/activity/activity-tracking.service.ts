import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// Allowed payload keys per event. Anything else is rejected, which is what
// keeps incidental personal data out.
const PAYLOAD_KEYS: Record<string, string[]> = {
  student_viewed_material: [],
  student_started_material: [],
  student_completed_material: ['duration_seconds'],
  student_started_quiz: ['count', 'difficulty'],
  student_answered_question: ['correct', 'duration_seconds'],
  student_completed_quiz: ['score', 'attempts', 'duration_seconds'],
  // server-only (AI usage)
  student_requested_explanation: ['level'],
  student_generated_questions: ['count', 'difficulty'],
  student_generated_flashcards: ['count'],
};
const SERVER_ONLY = new Set([
  'student_requested_explanation',
  'student_generated_questions',
  'student_generated_flashcards',
]);

export interface EventInput {
  eventType: string;
  idempotencyKey?: string;
  courseId?: string;
  topicId?: string;
  materialId?: string;
  payload?: Record<string, string | number | boolean>;
}

@Injectable()
export class ActivityTrackingService {
  private readonly logger = new Logger(ActivityTrackingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private validate(e: EventInput, fromClient: boolean) {
    if (!e || typeof e !== 'object' || typeof e.eventType !== 'string' || e.eventType.length > 80) {
      throw new BadRequestException('Invalid activity event.');
    }
    const allowed = PAYLOAD_KEYS[e.eventType];
    if (!allowed) throw new BadRequestException(`Unknown event type: ${e.eventType}`);
    if (fromClient && SERVER_ONLY.has(e.eventType)) {
      throw new BadRequestException(`Event not accepted from client: ${e.eventType}`);
    }
    for (const id of [e.idempotencyKey, e.courseId, e.topicId, e.materialId]) {
      if (id !== undefined && (typeof id !== 'string' || id.length > 128)) {
        throw new BadRequestException('Invalid activity identifier.');
      }
    }
    if (e.payload !== undefined && (!e.payload || typeof e.payload !== 'object' || Array.isArray(e.payload) || Object.keys(e.payload).length > 5)) {
      throw new BadRequestException('Invalid event payload.');
    }
    for (const [k, v] of Object.entries(e.payload ?? {})) {
      if (!allowed.includes(k)) throw new BadRequestException(`Unexpected payload field: ${k}`);
      if (!['string', 'boolean'].includes(typeof v) && !(typeof v === 'number' && Number.isFinite(v))) {
        throw new BadRequestException(`Invalid payload value for ${k}`);
      }
      if (String(v).length > 50) {
        throw new BadRequestException(`Invalid payload value for ${k}`);
      }
    }
  }

  // Client batch ingestion (POST /activity/events)
  async ingest(studentId: string, events: EventInput[]) {
    if (!Array.isArray(events) || events.length === 0 || events.length > 50) {
      throw new BadRequestException('Send between 1 and 50 events.');
    }
    events.forEach((e) => {
      if (!e || typeof e !== 'object') throw new BadRequestException('Invalid activity event.');
      if (!e.idempotencyKey) throw new BadRequestException('idempotencyKey is required.');
      this.validate(e, true);
    });
    const previous = await this.prisma.studentActivityEvent.findMany({
      where: { studentId, idempotencyKey: { in: events.map((event) => event.idempotencyKey!) } },
      select: { idempotencyKey: true },
    });
    const previouslyAccepted = new Set(previous.map((event) => event.idempotencyKey));
    const result = await this.prisma.studentActivityEvent.createMany({
      data: events.map((e) => this.toRow(studentId, e)),
      skipDuplicates: true,
    });
    if (result.count > 0) {
      const notifiedKeys = new Set<string>();
      const newEvents = events.filter((event) => {
        if (previouslyAccepted.has(event.idempotencyKey!) || notifiedKeys.has(event.idempotencyKey!)) return false;
        notifiedKeys.add(event.idempotencyKey!);
        return true;
      });
      await Promise.all(newEvents.map((event) =>
        this.notifications.notifyActivity(studentId, event.eventType, event.payload),
      ));
    }
    return { accepted: result.count };
  }

  // Internal use by other services. Never throws: tracking must not break features.
  async record(studentId: string, e: EventInput) {
    try {
      this.validate(e, false);
      await this.prisma.studentActivityEvent.createMany({
        data: [this.toRow(studentId, { ...e, idempotencyKey: e.idempotencyKey ?? randomUUID() })],
        skipDuplicates: true,
      });
    } catch (err) {
      this.logger.warn(`Failed to record ${e.eventType}: ${(err as Error).message}`);
    }
  }

  private toRow(studentId: string, e: EventInput) {
    return {
      studentId,
      eventType: e.eventType,
      courseId: e.courseId ?? null,
      topicId: e.topicId ?? null,
      materialId: e.materialId ?? null,
      payload: e.payload && Object.keys(e.payload).length ? e.payload : undefined,
      idempotencyKey: e.idempotencyKey!,
    };
  }
}
