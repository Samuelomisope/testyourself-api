// Progress summaries for the "My learning" page (Phase I). Pure: reads attempt rows and returns numbers. Nothing here
// invents anything; a step with no attempt has no score.

export type AttemptRow = { assessmentId: string; score: number; total: number; createdAt: Date; stepIndex: number };
export type Score = { score: number; total: number };
export type StepSummary = { stepIndex: number; assessmentId: string; attempts: number; best: Score; latest: Score & { createdAt: Date } };

const ratio = (s: Score) => (s.total > 0 ? s.score / s.total : 0);

/** Per step, oldest attempt first in the input: attempt count, best score, latest score. A bad retry never hides a good best. */
export function summarizeSteps(rows: AttemptRow[]): StepSummary[] {
  const steps = new Map<number, StepSummary>();
  for (const r of rows) {
    const current = steps.get(r.stepIndex);
    steps.set(r.stepIndex, {
      stepIndex: r.stepIndex,
      assessmentId: r.assessmentId,
      attempts: (current?.attempts ?? 0) + 1,
      best: !current || ratio(r) > ratio(current.best) ? { score: r.score, total: r.total } : current.best,
      latest: { score: r.score, total: r.total, createdAt: r.createdAt },
    });
  }
  return [...steps.values()].sort((a, b) => a.stepIndex - b.stepIndex);
}

/** Average of the best score per checked step as a whole percentage, or null when no step has been checked. */
export function averageBestPercent(steps: StepSummary[]): number | null {
  const scored = steps.filter((s) => s.best.total > 0);
  if (!scored.length) return null;
  return Math.round((scored.reduce((sum, s) => sum + ratio(s.best), 0) / scored.length) * 100);
}

export function outlineLength(outline: unknown): number {
  return Array.isArray(outline) ? outline.length : 0;
}

export function stepTitle(outline: unknown, stepIndex: number): string | null {
  const step = Array.isArray(outline) ? (outline[stepIndex] as { title?: unknown } | undefined) : undefined;
  return typeof step?.title === 'string' ? step.title.slice(0, 200) : null;
}

export type LessonProgress = {
  id: string; title: string; topic: string; status: string; mode: string;
  stepCount: number; stepIndex: number; started: boolean;
  checkedSteps: number; attempts: number; averageBest: number | null;
  lastStudiedAt: string; lastAttemptAt: string | null;
};

export function summarizeLesson(
  session: { id: string; title: string; topic: string; status: string; mode: string; outline: unknown; currentStepIndex: number; updatedAt: Date; _count: { turns: number } },
  rows: AttemptRow[],
): LessonProgress {
  const steps = summarizeSteps(rows);
  const last = rows.reduce<Date | null>((latest, r) => (!latest || r.createdAt > latest ? r.createdAt : latest), null);
  const stepCount = outlineLength(session.outline);
  return {
    id: session.id, title: session.title, topic: session.topic, status: session.status, mode: session.mode,
    stepCount, stepIndex: stepCount ? Math.min(Math.max(session.currentStepIndex, 0), stepCount - 1) : 0,
    started: session._count.turns > 0,
    checkedSteps: steps.length, attempts: rows.length, averageBest: averageBestPercent(steps),
    lastStudiedAt: session.updatedAt.toISOString(), lastAttemptAt: last ? last.toISOString() : null,
  };
}
