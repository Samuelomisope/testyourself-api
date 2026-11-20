jest.mock('uuid', () => ({ v4: () => 'test-id' }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudyMaterialService } from './study-material.service';

function build(overrides: Record<string, any> = {}) {
  const prisma: any = {
    studyMaterial: {
      findUnique: jest.fn().mockResolvedValue({ id: 'm1', userId: 'owner', isPublic: true, classificationStatus: 'CLASSIFIED' }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.studyMaterial,
    },
    materialReport: { upsert: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(1), ...overrides.materialReport },
  };
  const service = new StudyMaterialService(prisma);
  jest.spyOn(service, 'withSignedUrl').mockImplementation(async (m: any) => m);
  return { service, prisma };
}

describe('StudyMaterialService.report', () => {
  it('stores one report per student and does not flag a single report', async () => {
    const { service, prisma } = build();
    await expect(service.report('m1', 'u1', 'BROKEN_FILE', '  will not open ')).resolves.toEqual({ ok: true });
    expect(prisma.materialReport.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { materialId_userId: { materialId: 'm1', userId: 'u1' } },
      create: { materialId: 'm1', userId: 'u1', reason: 'BROKEN_FILE', note: 'will not open' },
    }));
    expect(prisma.studyMaterial.update).not.toHaveBeenCalled();
  });
  it('puts the material in the admin review list at 3 distinct reports', async () => {
    const { service, prisma } = build({ materialReport: { count: jest.fn().mockResolvedValue(3) } });
    await service.report('m1', 'u1', 'WRONG_COURSE', undefined);
    expect(prisma.studyMaterial.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { needsReview: true } });
  });
  it('rejects an invalid reason before touching the database', async () => {
    const { service, prisma } = build();
    await expect(service.report('m1', 'u1', 'SPAM', null)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.report('m1', 'u1', undefined, null)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.studyMaterial.findUnique).not.toHaveBeenCalled();
  });
  it('hides private materials of others and duplicates; blocks self-reports', async () => {
    const priv = build({ studyMaterial: { findUnique: jest.fn().mockResolvedValue({ id: 'm1', userId: 'owner', isPublic: false, classificationStatus: 'CLASSIFIED' }) } });
    await expect(priv.service.report('m1', 'u1', 'OTHER', null)).rejects.toBeInstanceOf(NotFoundException);
    const dup = build({ studyMaterial: { findUnique: jest.fn().mockResolvedValue({ id: 'm1', userId: 'owner', isPublic: true, classificationStatus: 'DUPLICATE' }) } });
    await expect(dup.service.report('m1', 'u1', 'OTHER', null)).rejects.toBeInstanceOf(NotFoundException);
    const missing = build({ studyMaterial: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(missing.service.report('m1', 'u1', 'OTHER', null)).rejects.toBeInstanceOf(NotFoundException);
    const own = build();
    await expect(own.service.report('m1', 'owner', 'OTHER', null)).rejects.toBeInstanceOf(BadRequestException);
    expect(own.prisma.materialReport.upsert).not.toHaveBeenCalled();
  });
});

describe('StudyMaterialService.popular', () => {
  it('scopes to the university, visibility and course, caps the limit, and never loads extracted text', async () => {
    const { service, prisma } = build();
    await service.popular('u1', 'uni1', 'c1', 500);
    const args = prisma.studyMaterial.findMany.mock.calls[0][0];
    expect(args.take).toBe(20);
    expect(args.where).toMatchObject({ universityId: 'uni1', courseId: 'c1', isDeleted: false, downloadCount: { gt: 0 }, OR: [{ isPublic: true }, { userId: 'u1' }] });
    expect(args.omit).toEqual({ extractedText: true });
    expect(args.orderBy[0]).toEqual({ downloadCount: 'desc' });
  });
  it('defaults to 8 and skips the course filter when none is given', async () => {
    const { service, prisma } = build();
    await service.popular('u1', 'uni1', undefined, undefined);
    const args = prisma.studyMaterial.findMany.mock.calls[0][0];
    expect(args.take).toBe(8);
    expect('courseId' in args.where).toBe(false);
  });
});
