const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Day 1 starts at `startDate` and each day lasts 24 hours from then. */
export function getPlanDayNumber(startDate: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
}