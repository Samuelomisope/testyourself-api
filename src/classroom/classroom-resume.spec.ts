import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClassroomService, presentResume } from './classroom.service';

jest.mock('../classification/services/text-extraction.service', () => ({ TextExtractionService: class TextExtractionService {} }));

describe('presentResume', () => {
  const at = new Date('2026-11-18T10:00:00.000Z');
  it('returns the saved position with the server time', () => {
    expect(presentResume({ v: 1, stepIndex: 2, eventId: 'e7', boardPage: 3 }, at)).toEqual({ stepIndex: 2, eventId: 'e7', boardPage: 3, updatedAt: at.toISOString() });
  });
  it('is null when nothing is saved or the value is not ours', () => {
    expect(presentResume(null, null)).toBeNull();
    expect(presentResume({ v: 1, stepIndex: 2 }, null)).toBeNull();
    expect(presentResume({ v: 2, stepIndex: 2 }, at)).toBeNull();
    expect(presentResume({ v: 1, stepIndex: -1 }, at)).toBeNull();
    expect(presentResume('junk', at)).toBeNull();
  });
  it('drops a stored event id or page that is out of shape instead of passing it on', () => {
    expect(presentResume({ v: 1, stepIndex: 0, eventId: '<b>x</b>', boardPage: 500 }, at)).toEqual({ stepIndex: 0, eventId: null, boardPage: 0, updatedAt: at.toISOString() });
  });
});

describe('ClassroomService resume', () => {
  let service: ClassroomService;
  let db: any;
  beforeEach(() => {
    db = { classroomSession: { findFirst: jest.fn(), updateMany: jest.fn() } };
    service = new ClassroomService(db, {} as any, {} as any, {} as any);
  });

  it('saves a valid position for the owner and stamps the time on the server', async () => {
    db.classroomSession.findFirst.mockResolvedValue({ outline: [{}, {}, {}] });
    await service.saveResume('u1', 's1', { stepIndex: 2, eventId: 'e4', boardPage: 1 });
    expect(db.classroomSession.findFirst.mock.calls[0][0].where).toMatchObject({ id: 's1', userId: 'u1' });
    const call = db.classroomSession.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 's1', userId: 'u1' });
    expect(call.data.resumePosition).toEqual({ v: 1, stepIndex: 2, eventId: 'e4', boardPage: 1 });
    expect(call.data.resumeUpdatedAt).toBeInstanceOf(Date);
  });
  it('refuses a step that is not in the lesson', async () => {
    db.classroomSession.findFirst.mockResolvedValue({ outline: [{}, {}] });
    await expect(service.saveResume('u1', 's1', { stepIndex: 2 })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.classroomSession.updateMany).not.toHaveBeenCalled();
  });
  it('accepts step 0 for a lesson with no plan', async () => {
    db.classroomSession.findFirst.mockResolvedValue({ outline: null });
    await service.saveResume('u1', 's1', { stepIndex: 0 });
    expect(db.classroomSession.updateMany.mock.calls[0][0].data.resumePosition).toEqual({ v: 1, stepIndex: 0, eventId: null, boardPage: 0 });
  });
  it("does not save into someone else's or a deleted session", async () => {
    db.classroomSession.findFirst.mockResolvedValue(null);
    await expect(service.saveResume('u2', 's1', { stepIndex: 0 })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.classroomSession.updateMany).not.toHaveBeenCalled();
  });
  it('getSession returns resume without the raw columns', async () => {
    db.classroomSession.findFirst.mockResolvedValue({ id: 's1', resumePosition: { v: 1, stepIndex: 1, eventId: null, boardPage: 0 }, resumeUpdatedAt: new Date('2026-11-18T10:00:00Z') });
    const out: any = await service.getSession('u1', 's1');
    expect(out.resume.stepIndex).toBe(1);
    expect(out.resumePosition).toBeUndefined();
    expect(out.resumeUpdatedAt).toBeUndefined();
  });
});
