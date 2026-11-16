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
    // The board pass is a second model call; the tests below that count provider calls run without it.
    process.env.CLASSROOM_BOARD_PASS = 'off';
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

  describe('whiteboard events', () => {
    const lessonJson = JSON.stringify({ summary: 'Limits in brief.', steps: [{ title: 'Definition', explanation: 'A limit is a target value $$L$$.', origin: 'EXTRA', sourceNumbers: [] }], examples: [], followUpQuestion: 'What is L?', sourceNumbers: [] });
    const boardJson = JSON.stringify({ blocks: [{ kind: 'TABLE', headers: ['x', 'f(x)'], rows: [['1', '2']] }, { kind: 'HTML', html: '<script>x</script>' }] });
    const reply = (text: string) => ({ text, isUncertain: false, providerUsed: 'claude', modelUsed: 'm' });
    const lesson = { schemaVersion: 2, summary: 's', stepIndex: null, steps: [{ id: 'step-1', title: 'T', explanation: 'E', origin: 'EXTRA', sources: [] }], examples: [], followUpQuestion: null, sources: [] };
    const pass = (l: any = lesson) => (service as any).boardPass(l, { stepTitle: 'Definition', topic: 'Limits' });

    it('is skipped by the kill switch and when there is nothing to draw', async () => {
      expect(await pass()).toEqual([]);
      process.env.CLASSROOM_BOARD_PASS = 'on';
      expect(await pass({ ...lesson, steps: [], examples: [] })).toEqual([]);
      expect(ai.generate).not.toHaveBeenCalled();
    });

    it('returns only validated blocks from the model', async () => {
      process.env.CLASSROOM_BOARD_PASS = 'on';
      ai.generate.mockResolvedValue(reply(boardJson));
      expect(await pass()).toEqual([{ kind: 'TABLE', headers: ['x', 'f(x)'], rows: [['1', '2']] }]);
      expect(ai.generate).toHaveBeenCalledTimes(1);
      expect(ai.generate.mock.calls[0][0]).toContain('Limits');
    });

    it('keeps the lesson when the provider fails, reports no provider or returns junk', async () => {
      process.env.CLASSROOM_BOARD_PASS = 'on';
      ai.generate.mockRejectedValueOnce(new Error('boom'));
      expect(await pass()).toEqual([]);
      ai.generate.mockResolvedValueOnce({ ...reply('sorry'), providerUsed: 'none' });
      expect(await pass()).toEqual([]);
      ai.generate.mockResolvedValueOnce(reply('not json at all'));
      expect(await pass()).toEqual([]);
    });

    it('gives up after the time limit instead of holding the turn', async () => {
      process.env.CLASSROOM_BOARD_PASS = 'on';
      jest.useFakeTimers();
      try {
        ai.generate.mockReturnValue(new Promise(() => undefined));
        const result = pass();
        await jest.advanceTimersByTimeAsync(20_000);
        expect(await result).toEqual([]);
      } finally {
        jest.useRealTimers();
      }
    });

    it('stores additive events on the tutor turn and leaves schemaVersion at 2', async () => {
      process.env.CLASSROOM_BOARD_PASS = 'on';
      let requestId = '';
      const session = { id: 'session-a', userId: 'user-a', status: 'ACTIVE', activeTurnRequestId: null, turnLeaseExpiresAt: null, turnLeaseVersion: 0, nextTurnSequence: 0 };
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.classroomSession.findFirst.mockImplementation(async () => (requestId ? { ...session, activeTurnRequestId: requestId, turnLeaseVersion: 1, nextTurnSequence: 1 } : session));
      db.classroomTurnRequest.findUnique.mockResolvedValue(null);
      db.classroomTurnRequest.create.mockImplementation(async ({ data }: any) => { requestId = data.id; return { ...data, createdAt: new Date() }; });
      db.classroomDocument.findMany.mockResolvedValue([]);
      db.classroomTurnRequest.findFirst.mockResolvedValue({ id: 'r', status: 'COMPLETED', turns: [] });
      db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'usage' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      ai.generate.mockResolvedValueOnce(reply(lessonJson)).mockResolvedValueOnce(reply(boardJson));
      await service.createTurn('user-a', 'session-a', { message: 'Explain limits', idempotencyKey: 'turn-key-123456' });
      expect(ai.generate).toHaveBeenCalledTimes(2);
      const tutor = db.classroomTurn.create.mock.calls.map(([arg]: any) => arg.data).find((data: any) => data.role === 'TUTOR');
      expect(tutor.response.schemaVersion).toBe(2);
      expect(tutor.response.eventsVersion).toBe(1);
      expect(tutor.response.events.map((e: any) => e.type)).toEqual(expect.arrayContaining(['BOARD_PAGE', 'SAY', 'BOARD_BLOCK', 'CHECK']));
      expect(tutor.response.events.filter((e: any) => e.type === 'BOARD_BLOCK').map((e: any) => e.block.kind)).toEqual(['FORMULA', 'TABLE']);
    });
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

  describe('retrieval for taught steps (C1)', () => {
    const row = (documentId: string, chunkIndex: number, text = 'x') => ({ documentId, chunkIndex, text, title: `${documentId}.pdf` });
    const plan = { objectives: ['Define a limit', 'Use limit laws'], outline: [{ id: 'step-1', title: 'Intuition', summary: 'Approaching a value.' }, { id: 'step-2', title: 'Formal definition', summary: 'Epsilon-delta.' }], stepIndex: 1 };

    it('searches by the current step while a lesson plan runs, because "continue" says nothing about the content', () => {
      const query = (phase: string, message = 'Continue to the next step.') => (service as any).retrievalQuery(message, 'Limits', { ...plan, phase });
      expect(query('ADVANCE')).toBe('Formal definition Limits Epsilon-delta.');
      expect(query('OPEN')).toContain('Formal definition');
      expect(query('ADVANCE')).not.toContain('Continue');
      expect(query('FINISH')).toBe('Limits Define a limit Use limit laws');
    });

    it('adds the student\'s own words to the step title when they ask a question', () => {
      expect((service as any).retrievalQuery('why does delta depend on epsilon', 'Limits', { ...plan, phase: 'ASK' })).toBe('Formal definition why does delta depend on epsilon');
    });

    it('uses the message alone when the lesson has no plan', () => {
      expect((service as any).retrievalQuery('Explain energy transfer', 'Energy', null)).toBe('Explain energy transfer');
    });

    it('takes the best excerpt of every document before filling up with the next best overall', () => {
      const ranked = [row('a', 0), row('a', 1), row('a', 2), row('a', 3), row('a', 4), row('b', 7), row('c', 2)];
      const picked = (service as any).spreadAcrossDocuments(ranked, 5);
      expect(picked).toHaveLength(5);
      expect(picked.map((r: any) => r.documentId)).toEqual(['a', 'b', 'c', 'a', 'a']);
      expect(picked.some((r: any) => r.documentId === 'b' && r.chunkIndex === 7)).toBe(true);
    });

    it('returns matching excerpts spread across the documents', async () => {
      db.$queryRaw.mockResolvedValueOnce([row('a', 0), row('a', 1), row('a', 2), row('a', 3), row('a', 4), row('b', 9)]);
      const found = await (service as any).searchChunks('user-a', 'session-a', [], 'epsilon delta definition');
      expect(found.notCovered).toBe(false);
      expect(found.chunks.some((r: any) => r.documentId === 'b')).toBe(true);
      expect(found.chunks.length).toBeLessThanOrEqual(5);
    });

    it('limits how many candidates one document can contribute, so a long file cannot crowd out the rest', async () => {
      db.$queryRaw.mockResolvedValueOnce([row('a', 0)]);
      await (service as any).searchChunks('user-a', 'session-a', [], 'epsilon delta definition');
      const call = db.$queryRaw.mock.calls[0][0];
      const sql = call.strings.join('');
      expect(sql).toContain('row_number() OVER (PARTITION BY c."documentId"');
      expect(sql).toContain('WHERE "position" <=');
      expect(call.values).toContain(3);
    });

    it('says the notes do not cover it, and withholds unrelated excerpts, when real search terms match nothing', async () => {
      db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([row('a', 0, 'Introduction to the course')]);
      const found = await (service as any).searchChunks('user-a', 'session-a', [], 'quantum entanglement');
      expect(found).toEqual({ chunks: [], notCovered: true });
    });

    it('still hands over the opening of the documents for a question with no searchable words', async () => {
      db.$queryRaw.mockResolvedValueOnce([row('a', 0, 'Introduction to the course')]);
      const found = await (service as any).searchChunks('user-a', 'session-a', [], 'what is this about');
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
      expect(found.notCovered).toBe(false);
      expect(found.chunks).toHaveLength(1);
    });

    it('does not claim the notes miss a topic when there are no readable documents at all', async () => {
      db.$queryRaw.mockResolvedValue([]);
      expect(await (service as any).searchChunks('user-a', 'session-a', [], 'quantum entanglement')).toEqual({ chunks: [], notCovered: false });
    });

    it('samples each document evenly from start to end and ignores malformed rows', () => {
      const rows = Array.from({ length: 40 }, (_, i) => row('a', i, `part ${i} ${'word '.repeat(80)}`));
      const map = (service as any).sampleMap([...rows, { id: 'usage' }, null, { documentId: 'a', chunkIndex: 'x', text: 't', title: 'a.pdf' }]);
      expect(map.length).toBeLessThanOrEqual(24);
      expect(map.length).toBeGreaterThan(5);
      expect(map[0].chunkIndex).toBe(0);
      expect(map[map.length - 1].chunkIndex).toBeGreaterThan(30);
      expect(map.every((m: any) => m.text.length <= 200)).toBe(true);
      expect(map.map((m: any) => m.chunkIndex)).toEqual([...map.map((m: any) => m.chunkIndex)].sort((x: number, y: number) => x - y));
    });

    it('gives every document a share of the map', () => {
      const rows = [...Array.from({ length: 30 }, (_, i) => row('a', i)), ...Array.from({ length: 30 }, (_, i) => row('b', i))];
      const map = (service as any).sampleMap(rows);
      for (const title of ['a.pdf', 'b.pdf']) expect(map.filter((m: any) => m.title === title).length).toBeGreaterThanOrEqual(3);
    });

    it('returns an empty map when nothing usable comes back', () => {
      expect((service as any).sampleMap([])).toEqual([]);
      expect((service as any).sampleMap([{ id: 'usage' }])).toEqual([]);
    });

    it('reads the map from ready documents of this classroom only', async () => {
      db.$queryRaw.mockResolvedValueOnce([row('a', 0, 'Chapter one')]);
      const map = await (service as any).documentMap('user-a', 'session-a');
      const sql = db.$queryRaw.mock.calls[0][0].strings.join('');
      expect(sql).toContain(`d."status" = 'READY'`);
      expect(sql).toContain('d."sessionId" =');
      expect(db.$queryRaw.mock.calls[0][0].values).toEqual(expect.arrayContaining(['session-a', 'user-a']));
      expect(map).toEqual([{ title: 'a.pdf', chunkIndex: 0, heading: null, text: 'Chapter one' }]);
    });

    it('tells the tutor to teach from general knowledge and label the step as beyond the notes when nothing matched', () => {
      const prompt = (service as any).buildTutorPrompt('Continue to the next step.', [], [], [], { ...plan, phase: 'ADVANCE' }, true);
      expect(prompt).toContain('no passage matches this step');
      expect(prompt).toContain('"EXTRA"');
      expect(prompt).toContain('not in their notes');
      expect(prompt).not.toContain('Untrusted UniLib document excerpts');
    });

    it('keeps the normal wording when the notes did match', () => {
      const prompt = (service as any).buildTutorPrompt('q', [{ title: 'n.pdf', text: 'epsilon' }], [], [], null, false);
      expect(prompt).toContain('[1] (n.pdf) epsilon');
      expect(prompt).not.toContain('no passage matches');
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

    it('plans from a map of the whole document as well as the passages that match the topic', async () => {
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.$queryRaw.mockResolvedValue([{ id: 'usage' }]);
      aiReturns(planJson);
      jest.spyOn(service as any, 'retrieveChunks').mockResolvedValue([]);
      const map = jest.spyOn(service as any, 'documentMap').mockResolvedValue([{ title: 'notes.pdf', chunkIndex: 3, text: 'Chapter 4 limit laws' }]);
      db.classroomSession.findFirst.mockResolvedValue(lessonRow({ sourceMode: 'UPLOADED' }));
      await service.generatePlan('user-a', 'session-a');
      expect(map).toHaveBeenCalledWith('user-a', 'session-a');
      const prompt = ai.generate.mock.calls[0][0] as string;
      expect(prompt).toContain('Document map');
      expect(prompt).toContain('- (notes.pdf, part 4) Chapter 4 limit laws');
      expect(prompt).toContain('in the order they cover it');
    });

    it('does not build a document map for a general-knowledge lesson', async () => {
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      db.$queryRaw.mockResolvedValue([{ id: 'usage' }]);
      aiReturns(planJson);
      const map = jest.spyOn(service as any, 'documentMap');
      db.classroomSession.findFirst.mockResolvedValue(lessonRow({ sourceMode: 'GENERAL' }));
      await service.generatePlan('user-a', 'session-a');
      expect(map).not.toHaveBeenCalled();
      expect(ai.generate.mock.calls[0][0]).not.toContain('Document map');
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

      it('searches by the step being taught, not by the words "continue to the next step"', async () => {
        const search = jest.spyOn(service as any, 'searchChunks').mockResolvedValue({ chunks: [], notCovered: false });
        await runTurn({ session: { currentStepIndex: 0 }, history: earlier, action: 'CONTINUE' });
        const query = search.mock.calls[0][3] as string;
        expect(query).toContain('Formal definition');
        expect(query).toContain('Epsilon-delta.');
        expect(query).not.toContain('next please');
      });

      it('searches by the current step plus the question when the student asks something', async () => {
        const search = jest.spyOn(service as any, 'searchChunks').mockResolvedValue({ chunks: [], notCovered: false });
        await runTurn({ session: { currentStepIndex: 1 }, history: earlier });
        expect(search.mock.calls[0][3]).toBe('Formal definition next please');
      });

      it('searches the whole classroom by the message alone for lessons without a plan', async () => {
        const search = jest.spyOn(service as any, 'searchChunks').mockResolvedValue({ chunks: [], notCovered: false });
        await runTurn({ session: { mode: 'CONVERSATION', outline: null, objectives: null }, history: earlier });
        expect(search.mock.calls[0][3]).toBe('next please');
      });

      it('tells the tutor when the notes do not cover the step being taught', async () => {
        jest.spyOn(service as any, 'searchChunks').mockResolvedValue({ chunks: [], notCovered: true });
        const { prompt } = await runTurn({ session: { currentStepIndex: 0 }, history: earlier, action: 'CONTINUE' });
        expect(prompt).toContain('no passage matches this step');
        expect(prompt).toContain('"EXTRA"');
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

  describe('document structure (C2)', () => {
    const headed = `# Limits\n${'Limits are the idea of approaching a value. '.repeat(40)}\n\n# Derivatives\n${'A derivative measures the rate of change. '.repeat(40)}`;

    it('stores the heading of each chunk and the length of the document before any cut', async () => {
      db.classroomDocument.findUnique.mockResolvedValue({ id: 'doc-a', status: 'READY' });
      await (service as any).saveExtracted('doc-a', headed, 'PDF_TEXT_LAYER');
      const rows = db.classroomDocumentChunk.createMany.mock.calls[0][0].data;
      expect([...new Set(rows.map((r: any) => r.heading))]).toEqual(['Limits', 'Derivatives']);
      expect(rows.map((r: any) => r.chunkIndex)).toEqual(rows.map((_: any, i: number) => i));
      expect(db.classroomDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ extractedChars: headed.trim().length, totalChars: headed.trim().length }) }));
    });

    it('stores no heading for a document without any', async () => {
      db.classroomDocument.findUnique.mockResolvedValue({ id: 'doc-a', status: 'READY' });
      await (service as any).saveExtracted('doc-a', 'plain lecture words and nothing else. '.repeat(10), 'TEXT');
      expect(db.classroomDocumentChunk.createMany.mock.calls[0][0].data.every((r: any) => r.heading === null)).toBe(true);
    });

    it('records the full length and flags the cut when a limit applies', async () => {
      db.classroomDocument.findUnique.mockResolvedValue({ id: 'doc-a', status: 'READY' });
      const saved = await (service as any).saveExtracted('doc-a', 'x '.repeat(25_000), 'TEXT', 20_000);
      expect(db.classroomDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ extractedChars: 20_000, totalChars: 49_999 }) }));
      expect(saved).toMatchObject({ truncated: true });
    });

    it('reports a cut from the real lengths, and falls back to the old cap for documents saved before totalChars existed', async () => {
      db.classroomSession.findFirst.mockResolvedValue({ id: 'session-a', userId: 'user-a', status: 'ACTIVE' });
      db.classroomDocument.findMany.mockResolvedValue([
        { id: 'exact', extractedChars: 100_000, totalChars: 100_000 },
        { id: 'cut', extractedChars: 100_000, totalChars: 340_000 },
        { id: 'legacy-cut', extractedChars: 100_000, totalChars: null },
        { id: 'legacy-short', extractedChars: 5_000, totalChars: null },
        { id: 'pending', extractedChars: null, totalChars: null },
      ]);
      const docs = await service.listDocuments('user-a', 'session-a');
      expect(docs.map((d: any) => [d.id, d.truncated])).toEqual([['exact', false], ['cut', true], ['legacy-cut', true], ['legacy-short', false], ['pending', false]]);
      expect(docs[1]).toMatchObject({ totalChars: 340_000 });
      expect(db.classroomDocument.findMany.mock.calls[0][0].select).toMatchObject({ totalChars: true });
    });

    describe('premium text limit', () => {
      const limitFor = async (user: any) => { db.user.findUnique.mockResolvedValue(user); return (service as any).textLimit('user-a'); };
      afterEach(() => { delete process.env.CLASSROOM_PREMIUM_MAX_EXTRACTED_CHARS; });

      it('keeps the normal cap for free users, even when a premium cap is configured', async () => {
        process.env.CLASSROOM_PREMIUM_MAX_EXTRACTED_CHARS = '300000';
        expect(await limitFor({ isPremium: false, premiumUntil: null })).toBe(100_000);
      });

      it('gives active premium users the configured cap', async () => {
        process.env.CLASSROOM_PREMIUM_MAX_EXTRACTED_CHARS = '300000';
        expect(await limitFor({ isPremium: true, premiumUntil: null })).toBe(300_000);
        expect(await limitFor({ isPremium: true, premiumUntil: new Date(Date.now() + 86_400_000) })).toBe(300_000);
      });

      it('treats an expired premium plan as free', async () => {
        process.env.CLASSROOM_PREMIUM_MAX_EXTRACTED_CHARS = '300000';
        expect(await limitFor({ isPremium: true, premiumUntil: new Date(Date.now() - 1000) })).toBe(100_000);
      });

      it('falls back to the normal cap when nothing valid is configured', async () => {
        expect(await limitFor({ isPremium: true, premiumUntil: null })).toBe(100_000);
        process.env.CLASSROOM_PREMIUM_MAX_EXTRACTED_CHARS = '500';
        expect(await limitFor({ isPremium: true, premiumUntil: null })).toBe(100_000);
        process.env.CLASSROOM_PREMIUM_MAX_EXTRACTED_CHARS = 'lots';
        expect(await limitFor({ isPremium: true, premiumUntil: null })).toBe(100_000);
      });

      it('does not fail when the user record is missing', async () => {
        expect(await limitFor(null)).toBe(100_000);
      });
    });

    it('matches search terms against section headings as well as the text', async () => {
      db.$queryRaw.mockResolvedValueOnce([{ documentId: 'a', chunkIndex: 0, text: 'body', title: 'a.pdf', heading: 'Limit laws' }]);
      const found = await (service as any).searchChunks('user-a', 'session-a', [], 'limit laws');
      const sql = db.$queryRaw.mock.calls[0][0].strings.join('');
      expect(sql).toContain(`coalesce(c."heading", '')`);
      expect(sql).toContain('c."heading"');
      expect(found.chunks[0].heading).toBe('Limit laws');
    });

    it('maps a document with real headings by its sections, in order, like a contents page', () => {
      const row = (chunkIndex: number, heading: string | null) => ({ documentId: 'a', title: 'a.pdf', chunkIndex, heading, text: `text ${chunkIndex}` });
      const rows = [row(0, 'Limits'), row(1, 'Limits'), row(2, 'Limits'), row(3, 'Continuity'), row(4, 'Continuity'), row(5, 'Derivatives'), row(6, 'Derivatives'), row(7, 'Integrals')];
      const map = (service as any).sampleMap(rows);
      expect(map.map((m: any) => m.heading)).toEqual(['Limits', 'Continuity', 'Derivatives', 'Integrals']);
      expect(map.map((m: any) => m.chunkIndex)).toEqual([0, 3, 5, 7]);
    });

    it('maps by samples when a document has fewer than three distinct headings', () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({ documentId: 'a', title: 'a.pdf', chunkIndex: i, heading: i < 5 ? 'Only' : null, text: `text ${i}` }));
      const map = (service as any).sampleMap(rows);
      expect(map).toHaveLength(10);
    });

    it('shows section names in the plan map and in the excerpts the tutor sees', () => {
      const plan = (service as any).buildPlanPrompt('Limits', [{ title: 'n.pdf', text: 'epsilon', heading: 'Limit laws' }], [{ title: 'n.pdf', chunkIndex: 3, heading: 'Limit laws', text: 'sum rule' }, { title: 'n.pdf', chunkIndex: 9, heading: null, text: 'misc' }]);
      expect(plan).toContain('[1] (n.pdf, Limit laws) epsilon');
      expect(plan).toContain('- (n.pdf, Limit laws) sum rule');
      expect(plan).toContain('- (n.pdf, part 10) misc');
      const tutor = (service as any).buildTutorPrompt('q', [{ title: 'n.pdf', text: 'epsilon', heading: 'Limit laws' }, { title: 'n.pdf', text: 'plain' }]);
      expect(tutor).toContain('[1] (n.pdf, Limit laws) epsilon');
      expect(tutor).toContain('[2] (n.pdf) plain');
    });

    it('lets a cited step carry the section it came from', () => {
      const chunks = [{ documentId: 'doc-a', title: 'notes.pdf', chunkIndex: 4, heading: 'Limit laws' }, { documentId: 'doc-a', title: 'notes.pdf', chunkIndex: 5 }];
      const lesson = (service as any).parseLesson(JSON.stringify({ summary: 's', examples: [], steps: [{ title: 'a', explanation: 'e', origin: 'SOURCE', sourceNumbers: [1, 2] }] }), chunks);
      expect(lesson.steps[0].sources).toEqual([
        { documentId: 'doc-a', title: 'notes.pdf', heading: 'Limit laws', chunkIndex: 4 },
        { documentId: 'doc-a', title: 'notes.pdf', chunkIndex: 5 },
      ]);
    });
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