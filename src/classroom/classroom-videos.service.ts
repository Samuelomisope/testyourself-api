import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

// Lesson videos: real YouTube matches for a lesson step, never links written by the tutor.
// Results are cached per topic and step and shared by every student, so only a cache miss spends YouTube quota.
const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const CACHE_VIDEOS = 5;
const MIN_SECONDS = 180;
const MAX_SECONDS = 2400;
const FETCH_TIMEOUT_MS = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 30 * DAY_MS;
const EMPTY_TTL_MS = DAY_MS;

export type LessonVideo = { videoId: string; title: string; channel: string; durationSeconds: number };
export type VideoReason = 'NOT_CONFIGURED' | 'LIMIT_REACHED' | 'BUSY' | 'NONE';
export type VideoResult = {
  videos: LessonVideo[];
  tier: 'FREE' | 'PREMIUM';
  perStep: number;
  lookupsRemaining: number | null;
  reason: VideoReason | null;
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function positiveInt(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Reads an ISO 8601 duration such as PT1H4M9S as seconds. */
export function parseIsoDuration(value: unknown): number {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(typeof value === 'string' ? value : '');
  if (!match) return 0;
  const [, d, h, m, s] = match.map((part) => Number(part || 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}

@Injectable()
export class ClassroomVideosService {
  private readonly logger = new Logger(ClassroomVideosService.name);
  constructor(private readonly db: PrismaService) {}

  async suggest(userId: string, sessionId: string, step?: number): Promise<VideoResult> {
    const session = await this.db.classroomSession.findFirst({ where: { id: sessionId, userId }, select: { topic: true, outline: true } });
    if (!session) throw new NotFoundException('Classroom session not found.');
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { isPremium: true, premiumUntil: true } });
    if (!user) throw new NotFoundException('User not found.');
    const premium = !!user.isPremium && (!user.premiumUntil || user.premiumUntil > new Date());
    const tier = premium ? 'PREMIUM' : 'FREE';
    const perStep = premium ? positiveInt('CLASSROOM_PREMIUM_VIDEOS_PER_STEP', 5) : positiveInt('CLASSROOM_FREE_VIDEOS_PER_STEP', 1);
    const dailyLookups = premium ? positiveInt('CLASSROOM_PREMIUM_DAILY_VIDEO_LOOKUPS', 60) : positiveInt('CLASSROOM_FREE_DAILY_VIDEO_LOOKUPS', 3);
    const result = (videos: LessonVideo[], reason: VideoReason | null, used: number): VideoResult => ({
      videos, tier, perStep, lookupsRemaining: Math.max(dailyLookups - used, 0), reason: videos.length ? null : reason,
    });

    if (!process.env.YOUTUBE_API_KEY) return result([], 'NOT_CONFIGURED', 0);

    const query = this.buildQuery(session.topic, session.outline, step);
    const queryKey = createHash('sha256').update(query.toLowerCase()).digest('hex');

    // Opening the suggestions counts as one lookup for the day, whether it is served from the cache or from YouTube.
    const used = await this.consumeLookup(userId, dailyLookups);
    if (used === null) return result([], 'LIMIT_REACHED', dailyLookups);

    const cached = await this.db.classroomVideoSuggestion.findUnique({ where: { queryKey } });
    const ttl = cached && Array.isArray(cached.videos) && cached.videos.length ? CACHE_TTL_MS : EMPTY_TTL_MS;
    if (cached && Date.now() - cached.fetchedAt.getTime() < ttl) return result(this.visible(cached.videos, cached.hiddenIds, perStep), 'NONE', used);

    if (!(await this.searchAllowed())) {
      // Out of search quota for today: an expired entry is still better than nothing.
      return result(cached ? this.visible(cached.videos, cached.hiddenIds, perStep) : [], 'BUSY', used);
    }
    const fetched = await this.fetchFromYouTube(query);
    if (fetched === null) {
      await this.refundLookup(userId);
      return result(cached ? this.visible(cached.videos, cached.hiddenIds, perStep) : [], 'BUSY', Math.max(used - 1, 0));
    }
    const hidden = cached?.hiddenIds ?? [];
    await this.db.classroomVideoSuggestion.upsert({
      where: { queryKey },
      create: { queryKey, query: query.slice(0, 300), videos: fetched as any, hiddenIds: [] },
      update: { videos: fetched as any, fetchedAt: new Date() },
    });
    return result(this.visible(fetched, hidden, perStep), 'NONE', used);
  }

  /** Hides one video from the shared list when a student says it did not help. */
  async report(userId: string, sessionId: string, videoId: string, step?: number) {
    if (!VIDEO_ID.test(videoId)) return { ok: true };
    const session = await this.db.classroomSession.findFirst({ where: { id: sessionId, userId }, select: { topic: true, outline: true } });
    if (!session) throw new NotFoundException('Classroom session not found.');
    const queryKey = createHash('sha256').update(this.buildQuery(session.topic, session.outline, step).toLowerCase()).digest('hex');
    const row = await this.db.classroomVideoSuggestion.findUnique({ where: { queryKey }, select: { hiddenIds: true, videos: true } });
    const listed = Array.isArray(row?.videos) && (row!.videos as any[]).some((video) => video?.videoId === videoId);
    if (row && listed && !row.hiddenIds.includes(videoId)) {
      await this.db.classroomVideoSuggestion.update({ where: { queryKey }, data: { hiddenIds: [...row.hiddenIds, videoId].slice(-50) } });
    }
    return { ok: true };
  }

  private buildQuery(topic: string, outline: unknown, step?: number) {
    const steps = Array.isArray(outline) ? outline : [];
    const title = Number.isInteger(step) && step! >= 0 && step! < steps.length && typeof (steps[step!] as any)?.title === 'string' ? ((steps[step!] as any).title as string) : '';
    return `${topic.trim()} ${title.trim()} explained lecture`.replace(/\s+/g, ' ').slice(0, 200);
  }

  private visible(videos: unknown, hidden: string[], limit: number): LessonVideo[] {
    if (!Array.isArray(videos)) return [];
    return (videos as any[])
      .filter((video) => video && VIDEO_ID.test(String(video.videoId)) && !hidden.includes(video.videoId))
      .slice(0, limit)
      .map((video) => ({ videoId: video.videoId, title: String(video.title ?? '').slice(0, 160), channel: String(video.channel ?? '').slice(0, 80), durationSeconds: Number(video.durationSeconds) || 0 }));
  }

  /** Counts one lookup for today; returns the new count, or null when the daily limit is already used. */
  private async consumeLookup(userId: string, limit: number): Promise<number | null> {
    if (limit < 1) return null;
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const rows = await this.db.$queryRaw<Array<{ videoLookupsUsed: number }>>`INSERT INTO "ClassroomUsage" ("id", "userId", "usageDate", "turnsUsed", "uploadBytesUsed", "videoLookupsUsed", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${userId}, ${day}, 0, 0, 1, NOW(), NOW()) ON CONFLICT ("userId", "usageDate") DO UPDATE SET "videoLookupsUsed" = "ClassroomUsage"."videoLookupsUsed" + 1, "updatedAt" = NOW() WHERE "ClassroomUsage"."videoLookupsUsed" < ${limit} RETURNING "videoLookupsUsed"`;
    return rows.length ? Number(rows[0].videoLookupsUsed) : null;
  }

  private async refundLookup(userId: string) {
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await this.db.$queryRaw`UPDATE "ClassroomUsage" SET "videoLookupsUsed" = GREATEST("videoLookupsUsed" - 1, 0), "updatedAt" = NOW() WHERE "userId" = ${userId} AND "usageDate" = ${day} RETURNING "id"`;
  }

  /** Each cached row was one YouTube search, so today's rows show how much of the daily search allowance is gone. */
  private async searchAllowed() {
    const cap = positiveInt('YOUTUBE_DAILY_SEARCH_LIMIT', 80);
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return (await this.db.classroomVideoSuggestion.count({ where: { fetchedAt: { gte: since } } })) < cap;
  }

  /** Returns the best embeddable matches, an empty list when nothing fits, or null when YouTube could not be reached. */
  private async fetchFromYouTube(query: string): Promise<LessonVideo[] | null> {
    const key = process.env.YOUTUBE_API_KEY!;
    try {
      const search = new URL(SEARCH_URL);
      search.search = new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true', safeSearch: 'strict', relevanceLanguage: 'en', maxResults: '15', q: query, key }).toString();
      const found = await this.getJson(search);
      const ids: string[] = (found?.items ?? []).map((item: any) => item?.id?.videoId).filter((id: unknown) => typeof id === 'string' && VIDEO_ID.test(id));
      if (!ids.length) return [];
      const details = new URL(VIDEOS_URL);
      details.search = new URLSearchParams({ part: 'contentDetails,status,snippet', id: ids.join(','), key }).toString();
      const info = await this.getJson(details);
      const byId = new Map<string, any>((info?.items ?? []).map((item: any) => [item.id, item]));
      const out: LessonVideo[] = [];
      for (const id of ids) {
        const item = byId.get(id);
        const seconds = parseIsoDuration(item?.contentDetails?.duration);
        if (!item || !item.status?.embeddable || item.status.privacyStatus !== 'public' || item.status.uploadStatus !== 'processed') continue;
        if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) continue;
        out.push({ videoId: id, title: String(item.snippet?.title ?? '').slice(0, 160), channel: String(item.snippet?.channelTitle ?? '').slice(0, 80), durationSeconds: seconds });
        if (out.length >= CACHE_VIDEOS) break;
      }
      return out;
    } catch (error) {
      // Never log the request URL: it carries the API key.
      this.logger.warn(`YouTube lookup failed (${error instanceof Error ? error.message : 'unknown'}).`);
      return null;
    }
  }

  private async getJson(url: URL): Promise<any> {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}
