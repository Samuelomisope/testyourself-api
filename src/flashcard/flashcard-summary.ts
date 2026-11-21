const DAY = 86_400_000;

// The day number in the person's own time zone. offsetMin is minutes ahead of UTC (Nigeria is +60).
const dayOf = (date: Date, offsetMin: number) => Math.floor((date.getTime() + offsetMin * 60_000) / DAY);

export function clampOffset(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(-840, Math.min(840, Math.trunc(n))) : 0;
}

/**
 * Consecutive days with at least one review. The streak stays alive through today until midnight, so it counts back
 * from yesterday when nothing has been reviewed yet today.
 */
export function computeStreak(reviewedAt: Date[], now: Date, offsetMin = 0): { streak: number; reviewedToday: boolean } {
  const days = new Set(reviewedAt.map((d) => dayOf(d, offsetMin)));
  const today = dayOf(now, offsetMin);
  const reviewedToday = days.has(today);
  let cursor = reviewedToday ? today : today - 1;
  let streak = 0;
  while (days.has(cursor)) { streak += 1; cursor -= 1; }
  return { streak, reviewedToday };
}

export type CardRow = { deckId: string; deckTitle: string; nextReviewDate: Date | null };

/** Cards with no schedule yet, or whose time has come, are due. */
export function summarizeDue(cards: CardRow[], now: Date) {
  const perDeck = new Map<string, { deckId: string; title: string; due: number; total: number }>();
  for (const card of cards) {
    const row = perDeck.get(card.deckId) ?? { deckId: card.deckId, title: card.deckTitle, due: 0, total: 0 };
    row.total += 1;
    if (!card.nextReviewDate || card.nextReviewDate <= now) row.due += 1;
    perDeck.set(card.deckId, row);
  }
  const decks = [...perDeck.values()].sort((a, b) => b.due - a.due || a.title.localeCompare(b.title));
  return { dueToday: decks.reduce((sum, d) => sum + d.due, 0), decks };
}
