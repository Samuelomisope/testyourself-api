import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import {
  AIProvider,
  AIResponse,
  ClassificationInput,
  ClassificationResult,
  RetrievedContext,
} from '../interfaces/ai-provider.interface';

/**
 * Kept for the existing cheaper/faster text+image tasks (per spec Section 5).
 * Not the default for classification or RAG-grounded answers.
 */
@Injectable()
export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  private readonly logger = new Logger(GroqProvider.name);
  private readonly client: Groq;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Groq({ apiKey: this.config.get<string>('GROQ_API_KEY') });
    this.model = this.config.get<string>('GROQ_MODEL', 'openai/gpt-oss-120b');
  }

async classify(input: ClassificationInput): Promise<ClassificationResult> {
  const completion = await this.client.chat.completions.create({
    model: this.model,
    messages: [
      {
        role: 'system',
        content:
          'Return ONLY valid JSON with fields university/school/department/programme/level/semester/course/materialType (each {value, confidence 0-100}), overallConfidence, reason. Use null value + 0 confidence when unsure, never guess.',
      },
      { role: 'user', content: `Text: ${input.extractedText.slice(0, 6000)}\nFile: ${input.fileName ?? ''}` },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 300,
    reasoning_effort: 'low', // GPT-OSS models require low/medium/high — 'none' was Qwen-specific
  } as any);

  const raw = completion.choices[0]?.message?.content ?? '{}';
  try {
    return JSON.parse(raw) as ClassificationResult;
  } catch {
    this.logger.warn('Groq classification returned malformed JSON');
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
      reason: 'Provider returned malformed JSON',
    };
  }
}
async generate(prompt: string, context?: RetrievedContext): Promise<AIResponse> {
  const contextText = context?.chunks?.length
    ? `Context:\n${context.chunks.map((c) => c.chunkText).join('\n\n')}\n\nQuestion: ${prompt}`
    : prompt;

  const completion = await this.client.chat.completions.create({
    model: this.model,
    messages: [{ role: 'user', content: contextText }],
    max_completion_tokens: 2000,
    reasoning_effort: 'low',
  } as any);

  const choice = completion.choices[0];
  const text = choice?.message?.content ?? '';

  return {
    text,
    sources: context?.chunks?.map((c) => ({ materialId: c.materialId, materialTitle: c.materialTitle })),
    isUncertain: text.length === 0,
    truncated: choice?.finish_reason === 'length',
    providerUsed: this.name,
    modelUsed: this.model,
  };
}

async understandImage(image: Buffer, question?: string, mimeType?: string): Promise<AIResponse> {
  const resolvedMimeType = mimeType?.startsWith('image/') ? mimeType : 'image/jpeg';

  const completion = await this.client.chat.completions.create({
    model: this.config.get<string>('GROQ_VISION_MODEL', 'qwen/qwen3.6-27b'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: question ?? 'Explain what is shown in this image.' },
          {
            type: 'image_url',
            image_url: { url: `data:${resolvedMimeType};base64,${image.toString('base64')}` },
          },
        ] as any,
      },
    ],
    max_completion_tokens: 450,
    reasoning_effort: 'low', // GPT-OSS models require low/medium/high — 'none' was Qwen-specific
  } as any);

  const text = completion.choices[0]?.message?.content ?? '';
  return { text, isUncertain: text.length === 0, providerUsed: this.name, modelUsed: 'groq-vision' };
}
}