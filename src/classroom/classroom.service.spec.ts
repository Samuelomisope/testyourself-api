import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ClassroomService } from './classroom.service';
import { ClassroomTurnRequestStatus } from '@prisma/client';
import { createHash } from 'node:crypto';

jest.mock('../classification/services/text-extraction.service', () => ({ TextExtractionService: class TextExtractionService {} }));

describe('ClassroomService', () => {
  let service: ClassroomService;
  let db: any;
  let storage: any;
  let extractor: any;
  let ai: any;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    db = {
      classroomSession: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
      classroomDocument: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
      classroomDocumentChunk: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
      classroomTurnRequest: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      classroomTurn: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
      studyMaterial: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
      course: { findUnique: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((fn: any) => fn(db)),
    };
    storage = { createOwnedUploadKey: jest.fn(), uploadToOwnedKey: jest.fn(), deleteOwnedKey: jest.fn(), downloadOwnedKey: jest.fn(), downloadFile: jest.fn() };
    extractor = { extractText: jest.fn() };
    ai = { generate: jest.fn() };
    service = new ClassroomService(db, storage, extractor, ai);
    process.env.CLASSROOM_FREE_DAILY_TURNS = '20';
    process.env.CLASSROOM_PREMIUM_DAILY_TURNS = '100';
    process.env.CLASSROOM_FREE_DAILY_UPLOAD_BYTES = '1000000';
    process.env.CLASSROOM_PREMIUM_DAILY_UPLOAD_BYTES = '5000000';
    process.env.CLASSROOM_FREE_MAX_DOCUMENTS_PER_SESSION = '3';
    process.env.CLASSROOM_PREMIUM_MAX_DOCUMENTS_PER_SESSION = '10';
  });

  afterAll(() => { process.env = originalEnv; });

  it('scopes session retrieval to the requesting owner', async () => {
    db.classroomSession.findFirst.mockResolvedValue(null);
    await expect(service.getSession('user-a', 'session-b')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.classroomSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'session-b', userId: 'user-a' } }));
  });

  it('creates a session owned by the authenticated user', async () => {
    db.classroomSession.create.mockImplementation(async ({ data }: any) => ({ id: 'session-a', ...data, _count: { turns: 0, documents: 0 } }));
    const created = await service.createSession('user-a', { topic: 'Calculus' });
    expect(db.classroomSession.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'user-a', topic: 'Calculus' }) }));
    expect(created.id).toBe('session-a');
  });

  it('rejects unsupported and oversized documents before storage access', async () => {
    await expect(service.uploadDocument('user-a', 'session-a', { mimetype: 'application/zip', size: 10, originalname: 'notes.zip', buffer: Buffer.alloc(10) } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.uploadDocument('user-a', 'session-a', { mimetype: 'application/pdf', size: 15 * 1024 * 1024 + 1, originalname: 'notes.pdf', buffer: Buffer.alloc(0) } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadToOwnedKey).not.toHaveBeenCalled();
  });

  it('stores and processes a supported PDF, returning metadata without an R2 key', async () => {
    db.classroomSession.findFirst.mockResolvedValue({ id: 'session-a', userId: 'user-a', status: 'ACTIVE' });
    db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
    db.classroomDocument.count.mockResolvedValue(0);
    db.$queryRaw.mockResolvedValue([{ id: 'usage-a' }]);
    storage.createOwnedUploadKey.mockReturnValue('users/user-a/classroom/file.pdf');
    db.classroomDocument.create.mockResolvedValue({ id: 'doc-a' });
    extractor.extractText.mockResolvedValue({ text: 'A sufficiently long lecture note about calculus and integration methods.', method: 'PDF_TEXT_LAYER', likelyScanned: false });
    db.classroomDocument.findUnique.mockResolvedValue({ id: 'doc-a', status: 'READY', originalName: 'notes.pdf' });
    const file = { originalname: 'notes.pdf', mimetype: 'application/pdf', size: 100, buffer: Buffer.from('%PDF-fake') } as any;

    const result = await service.uploadDocument('user-a', 'session-a', file);
    expect(storage.uploadToOwnedKey).toHaveBeenCalledWith(file, 'users/user-a/classroom/file.pdf', 'classroom', 'user-a');
    expect(db.classroomDocumentChunk.createMany).toHaveBeenCalled();
    expect(result).toEqual({ id: 'doc-a', status: 'READY', originalName: 'notes.pdf' });
    expect(JSON.stringify(result)).not.toContain('storageKey');
  });

  it('keeps a failed R2 deletion retryable and completes it on retry', async () => {
    db.classroomDocument.findFirst.mockResolvedValue({ id: 'doc-a', sessionId: 'session-a', source: 'UPLOAD', storageKey: 'users/user-a/classroom/file.pdf' });
    storage.deleteOwnedKey.mockRejectedValueOnce(new Error('temporary storage failure')).mockResolvedValueOnce(undefined);
    expect(await service.deleteDocument('user-a', 'session-a', 'doc-a')).toMatchObject({ status: 'DELETE_FAILED', retryable: true });
    expect(db.classroomDocument.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'DELETE_FAILED', failureCode: 'STORAGE_DELETE_FAILED' } }));
    expect(await service.deleteDocument('user-a', 'session-a', 'doc-a')).toMatchObject({ status: 'DELETED', retryable: false });
    expect(storage.deleteOwnedKey).toHaveBeenCalledTimes(2);
    expect(db.classroomDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DELETED', storageKey: null }) }));
  });

  it('retrieves only ready chunks attached to the requested classroom', async () => {
    db.$queryRaw.mockResolvedValue([]);
    await (service as any).retrieveChunks('user-a', 'session-a', [], 'Explain energy transfer');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const query = db.$queryRaw.mock.calls[0][0].strings.join('');
    expect(query).toContain('d."sessionId"');
    expect(query).toContain('d."status" = \'READY\'');
    expect(query).toContain('m."isPublic" = true');
  });

  it('uses configured free or active-premium quota values without defaults', async () => {
    db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
    await expect((service as any).quota('user-a')).resolves.toEqual({ turns: 20, uploadBytes: 1000000n, documents: 3 });
    db.user.findUnique.mockResolvedValue({ isPremium: true, premiumUntil: new Date(Date.now() + 60_000) });
    await expect((service as any).quota('user-a')).resolves.toEqual({ turns: 100, uploadBytes: 5000000n, documents: 10 });
    delete process.env.CLASSROOM_FREE_DAILY_TURNS;
    db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
    await expect((service as any).quota('user-a')).rejects.toThrow(/not configured/);
  });

  it('fails closed when the atomic turn-quota update reports the limit reached', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };
    await expect((service as any).consumeTurn(tx, 'user-a', 4)).rejects.toBeInstanceOf(ConflictException);
    const query = tx.$queryRaw.mock.calls[0][0].join('');
    expect(query).toContain('"turnsUsed" <');
  });

  it('persists a student/tutor exchange with a structured lesson and ordered sequences', async () => {
    let requestId = '';
    const initialSession = { id: 'session-a', userId: 'user-a', status: 'ACTIVE', activeTurnRequestId: null, turnLeaseExpiresAt: null, turnLeaseVersion: 0, nextTurnSequence: 0 };
    const leasedSession = { ...initialSession, activeTurnRequestId: requestId, turnLeaseVersion: 1, turnLeaseExpiresAt: new Date(Date.now() + 60_000), nextTurnSequence: 1 };
    db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
    db.classroomSession.findFirst.mockImplementation(async () => requestId ? { ...leasedSession, activeTurnRequestId: requestId } : initialSession);
    db.classroomTurnRequest.findUnique.mockResolvedValue(null);
    db.classroomTurnRequest.create.mockImplementation(async ({ data }: any) => { requestId = data.id; return data; });
    db.classroomDocument.findMany.mockResolvedValue([]);
    db.classroomTurnRequest.findFirst.mockResolvedValue({
      id: requestId, status: 'COMPLETED', turns: [
        { id: 'student-turn', sequence: 1, role: 'STUDENT', content: 'Explain limits', response: null, createdAt: new Date() },
        { id: 'tutor-turn', sequence: 2, role: 'TUTOR', content: 'A limit describes a value approached.', response: { schemaVersion: 1, summary: 'A limit describes a value approached.', steps: [], examples: [], followUpQuestion: null, sources: [] }, createdAt: new Date() },
      ],
    });
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'usage' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    ai.generate.mockResolvedValue({ text: JSON.stringify({ schemaVersion: 1, summary: 'A limit describes a value approached.', steps: [], examples: [], followUpQuestion: null, sourceNumbers: [] }), isUncertain: false, providerUsed: 'claude', modelUsed: 'test-model' });

    const result = await service.createTurn('user-a', 'session-a', { message: 'Explain limits', idempotencyKey: 'turn-key-123456' });
    expect(result.request.status).toBe('COMPLETED');
    expect(result.turns.map((t: any) => t.sequence)).toEqual([1, 2]);
    expect(result.turns[1].structuredLesson).toMatchObject({ schemaVersion: 1, steps: [], examples: [] });
    expect(result.turns[1]).not.toHaveProperty('provider');
    expect(db.classroomTurn.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ role: 'STUDENT', sequence: 1 }) }));
    expect(db.classroomTurn.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ role: 'TUTOR', sequence: 2 }) }));
  });

  it('returns a completed idempotent request without calling the AI provider again', async () => {
    const message = 'Explain this topic';
    const hash = createHash('sha256').update(JSON.stringify({ message, documentIds: [] })).digest('hex');
    db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
    db.classroomSession.findFirst.mockResolvedValue({ id: 'session-a', userId: 'user-a', status: 'ACTIVE', activeTurnRequestId: null, turnLeaseExpiresAt: null, turnLeaseVersion: 1, nextTurnSequence: 2 });
    db.classroomTurnRequest.findUnique.mockResolvedValue({ id: 'request-a', requestHash: hash, status: ClassroomTurnRequestStatus.COMPLETED });
    db.classroomTurnRequest.findFirst.mockResolvedValue({ id: 'request-a', status: 'COMPLETED', turns: [{ id: 'turn-a', sequence: 1, role: 'STUDENT', content: message, response: null, createdAt: new Date() }, { id: 'turn-b', sequence: 2, role: 'TUTOR', content: 'Explanation', response: { schemaVersion: 1 }, createdAt: new Date() }] });

    const result = await service.createTurn('user-a', 'session-a', { message, idempotencyKey: 'request-key-123' });
    expect(result.turns).toHaveLength(2);
    expect(ai.generate).not.toHaveBeenCalled();
    expect(db.$queryRaw.mock.calls.some(([parts]: [TemplateStringsArray]) => parts.join('').includes('INSERT INTO "ClassroomUsage"'))).toBe(false);
  });

  it('rejects reuse of an idempotency key with a different request body', async () => {
    db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
    db.classroomSession.findFirst.mockResolvedValue({ id: 'session-a', userId: 'user-a', status: 'ACTIVE', activeTurnRequestId: null, turnLeaseExpiresAt: null, turnLeaseVersion: 1, nextTurnSequence: 2 });
    db.classroomTurnRequest.findUnique.mockResolvedValue({ id: 'request-a', requestHash: 'different-payload', status: ClassroomTurnRequestStatus.COMPLETED });
    await expect(service.createTurn('user-a', 'session-a', { message: 'Different question', idempotencyKey: 'request-key-123' })).rejects.toBeInstanceOf(ConflictException);
    expect(ai.generate).not.toHaveBeenCalled();
  });
});
