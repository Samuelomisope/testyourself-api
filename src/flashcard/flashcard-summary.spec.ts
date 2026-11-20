import { clampOffset, computeStreak, summarizeDue } from './flashcard-summary';

const at = (iso: string) => new Date(iso);

describe('computeStreak', () => {
  const now = at('2026-11-20T10:00:00Z');
  it('counts consecutive days ending today', () => {
    const r = computeStreak([at('2026-11-20T08:00:00Z'), at('2026-11-19T20:00:00Z'), at('2026-11-18T01:00:00Z')], now);
    expect(r).toEqual({ streak: 3, reviewedToday: true });
  });
  it('keeps the streak alive until midnight when today has no review yet', () => {
    const r = computeStreak([at('2026-11-19T20:00:00Z'), at('2026-11-18T20:00:00Z')], now);
    expect(r).toEqual({ streak: 2, reviewedToday: false });
  });
  it('breaks after a missed day', () => {
    expect(computeStreak([at('2026-11-20T08:00:00Z'), at('2026-11-18T08:00:00Z')], now).streak).toBe(1);
    expect(computeStreak([at('2026-11-17T08:00:00Z')], now).streak).toBe(0);
    expect(computeStreak([], now)).toEqual({ streak: 0, reviewedToday: false });
  });
  it('counts several reviews in one day once', () => {
    expect(computeStreak([at('2026-11-20T01:00:00Z'), at('2026-11-20T02:00:00Z')], now).streak).toBe(1);
  });
  it("uses the person's own day: 23:30 UTC is already the next day in Nigeria (+60)", () => {
    const review = [at('2026-11-20T23:30:00Z')];
    const justAfterMidnightUtc = at('2026-11-21T00:10:00Z');
    expect(computeStreak(review, justAfterMidnightUtc, 60).reviewedToday).toBe(true);
    expect(computeStreak(review, justAfterMidnightUtc, 0).reviewedToday).toBe(false);
  });
});

describe('summarizeDue', () => {
  const now = at('2026-11-20T10:00:00Z');
  it('counts unscheduled and overdue cards, not future ones, and sorts by due', () => {
    const r = summarizeDue([
      { deckId: 'a', deckTitle: 'Algebra', nextReviewDate: null },
      { deckId: 'a', deckTitle: 'Algebra', nextReviewDate: at('2026-11-20T10:00:00Z') },
      { deckId: 'a', deckTitle: 'Algebra', nextReviewDate: at('2026-11-21T00:00:00Z') },
      { deckId: 'b', deckTitle: 'Biology', nextReviewDate: at('2026-11-19T00:00:00Z') },
      { deckId: 'b', deckTitle: 'Biology', nextReviewDate: null },
      { deckId: 'b', deckTitle: 'Biology', nextReviewDate: null },
    ], now);
    expect(r.dueToday).toBe(5);
    expect(r.decks.map((d) => [d.title, d.due, d.total])).toEqual([['Biology', 3, 3], ['Algebra', 2, 3]]);
  });
  it('is empty with no cards', () => expect(summarizeDue([], now)).toEqual({ dueToday: 0, decks: [] }));
});

describe('clampOffset', () => {
  it('keeps sane values only', () => {
    expect(clampOffset('60')).toBe(60);
    expect(clampOffset(-9999)).toBe(-840);
    expect(clampOffset('abc')).toBe(0);
    expect(clampOffset(undefined)).toBe(0);
  });
});
