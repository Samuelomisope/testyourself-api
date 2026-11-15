/**
 * Splits extracted document text into chunks that follow the document's own sections.
 *
 * Headings are found line by line (Markdown headings, "Chapter 3", "2.1 Limits", ALL CAPS titles). Each chunk carries the heading of
 * the section it came from, so retrieval can match on it and the tutor can cite "Limit laws" instead of "part 7". A document with no
 * recognisable headings is cut into plain overlapping windows, as before.
 */
export type TextChunk = { heading: string | null; text: string };

export const CHUNK_SIZE = 1_500;
export const CHUNK_OVERLAP = 200;
// A section shorter than this is joined to the chunk before it (when it fits) instead of becoming a tiny chunk of its own.
const MIN_SECTION = 300;
const MAX_HEADING = 100;
// If more than this share of the lines look like headings, the "headings" are probably list items or capitals everywhere.
// Only judged once there are enough of them to tell; a short document with two real headings is fine.
const MAX_HEADING_SHARE = 0.3;
const MIN_HEADINGS_TO_JUDGE = 6;

const MARKDOWN = /^#{1,6}\s+(\S.*)$/;
const KEYWORD = /^(?:chapter|section|unit|module|topic|lecture|week|part)\s+(?:\d+|[ivxlc]+)\b.*$/i;
const NUMBERED = /^\d+(?:\.\d+){0,3}[.)]?\s+\p{Lu}[^.!?;]{2,}$/u;

function plainLine(rawLine: string): string | null {
  const line = rawLine.trim();
  return line.length < 3 || line.length > MAX_HEADING || !/\p{L}/u.test(line) ? null : line;
}

/** Headings that are reliable on their own: Markdown "#" lines and "Chapter 3" style lines. */
function strongHeading(rawLine: string): string | null {
  const line = plainLine(rawLine);
  if (!line) return null;
  const markdown = MARKDOWN.exec(line);
  if (markdown) return markdown[1].replace(/#+\s*$/, '').trim().slice(0, MAX_HEADING) || null;
  return KEYWORD.test(line) && !/[.!?,;]$/.test(line) ? line : null;
}

/** Headings that are only a good guess: "2.1 Limit laws" and ALL CAPS titles. */
function weakHeading(rawLine: string): string | null {
  const line = plainLine(rawLine);
  if (!line) return null;
  if (/[.,;]$/.test(line) && !/^\d/.test(line)) return null;
  if (NUMBERED.test(line)) return line;
  const letters = line.replace(/[^\p{L}]/gu, '');
  const words = line.split(/\s+/).length;
  if (letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase() && words <= 10 && line.length <= 80) return line;
  return null;
}

/** Returns the heading text when the line looks like one, otherwise null. */
export function headingOf(rawLine: string): string | null {
  return strongHeading(rawLine) ?? weakHeading(rawLine);
}

type Section = { heading: string | null; body: string };

export function splitSections(text: string): Section[] {
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim()).length;
  const found = lines.map((l) => headingOf(l));
  // Strong headings are always trusted. Weak guesses are dropped when there are many of them and they are a large share of
  // the lines, which usually means list items or capitals everywhere. Only judged once there are enough to tell.
  const weak = found.flatMap((heading, i) => (heading && !strongHeading(lines[i]) ? [i] : []));
  if (weak.length >= MIN_HEADINGS_TO_JUDGE && weak.length / Math.max(nonEmpty, 1) > MAX_HEADING_SHARE) weak.forEach((i) => { found[i] = null; });
  if (!found.some(Boolean)) return [{ heading: null, body: text }];

  const sections: Section[] = [];
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] };
  lines.forEach((line, i) => {
    if (found[i]) {
      if (current.lines.join('').trim()) sections.push({ heading: current.heading, body: current.lines.join('\n') });
      current = { heading: found[i], lines: [line] };
    } else current.lines.push(line);
  });
  if (current.lines.join('').trim()) sections.push({ heading: current.heading, body: current.lines.join('\n') });
  return sections;
}

/** Cuts a long section into overlapping windows, preferring to end on a paragraph or sentence boundary near the limit. */
function windows(body: string, size: number, overlap: number): string[] {
  const text = body.trim();
  if (text.length <= size) return text ? [text] : [];
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const floor = start + Math.floor(size * 0.8);
      const slice = text.slice(floor, end);
      const paragraph = slice.lastIndexOf('\n');
      let sentence = -1;
      for (const match of slice.matchAll(/[.!?]\s/g)) sentence = match.index ?? sentence;
      const cut = paragraph >= 0 ? paragraph : sentence;
      if (cut >= 0) end = floor + cut + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

/** The names of the sections a merged chunk spans, in order, e.g. "1.1 Intuitive idea of a limit · 1.2 Limit laws" (or "first … last" when long). */
function joinHeadings(headings: string[]): string | null {
  const unique = headings.filter((h, i) => h && headings.indexOf(h) === i);
  if (!unique.length) return null;
  const joined = unique.join(' · ');
  if (joined.length <= MAX_HEADING) return joined;
  // Too many to list: show where the span starts and ends. The chunk text still holds every heading line, so search finds them all.
  const room = Math.floor((MAX_HEADING - 3) / 2);
  const clip = (text: string) => (text.length > room ? `${text.slice(0, room - 1).trimEnd()}…` : text);
  return `${clip(unique[0])} … ${clip(unique[unique.length - 1])}`;
}

export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): TextChunk[] {
  const pieces: Array<{ headings: string[]; text: string }> = [];
  for (const section of splitSections(text)) {
    const body = section.body.trim();
    if (!body) continue;
    const last = pieces[pieces.length - 1];
    if (body.length < MIN_SECTION && last && last.text.length + 2 + body.length <= size) {
      last.text = `${last.text}\n\n${body}`;
      if (section.heading) last.headings.push(section.heading);
      continue;
    }
    for (const piece of windows(body, size, overlap)) pieces.push({ headings: section.heading ? [section.heading] : [], text: piece });
  }
  return pieces.map((piece) => ({ heading: joinHeadings(piece.headings), text: piece.text }));
}
