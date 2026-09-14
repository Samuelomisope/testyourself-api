import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  AIProvider,
  AIResponse,
  ClassificationInput,
  ClassificationResult,
  RetrievedContext,
} from '../interfaces/ai-provider.interface';

/**
 * Default provider for classification and RAG-grounded answers.
 * Chosen for strongest structured-JSON + multi-field reasoning fit (per spec Section 5).
 */
@Injectable()
export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  private readonly logger = new Logger(ClaudeProvider.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
    this.model = this.config.get<string>('CLAUDE_MODEL', 'claude-sonnet-4-6');
  }

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const systemPrompt = `You are a strict academic material classifier for UniLib.
Return ONLY valid JSON matching this exact shape, no prose, no markdown fences:
{
  "university": {"value": string|null, "confidence": number},
  "school": {"value": string|null, "confidence": number},
  "department": {"value": string|null, "confidence": number},
  "programme": {"value": string|null, "confidence": number},
  "level": {"value": string|null, "confidence": number},
  "semester": {"value": string|null, "confidence": number},
  "course": {"value": string|null, "confidence": number},
  "materialType": {"value": string|null, "confidence": number},
  "overallConfidence": number,
  "reason": string
}
Rules:
- confidence is 0-100.
- If a field cannot be determined, set value to null and confidence to 0. NEVER guess.
- Only choose from the provided candidateOptions when given; otherwise infer conservatively.
- overallConfidence should reflect the weakest link, not an average that hides uncertainty.`;

    const userPrompt = `Extracted text:\n"""${input.extractedText.slice(0, 8000)}"""\n\nFile name: ${
      input.fileName ?? 'unknown'
    }\n\nCandidate options: ${JSON.stringify(input.candidateOptions ?? {})}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).text)
      .join('');

    try {
      const parsed = JSON.parse(this.stripFences(raw));
      return parsed as ClassificationResult;
    } catch (err) {
      this.logger.warn(`Claude classification returned non-JSON, treating as unclassifiable: ${raw.slice(0, 200)}`);
      return this.unclassifiableResult('Provider returned malformed JSON');
    }
  }

async generate(prompt: string, context?: RetrievedContext): Promise<AIResponse> {
  const contextBlock = context?.chunks?.length
    ? `Use ONLY the following UniLib material excerpts to answer. If the excerpts do not contain the answer, say so plainly instead of guessing.\n\n${context.chunks
        .map((c, i) => `[${i + 1}] (${c.materialTitle}) ${c.chunkText}`)
        .join('\n\n')}`
    : undefined;

  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: 1500,
    system: contextBlock,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as any).text)
    .join('');

  const isUncertain = /i (don't|do not) (know|have enough)|insufficient (context|information)/i.test(text);

  return {
    text,
    sources: context?.chunks?.map((c) => ({ materialId: c.materialId, materialTitle: c.materialTitle })),
    isUncertain,
    truncated: response.stop_reason === 'max_tokens',
    providerUsed: this.name,
    modelUsed: this.model,
  };
}

  async understandImage(image: Buffer, question?: string, mimeType?: string): Promise<AIResponse> {
  const resolvedMediaType = (mimeType && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType))
    ? mimeType
    : 'image/jpeg';

  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: resolvedMediaType as any, data: image.toString('base64') },
          },
          {
            type: 'text',
            text: question ?? 'Explain what is shown in this image in an academic context.',
          },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as any).text)
    .join('');

  return { text, isUncertain: false, providerUsed: this.name, modelUsed: this.model };
}

  private stripFences(raw: string): string {
    return raw.replace(/```json|```/g, '').trim();
  }

  private unclassifiableResult(reason: string): ClassificationResult {
    const empty = { value: null, confidence: 0 };
    return {
      university: empty,
      school: empty,
      department: empty,
      programme: empty,
      level: empty,
      semester: empty,
      course: empty,
      materialType: empty,
      overallConfidence: 0,
      reason,
    };
  }
}