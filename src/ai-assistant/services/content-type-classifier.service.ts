import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../../provider/services/ai.service';
import { AskUniLibContentType } from '../enums/content-type.enum';

export interface ContentTypeDetection {
  contentType: AskUniLibContentType;
  confidence: number; // 0-100
  providerUsed: string;
  modelUsed: string;
}

const CLASSIFY_PROMPT = `Look at this image and classify it into EXACTLY ONE of these categories:
- LECTURE_TEXT: normal lecture notes or slides explaining a concept
- EXAM_QUESTION: a single examination/test/assignment question
- MATH_QUESTION: a mathematical problem requiring calculation/derivation
- DIAGRAM: a diagram, chart, figure, or labeled illustration
- MULTIPLE_QUESTIONS: more than one distinct question visible
- MESSY_NOTES: handwritten or disorganized notes needing cleanup
- TEXTBOOK_PAGE: a textbook or reference page with dense reading content

Respond with ONLY this JSON, no prose, no markdown fences:
{"contentType": "ONE_OF_THE_CATEGORIES_ABOVE", "confidence": number_0_to_100}

If genuinely unsure between categories, pick the closer one and lower the confidence — do not invent a new category.`;

/**
 * Separate, deliberately cheap classification pass that runs BEFORE the
 * real answer-generation call. Keeps the expensive "understand and answer"
 * prompt focused on one job, and lets us route to a type-specific prompt
 * template (per roadmap's 7 content-type handlers).
 */
@Injectable()
export class ContentTypeClassifierService {
  private readonly logger = new Logger(ContentTypeClassifierService.name);

  constructor(private readonly aiService: AIService) {}

  async detect(image: Buffer): Promise<ContentTypeDetection> {
    const response = await this.aiService.understandImage(image, CLASSIFY_PROMPT);

    const parsed = this.tryParse(response.text);
    if (!parsed) {
      this.logger.warn(`Content-type classification returned unparseable output: ${response.text.slice(0, 200)}`);
      return {
        contentType: AskUniLibContentType.UNKNOWN,
        confidence: 0,
        providerUsed: response.providerUsed,
        modelUsed: response.modelUsed,
      };
    }

    return { ...parsed, providerUsed: response.providerUsed, modelUsed: response.modelUsed };
  }

  private tryParse(raw: string): { contentType: AskUniLibContentType; confidence: number } | null {
    try {
      // Some models (e.g. Qwen in thinking mode) prepend a <think>...</think>
      // reasoning block before the actual answer — strip it before parsing.
      const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const withoutFences = withoutThinking.replace(/```json|```/g, '').trim();

      // Fall back to extracting the first {...} block in case there's still
      // stray prose around the JSON.
      const jsonMatch = withoutFences.match(/\{[\s\S]*\}/);
      const candidate = jsonMatch ? jsonMatch[0] : withoutFences;

      const obj = JSON.parse(candidate);
      if (!Object.values(AskUniLibContentType).includes(obj.contentType)) return null;
      return { contentType: obj.contentType, confidence: Number(obj.confidence) || 0 };
    } catch {
      return null;
    }
  }
}