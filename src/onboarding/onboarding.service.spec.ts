import { BadRequestException, ConflictException } from '@nestjs/common';
import { isValidFeatureKey, MAX_SEEN_KEYS, OnboardingService } from './onboarding.service';

describe('isValidFeatureKey', () => {
  it('accepts feature and tour keys', () => {
    for (const key of ['feature:classroom', 'tour:v2', 'a1', 'whats-new_2026-11']) expect(isValidFeatureKey(key)).toBe(true);
  });
  it('rejects anything else', () => {
    for (const key of ['', 'a', 'Feature:Classroom', ':x', '-x', 'has space', 'x'.repeat(65), 'a/b', 'a;drop', '../x', null, undefined, 5, {}]) expect(isValidFeatureKey(key)).toBe(false);
  });
  it('accepts the longest allowed key', () => expect(isValidFeatureKey('k'.repeat(64))).toBe(true));
});

describe('OnboardingService', () => {
  let service: OnboardingService;
  let db: any;
  beforeEach(() => {
    db = { userFeatureSeen: { findMany: jest.fn(), findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), upsert: jest.fn() } };
    service = new OnboardingService(db);
  });

  it("lists only the signed-in user's keys", async () => {
    db.userFeatureSeen.findMany.mockResolvedValue([{ key: 'tour:v2' }, { key: 'feature:classroom' }]);
    expect(await service.listSeen('u1')).toEqual({ keys: ['tour:v2', 'feature:classroom'] });
    expect(db.userFeatureSeen.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1' });
  });

  it('records a new key for that user', async () => {
    await service.markSeen('u1', 'feature:classroom');
    expect(db.userFeatureSeen.upsert.mock.calls[0][0]).toMatchObject({ where: { userId_key: { userId: 'u1', key: 'feature:classroom' } }, create: { userId: 'u1', key: 'feature:classroom' } });
  });

  it('is idempotent: a key already seen is not written or counted again', async () => {
    db.userFeatureSeen.findUnique.mockResolvedValue({ key: 'tour:v2' });
    await service.markSeen('u1', 'tour:v2');
    expect(db.userFeatureSeen.upsert).not.toHaveBeenCalled();
    expect(db.userFeatureSeen.count).not.toHaveBeenCalled();
  });

  it('rejects an invalid key before touching the database', async () => {
    await expect(service.markSeen('u1', 'Bad Key')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.userFeatureSeen.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a new key once the user has 200', async () => {
    db.userFeatureSeen.count.mockResolvedValue(MAX_SEEN_KEYS);
    await expect(service.markSeen('u1', 'feature:new')).rejects.toBeInstanceOf(ConflictException);
    expect(db.userFeatureSeen.upsert).not.toHaveBeenCalled();
  });

  it('still lets a user at the cap see a key they already have', async () => {
    db.userFeatureSeen.count.mockResolvedValue(MAX_SEEN_KEYS);
    db.userFeatureSeen.findUnique.mockResolvedValue({ key: 'tour:v2' });
    await expect(service.markSeen('u1', 'tour:v2')).resolves.toBeUndefined();
  });
});
