// study-plan-coach.service.ts
//
// Server computes the facts (behind/on track, which day to catch up on, etc.),
// the model only turns those facts into a short human message.
// Falls back to a deterministic message if the AI call fails or times out.
//
// STILL TO CHECK in your codebase:
//  - PrismaService import path
//  - Make getCurrentStudyPlan use getPlanDayNumber from ./study-plan.utils too
//  - Swap the direct Anthropic call for your existing AI provider in AiService if you prefer

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { StudyPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getPlanDayNumber } from './study-plan.utils';

type Entry = { day: number; focus?: string; tasks?: string[] };

export interface CoachSignals {
  subject: string;
  status: 'complete' | 'behind' | 'on_track';
  dayNumber: number;
  daysAvailable: number;
  daysLeftInPlan: number;
  hoursPerDay: number | null;
  totalTasks: number;
  completedTasks: number;
  remainingTasks: number;
  missedTasks: number; // unfinished tasks from days BEFORE today
  catchUp: { day: number; focus: string; missed: number } | null; // earliest day to fix
  todayRemaining: number;
  todayFocus: string | null;
  daysToExam: number | null;
}

const MODEL = 'claude-haiku-4-5-20251001'; // cheap + fast, plenty for 1–2 sentences
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class StudyPlanCoachService {
  private readonly logger = new Logger(StudyPlanCoachService.name);
  private readonly client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // key = hash of signals, so a new message is generated only when something changed
  private readonly cache = new Map<string, { message: string; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async getCoachMessage(userId: string, planId: string) {
    const plan = await this.prisma.studyPlan.findFirst({ where: { id: planId, userId } });
    if (!plan) throw new NotFoundException('Study plan not found');

    const signals = this.computeSignals(plan);
    const key = createHash('sha1').update(JSON.stringify(signals)).digest('hex');

    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { message: hit.message, source: 'ai' as const, signals };
    }

    try {
      const message = await this.generate(signals);
      this.cache.set(key, { message, at: Date.now() });
      this.prune();
      return { message, source: 'ai' as const, signals };
    } catch (err) {
      this.logger.warn(`Coach AI failed, using fallback: ${(err as Error).message}`);
      return { message: this.fallback(signals), source: 'fallback' as const, signals };
    }
  }

  /* ---------- facts ---------- */

  private computeSignals(plan: StudyPlan): CoachSignals {
    const entries: Entry[] = Array.isArray(plan.entries)
      ? (plan.entries as unknown as Entry[])
      : [];
    const done = (plan.completedTasks ?? {}) as unknown as Record<string, number[]>;
    const isDone = (day: number, i: number) => (done[String(day)] ?? []).includes(i);

    const dayNumber = getPlanDayNumber(plan.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // only used for the exam countdown below

    let totalTasks = 0;
    let completedTasks = 0;
    let missedTasks = 0;
    let todayRemaining = 0;
    let todayFocus: string | null = null;
    let catchUp: CoachSignals['catchUp'] = null;

    for (const e of entries) {
      const tasks = e.tasks ?? [];
      const doneCount = tasks.filter((_, i) => isDone(e.day, i)).length;
      totalTasks += tasks.length;
      completedTasks += doneCount;

      if (e.day < dayNumber) {
        const missed = tasks.length - doneCount;
        missedTasks += missed;
        if (missed > 0 && !catchUp) {
          catchUp = { day: e.day, focus: (e.focus ?? '').slice(0, 120), missed };
        }
      } else if (e.day === dayNumber) {
        todayRemaining = tasks.length - doneCount;
        todayFocus = (e.focus ?? '').slice(0, 120) || null;
      }
    }

    let daysToExam: number | null = null;
    if (plan.examDate) {
      const exam = new Date(plan.examDate);
      exam.setHours(0, 0, 0, 0);
      daysToExam = Math.max(0, Math.round((exam.getTime() - today.getTime()) / 86400000));
    }

    const remainingTasks = Math.max(totalTasks - completedTasks, 0);
    const status: CoachSignals['status'] =
      totalTasks > 0 && remainingTasks === 0 ? 'complete' : missedTasks > 0 ? 'behind' : 'on_track';

    return {
      subject: String(plan.subject ?? 'your course').slice(0, 80),
      status,
      dayNumber,
      daysAvailable: plan.daysAvailable,
      daysLeftInPlan: Math.max(plan.daysAvailable - dayNumber, 0),
      hoursPerDay: plan.hoursPerDay,
      totalTasks,
      completedTasks,
      remainingTasks,
      missedTasks,
      catchUp,
      todayRemaining,
      todayFocus,
      daysToExam,
    };
  }

  /* ---------- AI ---------- */

  private async generate(signals: CoachSignals): Promise<string> {
    const res = await this.client.messages.create(
      {
        model: MODEL,
        max_tokens: 120,
        system:
          'You are a concise, encouraging study coach inside a student app. ' +
          'Write 1-2 sentences (max 40 words) of advice using ONLY the facts in the JSON. ' +
          'If the student is behind, name how many tasks and which day/topic to catch up on first. ' +
          'If on track, say what to do today. If complete, congratulate briefly. ' +
          'Never invent numbers, dates or topics. No emojis, no greeting, no markdown. Plain text only.',
        messages: [{ role: 'user', content: JSON.stringify(signals) }],
      },
      { timeout: 8000 },
    );

    const text = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    if (!text) throw new Error('Empty AI response');
    return text.slice(0, 280);
  }

  /* ---------- deterministic fallback ---------- */

  private fallback(s: CoachSignals): string {
    if (s.status === 'complete') {
      return 'Your plan is complete. Create a new roadmap for your next academic goal.';
    }
    if (s.status === 'behind' && s.catchUp) {
      const n = s.missedTasks;
      return `You're ${n} task${n === 1 ? '' : 's'} behind schedule. Catch up on Day ${s.catchUp.day} first${
        s.catchUp.focus ? ` (${s.catchUp.focus})` : ''
      }.`;
    }
    if (s.todayRemaining > 0) {
      return `You're on track. Finish today's ${s.todayRemaining} remaining task${
        s.todayRemaining === 1 ? '' : 's'
      } to keep your momentum.`;
    }
    return "You're on track. Today's tasks are done, so rest up for tomorrow.";
  }

  private prune() {
    if (this.cache.size < 500) return;
    const cutoff = Date.now() - CACHE_TTL_MS;
    for (const [k, v] of this.cache) if (v.at < cutoff) this.cache.delete(k);
  }
}

/* ------------------------------------------------------------------
   Wire-up in ai.controller.ts (matches your existing style)

   import { StudyPlanCoachService } from './study-plan-coach.service';

   constructor(
     private readonly aiService: AiService,
     private readonly coachService: StudyPlanCoachService,
   ) {}

   // put next to the other study-plan routes
   @Get('study-plan/:id/coach')
   @Throttle({ default: { limit: 10, ttl: 60_000 } })
   async getStudyPlanCoach(@Param('id') id: string, @CurrentUser() user: AuthUser) {
     const planId = validateMaterialId(id); // same UUID check you use in toggleTask
     if (!planId) throw new BadRequestException('Invalid plan ID.');
     return this.coachService.getCoachMessage(user.sub, planId);
   }

   And in ai.module.ts add StudyPlanCoachService to `providers`
   (PrismaService must already be available there, since AiService uses it).
------------------------------------------------------------------- */