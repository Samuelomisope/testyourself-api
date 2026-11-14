import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
    // One ranked keyword query, then the fallback query because the first returned nothing.
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    for (const [call] of db.$queryRaw.mock.calls) {
      const query = call.strings.join('');
      expect(query).toContain('d."sessionId"');
      expect(query).toContain('d."status" = \'READY\'');
      expect(query).toContain('m."isPublic" = true');
    }
  });

  it('matches any meaningful word of a long question instead of requiring all of them', async () => {
    db.$queryRaw.mockResolvedValue([{ documentId: 'doc-a', chunkIndex: 0, text: 'substitution rule', title: 'notes.pdf' }]);
    const rows = await (service as any).retrieveChunks('user-a', 'session-a', [], 'Please explain integration by substitution step by step');
    expect(rows).toHaveLength(1);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const call = db.$queryRaw.mock.calls[0][0];
    expect(call.strings.join('')).toContain('to_tsquery');
    expect(call.strings.join('')).not.toContain('plainto_tsquery');
    expect(call.values).toContain('integration | substitution');
  });

  it('falls back to the opening of attached documents when no keyword matches', async () => {
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ documentId: 'doc-a', chunkIndex: 0, text: 'Introduction', title: 'notes.pdf' }]);
    const rows = await (service as any).retrieveChunks('user-a', 'session-a', [], 'quantum entanglement');
    expect(rows).toHaveLength(1);
    expect(db.$queryRaw.mock.calls[1][0].strings.join('')).toContain('ORDER BY d."createdAt" ASC, c."chunkIndex" ASC');
  });

  it('only builds tsquery terms from letters and digits', () => {
    const terms = (service as any).queryTerms("energy' | !drop & (table) <-> x:* 2024");
    expect(terms).toEqual(['energy', 'drop', 'table', '2024']);
    expect(terms.every((t: string) => /^[\p{L}\p{N}]+$/u.test(t))).toBe(true);
  });

  describe('parseLesson', () => {
    const chunks = [{ documentId: 'doc-a', title: 'notes.pdf', chunkIndex: 0 }, { documentId: 'doc-a', title: 'notes.pdf', chunkIndex: 1 }];
    const parse = (raw: string, c = chunks) => (service as any).parseLesson(raw, c);

    it('accepts a lesson that omits optional fields instead of failing the turn', () => {
      const lesson = parse(JSON.stringify({ summary: 'Limits describe approach.', steps: [{ title: 'Idea', explanation: 'Get close.' }], examples: [] }));
      expect(lesson).toMatchObject({ schemaVersion: 2, stepIndex: null, summary: 'Limits describe approach.', followUpQuestion: null, sources: [] });
      expect(lesson.steps).toEqual([{ id: 'step-1', title: 'Idea', explanation: 'Get close.', origin: 'EXTRA', sources: [] }]);
    });

    it('accepts JSON wrapped in prose or code fences', () => {
      expect(parse('Here you go:\n```json\n{"summary":"ok","steps":[],"examples":[]}\n```').summary).toBe('ok');
    });

    it('drops citations that point at excerpts that were never supplied, and sorts the rest numerically', () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ documentId: 'doc-a', title: 't', chunkIndex: i }));
      const lesson = parse(JSON.stringify({ summary: 's', steps: [{ title: 'a', explanation: 'b', sourceNumbers: [10, 2, 99] }], examples: [], sourceNumbers: [] }), many);
      expect(lesson.sources.map((x: any) => x.chunkIndex)).toEqual([1, 9]);
    });

    it('never saves cut-off or malformed JSON as the tutor answer', () => {
      expect(() => parse('{"summary":"Limits describe","steps":[{"title":"Idea","expl')).toThrow(/response format/);
    });

    it('keeps a plain prose answer', () => {
      expect(parse('A limit is the value a function approaches.')).toMatchObject({ schemaVersion: 2, summary: 'A limit is the value a function approaches.', steps: [] });
    });

    it('labels each step by where it came from and attaches its own sources', () => {
      const lesson = parse(JSON.stringify({ summary: 's', examples: [], steps: [
        { title: 'a', explanation: 'from notes', origin: 'SOURCE', sourceNumbers: [2] },
        { title: 'b', explanation: 'reworded', origin: 'SIMPLIFIED', sourceNumbers: [1, 2, 1] },
        { title: 'c', explanation: 'own knowledge', origin: 'EXTRA', sourceNumbers: [] },
      ] }));
      expect(lesson.steps.map((x: any) => x.origin)).toEqual(['SOURCE', 'SIMPLIFIED', 'EXTRA']);
      expect(lesson.steps[0].sources).toEqual([{ documentId: 'doc-a', title: 'notes.pdf', chunkIndex: 1 }]);
      expect(lesson.steps[1].sources.map((x: any) => x.chunkIndex)).toEqual([0, 1]);
      expect(lesson.steps[2].sources).toEqual([]);
    });

    it('never labels a step as coming from the documents without a valid citation', () => {
      const lesson = parse(JSON.stringify({ summary: 's', examples: [], steps: [
        { title: 'a', explanation: 'claims a source', origin: 'SOURCE', sourceNumbers: [] },
        { title: 'b', explanation: 'cites a missing excerpt', origin: 'SIMPLIFIED', sourceNumbers: [99] },
        { title: 'c', explanation: 'invented label', origin: 'OFFICIAL', sourceNumbers: [1] },
      ] }));
      expect(lesson.steps.map((x: any) => x.origin)).toEqual(['EXTRA', 'EXTRA', 'SOURCE']);
    });

    it('records which plan step the turn taught', () => {
      expect((service as any).parseLesson(JSON.stringify({ summary: 's', steps: [], examples: [] }), chunks, 2).stepIndex).toBe(2);
    });
  });

  it('does not duplicate excerpts by also passing them as provider context', async () => {
    let requestId = '';
    const session = { id: 'session-a', userId: 'user-a', status: 'ACTIVE', activeTurnRequestId: null, turnLeaseExpiresAt: null, turnLeaseVersion: 0, nextTurnSequence: 0 };
    db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
    db.classroomSession.findFirst.mockImplementation(async () => (requestId ? { ...session, activeTurnRequestId: requestId, turnLeaseVersion: 1, nextTurnSequence: 1 } : session));
    db.classroomTurnRequest.findUnique.mockResolvedValue(null);
    db.classroomTurnRequest.create.mockImplementation(async ({ data }: any) => { requestId = data.id; return { ...data, createdAt: new Date() }; });
    db.classroomDocument.findMany.mockResolvedValue([]);
    db.classroomTurnRequest.findFirst.mockResolvedValue({ id: 'r', status: 'COMPLETED', turns: [] });
    // admission lock, daily-turn insert, ranked retrieval, completion lock
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'usage' }]).mockResolvedValueOnce([{ documentId: 'doc-a', chunkIndex: 0, text: 'excerpt text', title: 'notes.pdf' }]).mockResolvedValueOnce([]);
    ai.generate.mockResolvedValue({ text: JSON.stringify({ summary: 's', steps: [], examples: [] }), isUncertain: false, providerUsed: 'claude', modelUsed: 'm' });
    await service.createTurn('user-a', 'session-a', { message: 'Explain limits', idempotencyKey: 'turn-key-123456' });
    expect(ai.generate).toHaveBeenCalledTimes(1);
    expect(ai.generate.mock.calls[0]).toHaveLength(1);
    expect(ai.generate.mock.calls[0][0]).toContain('excerpt text');
  });

  describe('tutor context', () => {
    const build = (...args: any[]) => (service as any).buildTutorPrompt(...args);

    it('adds the earlier conversation so follow-ups are answered in context', () => {
      const prompt = build('continue', [], [{ role: 'STUDENT', content: 'Explain   limits' }, { role: 'TUTOR', content: 'A limit is the value a function approaches.' }]);
      expect(prompt).toContain('Earlier in this lesson');
      expect(prompt.indexOf('Student: Explain limits')).toBeGreaterThan(-1);
      expect(prompt.indexOf('Student: Explain limits')).toBeLessThan(prompt.indexOf('Tutor: A limit is'));
      expect(prompt.indexOf('Tutor: A limit is')).toBeLessThan(prompt.indexOf('Student question:\ncontinue'));
    });

    it('trims long history turns and omits the section when there is none', () => {
      expect(build('next', [], [{ role: 'TUTOR', content: 'y'.repeat(5000) }])).not.toContain('y'.repeat(601));
      expect(build('next', [])).not.toContain('Earlier in this lesson');
    });

    it('names documents that are not readable and tells the tutor never to claim it read them', () => {
      const prompt = build('Summarise my notes', [], [], [{ originalName: 'week1.pdf', status: 'PROCESSING' }, { originalName: 'bad"\nname.pdf', status: 'FAILED' }]);
      expect(prompt).toContain('"week1.pdf" (still processing)');
      expect(prompt).toContain('(processing failed)');
      expect(prompt).toContain('Never claim to have read');
      expect(prompt).toContain('No attached document could be read yet');
      expect(prompt).not.toContain('bad"\nname'); // names are JSON-escaped, so a file name cannot inject a new line
    });

    it('keeps the normal wording when nothing is attached, and keeps excerpts when some are readable', () => {
      expect(build('q', [])).toContain('No classroom documents were attached');
      const prompt = build('q', [{ title: 'notes.pdf', text: 'excerpt text' }], [], [{ originalName: 'week2.pdf', status: 'PROCESSING' }]);
      expect(prompt).toContain('excerpt text');
      expect(prompt).not.toContain('No attached document could be read yet');
    });

    it('loads only completed earlier exchanges, oldest first', async () => {
      db.classroomTurn.findMany.mockResolvedValue([{ role: 'TUTOR', content: 'b' }, { role: 'STUDENT', content: 'a' }]);
      const rows = await (service as any).recentHistory('session-a', 5);
      expect(rows.map((r: any) => r.content)).toEqual(['a', 'b']);
      expect(db.classroomTurn.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { sessionId: 'session-a', sequence: { lt: 5 }, request: { status: 'COMPLETED' } }, orderBy: { sequence: 'desc' }, take: 6,
      }));
    });

    it('looks up only processing or failed documents in this session', async () => {
      db.classroomDocument.findMany.mockResolvedValue([]);
      await (service as any).unavailableDocuments('session-a', []);
      expect(db.classroomDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionId: 'session-a', status: { in: ['PROCESSING', 'FAILED'] } } }));
      await (service as any).unavailableDocuments('session-a', ['doc-a']);
      expect(db.classroomDocument.findMany.mock.calls[1][0].where).toMatchObject({ id: { in: ['doc-a'] } });
    });

    it('sends earlier turns to the model when answering a new turn', async () => {
      let requestId = '';
      const session = { id: 'session-a', userId: 'user-a', status: 'ACTIVE', activeTurnRequestId: null, turnLeaseExpiresAt: null, turnLeaseVersion: 0, nextTurnSequence: 0 };
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.classroomSession.findFirst.mockImplementation(async () => (requestId ? { ...session, activeTurnRequestId: requestId, turnLeaseVersion: 1, nextTurnSequence: 1 } : session));
      db.classroomTurnRequest.findUnique.mockResolvedValue(null);
      db.classroomTurnRequest.create.mockImplementation(async ({ data }: any) => { requestId = data.id; return { ...data, createdAt: new Date() }; });
      db.classroomDocument.findMany.mockResolvedValue([]);
      db.classroomTurnRequest.findFirst.mockResolvedValue({ id: 'r', status: 'COMPLETED', turns: [] });
      db.classroomTurn.findMany.mockResolvedValue([{ role: 'TUTOR', content: 'Earlier tutor answer' }, { role: 'STUDENT', content: 'Earlier student question' }]);
      db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'usage' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      ai.generate.mockResolvedValue({ text: JSON.stringify({ summary: 's', steps: [], examples: [] }), isUncertain: false, providerUsed: 'claude', modelUsed: 'm' });

      await service.createTurn('user-a', 'session-a', { message: 'continue', idempotencyKey: 'turn-key-123456' });
      const prompt: string = ai.generate.mock.calls[0][0];
      expect(prompt.indexOf('Student: Earlier student question')).toBeGreaterThan(-1);
      expect(prompt.indexOf('Student: Earlier student question')).toBeLessThan(prompt.indexOf('Tutor: Earlier tutor answer'));
      expect(db.classroomTurn.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sequence: { lt: 1 } }) }));
    });
  });

  describe('lesson plan', () => {
    const text = (arg: any) => (Array.isArray(arg) ? arg : arg.strings).join('');
    const refunds = () => db.$queryRaw.mock.calls.filter(([parts]: [any]) => text(parts).includes('GREATEST("turnsUsed" - 1, 0)'));
    const usageInserts = () => db.$queryRaw.mock.calls.filter(([parts]: [any]) => text(parts).includes('INSERT INTO "ClassroomUsage"'));
    const threeSteps = [{ id: 'step-1', title: 'Intuition', summary: 'Approaching a value.' }, { id: 'step-2', title: 'Formal definition', summary: 'Epsilon-delta.' }, { id: 'step-3', title: 'Computing limits', summary: 'Techniques.' }];
    const lessonRow = (over: any = {}) => ({ id: 'session-a', userId: 'user-a', status: 'ACTIVE', mode: 'CLASSROOM', sourceMode: 'GENERAL', topic: 'Limits', title: 'Limits', objectives: null, outline: null, currentStepIndex: 0, ...over });
    const planJson = JSON.stringify({ title: 'Understanding limits', objectives: ['Define a limit', 'Compute simple limits'], outline: [{ title: 'Intuition', summary: 'Approaching a value.' }, { title: 'Formal definition', summary: 'Epsilon-delta.' }, { title: 'Computing limits', summary: 'Techniques.' }] });
    const aiReturns = (body: string) => ai.generate.mockResolvedValue({ text: body, isUncertain: false, providerUsed: 'claude', modelUsed: 'm' });

    it('starts new lessons in classroom mode with general sources unless told otherwise', async () => {
      db.classroomSession.create.mockImplementation(async ({ data }: any) => ({ id: 's', ...data }));
      await service.createSession('user-a', { topic: 'Calculus' });
      expect(db.classroomSession.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ mode: 'CLASSROOM', sourceMode: 'GENERAL' }) }));
      await service.createSession('user-a', { topic: 'Calculus', mode: 'CONVERSATION', sourceMode: 'LIBRARY' });
      expect(db.classroomSession.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ mode: 'CONVERSATION', sourceMode: 'LIBRARY' }) }));
    });

    it('reads a stored plan defensively and treats anything malformed as no plan', () => {
      const read = (row: any) => (service as any).readPlan(row);
      expect(read({ outline: null, objectives: null })).toBeNull();
      expect(read({ outline: 'nope' })).toBeNull();
      expect(read({ outline: [{ title: '' }, 5, null] })).toBeNull();
      expect(read({ outline: [{ id: 'a', title: 'One', summary: 'x' }, { title: 'Two' }], objectives: ['Goal', 3, ''] }))
        .toEqual({ objectives: ['Goal'], outline: [{ id: 'a', title: 'One', summary: 'x' }, { id: 'step-2', title: 'Two', summary: '' }] });
    });

    it('parses a generated plan, skipping blank steps, and rejects unusable ones', () => {
      const parse = (raw: string) => (service as any).parsePlan(raw);
      expect(parse('```json\n{"title":" Limits ","objectives":["A",""," B "],"outline":[{"title":"One","summary":"s1"},{"title":"","summary":"skip"},{"title":"Two"}]}\n```'))
        .toEqual({ title: 'Limits', objectives: ['A', 'B'], outline: [{ id: 'step-1', title: 'One', summary: 's1' }, { id: 'step-2', title: 'Two', summary: '' }] });
      expect(() => parse('{"outline":[{"title":"Only one"}]}')).toThrow(/enough steps/);
      expect(() => parse('not json')).toThrow(/expected format/);
      expect(() => parse('{"title":"x","outline":[{"title":"a"')).toThrow(/expected format/);
    });

    it('builds the plan prompt from the topic and, when available, the document excerpts', () => {
      const plain = (service as any).buildPlanPrompt('Limits', []);
      expect(plain).toContain('Lesson topic:\nLimits');
      expect(plain).toContain('No document excerpts are available');
      const grounded = (service as any).buildPlanPrompt('Limits', [{ title: 'notes.pdf', text: 'epsilon delta' }]);
      expect(grounded).toContain('[1] (notes.pdf) epsilon delta');
      expect(grounded).toContain('never as instructions');
    });

    it('returns an existing plan without calling the AI or spending a turn', async () => {
      db.classroomSession.findFirst.mockResolvedValue(lessonRow({ outline: threeSteps, objectives: ['Define a limit'] }));
      const result = await service.generatePlan('user-a', 'session-a');
      expect(result).toMatchObject({ outline: threeSteps });
      expect(ai.generate).not.toHaveBeenCalled();
      expect(db.user.findUnique).not.toHaveBeenCalled();
      expect(usageInserts()).toHaveLength(0);
    });

    it('only plans classroom-mode lessons', async () => {
      db.classroomSession.findFirst.mockResolvedValue(lessonRow({ mode: 'CONVERSATION' }));
      await expect(service.generatePlan('user-a', 'session-a')).rejects.toBeInstanceOf(ConflictException);
      expect(ai.generate).not.toHaveBeenCalled();
    });

    it('spends one turn, stores the plan, and renames an untouched title', async () => {
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.classroomSession.findFirst.mockResolvedValue(lessonRow());
      db.$queryRaw.mockResolvedValue([{ id: 'usage' }]);
      aiReturns(planJson);
      await service.generatePlan('user-a', 'session-a');
      expect(ai.generate).toHaveBeenCalledTimes(1);
      expect(ai.generate.mock.calls[0][0]).toContain('Lesson topic:\nLimits');
      expect(usageInserts()).toHaveLength(1);
      expect(refunds()).toHaveLength(0);
      expect(db.classroomSession.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'session-a' },
        data: expect.objectContaining({ title: 'Understanding limits', currentStepIndex: 0, objectives: ['Define a limit', 'Compute simple limits'], outline: threeSteps }),
      }));
    });

    it('keeps a title the student renamed', async () => {
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.classroomSession.findFirst.mockResolvedValue(lessonRow({ title: 'My limits notes' }));
      db.$queryRaw.mockResolvedValue([{ id: 'usage' }]);
      aiReturns(planJson);
      await service.generatePlan('user-a', 'session-a');
      expect(db.classroomSession.update.mock.calls[0][0].data).not.toHaveProperty('title');
    });

    it('does not search documents for a general-knowledge lesson, but does for a library or upload lesson', async () => {
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.$queryRaw.mockResolvedValue([{ id: 'usage' }]);
      aiReturns(planJson);
      const retrieve = jest.spyOn(service as any, 'retrieveChunks').mockResolvedValue([{ documentId: 'doc-a', title: 'notes.pdf', chunkIndex: 0, text: 'epsilon delta' }]);
      db.classroomSession.findFirst.mockResolvedValue(lessonRow({ sourceMode: 'GENERAL' }));
      await service.generatePlan('user-a', 'session-a');
      expect(retrieve).not.toHaveBeenCalled();
      db.classroomSession.findFirst.mockResolvedValue(lessonRow({ sourceMode: 'UPLOADED' }));
      await service.generatePlan('user-a', 'session-a');
      expect(retrieve).toHaveBeenCalledWith('user-a', 'session-a', [], 'Limits');
      expect(ai.generate.mock.calls[1][0]).toContain('[1] (notes.pdf) epsilon delta');
    });

    it('refuses without calling the AI when the daily turn quota is used up', async () => {
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.classroomSession.findFirst.mockResolvedValue(lessonRow());
      db.$queryRaw.mockResolvedValue([]);
      await expect(service.generatePlan('user-a', 'session-a')).rejects.toBeInstanceOf(ConflictException);
      expect(ai.generate).not.toHaveBeenCalled();
      expect(refunds()).toHaveLength(0);
    });

    it('returns the turn when generation fails and saves nothing', async () => {
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.classroomSession.findFirst.mockResolvedValue(lessonRow());
      db.$queryRaw.mockResolvedValue([{ id: 'usage' }]);
      ai.generate.mockRejectedValue(new Error('provider down'));
      await expect(service.generatePlan('user-a', 'session-a')).rejects.toBeInstanceOf(BadGatewayException);
      expect(refunds()).toHaveLength(1);
      expect(db.classroomSession.update).not.toHaveBeenCalled();
    });

    it('treats an exhausted provider chain or an unusable plan as a failure and refunds', async () => {
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.classroomSession.findFirst.mockResolvedValue(lessonRow());
      db.$queryRaw.mockResolvedValue([{ id: 'usage' }]);
      ai.generate.mockResolvedValueOnce({ text: "I'm not confident", isUncertain: true, providerUsed: 'none', modelUsed: 'none' });
      await expect(service.generatePlan('user-a', 'session-a')).rejects.toBeInstanceOf(BadGatewayException);
      aiReturns('{"title":"x","objectives":[],"outline":[{"title":"only one"}]}');
      await expect(service.generatePlan('user-a', 'session-a')).rejects.toBeInstanceOf(BadGatewayException);
      expect(refunds()).toHaveLength(2);
      expect(db.classroomSession.update).not.toHaveBeenCalled();
    });

    it('keeps the winner\'s plan and returns its own turn when two requests race', async () => {
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.$queryRaw.mockResolvedValue([{ id: 'usage' }]);
      db.classroomSession.findFirst
        .mockResolvedValueOnce(lessonRow()) // requireActiveSession
        .mockResolvedValueOnce(lessonRow()) // reservation lock
        .mockResolvedValue(lessonRow({ outline: threeSteps })); // save lock and the final read: another request finished first
      aiReturns(planJson);
      const result = await service.generatePlan('user-a', 'session-a');
      expect(result).toMatchObject({ outline: threeSteps });
      expect(db.classroomSession.update).not.toHaveBeenCalled();
      expect(refunds()).toHaveLength(1);
    });

    describe('plan-aware turns', () => {
      const runTurn = async ({ session = {}, history = [] as any[], action }: { session?: any; history?: any[]; action?: 'ASK' | 'CONTINUE' }) => {
        let requestId = '';
        const base = lessonRow({ activeTurnRequestId: null, turnLeaseExpiresAt: null, turnLeaseVersion: 0, nextTurnSequence: 0, outline: threeSteps, objectives: ['Define a limit'], ...session });
        db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
        db.classroomSession.findFirst.mockImplementation(async () => (requestId ? { ...base, activeTurnRequestId: requestId, turnLeaseVersion: 1, nextTurnSequence: 1 } : base));
        db.classroomTurnRequest.findUnique.mockResolvedValue(null);
        db.classroomTurnRequest.create.mockImplementation(async ({ data }: any) => { requestId = data.id; return { ...data, createdAt: new Date() }; });
        db.classroomDocument.findMany.mockResolvedValue([]);
        db.classroomTurnRequest.findFirst.mockResolvedValue({ id: 'r', status: 'COMPLETED', turns: [] });
        db.classroomTurn.findMany.mockResolvedValue(history);
        db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'usage' }]).mockResolvedValue([]);
        aiReturns(JSON.stringify({ summary: 's', steps: [], examples: [] }));
        await service.createTurn('user-a', 'session-a', { message: 'next please', idempotencyKey: 'turn-key-123456', ...(action ? { action } : {}) });
        const completion = db.classroomSession.update.mock.calls.map(([arg]: any) => arg.data).find((data: any) => data.activeTurnRequestId === null);
        const tutor = db.classroomTurn.create.mock.calls.map(([arg]: any) => arg.data).find((data: any) => data.role === 'TUTOR');
        return { prompt: ai.generate.mock.calls[0][0] as string, completion, tutor };
      };
      const earlier = [{ role: 'TUTOR', content: 'Taught the previous step' }, { role: 'STUDENT', content: 'ok' }]; // newest first, as the query returns them

      it('opens the lesson on step one, even if the first message asks to continue', async () => {
        const { prompt, completion, tutor } = await runTurn({ action: 'CONTINUE' });
        expect(prompt).toContain('Open the lesson');
        expect(prompt).toContain('step 1 of 3 ("Intuition")');
        expect(prompt).toContain('Objectives: Define a limit');
        expect(prompt).toContain('1. Intuition - Approaching a value.  <-- CURRENT STEP');
        expect(completion.currentStepIndex).toBe(0);
        expect(tutor.response).toMatchObject({ schemaVersion: 2, stepIndex: 0 });
      });

      it('answers a question in context without moving on', async () => {
        const { prompt, completion, tutor } = await runTurn({ session: { currentStepIndex: 1 }, history: earlier });
        expect(prompt).toContain('step 2 of 3 ("Formal definition")');
        expect(prompt).toContain('do not move on');
        expect(prompt).toContain('2. Formal definition - Epsilon-delta.  <-- CURRENT STEP');
        expect(completion.currentStepIndex).toBe(1);
        expect(tutor.response.stepIndex).toBe(1);
      });

      it('moves to the next step only when the student asks to continue', async () => {
        const { prompt, completion, tutor } = await runTurn({ session: { currentStepIndex: 0 }, history: earlier, action: 'CONTINUE' });
        expect(prompt).toContain('ready to move on');
        expect(prompt).toContain('step 2 of 3 ("Formal definition")');
        expect(prompt).not.toContain('final step.');
        expect(completion.currentStepIndex).toBe(1);
        expect(tutor.response.stepIndex).toBe(1);
      });

      it('flags the last step as final', async () => {
        const { prompt, completion } = await runTurn({ session: { currentStepIndex: 1 }, history: earlier, action: 'CONTINUE' });
        expect(prompt).toContain('step 3 of 3 ("Computing limits")');
        expect(prompt).toContain('This is the final step.');
        expect(completion.currentStepIndex).toBe(2);
      });

      it('wraps up, without inventing a new step, when the student continues past the end', async () => {
        const { prompt, completion, tutor } = await runTurn({ session: { currentStepIndex: 2 }, history: earlier, action: 'CONTINUE' });
        expect(prompt).toContain('finished the final step');
        expect(prompt).toContain('Do not introduce new steps');
        expect(completion.currentStepIndex).toBe(2);
        expect(tutor.response.stepIndex).toBe(2);
      });

      it('leaves conversation-mode lessons and lessons with no plan exactly as they were', async () => {
        for (const session of [{ mode: 'CONVERSATION' }, { outline: null }]) {
          db = undefined as any; // fresh mocks for each lesson
          (service as any).db = db = {
            classroomSession: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
            classroomDocument: { findMany: jest.fn() }, classroomTurnRequest: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
            classroomTurn: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() }, user: { findUnique: jest.fn() }, $queryRaw: jest.fn(), $transaction: jest.fn((fn: any) => fn(db)),
          };
          const { prompt, completion } = await runTurn({ session, history: earlier, action: 'CONTINUE' });
          expect(prompt).not.toContain('Lesson plan');
          expect(completion).not.toHaveProperty('currentStepIndex');
        }
      });
    });

    it('tells the model about the plan and asks it to label each step\'s origin', () => {
      const plan = { objectives: ['Define a limit'], outline: threeSteps.slice(0, 2), stepIndex: 1, phase: 'ASK' };
      const prompt = (service as any).buildTutorPrompt('why?', [], [], [], plan);
      expect(prompt).toContain('2. Formal definition - Epsilon-delta.  <-- CURRENT STEP');
      expect(prompt).toContain('"origin":"SOURCE"|"SIMPLIFIED"|"EXTRA"');
      expect(prompt).not.toContain('<-- CURRENT STEP\n1.');
      expect((service as any).buildTutorPrompt('why?', [])).not.toContain('Lesson plan');
    });

    it('treats CONTINUE as a different request from ASK for the same idempotency key', async () => {
      const askHash = createHash('sha256').update(JSON.stringify({ message: 'next', documentIds: [] })).digest('hex');
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.classroomSession.findFirst.mockResolvedValue(lessonRow());
      db.classroomTurnRequest.findUnique.mockResolvedValue({ id: 'request-a', requestHash: askHash, status: ClassroomTurnRequestStatus.COMPLETED });
      db.classroomTurnRequest.findFirst.mockResolvedValue({ id: 'request-a', status: 'COMPLETED', turns: [] });
      await expect(service.createTurn('user-a', 'session-a', { message: 'next', idempotencyKey: 'request-key-123', action: 'CONTINUE' })).rejects.toBeInstanceOf(ConflictException);
      await expect(service.createTurn('user-a', 'session-a', { message: 'next', idempotencyKey: 'request-key-123', action: 'ASK' })).resolves.toMatchObject({ request: { status: 'COMPLETED' } });
      expect(ai.generate).not.toHaveBeenCalled();
    });
  });

  describe('failed tutor responses', () => {
    const arrange = (generate: () => Promise<any>) => {
      const createdAt = new Date('2026-11-14T10:00:00Z');
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.classroomSession.findFirst.mockResolvedValue({ id: 'session-a', userId: 'user-a', status: 'ACTIVE', activeTurnRequestId: null, turnLeaseExpiresAt: null, turnLeaseVersion: 0, nextTurnSequence: 0 });
      db.classroomTurnRequest.findUnique.mockResolvedValue(null);
      db.classroomTurnRequest.create.mockImplementation(async ({ data }: any) => ({ ...data, createdAt }));
      db.classroomTurnRequest.updateMany.mockResolvedValue({ count: 1 });
      db.classroomDocument.findMany.mockResolvedValue([]);
      db.$queryRaw.mockResolvedValue([{ id: 'usage' }]);
      ai.generate.mockImplementation(generate);
    };
    const textOf = (arg: any) => (Array.isArray(arg) ? arg : arg.strings).join('');
    const refunds = () => db.$queryRaw.mock.calls.filter(([parts]: [any]) => textOf(parts).includes('GREATEST("turnsUsed" - 1, 0)'));

    it('refunds the daily turn when the provider chain is exhausted and does not store the apology as an answer', async () => {
      arrange(async () => ({ text: "I'm not confident enough in an answer right now", isUncertain: true, providerUsed: 'none', modelUsed: 'none' }));
      await expect(service.createTurn('user-a', 'session-a', { message: 'Explain limits', idempotencyKey: 'turn-key-123456' })).rejects.toThrow();
      expect(refunds()).toHaveLength(1);
      expect(refunds()[0][2]).toEqual(new Date(Date.UTC(2026, 10, 14)));
      expect(db.classroomTurn.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'TUTOR' }) }));
    });

    it('does not refund twice when the request was already moved out of PROCESSING', async () => {
      arrange(async () => { throw new Error('provider down'); });
      db.classroomTurnRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.createTurn('user-a', 'session-a', { message: 'Explain limits', idempotencyKey: 'turn-key-123456' })).rejects.toThrow();
      expect(refunds()).toHaveLength(0);
    });
  });

  it('rejects new turns, uploads and links on an archived lesson', async () => {
    db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
    db.classroomSession.findFirst.mockResolvedValue({ id: 'session-a', userId: 'user-a', status: 'ARCHIVED', activeTurnRequestId: null, turnLeaseExpiresAt: null, turnLeaseVersion: 0, nextTurnSequence: 0 });
    db.classroomTurnRequest.findUnique.mockResolvedValue(null);
    await expect(service.createTurn('user-a', 'session-a', { message: 'Explain limits', idempotencyKey: 'turn-key-123456' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.uploadDocument('user-a', 'session-a', { mimetype: 'text/plain', size: 10, originalname: 'a.txt', buffer: Buffer.alloc(10) } as any)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.linkMaterial('user-a', 'session-a', { materialId: '00000000-0000-4000-8000-000000000000' })).rejects.toBeInstanceOf(ConflictException);
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('keeps long documents beyond the old 12,000 character cap and flags the cut when it still applies', async () => {
    db.classroomDocument.findUnique.mockResolvedValue({ id: 'doc-a', status: 'READY' });
    const long = 'Integration by substitution lets you change variables. '.repeat(1000); // ~55,000 chars
    const saved = await (service as any).saveExtracted('doc-a', long, 'PDF_TEXT_LAYER');
    expect(db.classroomDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ extractedChars: long.trim().length }) }));
    expect(saved).not.toHaveProperty('truncated');
    const cut = await (service as any).saveExtracted('doc-a', 'x'.repeat(150_000), 'TEXT');
    expect(cut).toMatchObject({ truncated: true });
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