import {
  CHECK_STYLE,
  PLAN_STYLE,
  TEACHING_STYLE,
  checkStyle,
  teachingEnabled,
} from './classroom-teaching';
import { buildAssessmentPrompt } from './classroom-assessment';

describe('classroom 2.1 teaching guidance', () => {
  it('asks for adaptive re-explanation, worked calculations, practical application and accuracy', () => {
    for (const phrase of [
      'different way',
      'misconception',
      'worked calculation',
      'units',
      'engineering',
      'never invent references',
    ]) {
      expect(TEACHING_STYLE.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });
  it('asks the plan for a teaching sequence and never to invent sources', () => {
    expect(PLAN_STYLE).toContain('recap and practice');
    expect(PLAN_STYLE).toContain('Never invent sources');
  });
  it('asks check-ins to explain the misconception behind wrong answers', () => {
    expect(CHECK_STYLE).toContain('misconception');
    const input = {
      topic: 'Rock mechanics',
      stepTitle: 'Stress',
      stepSummary: 's',
      objectives: [],
      chunks: [],
    };
    const original = process.env.CLASSROOM_TEACHING_V21;
    try {
      delete process.env.CLASSROOM_TEACHING_V21;
      expect(buildAssessmentPrompt(input)).not.toContain(CHECK_STYLE);
      process.env.CLASSROOM_TEACHING_V21 = 'true';
      const prompt = buildAssessmentPrompt(input);
      expect(prompt).toContain(CHECK_STYLE);
      expect(prompt).toContain('Return ONLY valid JSON');
    } finally {
      if (original === undefined) delete process.env.CLASSROOM_TEACHING_V21;
      else process.env.CLASSROOM_TEACHING_V21 = original;
    }
  });
  it('adds no new JSON fields, so the API stays the same', () => {
    for (const text of [TEACHING_STYLE, PLAN_STYLE, CHECK_STYLE])
      expect(text).not.toMatch(/"[a-zA-Z]+":/);
  });

  it('is off unless CLASSROOM_TEACHING_V21 is exactly "true"', () => {
    expect(teachingEnabled({})).toBe(false);
    expect(teachingEnabled({ CLASSROOM_TEACHING_V21: '1' } as any)).toBe(false);
    expect(teachingEnabled({ CLASSROOM_TEACHING_V21: 'true' } as any)).toBe(
      true,
    );
    expect(checkStyle({})).toBe('');
    expect(checkStyle({ CLASSROOM_TEACHING_V21: 'true' } as any)).toBe(
      CHECK_STYLE,
    );
  });
});
