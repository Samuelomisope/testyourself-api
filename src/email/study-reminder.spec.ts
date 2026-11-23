jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('resend', () => ({ Resend: class { emails = { send: jest.fn() }; } }));

import { JwtService } from '@nestjs/jwt';
import { BadRequestException } from '@nestjs/common';
import { dailyCap, rankCandidates, StudyReminderService } from './study-reminder.service';
import { signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token';
import { EmailController } from './email.controller';
import { studyReminderEmail, welcomeEmail } from './email-templates';

process.env.JWT_SECRET = 'test-secret';
const jwt = new JwtService({ secret: process.env.JWT_SECRET });

describe('unsubscribe token', () => {
  it('round-trips to the user id', () => {
    expect(verifyUnsubscribeToken(jwt, signUnsubscribeToken(jwt, 'u1'))).toBe('u1');
  });
  it('is not a login token: it fails verification with the normal login secret', () => {
    const token = signUnsubscribeToken(jwt, 'u1');
    expect(() => jwt.verify(token, { secret: process.env.JWT_SECRET })).toThrow();
  });
  it('a login token is not accepted as an unsubscribe token', () => {
    const access = jwt.sign({ sub: 'u1', email: 'a@b.c' }, { expiresIn: '15m' });
    expect(verifyUnsubscribeToken(jwt, access)).toBeNull();
  });
  it('rejects garbage and expired tokens', () => {
    expect(verifyUnsubscribeToken(jwt, 'nope')).toBeNull();
    const expired = jwt.sign({ sub: 'u1', purpose: 'unsubscribe-reminders' }, { secret: `${process.env.JWT_SECRET}:unsubscribe-reminders`, expiresIn: '-1s' });
    expect(verifyUnsubscribeToken(jwt, expired)).toBeNull();
  });
});

describe('EmailController.unsubscribe', () => {
  it('turns reminders off for the token owner only', async () => {
    const prisma: any = { user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await new EmailController(prisma, jwt).unsubscribe({ token: signUnsubscribeToken(jwt, 'u7') });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u7' }, data: { emailReminders: false } });
  });
  it('rejects a bad token without touching the database', async () => {
    const prisma: any = { user: { updateMany: jest.fn() } };
    await expect(new EmailController(prisma, jwt).unsubscribe({ token: 'bad' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(new EmailController(prisma, jwt).unsubscribe({} as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('ranking and cap', () => {
  it('puts the people with the most to do first', () => {
    const ranked = rankCandidates([
      { userId: 'a', planRemaining: 0, dueCards: 2 },
      { userId: 'b', planRemaining: 3, dueCards: 5 },
      { userId: 'c', planRemaining: 1, dueCards: 0 },
    ]);
    expect(ranked.map((c) => c.userId)).toEqual(['b', 'a', 'c']);
  });
  it('defaults to 80 and honours REMINDER_EMAIL_DAILY_CAP', () => {
    delete process.env.REMINDER_EMAIL_DAILY_CAP;
    expect(dailyCap()).toBe(80);
    process.env.REMINDER_EMAIL_DAILY_CAP = '25';
    expect(dailyCap()).toBe(25);
    process.env.REMINDER_EMAIL_DAILY_CAP = 'abc';
    expect(dailyCap()).toBe(80);
    delete process.env.REMINDER_EMAIL_DAILY_CAP;
  });
});

describe('StudyReminderService', () => {
  const now = new Date('2026-11-23T17:10:00Z');
  const day = (n: number) => new Date(now.getTime() - (n - 1) * 86_400_000);
  function build(opts: { plans?: any[]; due?: any[]; users?: any[] } = {}) {
    const prisma: any = {
      studyPlan: { findMany: jest.fn().mockResolvedValue(opts.plans ?? []) },
      flashcardProgress: { groupBy: jest.fn().mockResolvedValue(opts.due ?? []) },
      user: { findMany: jest.fn().mockResolvedValue(opts.users ?? []), findUnique: jest.fn(), update: jest.fn() },
    };
    const email: any = { sendStudyReminder: jest.fn().mockResolvedValue(undefined) };
    return { svc: new StudyReminderService(prisma, email, jwt), prisma, email };
  }

  it('counts only unfinished tasks of today and due cards, and makes no user query when nobody has work', async () => {
    const none = build({ plans: [{ userId: 'u1', subject: 'MEE', startDate: day(2), daysAvailable: 5, entries: [{ day: 2, tasks: ['a', 'b'] }], completedTasks: { '2': [0, 1] } }] });
    expect(await none.svc.findCandidates(now)).toEqual([]);
    expect(none.prisma.user.findMany).not.toHaveBeenCalled();

    const some = build({
      plans: [{ userId: 'u1', subject: 'MEE', startDate: day(2), daysAvailable: 5, entries: [{ day: 2, tasks: ['a', 'b', 'c'] }], completedTasks: { '2': [0] } }],
      due: [{ userId: 'u2', _count: { _all: 4 } }],
      users: [{ id: 'u1' }, { id: 'u2' }],
    });
    const c = await some.svc.findCandidates(now);
    expect(c).toEqual([
      { userId: 'u1', planSubject: 'MEE', planRemaining: 2, dueCards: 0 },
      { userId: 'u2', planRemaining: 0, dueCards: 4 },
    ]);
  });

  it('filters opted-out, banned, recently active and already-emailed users in the query', async () => {
    const { svc, prisma } = build({ due: [{ userId: 'u2', _count: { _all: 1 } }], users: [] });
    await svc.findCandidates(now);
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.emailReminders).toBe(true);
    expect(where.isBanned).toBe(false);
    expect(where.lastActiveAt.lt).toBeInstanceOf(Date);
    expect(where.OR).toHaveLength(2);
  });

  it('ignores plans outside their date range', async () => {
    const { svc } = build({ plans: [{ userId: 'u1', subject: 'X', startDate: day(9), daysAvailable: 5, entries: [{ day: 9, tasks: ['a'] }], completedTasks: null }] });
    expect(await svc.findCandidates(now)).toEqual([]);
  });

  it('records the send time before emailing, so a failure never causes a second email the same day', async () => {
    const { svc, prisma, email } = build();
    prisma.user.findUnique.mockResolvedValue({ email: 'a@b.c', displayName: 'Ada Obi' });
    const order: string[] = [];
    prisma.user.update.mockImplementation(async () => { order.push('record'); });
    email.sendStudyReminder.mockImplementation(async () => { order.push('send'); });
    expect(await (svc as any).sendOne({ userId: 'u1', planSubject: 'MEE', planRemaining: 2, dueCards: 3 }, now)).toBe(true);
    expect(order).toEqual(['record', 'send']);
    const arg = email.sendStudyReminder.mock.calls[0][1];
    expect(arg.unsubscribeUrl).toContain('https://unilib.com.ng/unsubscribe?token=');
    expect(arg.plan).toEqual({ subject: 'MEE', remaining: 2 });
  });

  it('a send failure is contained and reported as not sent', async () => {
    const { svc, prisma, email } = build();
    prisma.user.findUnique.mockResolvedValue({ email: 'a@b.c', displayName: 'Ada' });
    email.sendStudyReminder.mockRejectedValue(new Error('resend down'));
    expect(await (svc as any).sendOne({ userId: 'u1', planRemaining: 0, dueCards: 1 }, now)).toBe(false);
  });
});

describe('email content', () => {
  it('welcome email greets by first name and links to study materials', () => {
    const m = welcomeEmail('Ada Obi');
    expect(m.subject).toBe('Welcome to UniLib, Ada!');
    expect(m.html).toContain('https://unilib.com.ng/study-material');
    expect(m.text).toContain('Study Materials');
  });
  it('reminder lists what is waiting, links to the right page and carries the unsubscribe link in both versions', () => {
    const url = 'https://unilib.com.ng/unsubscribe?token=abc';
    const m = studyReminderEmail({ displayName: 'Ada', plan: { subject: 'MEE 301', remaining: 1 }, dueCards: 5, unsubscribeUrl: url });
    expect(m.html).toContain("1 task left in today&#39;s MEE 301 study plan");
    expect(m.html).toContain('5 flashcards due');
    expect(m.html).toContain(`href="${url}"`);
    expect(m.text).toContain(`Unsubscribe from study reminders: ${url}`);
    expect(m.html).toContain('https://unilib.com.ng/study-plan');
  });
  it('flashcards-only reminder links to flashcards and escapes the subject', () => {
    const m = studyReminderEmail({ displayName: null, plan: { subject: '<b>x</b>', remaining: 0 }, dueCards: 1, unsubscribeUrl: 'https://u' });
    expect(m.html).toContain('https://unilib.com.ng/flashcards');
    expect(m.html).not.toContain('<b>x</b>');
    expect(m.html).toContain('Hi there');
  });
});
