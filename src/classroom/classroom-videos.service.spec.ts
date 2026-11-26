import { NotFoundException } from '@nestjs/common';
import { ClassroomVideosService, parseIsoDuration } from './classroom-videos.service';

const id = (n: number) => `video${String(n).padStart(6, '0')}`; // 11 chars
const detail = (n: number, over: any = {}) => ({
  id: id(n),
  contentDetails: { duration: 'PT10M' },
  status: { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' },
  snippet: { title: `Title ${n}`, channelTitle: 'Channel' },
  ...over,
});

describe('ClassroomVideosService', () => {
  let service: ClassroomVideosService;
  let db: any;
  let fetchMock: jest.Mock;
  const env = { ...process.env };
  const originalFetch = global.fetch;

  const youtube = (items: any[]) => {
    fetchMock.mockImplementation(async (url: URL) => {
      const text = String(url);
      if (text.includes('/search')) return { ok: true, json: async () => ({ items: items.map((item) => ({ id: { videoId: item.id } })) }) };
      return { ok: true, json: async () => ({ items }) };
    });
  };

  beforeEach(() => {
    db = {
      classroomSession: { findFirst: jest.fn().mockResolvedValue({ topic: 'Thermodynamics', outline: [{ title: 'First law' }, { title: 'Entropy' }] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ isPremium: false, premiumUntil: null }) },
      classroomVideoSuggestion: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([{ videoLookupsUsed: 1 }]),
    };
    service = new ClassroomVideosService(db);
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    process.env.YOUTUBE_API_KEY = 'test-key';
    delete process.env.CLASSROOM_FREE_VIDEOS_PER_STEP;
    delete process.env.CLASSROOM_PREMIUM_VIDEOS_PER_STEP;
    delete process.env.CLASSROOM_FREE_DAILY_VIDEO_LOOKUPS;
    delete process.env.YOUTUBE_DAILY_SEARCH_LIMIT;
  });
  afterEach(() => { process.env = { ...env }; (global as any).fetch = originalFetch; });

  it('parses ISO durations', () => {
    expect(parseIsoDuration('PT1H4M9S')).toBe(3849);
    expect(parseIsoDuration('PT45S')).toBe(45);
    expect(parseIsoDuration('garbage')).toBe(0);
  });

  it('does nothing without an API key', async () => {
    delete process.env.YOUTUBE_API_KEY;
    const out = await service.suggest('u1', 's1', 0);
    expect(out).toMatchObject({ videos: [], reason: 'NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a session the user does not own', async () => {
    db.classroomSession.findFirst.mockResolvedValue(null);
    await expect(service.suggest('u1', 's1', 0)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives a free student one video and caches five', async () => {
    youtube([1, 2, 3, 4, 5, 6].map((n) => detail(n)));
    const out = await service.suggest('u1', 's1', 1);
    expect(out.tier).toBe('FREE');
    expect(out.videos).toHaveLength(1);
    expect(out.videos[0].videoId).toBe(id(1));
    expect(db.classroomVideoSuggestion.upsert.mock.calls[0][0].create.videos).toHaveLength(5);
    expect(String(fetchMock.mock.calls[0][0])).toContain('Entropy');
  });

  it('gives a premium student five videos', async () => {
    db.user.findUnique.mockResolvedValue({ isPremium: true, premiumUntil: new Date(Date.now() + 86_400_000) });
    youtube([1, 2, 3, 4, 5, 6].map((n) => detail(n)));
    const out = await service.suggest('u1', 's1', 0);
    expect(out.tier).toBe('PREMIUM');
    expect(out.videos).toHaveLength(5);
  });

  it('treats expired premium as free', async () => {
    db.user.findUnique.mockResolvedValue({ isPremium: true, premiumUntil: new Date(Date.now() - 1000) });
    youtube([detail(1), detail(2)]);
    expect((await service.suggest('u1', 's1', 0)).videos).toHaveLength(1);
  });

  it('skips videos that cannot be embedded, are private, or are too short or long', async () => {
    db.user.findUnique.mockResolvedValue({ isPremium: true, premiumUntil: null });
    youtube([
      detail(1, { status: { embeddable: false, privacyStatus: 'public', uploadStatus: 'processed' } }),
      detail(2, { status: { embeddable: true, privacyStatus: 'private', uploadStatus: 'processed' } }),
      detail(3, { contentDetails: { duration: 'PT30S' } }),
      detail(4, { contentDetails: { duration: 'PT2H' } }),
      detail(5),
    ]);
    const out = await service.suggest('u1', 's1', 0);
    expect(out.videos.map((v) => v.videoId)).toEqual([id(5)]);
  });

  it('serves a fresh cache entry without calling YouTube', async () => {
    db.classroomVideoSuggestion.findUnique.mockResolvedValue({ videos: [{ videoId: id(1), title: 'A', channel: 'C', durationSeconds: 600 }], hiddenIds: [], fetchedAt: new Date() });
    const out = await service.suggest('u1', 's1', 0);
    expect(out.videos).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hides reported videos', async () => {
    db.classroomVideoSuggestion.findUnique.mockResolvedValue({ videos: [{ videoId: id(1), title: 'A', channel: 'C', durationSeconds: 600 }, { videoId: id(2), title: 'B', channel: 'C', durationSeconds: 600 }], hiddenIds: [id(1)], fetchedAt: new Date() });
    expect((await service.suggest('u1', 's1', 0)).videos.map((v) => v.videoId)).toEqual([id(2)]);
  });

  it('stops at the daily lookup limit without touching YouTube', async () => {
    db.$queryRaw.mockResolvedValue([]);
    const out = await service.suggest('u1', 's1', 0);
    expect(out).toMatchObject({ videos: [], reason: 'LIMIT_REACHED', lookupsRemaining: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops searching when the daily search allowance is used', async () => {
    process.env.YOUTUBE_DAILY_SEARCH_LIMIT = '2';
    db.classroomVideoSuggestion.count.mockResolvedValue(2);
    const out = await service.suggest('u1', 's1', 0);
    expect(out).toMatchObject({ videos: [], reason: 'BUSY' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns nothing and refunds the lookup when YouTube fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const out = await service.suggest('u1', 's1', 0);
    expect(out).toMatchObject({ videos: [], reason: 'BUSY' });
    expect(db.$queryRaw).toHaveBeenCalledTimes(2); // consume, then refund
    expect(db.classroomVideoSuggestion.upsert).not.toHaveBeenCalled();
  });

  it('only hides a video that is in the list', async () => {
    db.classroomVideoSuggestion.findUnique.mockResolvedValue({ videos: [{ videoId: id(1) }], hiddenIds: [] });
    await service.report('u1', 's1', id(9), 0);
    expect(db.classroomVideoSuggestion.update).not.toHaveBeenCalled();
    await service.report('u1', 's1', id(1), 0);
    expect(db.classroomVideoSuggestion.update).toHaveBeenCalledWith(expect.objectContaining({ data: { hiddenIds: [id(1)] } }));
  });
});
