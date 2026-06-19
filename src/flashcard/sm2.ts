// SM-2 spaced repetition algorithm
// Reference: https://en.wikipedia.org/wiki/SuperMemo#Description_of_SM-2_algorithm

export type ReviewRating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';

interface SM2Input {
  easeFactor: number;
  interval: number;
  repetitions: number;
}

interface SM2Output {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: Date;
}

// Maps our 4-button UI rating to the 0-5 quality scale SM-2 expects
const RATING_TO_QUALITY: Record<ReviewRating, number> = {
  AGAIN: 1,
  HARD: 3,
  GOOD: 4,
  EASY: 5,
};

export function calculateSM2(input: SM2Input, rating: ReviewRating): SM2Output {
  const quality = RATING_TO_QUALITY[rating];
  let { easeFactor, interval, repetitions } = input;

  if (quality < 3) {
    // Failed recall — reset repetitions, review again soon
    repetitions = 0;
    interval = 0; // due again today/immediately (treat as "due now")
  } else {
    // Successful recall — grow the interval
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  // Update ease factor (clamped at a minimum of 1.3 so cards never get "stuck" too hard)
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextReviewDate = new Date();
  if (interval === 0) {
    // "Again" — due in 10 minutes, not a full day, so the user can retry same session
    nextReviewDate.setMinutes(nextReviewDate.getMinutes() + 10);
  } else {
    nextReviewDate.setDate(nextReviewDate.getDate() + interval);
  }

  return { easeFactor, interval, repetitions, nextReviewDate };
}