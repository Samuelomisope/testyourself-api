import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ClassroomSessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { hasPremiumAccess, PREMIUM_SELECT } from '../../common/premium-access';
import { TTS_PROVIDER } from './tts-provider';
import type { SpeechResult, TtsProvider, TutorVoice } from './tts-provider';

const DEFAULT_MAX_CHUNK = 200;

/** Turns short pieces of a tutor reply into audio for the 3D tutor. Premium only, capped per day, charged by character. */
@Injectable()
export class ClassroomSpeechService {
  private readonly logger = new Logger(ClassroomSpeechService.name);
  constructor(private readonly db: PrismaService, @Inject(TTS_PROVIDER) private readonly provider: TtsProvider) {}

  /** Longest piece accepted in one call. The app splits replies into sentences below this. */
  maxChunkChars(): number {
    const n = Number(process.env.CLASSROOM_SPEECH_MAX_CHUNK_CHARS);
    return Number.isSafeInteger(n) && n >= 50 && n <= 1000 ? n : DEFAULT_MAX_CHUNK;
  }

  /** The daily allowance in characters, or 0 when server voice is not switched on. */
  dailyLimit(): number {
    const n = Number(process.env.CLASSROOM_PREMIUM_DAILY_SPEECH_CHARS);
    return Number.isSafeInteger(n) && n >= 1 ? n : 0;
  }

  private todayUtc() { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }

  async synthesize(userId: string, sessionId: string, rawText: string, voice: TutorVoice): Promise<SpeechResult> {
    const text = rawText.replace(/\s+/g, ' ').trim();
    if (!text) throw new HttpException('There is nothing to read aloud.', HttpStatus.BAD_REQUEST);
    if (text.length > this.maxChunkChars()) throw new HttpException(`Send at most ${this.maxChunkChars()} characters at a time.`, HttpStatus.BAD_REQUEST);

    const limit = this.dailyLimit();
    if (!limit || !this.provider.isConfigured()) throw new ServiceUnavailableException('Server voice is not available.');

    const user = await this.db.user.findUnique({ where: { id: userId }, select: PREMIUM_SELECT });
    if (!user) throw new NotFoundException('User not found.');
    if (!hasPremiumAccess(user)) throw new ForbiddenException('The voice tutor is part of Premium.');

    const session = await this.db.classroomSession.findFirst({
      where: { id: sessionId, userId, status: { notIn: [ClassroomSessionStatus.DELETING, ClassroomSessionStatus.DELETE_FAILED] } },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Lesson not found.');

    const day = this.todayUtc();
    const reserved = await this.db.$queryRaw<Array<{ id: string }>>`INSERT INTO "ClassroomUsage" ("id", "userId", "usageDate", "turnsUsed", "uploadBytesUsed", "speechCharsUsed", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${userId}, ${day}, 0, 0, ${text.length}, NOW(), NOW()) ON CONFLICT ("userId", "usageDate") DO UPDATE SET "speechCharsUsed" = "ClassroomUsage"."speechCharsUsed" + ${text.length}, "updatedAt" = NOW() WHERE "ClassroomUsage"."speechCharsUsed" + ${text.length} <= ${limit} RETURNING "id"`;
    if (!reserved.length) throw new HttpException('Your voice allowance for today is used up. The browser voice can keep reading.', HttpStatus.TOO_MANY_REQUESTS);

    try {
      return await this.provider.synthesize(text, voice);
    } catch (error) {
      await this.db.$queryRaw`UPDATE "ClassroomUsage" SET "speechCharsUsed" = GREATEST("speechCharsUsed" - ${text.length}, 0), "updatedAt" = NOW() WHERE "userId" = ${userId} AND "usageDate" = ${day} RETURNING "id"`.catch(() => undefined);
      this.logger.warn(`Speech failed (${this.provider.name}): ${(error as Error).message}`);
      throw new HttpException('The voice could not be created. Try again.', HttpStatus.BAD_GATEWAY);
    }
  }
}
