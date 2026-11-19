import { averageBestPercent, outlineLength, stepTitle, summarizeLesson, summarizeSteps } from './classroom-progress';

const t = (n: number) => new Date(Date.UTC(2026, 10, n));
const row = (stepIndex: number, score: number, total: number, day: number, assessmentId = `a${stepIndex}`) => ({ assessmentId, score, total, createdAt: t(day), stepIndex });

describe('summarizeSteps', () => {
  it('keeps the best score when a later retry is worse', () => {
    const [s] = summarizeSteps([row(0, 3, 3, 1), row(0, 1, 3, 2)]);
    expect(s).toMatchObject({ attempts: 2, best: { score: 3, total: 3 }, latest: { score: 1, total: 3 } });
  });
  it('orders by step and ignores nothing', () => {
    expect(summarizeSteps([row(2, 1, 2, 1), row(0, 2, 2, 2)]).map((s) => s.stepIndex)).toEqual([0, 2]);
    expect(summarizeSteps([])).toEqual([]);
  });
  it('compares best by ratio, not raw score', () => {
    const [s] = summarizeSteps([row(0, 2, 4, 1), row(0, 2, 3, 2)]);
    expect(s.best).toEqual({ score: 2, total: 3 });
  });
});

describe('averageBestPercent', () => {
  it('averages the best score of each checked step', () => {
    expect(averageBestPercent(summarizeSteps([row(0, 3, 3, 1), row(1, 1, 2, 1), row(1, 0, 2, 2)]))).toBe(75);
  });
  it('rounds to the nearest whole percent', () => {
    expect(averageBestPercent(summarizeSteps([row(0, 2, 3, 1)]))).toBe(67);
  });
  it('is null when nothing was scored, including attempts where nothing could be marked', () => {
    expect(averageBestPercent([])).toBeNull();
    expect(averageBestPercent(summarizeSteps([row(0, 0, 0, 1)]))).toBeNull();
  });
});

describe('outline helpers', () => {
  it('reads length and titles defensively', () => {
    expect(outlineLength(null)).toBe(0);
    expect(outlineLength([{}, {}])).toBe(2);
    expect(stepTitle([{ title: 'One' }], 0)).toBe('One');
    expect(stepTitle([{ title: 'One' }], 3)).toBeNull();
    expect(stepTitle('x', 0)).toBeNull();
    expect(stepTitle([{ title: 5 }], 0)).toBeNull();
  });
});

describe('summarizeLesson', () => {
  const session = { id: 's', title: 'T', topic: 'Topic', status: 'ACTIVE', mode: 'CLASSROOM', outline: [{}, {}, {}], currentStepIndex: 1, updatedAt: t(5), _count: { turns: 4 } };
  it('combines the lesson, its step and its scores', () => {
    const out = summarizeLesson(session, [row(0, 2, 2, 1), row(1, 1, 2, 3)]);
    expect(out).toMatchObject({ stepCount: 3, stepIndex: 1, started: true, checkedSteps: 2, attempts: 2, averageBest: 75, lastStudiedAt: t(5).toISOString(), lastAttemptAt: t(3).toISOString() });
  });
  it('handles a lesson with no plan, no turns and no attempts', () => {
    const out = summarizeLesson({ ...session, outline: null, currentStepIndex: 4, _count: { turns: 0 } }, []);
    expect(out).toMatchObject({ stepCount: 0, stepIndex: 0, started: false, checkedSteps: 0, averageBest: null, lastAttemptAt: null });
  });
  it('keeps the step inside the plan', () => {
    expect(summarizeLesson({ ...session, currentStepIndex: 99 }, []).stepIndex).toBe(2);
    expect(summarizeLesson({ ...session, currentStepIndex: -1 }, []).stepIndex).toBe(0);
  });
});
