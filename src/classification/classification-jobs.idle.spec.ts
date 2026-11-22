jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../upload/upload.service', () => ({ UploadService: class {} }));
jest.mock('./services/classification.service', () => ({ ClassificationService: class {} }));

import { ClassificationJobsService } from './classification-jobs.service';

function build(claimed: unknown[] = [], nextRow: { next: Date | null } = { next: null }) {
  const queryRaw = jest.fn().mockResolvedValue([nextRow]);
  const prisma: any = {
    $queryRaw: queryRaw,
    // claimNextItem runs inside $transaction: hand it a tx whose $queryRaw returns the claimed rows
    $transaction: jest.fn(async (fn: any) => fn({ $queryRaw: jest.fn().mockResolvedValue(claimed), classificationJob: { update: jest.fn() } })),
  };
  const svc = new ClassificationJobsService(prisma, {} as any, {} as any);
  jest.spyOn(svc as any, 'processItem').mockResolvedValue(undefined);
  return { svc, prisma, queryRaw };
}

describe('classification worker idling (lets the database sleep)', () => {
  it('checks once after start, then makes no database calls while the queue is empty', async () => {
    const { svc, prisma } = build([]);
    await svc.pollQueue();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 50; i++) await svc.pollQueue();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1); // the single "when is the next work" lookup
  });

  it('wake() resumes polling', async () => {
    const { svc, prisma } = build([]);
    await svc.pollQueue();
    svc.wake();
    await svc.pollQueue();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('stays awake while it has an item, and goes idle after the queue drains', async () => {
    const { svc, prisma } = build([{ id: 'i', jobId: 'j', materialId: 'm', attempts: 1 }]);
    await svc.pollQueue();
    expect((svc as any).awake).toBe(true);
    expect((svc as any).processItem).toHaveBeenCalledTimes(1);
    prisma.$transaction.mockImplementation(async (fn: any) => fn({ $queryRaw: jest.fn().mockResolvedValue([]), classificationJob: { update: jest.fn() } }));
    await svc.pollQueue();
    expect((svc as any).awake).toBe(false);
  });

  it('sleeps until a retry becomes available, then polls again', async () => {
    const retryAt = new Date(Date.now() + 30_000);
    const { svc, prisma } = build([], { next: retryAt });
    await svc.pollQueue();
    expect((svc as any).wakeAt).toBe(retryAt.getTime());
    await svc.pollQueue(); // still before retryAt
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    (svc as any).wakeAt = Date.now() - 1; // retry time has passed
    await svc.pollQueue();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('never sleeps forever when work is pending: a stale lease is reclaimed on schedule', async () => {
    const lease = new Date(Date.now() + 600_000);
    const { svc } = build([], { next: lease });
    await svc.pollQueue();
    expect((svc as any).wakeAt).toBe(lease.getTime());
  });
});
