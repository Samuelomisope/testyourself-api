import { CHECK_STYLE, PLAN_STYLE, TEACHING_STYLE } from './classroom-teaching';
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
    const prompt = buildAssessmentPrompt({
      topic: 'Rock mechanics',
      stepTitle: 'Stress',
      stepSummary: 's',
      objectives: [],
      chunks: [],
    });
    expect(prompt).toContain(CHECK_STYLE);
    expect(prompt).toContain('Return ONLY valid JSON');
  });
  it('adds no new JSON fields, so the API stays the same', () => {
    for (const text of [TEACHING_STYLE, PLAN_STYLE, CHECK_STYLE])
      expect(text).not.toMatch(/"[a-zA-Z]+":/);
  });
});
