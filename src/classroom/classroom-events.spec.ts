import {
  baselineBlocks,
  buildBoardPrompt,
  composeEvents,
  EventLessonInput,
  parseBoardPass,
  sanitizeBlock,
  sanitizeBlocks,
} from './classroom-events';

const lesson = (over: Partial<EventLessonInput> = {}): EventLessonInput => ({
  summary: 'Limits describe where a function is heading.',
  steps: [
    {
      title: 'Definition',
      explanation: 'The limit is L when\n$$\\lim_{x\\to a} f(x)=L$$',
      origin: 'SOURCE',
      sources: [{ documentId: 'd1', title: 'notes.pdf', chunkIndex: 2 }],
    },
    {
      title: 'One-sided limits',
      explanation: 'Approach from the left or right.',
      origin: 'EXTRA',
      sources: [],
    },
  ],
  examples: [
    {
      title: 'Easy limit',
      prompt: 'Find the limit of 2x at 3.',
      solutionSteps: ['Substitute x = 3', 'Get 6'],
    },
  ],
  followUpQuestion: 'What is a one-sided limit?',
  ...over,
});

const ctx = (over = {}) => ({
  phase: 'ADVANCE' as const,
  stepIndex: 1,
  stepTitle: 'One-sided limits',
  topic: 'Limits',
  ...over,
});

describe('sanitizeBlock', () => {
  it('keeps valid blocks and trims them to their caps', () => {
    expect(
      sanitizeBlock({ kind: 'TEXT', text: `  ${'a'.repeat(500)}  ` }),
    ).toEqual({ kind: 'TEXT', text: 'a'.repeat(400) });
    expect(
      sanitizeBlock({ kind: 'LIST', ordered: true, items: ['a', '', 'b'] }),
    ).toEqual({ kind: 'LIST', ordered: true, items: ['a', 'b'] });
    expect(
      sanitizeBlock({
        kind: 'FORMULA',
        latex: 'x^2 + y^2 = r^2',
        caption: 'Circle',
      }),
    ).toEqual({ kind: 'FORMULA', latex: 'x^2 + y^2 = r^2', caption: 'Circle' });
  });

  it('drops unknown kinds, non-objects and empty content', () => {
    for (const bad of [
      null,
      'text',
      5,
      [],
      {},
      { kind: 'HTML', html: '<b>x</b>' },
      { kind: 'IMAGE', url: 'https://x.test/a.png' },
      { kind: 'TEXT', text: '   ' },
      { kind: 'LIST', items: [] },
    ]) {
      expect(sanitizeBlock(bad)).toBeNull();
    }
  });

  it('rejects formulas that could load or define things, and strips dollar signs', () => {
    for (const latex of [
      '\\href{https://x.test}{go}',
      '\\url{https://x.test}',
      '\\includegraphics{a}',
      '\\input{a}',
      '\\def\\x{1}',
      '\\htmlClass{a}{b}',
      'a'.repeat(401),
    ]) {
      expect(sanitizeBlock({ kind: 'FORMULA', latex })).toBeNull();
    }
    expect(sanitizeBlock({ kind: 'FORMULA', latex: '$$x+1$$' })).toEqual({
      kind: 'FORMULA',
      latex: 'x+1',
    });
  });

  it('pads ragged table rows to the header width and caps the size', () => {
    const table = sanitizeBlock({
      kind: 'TABLE',
      headers: ['a', 'b'],
      rows: [['1'], ['1', '2', '3'], [], 'bad'],
    });
    expect(table).toEqual({
      kind: 'TABLE',
      headers: ['a', 'b'],
      rows: [
        ['1', ''],
        ['1', '2'],
      ],
    });
    const big = sanitizeBlock({
      kind: 'TABLE',
      headers: Array(9).fill('h'),
      rows: Array(9).fill(Array(9).fill('c')),
    });
    expect(
      (big as { headers: string[]; rows: string[][] }).headers,
    ).toHaveLength(6);
    expect((big as { rows: string[][] }).rows).toHaveLength(6);
  });

  it('requires an alt sentence, at least two nodes and edges that point at real nodes', () => {
    const nodes = [
      { id: 'a', label: 'Start' },
      { id: 'b', label: 'End' },
    ];
    expect(sanitizeBlock({ kind: 'DIAGRAM', nodes, edges: [] })).toBeNull();
    expect(
      sanitizeBlock({
        kind: 'DIAGRAM',
        alt: 'x',
        nodes: [nodes[0]],
        edges: [],
      }),
    ).toBeNull();
    const diagram = sanitizeBlock({
      kind: 'DIAGRAM',
      alt: 'Start leads to end',
      direction: 'TB',
      nodes: [
        ...nodes,
        { id: 'a', label: 'dup' },
        { id: 'bad id!', label: 'x' },
      ],
      edges: [
        { from: 'a', to: 'b', label: 'then' },
        { from: 'a', to: 'zzz' },
        { from: 'a', to: 'a' },
      ],
    });
    expect(diagram).toEqual({
      kind: 'DIAGRAM',
      alt: 'Start leads to end',
      direction: 'TB',
      nodes,
      edges: [{ from: 'a', to: 'b', label: 'then' }],
    });
  });

  it('drops chart series that do not match the labels or hold non-finite numbers', () => {
    const chart = sanitizeBlock({
      kind: 'CHART',
      alt: 'Rising line',
      chart: 'bar',
      labels: ['1', '2', '3'],
      series: [
        { name: 'ok', values: [1, 2, 3] },
        { name: 'short', values: [1, 2] },
        { name: 'nan', values: [1, null, 3] },
        { name: 'huge', values: [1, 2, 1e12] },
      ],
    });
    expect(chart).toEqual({
      kind: 'CHART',
      alt: 'Rising line',
      chart: 'bar',
      labels: ['1', '2', '3'],
      series: [{ name: 'ok', values: [1, 2, 3] }],
    });
    expect(
      sanitizeBlock({
        kind: 'CHART',
        labels: ['1', '2'],
        series: [{ name: 'a', values: [1, 2] }],
      }),
    ).toBeNull();
    expect(
      sanitizeBlock({
        kind: 'CHART',
        alt: 'x',
        labels: ['1'],
        series: [{ name: 'a', values: [1] }],
      }),
    ).toBeNull();
  });

  it('removes control characters', () => {
    expect(sanitizeBlock({ kind: 'TEXT', text: 'a\u0000b\u0007c' })).toEqual({
      kind: 'TEXT',
      text: 'abc',
    });
  });
});

