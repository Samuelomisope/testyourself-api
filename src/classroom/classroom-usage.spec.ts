import { ClassroomService } from './classroom.service';

jest.mock('../classification/services/text-extraction.service', () => ({ TextExtractionService: class TextExtractionService {} }));

const ENV = {
  CLASSROOM_FREE_DAILY_TURNS: '10', CLASSROOM_FREE_DAILY_UPLOAD_BYTES: '20971520', CLASSROOM_FREE_MAX_DOCUMENTS_PER_SESSION: '2',
  CLASSROOM_PREMIUM_DAILY_TURNS: '50', CLASSROOM_PREMIUM_DAILY_UPLOAD_BYTES: '104857600', CLASSROOM_PREMIUM_MAX_DOCUMENTS_PER_SESSION: '5',
};

describe('ClassroomService.usage', () => {
  const saved = { ...process.env };
  beforeEach(() => { Object.assign(process.env, ENV); });
  afterEach(() => { process.env = { ...saved }; });

  function build(user: any, row?: { turnsUsed: number; uploadBytesUsed: bigint }) {
    const db: any = { user: { findUnique: jest.fn().mockResolvedValue(user) }, $queryRaw: jest.fn().mockResolvedValue(row ? [row] : []) };
    return new ClassroomService(db, {} as any, {} as any, {} as any);
  }

  it('reports exact free-tier numbers and the next UTC midnight as the reset', async () => {
    const u = await build({ isPremium: false, premiumUntil: null }, { turnsUsed: 6, uploadBytesUsed: BigInt(1_000_000) }).usage('u1');
    expect(u.tier).toBe('FREE');
    expect(u.turns).toEqual({ used: 6, limit: 10, remaining: 4 });
    expect(u.uploads).toEqual({ usedBytes: 1_000_000, limitBytes: 20_971_520, remainingBytes: 19_971_520 });
    expect(u.documentsPerSession).toBe(2);
    const reset = new Date(u.resetsAt);
    expect(reset.getUTCHours()).toBe(0);
    expect(reset.getTime()).toBeGreaterThan(Date.now());
    expect(reset.getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it('shows zero used when the person has not used Classroom today', async () => {
    const u = await build({ isPremium: false, premiumUntil: null }).usage('u1');
    expect(u.turns).toEqual({ used: 0, limit: 10, remaining: 10 });
  });

  it('uses the premium limits while premium is active, and the free limits once it has expired', async () => {
    const active = await build({ isPremium: true, premiumUntil: new Date(Date.now() + 86_400_000) }, { turnsUsed: 12, uploadBytesUsed: BigInt(0) }).usage('u1');
    expect(active.tier).toBe('PREMIUM');
    expect(active.turns).toEqual({ used: 12, limit: 50, remaining: 38 });
    const expired = await build({ isPremium: true, premiumUntil: new Date(Date.now() - 1000) }, { turnsUsed: 12, uploadBytesUsed: BigInt(0) }).usage('u1');
    expect(expired.tier).toBe('FREE');
    expect(expired.turns).toEqual({ used: 10, limit: 10, remaining: 0 }); // never reports more used than allowed
  });
});
