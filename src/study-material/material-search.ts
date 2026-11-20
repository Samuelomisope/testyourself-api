// Search inside the text we already extracted from PDFs. The list endpoint returns a short snippet around the match
// instead of the whole text, which can be hundreds of kilobytes per material.

export const MIN_CONTENT_SEARCH_LENGTH = 3;

export function makeSnippet(text: string | null | undefined, query: string, radius = 70): string | null {
  const q = (query ?? '').trim();
  if (!text || q.length < MIN_CONTENT_SEARCH_LENGTH) return null;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return null;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + q.length + radius);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

/** Strips extractedText from each material and adds matchSnippet when the words were found inside the document. */
export function withSnippets<T extends { extractedText?: string | null; title?: string | null; description?: string | null }>(
  materials: T[],
  search?: string,
): Array<Omit<T, 'extractedText'> & { matchSnippet?: string }> {
  return materials.map((material) => {
    const { extractedText, ...rest } = material;
    const q = (search ?? '').trim().toLowerCase();
    const inTitle = q && `${material.title ?? ''} ${material.description ?? ''}`.toLowerCase().includes(q);
    const snippet = q && !inTitle ? makeSnippet(extractedText, q) : null;
    return snippet ? { ...rest, matchSnippet: snippet } : rest;
  });
}

export const REPORT_REASONS = ['BROKEN_FILE', 'WRONG_COURSE', 'INAPPROPRIATE', 'DUPLICATE', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** Distinct reports that put a material in the existing admin "needs review" list. */
export const REPORTS_FOR_REVIEW = 3;

export function cleanReportNote(note: unknown): string | null {
  if (typeof note !== 'string') return null;
  const text = note.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 500);
  return text || null;
}

/** Form fields arrive as strings. Only the exact text "true" turns a flag on. */
export function parseFlag(value: unknown): boolean {
  return value === true || value === 'true';
}