describe('sanitizeBlocks / parseBoardPass', () => {
  it('limits how many model blocks are kept', () => {
    const blocks = Array.from({ length: 10 }, (_, i) => ({
      kind: 'TEXT',
      text: `t${i}`,
    }));
    expect(sanitizeBlocks(blocks)).toHaveLength(6);
    expect(sanitizeBlocks('nope')).toEqual([]);
  });

  it('reads fenced or wrapped JSON and ignores everything else', () => {
    expect(
      parseBoardPass('```json\n{"blocks":[{"kind":"TEXT","text":"hi"}]}\n```'),
    ).toEqual([{ kind: 'TEXT', text: 'hi' }]);
    expect(
      parseBoardPass(
        'Here you go: {"blocks":[{"kind":"TEXT","text":"hi"}]} done',
      ),
    ).toHaveLength(1);
    for (const bad of [
      '',
      'no json',
      '{"blocks":[{"kind":"TEXT"',
      '{"blocks":"x"}',
      '[]',
    ])
      expect(parseBoardPass(bad)).toEqual([]);
  });
});

describe('buildBoardPrompt', () => {
  it('quotes the topic, marks the lesson text untrusted and asks for alt text', () => {
    const prompt = buildBoardPrompt(
      'Limits "and" more',
      'Definition',
      lesson(),
    );
    expect(prompt).toContain('"Limits \\"and\\" more"');
    expect(prompt).toContain('untrusted');
    expect(prompt).toContain('"alt"');
    expect(prompt).toContain('Definition: The limit is L');
  });
});

