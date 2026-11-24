import { Logger } from '@nestjs/common';

export type AiUsageTask = 'classify' | 'generate' | 'vision';

/**
 * One JSON line per AI call, prefixed AI_USAGE so it can be found in the Render logs and totalled with
 * scripts/ai-usage-summary.mjs. Only counts are logged: never prompts, answers, names or ids. Must never throw.
 */
export function logAiUsage(
  logger: Logger,
  task: AiUsageTask,
  provider: string,
  model: string,
  inputTokens: unknown,
  outputTokens: unknown,
  startedAt: number,
): void {
  try {
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    logger.log(`AI_USAGE ${JSON.stringify({ task, provider, model, in: n(inputTokens), out: n(outputTokens), ms: Date.now() - startedAt })}`);
  } catch {
    // logging is best effort
  }
}
