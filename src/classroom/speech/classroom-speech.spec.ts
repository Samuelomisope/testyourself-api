jest.mock('@prisma/client', () => ({ ClassroomSessionStatus: { DELETING: 'DELETING', DELETE_FAILED: 'DELETE_FAILED' } }));
jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { ClassroomSpeechService } from './classroom-speech.service';
import { GroqTtsProvider } from './groq-tts.provider';

const AUDIO = { audio: Buffer.from('RIFFwav'), contentType: 'audio/wav' };

function build(opts: { user?: any; session?: any; reserve?: any[]; provider?: any } = {}) {
  const db: any = {
    user: { findUnique: jest.fn().mockResolvedValue('user' in opts ? opts.user : { isPremium: true, premiumUntil: null, role: 'STUDENT', email: 'a@x.com' }) },
    classroomSession: { findFirst: jest.fn().mockResolvedValue('session' in opts ? opts.session : { id: 's1' }) },
    $queryRaw: jest.fn().mockResolvedValue(opts.reserve ?? [{ id: 'row' }]),
  };
  const provider = opts.provider ?? { name: 'fake', isConfigured: () => true, synthesize: jest.fn().mockResolvedValue(AUDIO) };
  return { db, provider, service: new ClassroomSpeechService(db, provider) };
}

describe('ClassroomSpeechService', () => {
  const saved = { ...process.env };
  beforeEach(() => { process.env.CLASSROOM_PREMIUM_DAILY_SPEECH_CHARS = '20000'; delete process.env.CLASSROOM_SPEECH_MAX_CHUNK_CHARS; });
  afterEach(() => { process.env = { ...saved }; });

  it('reads a short piece aloud for a Premium user and charges its characters', async () => {
    const { service, db, provider } = build();
    const out = await service.synthesize('u1', 's1', '  Newton   says force equals mass times acceleration.  ', 'female');
    expect(out).toBe(AUDIO);
    expect(provider.synthesize).toHaveBeenCalledWith('Newton says force equals mass times acceleration.', 'female');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('lets an admin account use the voice without paying', async () => {
    const { service } = build({ user: { isPremium: false, premiumUntil: null, role: 'ADMIN', email: 'b@x.com' } });
    await expect(service.synthesize('u1', 's1', 'Hello there.', 'male')).resolves.toBe(AUDIO);
  });

  it('refuses a free student, before charging or calling the provider', async () => {
    const { service, db, provider } = build({ user: { isPremium: false, premiumUntil: null, role: 'STUDENT', email: 'a@x.com' } });
    await expect(service.synthesize('u1', 's1', 'Hello.', 'female')).rejects.toMatchObject({ status: 403 });
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it('refuses someone else\'s lesson', async () => {
    const { service, provider } = build({ session: null });
    await expect(service.synthesize('u1', 's1', 'Hello.', 'female')).rejects.toMatchObject({ status: 404 });
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it('returns 429 and does not call the provider when the daily allowance is used up', async () => {
    const { service, provider } = build({ reserve: [] });
    await expect(service.synthesize('u1', 's1', 'Hello.', 'female')).rejects.toMatchObject({ status: 429 });
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it('refunds the characters and returns 502 when the provider fails', async () => {
    const failing = { name: 'fake', isConfigured: () => true, synthesize: jest.fn().mockRejectedValue(new Error('down')) };
    const { service, db } = build({ provider: failing });
    await expect(service.synthesize('u1', 's1', 'Hello.', 'female')).rejects.toMatchObject({ status: 502 });
    expect(db.$queryRaw).toHaveBeenCalledTimes(2); // reserve, then refund
  });

  it('says unavailable when no allowance is configured or the provider has no key', async () => {
    delete process.env.CLASSROOM_PREMIUM_DAILY_SPEECH_CHARS;
    await expect(build().service.synthesize('u1', 's1', 'Hello.', 'female')).rejects.toMatchObject({ status: 503 });
    process.env.CLASSROOM_PREMIUM_DAILY_SPEECH_CHARS = '1000';
    const off = { name: 'fake', isConfigured: () => false, synthesize: jest.fn() };
    await expect(build({ provider: off }).service.synthesize('u1', 's1', 'Hello.', 'female')).rejects.toMatchObject({ status: 503 });
  });

  it('rejects empty and over-long text with 400', async () => {
    const { service } = build();
    await expect(service.synthesize('u1', 's1', '   ', 'female')).rejects.toMatchObject({ status: 400 });
    await expect(service.synthesize('u1', 's1', 'x'.repeat(201), 'female')).rejects.toMatchObject({ status: 400 });
    process.env.CLASSROOM_SPEECH_MAX_CHUNK_CHARS = '300';
    await expect(service.synthesize('u1', 's1', 'x'.repeat(250), 'female')).resolves.toBe(AUDIO);
  });
});

describe('GroqTtsProvider', () => {
  const config = (values: Record<string, string>) => ({ get: (k: string) => values[k] }) as any;
  afterEach(() => jest.restoreAllMocks());

  it('is configured only with a key and not switched off', () => {
    expect(new GroqTtsProvider(config({})).isConfigured()).toBe(false);
    expect(new GroqTtsProvider(config({ GROQ_API_KEY: 'k' })).isConfigured()).toBe(true);
    expect(new GroqTtsProvider(config({ GROQ_API_KEY: 'k', CLASSROOM_SPEECH_ENABLED: 'false' })).isConfigured()).toBe(false);
  });

  it('sends the model, the voice for the tutor and wav output, and returns the audio', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    global.fetch = fetchMock as any;
    const provider = new GroqTtsProvider(config({ GROQ_API_KEY: 'k' }));
    const out = await provider.synthesize('Hi', 'male');
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ model: 'canopylabs/orpheus-v1-english', voice: 'troy', input: 'Hi', response_format: 'wav' });
    expect(init.headers.Authorization).toBe('Bearer k');
    expect(out.audio.length).toBe(3);
    await provider.synthesize('Hi', 'female');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).voice).toBe('hannah');
  });

  it('throws on a failed or empty response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 }) as any;
    await expect(new GroqTtsProvider(config({ GROQ_API_KEY: 'k' })).synthesize('Hi', 'male')).rejects.toThrow('429');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }) as any;
    await expect(new GroqTtsProvider(config({ GROQ_API_KEY: 'k' })).synthesize('Hi', 'male')).rejects.toThrow('no audio');
  });
});
