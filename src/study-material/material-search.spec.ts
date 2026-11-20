import { cleanReportNote, makeSnippet, withSnippets } from './material-search';

describe('makeSnippet', () => {
  const text = 'Chapter 3. The second law of thermodynamics states that entropy of an isolated system never decreases over time.';
  it('returns text around the match with ellipses', () => {
    const s = makeSnippet(text, 'THERMODYNAMICS', 20)!;
    expect(s).toContain('thermodynamics');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
  });
  it('has no ellipsis at the edges', () => {
    expect(makeSnippet('entropy rises', 'entropy', 70)).toBe('entropy rises');
  });
  it('returns null for short queries, no match or no text', () => {
    expect(makeSnippet(text, 'th')).toBeNull();
    expect(makeSnippet(text, 'quantum')).toBeNull();
    expect(makeSnippet(null, 'entropy')).toBeNull();
    expect(makeSnippet(text, '   ')).toBeNull();
  });
  it('collapses whitespace', () => {
    expect(makeSnippet('a\n\n  entropy   \t b', 'entropy')).toBe('a entropy b');
  });
});

describe('withSnippets', () => {
  const rows = [
    { id: 1, title: 'Thermo notes', description: null, extractedText: 'Entropy is a measure of disorder.' },
    { id: 2, title: 'Random', description: null, extractedText: 'Entropy is a measure of disorder.' },
  ];
  it('always removes extractedText', () => {
    for (const r of withSnippets(rows, undefined)) expect('extractedText' in r).toBe(false);
  });
  it('adds a snippet only when the match is inside the document, not the title', () => {
    const out = withSnippets(rows, 'entropy');
    expect(out[0].matchSnippet).toContain('Entropy');
    expect(out[1].matchSnippet).toContain('Entropy');
    const byTitle = withSnippets(rows, 'thermo');
    expect(byTitle[0].matchSnippet).toBeUndefined();
  });
  it('adds nothing without a search', () => {
    expect(withSnippets(rows, '')[0].matchSnippet).toBeUndefined();
  });
});

describe('cleanReportNote', () => {
  it('trims, clips and drops empties', () => {
    expect(cleanReportNote('  broken  ')).toBe('broken');
    expect(cleanReportNote('x'.repeat(900))!.length).toBe(500);
    expect(cleanReportNote('   ')).toBeNull();
    expect(cleanReportNote(5)).toBeNull();
    expect(cleanReportNote('a\u0001b')).toBe('ab');
  });
});
