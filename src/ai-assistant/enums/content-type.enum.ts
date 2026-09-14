/**
 * The 7 content types from the roadmap, plus UNKNOWN as an explicit
 * fallback so a failed/uncertain classification never silently defaults
 * to one of the real categories.
 */
export enum AskUniLibContentType {
  LECTURE_TEXT = 'LECTURE_TEXT',
  EXAM_QUESTION = 'EXAM_QUESTION',
  MATH_QUESTION = 'MATH_QUESTION',
  DIAGRAM = 'DIAGRAM',
  MULTIPLE_QUESTIONS = 'MULTIPLE_QUESTIONS',
  MESSY_NOTES = 'MESSY_NOTES',
  TEXTBOOK_PAGE = 'TEXTBOOK_PAGE',
  UNKNOWN = 'UNKNOWN',
}

export enum AskUniLibQueryStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
