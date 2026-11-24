import { Logger } from '@nestjs/common';
import { logAiUsage } from './ai-usage-log';

describe('logAiUsage', () => {
  it('logs counts only, as one AI_USAGE json line', () => {
    const logger = { log: jest.fn() } as unknown as Logger;
    logAiUsage(logger, 'generate', 'claude', 'm', 3200, 640, Date.now() - 5);
    const line = (logger.log as jest.Mock).mock.calls[0][0] as string;
    expect(line.startsWith('AI_USAGE ')).toBe(true);
    const e = JSON.parse(line.slice(9));
    expect(e).toMatchObject({ task: 'generate', provider: 'claude', model: 'm', in: 3200, out: 640 });
    expect(Object.keys(e).sort()).toEqual(['in', 'model', 'ms', 'out', 'provider', 'task']);
  });
  it('records null for missing counts and never throws', () => {
    const logger = { log: jest.fn() } as unknown as Logger;
    logAiUsage(logger, 'vision', 'groq', 'm', undefined, 'x', 0);
    expect(JSON.parse((logger.log as jest.Mock).mock.calls[0][0].slice(9))).toMatchObject({ in: null, out: null });
    const bad = { log: () => { throw new Error('x'); } } as unknown as Logger;
    expect(() => logAiUsage(bad, 'vision', 'g', 'm', 1, 1, 0)).not.toThrow();
  });
});
