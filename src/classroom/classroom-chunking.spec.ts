import { chunkText, headingOf, splitSections, CHUNK_SIZE } from './classroom-chunking';

const para = (word: string, n = 60) => `${word} ${'is explained here with enough ordinary words to look like a real paragraph. '.repeat(n)}`.trim();

describe('classroom chunking', () => {
  describe('headingOf', () => {
    it.each([
      ['# Limits and continuity', 'Limits and continuity'],
      ['## 2.1 Limit laws ##', '2.1 Limit laws'],
      ['Chapter 3: Limit laws', 'Chapter 3: Limit laws'],
      ['Week 4 Derivatives', 'Week 4 Derivatives'],
      ['2.1 Limit laws', '2.1 Limit laws'],
      ['3) Product rule', '3) Product rule'],
      ['LIMIT LAWS', 'LIMIT LAWS'],
    ])('recognises %j as a heading', (line, expected) => {
      expect(headingOf(line)).toBe(expected);
    });

    it.each([
      'This is an ordinary sentence about limits.',
      'The limit of f(x) as x approaches a exists',
      'Therefore, the result follows.',
      '42',
      '----',
      'f(x) = 3x + 1',
      '1. Find the limit, if it exists.',
      'ab',
      '',
      `${'A'.repeat(120)}`,
    ])('does not treat %j as a heading', (line) => {
      expect(headingOf(line)).toBeNull();
    });
  });

  describe('splitSections', () => {
    it('splits at headings and keeps the text before the first heading', () => {
      const text = `Course outline\nintro words here\n\nChapter 1: Limits\nbody one\n\nChapter 2: Derivatives\nbody two`;
      const sections = splitSections(text);
      expect(sections.map((s) => s.heading)).toEqual([null, 'Chapter 1: Limits', 'Chapter 2: Derivatives']);
      expect(sections[1].body).toContain('body one');
      expect(sections[2].body).toContain('body two');
    });

    it('treats a document with no headings as one section', () => {
      const sections = splitSections('just some plain text\nover two lines');
      expect(sections).toEqual([{ heading: null, body: 'just some plain text\nover two lines' }]);
    });

    it('always keeps reliable headings, however many there are', () => {
      const text = Array.from({ length: 9 }, (_, i) => `# Topic ${i}\nsome words here`).join('\n');
      expect(splitSections(text).map((x) => x.heading)).toEqual(Array.from({ length: 9 }, (_, i) => `Topic ${i}`));
    });

    it('keeps reliable headings when it drops the unreliable ones', () => {
      const caps = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF', 'GGGG'];
      const text = ['Chapter 1: Limits', ...caps, 'plain text one', 'plain text two'].join('\n');
      expect(splitSections(text).map((x) => x.heading)).toEqual(['Chapter 1: Limits']);
    });

    it('keeps two real headings in a short document', () => {
      expect(splitSections('# A\nsome words\n# B\nother words').map((s) => s.heading)).toEqual(['A', 'B']);
    });

    it('ignores "headings" when there are many and they make up a large share of the lines', () => {
      const text = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'some text here', 'more text here'].join('\n');
      expect(splitSections(text)).toHaveLength(1);
      expect(splitSections(text)[0].heading).toBeNull();
    });
  });

  describe('a realistic lecture note', () => {
    const note = [
      'MTH 101: CALCULUS I', 'Lecture Notes - Dr. A. Bello', '', 'Chapter 1: Limits', '1.1 Intuitive idea of a limit',
      'We say that the limit of f(x) as x approaches a is L if f(x) gets arbitrarily close to L when x is close to a.', '',
      '1.2 Limit laws', 'If the limits of f and g exist then:', '1. The limit of a sum is the sum of the limits.',
      '2. The limit of a product is the product of the limits.', '', '1.3 One-sided limits',
      'The left-hand limit and the right-hand limit must agree for the two-sided limit to exist.', '', 'Chapter 2: Continuity',
      'A function f is continuous at a if the limit of f(x) as x approaches a equals f(a).', '', 'EXERCISES',
      '1. Evaluate the limit of 3x + 1 as x approaches 2.', '2. Show that f(x) = x^2 is continuous everywhere.',
    ].join('\n');

    it('finds the real sections and names them', () => {
      const headings = splitSections(note).map((x) => x.heading);
      expect(headings).toEqual(expect.arrayContaining(['Chapter 1: Limits', '1.1 Intuitive idea of a limit', '1.2 Limit laws', '1.3 One-sided limits', 'Chapter 2: Continuity', 'EXERCISES']));
      expect(headings).not.toContain('1. The limit of a sum is the sum of the limits.');
    });

    it('labels a merged chunk by where its sections start and end, and keeps every heading line in its text', () => {
      const chunks = chunkText(note);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].heading!.length).toBeLessThanOrEqual(100);
      expect(chunks[0].heading).toMatch(/^MTH 101: CALCULUS I/);
      expect(chunks[0].heading).toContain(' … ');
      expect(chunks[0].heading).toMatch(/EXERCISES$/);
      for (const name of ['Limit laws', 'One-sided limits', 'Chapter 2: Continuity']) expect(chunks[0].text).toContain(name);
    });

    it('lists the names when they fit', () => {
      const chunks = chunkText('# Limits\nshort one\n\n# Continuity\nshort two');
      expect(chunks[0].heading).toBe('Limits · Continuity');
    });
  });

  describe('chunkText', () => {
    it('gives every chunk the heading of its section', () => {
      const text = `# Limits\n${para('Limits')}\n\n# Derivatives\n${para('Derivatives')}`;
      const chunks = chunkText(text);
      expect(chunks.length).toBeGreaterThan(2);
      const headings = [...new Set(chunks.map((c) => c.heading))];
      expect(headings).toEqual(['Limits', 'Derivatives']);
      expect(chunks.filter((c) => c.heading === 'Limits').every((c) => c.text.includes('Limits') || c.text.includes('explained'))).toBe(true);
    });

    it('never makes a chunk larger than the size limit', () => {
      const chunks = chunkText(`# A\n${para('A', 200)}\n\n# B\n${para('B', 200)}`);
      expect(chunks.every((c) => c.text.length <= CHUNK_SIZE)).toBe(true);
    });

    it('cuts a document without headings into overlapping windows with no heading', () => {
      const chunks = chunkText(para('Plain', 200));
      expect(chunks.length).toBeGreaterThan(3);
      expect(chunks.every((c) => c.heading === null)).toBe(true);
      expect(chunks.every((c) => c.text.length <= CHUNK_SIZE)).toBe(true);
    });

    it('cuts on a paragraph or sentence boundary when one is near the limit', () => {
      const sentence = 'The limit exists when both one-sided limits agree. ';
      const chunks = chunkText(sentence.repeat(120));
      expect(chunks.slice(0, -1).every((c) => /[.!?]$/.test(c.text))).toBe(true);
    });

    it('joins very short sections to the one before instead of making tiny chunks', () => {
      const text = `# Intro\n${para('Intro', 4)}\n\n# Note\nShort note.\n\n# Next\nAnother short line.`;
      const chunks = chunkText(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].heading).toBe('Intro · Note · Next');
      expect(chunks[0].text).toContain('Short note.');
      expect(chunks[0].text).toContain('Another short line.');
    });

    it('does not lose any text', () => {
      const sentences = Array.from({ length: 150 }, (_, i) => `Sentence number ${i} about limits.`);
      const text = `# Limits\n${sentences.slice(0, 75).join(' ')}\n\n# Continuity\n${sentences.slice(75).join(' ')}`;
      const joined = chunkText(text).map((c) => c.text).join('\n');
      for (const sentence of sentences) expect(joined).toContain(sentence);
    });

    it('returns nothing for blank text', () => {
      expect(chunkText('  \n \n')).toEqual([]);
    });
  });
});
