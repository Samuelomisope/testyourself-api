jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { FeatureUsageService } from './feature-usage.service';
import { FeatureVisitService } from '../activity/feature-visit.service';
import { FEATURES, isFeatureKey } from '../common/feature-keys';

describe('FeatureUsageService', () => {
  const build = (actions: any[], visits: any[], firstDay: Date | null = null) => {
    const db: any = { $queryRawUnsafe: jest.fn(async (sql: string) => (sql.includes('UNION ALL') ? actions : sql.includes('MIN("day")') ? [{ firstDay }] : visits)) };
    return { db, service: new FeatureUsageService(db) };
  };

  it('accepts only 7, 30 and 90 days and defaults to 30', () => {
    expect([7, 30, 90, '7', '90'].map((d) => FeatureUsageService.window(d))).toEqual([7, 30, 90, 7, 90]);
    expect(['1', '365', 'abc', undefined, '30; DROP TABLE "User"'].map((d) => FeatureUsageService.window(d))).toEqual([30, 30, 30, 30, 30]);
  });

  it('lists every known section, merges actions with visits, and ranks by who opened it', async () => {
    const { service } = build(
      [{ feature: 'classroom', actions: 120, users: 9, premiumUsers: 3 }, { feature: 'library', actions: 40, users: 20, premiumUsers: 2 }],
      [{ feature: 'library', visits: 500, visitors: 80, premiumVisitors: 6 }, { feature: 'classroom', visits: 90, visitors: 15, premiumVisitors: 4 }, { feature: 'practice', visits: 30, visitors: 12, premiumVisitors: 1 }],
      new Date('2026-11-25T00:00:00Z'),
    );
    const report = await service.report('7');
    expect(report.days).toBe(7);
    expect(report.visitsTrackedSince).toBe('2026-11-25');
    expect(report.features).toHaveLength(FEATURES.length);
    expect(report.features.slice(0, 3).map((f) => f.key)).toEqual(['library', 'classroom', 'practice']);
    expect(report.features[0]).toMatchObject({ actions: 40, users: 20, visits: 500, visitors: 80, premiumVisitors: 6 });
    const quiet = report.features.find((f) => f.key === 'settings')!;
    expect(quiet).toMatchObject({ actions: 0, users: 0, visits: 0, visitors: 0 });
  });

  it('turns database counts that arrive as strings or bigints into numbers', async () => {
    const { service } = build([{ feature: 'chat', actions: '7', users: BigInt(3), premiumUsers: '0' }], []);
    const chat = (await service.report()).features.find((f) => f.key === 'chat')!;
    expect(chat).toMatchObject({ actions: 7, users: 3 });
  });

  it('passes the window start as a bound value, never inside the query text', async () => {
    const { service, db } = build([], []);
    await service.report('90');
    const [sql, since] = db.$queryRawUnsafe.mock.calls[0];
    expect(since).toBeInstanceOf(Date);
    expect(Date.now() - since.getTime()).toBeGreaterThan(89 * 86_400_000);
    expect(sql).not.toMatch(/\b90\b/);
    expect(sql).toContain('$1');
  });
});

/** The query text cannot be run here, so check every table and column it names against the real schema. */
describe('action sources match the Prisma schema', () => {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const models = new Map<string, Set<string>>();
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const fields = new Set<string>();
    for (const line of m[2].split('\n')) { const f = /^\s+(\w+)\s+\S/.exec(line); if (f && !line.trim().startsWith('@@') && !line.trim().startsWith('//')) fields.add(f[1]); }
    models.set(m[1], fields);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const source = readFileSync(join(__dirname, 'feature-usage.service.ts'), 'utf8');
  const sources = [...source.matchAll(/^\s+`(SELECT [^`]+)`,$/gm)].map((m) => m[1]).filter((q) => q.includes('$1'));
  const visits = /FROM "FeatureVisit" v/.test(source);

  it('finds the sources it is meant to check', () => { expect(sources.length).toBeGreaterThanOrEqual(13); expect(visits).toBe(true); });

  for (const query of sources) {
    it(`${query.slice(0, 48)}…`, () => {
      const tables = [...query.matchAll(/(?:FROM|JOIN) "(\w+)"/g)].map((m) => m[1]);
      expect(tables.length).toBeGreaterThan(0);
      for (const t of tables) expect(models.has(t)).toBe(true);
      const allowed = new Set(tables.flatMap((t) => [...(models.get(t) ?? [])]));
      const columns = [...query.matchAll(/(?:\b\w+\.)?"(\w+)"/g)].map((m) => m[1]).filter((c) => !tables.includes(c));
      for (const c of columns) expect([c, allowed.has(c)]).toEqual([c, true]);
    });
  }

  it('the visit table in the schema has the columns the counter writes', () => {
    const fields = models.get('FeatureVisit')!;
    for (const c of ['id', 'userId', 'feature', 'day', 'count', 'createdAt', 'updatedAt']) expect(fields.has(c)).toBe(true);
    const sql = readFileSync(join(__dirname, '../../prisma/migrations/20261125000000_add_feature_visit/migration.sql'), 'utf8');
    for (const c of ['id', 'userId', 'feature', 'day', 'count', 'createdAt', 'updatedAt']) expect(sql).toContain(`"${c}"`);
    expect(sql).toContain('"FeatureVisit_userId_feature_day_key"');
  });
});

describe('FeatureVisitService', () => {
  it('counts a known section and rejects anything else', async () => {
    const db: any = { $executeRaw: jest.fn().mockResolvedValue(1) };
    const service = new FeatureVisitService(db);
    await service.record('u1', 'library');
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    for (const bad of ['/study-material', 'LIBRARY', '', undefined, 5, { a: 1 }, 'x'.repeat(500)]) await expect(service.record('u1', bad)).rejects.toMatchObject({ status: 400 });
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(isFeatureKey('library')).toBe(true);
    expect(isFeatureKey('admin')).toBe(false);
  });
});
