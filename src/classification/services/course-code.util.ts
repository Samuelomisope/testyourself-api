/**
 * Extracts candidate Nigerian-style course codes (e.g. "MEE 201", "GNS106", "CVE-301L")
 * from a filename or block of text, and normalizes them to the "LETTERS DIGITS" form
 * used in Course.code (e.g. "MEE 201").
 *
 * Deliberately permissive on input (handles missing space, hyphen, trailing lab-letter
 * suffix) but strict + consistent on output, since Course.code lookups are exact matches.
 */

const COURSE_CODE_PATTERN = /\b([A-Z]{2,5})[\s\-_]?(\d{3})([A-Z]?)\b/g;

export interface CourseCodeCandidate {
  raw: string; // exact substring matched, pre-normalization — kept for audit/debugging
  normalized: string; // e.g. "MEE 201"
}

export function extractCourseCodeCandidates(input: string): CourseCodeCandidate[] {
  if (!input) return [];

  const upper = input.toUpperCase();
  const seen = new Set<string>();
  const candidates: CourseCodeCandidate[] = [];

  let match: RegExpExecArray | null;
  // Reset lastIndex since the regex has the global flag and this function may be
  // called repeatedly on different strings using the same module-level pattern.
  COURSE_CODE_PATTERN.lastIndex = 0;

  while ((match = COURSE_CODE_PATTERN.exec(upper)) !== null) {
    const [raw, letters, digits] = match;
    const normalized = `${letters} ${digits}`;

    if (!seen.has(normalized)) {
      seen.add(normalized);
      candidates.push({ raw, normalized });
    }
  }

  return candidates;
}