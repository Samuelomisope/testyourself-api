import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_SEEN_KEYS = 200;
const FEATURE_KEY = /^[a-z0-9][a-z0-9:_-]{1,63}$/;

/** Keys name a feature or tour, such as "feature:classroom" or "tour:v2". Nothing else is accepted. */
export const isValidFeatureKey = (key: unknown): key is string => typeof key === 'string' && FEATURE_KEY.test(key);

@Injectable()
export class OnboardingService {
  constructor(private readonly db: PrismaService) {}

  /** The signed-in user's own seen keys; never another user's. */
  async listSeen(userId: string) {
    const rows = await this.db.userFeatureSeen.findMany({ where: { userId }, orderBy: { seenAt: 'asc' }, take: MAX_SEEN_KEYS, select: { key: true } });
    return { keys: rows.map((row) => row.key) };
  }

  /** Records that the user has seen or dismissed a feature. Repeating it changes nothing. */
  async markSeen(userId: string, key: string) {
    if (!isValidFeatureKey(key)) throw new BadRequestException('That is not a valid feature key.');
    const existing = await this.db.userFeatureSeen.findUnique({ where: { userId_key: { userId, key } }, select: { key: true } });
    if (existing) return;
    if ((await this.db.userFeatureSeen.count({ where: { userId } })) >= MAX_SEEN_KEYS) throw new ConflictException('Too many items are already recorded.');
    await this.db.userFeatureSeen.upsert({ where: { userId_key: { userId, key } }, create: { userId, key }, update: {} });
  }
}