describe('baselineBlocks', () => {
  it('builds key points, formulas and the worked example without a model', () => {
    const blocks = baselineBlocks(lesson());
    expect(blocks[0]).toEqual({
      kind: 'LIST',
      ordered: false,
      items: ['Definition', 'One-sided limits'],
    });
    expect(blocks).toContainEqual({
      kind: 'FORMULA',
      latex: '\\lim_{x\\to a} f(x)=L',
    });
    expect(blocks).toContainEqual({
      kind: 'TEXT',
      text: 'Easy limit: Find the limit of 2x at 3.',
    });
    expect(blocks).toContainEqual({
      kind: 'LIST',
      ordered: true,
      items: ['Substitute x = 3', 'Get 6'],
    });
  });

  it('is empty for a reply with no steps or examples', () => {
    expect(baselineBlocks(lesson({ steps: [], examples: [] }))).toEqual([]);
  });

  it('skips forbidden or repeated formulas and caps the count', () => {
    const many = Array.from({ length: 8 }, (_, i) => `$$x_${i}$$`).join('\n');
    const blocks = baselineBlocks(
      lesson({
        steps: [
          {
            title: 't',
            explanation: `${many}\n$$\\href{a}{b}$$\n$$x_0$$`,
            origin: 'EXTRA',
            sources: [],
          },
        ],
        examples: [],
      }),
    );
    expect(blocks.filter((b) => b.kind === 'FORMULA')).toHaveLength(4);
  });
});

describe('composeEvents', () => {
  it('starts a step with a page, then speaks, draws and checks, in order', () => {
    const events = composeEvents(lesson(), ctx());
    expect(events.map((e) => e.type)).toEqual([
      'STEP_START',
      'BOARD_PAGE',
      'SAY',
      'SAY',
      'SAY',
      'BOARD_BLOCK',
      'BOARD_BLOCK',
      'BOARD_BLOCK',
      'BOARD_BLOCK',
      'CHECK',
    ]);
    expect(events[0]).toMatchObject({
      id: 'e1',
      type: 'STEP_START',
      stepIndex: 1,
      title: 'One-sided limits',
    });
    expect(events[1]).toMatchObject({
      type: 'BOARD_PAGE',
      stepIndex: 1,
      title: 'One-sided limits',
    });
    expect(events[3]).toMatchObject({
      type: 'SAY',
      title: 'Definition',
      origin: 'SOURCE',
      sources: [{ documentId: 'd1' }],
    });
    expect(events[4]).not.toHaveProperty('sources');
    expect(events.map((e) => e.id)).toEqual(events.map((_, i) => `e${i + 1}`));
  });

  it('adds no page for an in-context answer so the board carries on', () => {
    const events = composeEvents(lesson(), ctx({ phase: 'ASK' }));
    expect(
      events.some((e) => e.type === 'BOARD_PAGE' || e.type === 'STEP_START'),
    ).toBe(false);
  });

  it('uses a recap page at the end and a topic page when there is no plan', () => {
    expect(composeEvents(lesson(), ctx({ phase: 'FINISH' }))[0]).toMatchObject({
      type: 'BOARD_PAGE',
      title: 'Recap',
    });
    expect(
      composeEvents(
        lesson(),
        ctx({ phase: null, stepIndex: null, stepTitle: null }),
      )[0],
    ).toMatchObject({ type: 'BOARD_PAGE', stepIndex: null, title: 'Limits' });
  });

  it('appends model blocks after the baseline blocks', () => {
    const extra = [{ kind: 'TABLE' as const, headers: ['a'], rows: [['1']] }];
    const blocks = composeEvents(lesson(), ctx(), extra).filter(
      (e) => e.type === 'BOARD_BLOCK',
    );
    expect(blocks[blocks.length - 1]).toMatchObject({ block: extra[0] });
  });

  it('still produces a valid list for a plain-prose reply', () => {
    const events = composeEvents(
      lesson({ steps: [], examples: [], followUpQuestion: null }),
      ctx({ phase: 'ASK' }),
    );
    expect(events).toEqual([
      {
        id: 'e1',
        type: 'SAY',
        text: 'Limits describe where a function is heading.',
      },
    ]);
  });

  it('drops board blocks, never the text, when the reply is too large', () => {
    const extra = Array.from({ length: 6 }, () => ({
      kind: 'TEXT' as const,
      text: 'x'.repeat(400),
    }));
    const input = lesson({
      steps: Array.from({ length: 8 }, (_, i) => ({
        title: `s${i}`,
        explanation: 'y'.repeat(2500),
        origin: 'EXTRA' as const,
        sources: [],
      })),
    });
    const events = composeEvents(input, ctx(), extra);
    expect(JSON.stringify(events).length).toBeLessThanOrEqual(30_000);
    expect(events.filter((e) => e.type === 'SAY')).toHaveLength(9);
    expect(events.map((e) => e.id)).toEqual(events.map((_, i) => `e${i + 1}`));
  });
});
