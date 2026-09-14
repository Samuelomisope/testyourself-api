import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  AIResponse,
  ClassificationInput,
  ClassificationResult,
  RetrievedContext,
} from '../interfaces/ai-provider.interface';
import { ClaudeProvider } from '../providers/claude.provider';
import { GroqProvider } from '../providers/groq.provider';
import { GeminiProvider } from '../providers/gemini.provider';

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES_PER_PROVIDER = 1;

/**
 * Single entry point the rest of the app calls instead of talking to any
 * concrete AIProvider directly. Owns provider selection (via config),
 * timeout, retry, and fallback-to-next-provider (Section 5).
 *
 * Every call records which provider/model actually served the request so
 * it can be stored for lineage (EvaluationRun / PredictionRecord / etc.)
 */
@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly classificationChain: AIProvider[];
  private readonly generationChain: AIProvider[];
  private readonly visionChain: AIProvider[];

  constructor(
    private readonly config: ConfigService,
    private readonly claude: ClaudeProvider,
    private readonly groq: GroqProvider,
    private readonly gemini: GeminiProvider,
  ) {
    // Order = priority. Config-driven so this can change without a deploy
    // once an admin-configurable table exists (see spec Section 5).
    this.classificationChain = this.resolveChain('AI_CLASSIFICATION_PROVIDER_CHAIN', ['claude', 'groq']);
    this.generationChain = this.resolveChain('AI_GENERATION_PROVIDER_CHAIN', ['claude', 'groq']);
    this.visionChain = this.resolveChain('AI_VISION_PROVIDER_CHAIN', ['claude', 'groq']);
  }

  async classify(input: ClassificationInput): Promise<ClassificationResult & { providerUsed: string }> {
    return this.runChain(this.classificationChain, (p) => p.classify(input), 'classification') as Promise<
      ClassificationResult & { providerUsed: string }
    >;
  }

  async generate(prompt: string, context?: RetrievedContext): Promise<AIResponse> {
    const result = await this.runChain(this.generationChain, (p) => p.generate(prompt, context), 'generation');
    if (!result) {
      return this.uncertainResponse('all configured providers failed');
    }
    return result as AIResponse;
  }

async understandImage(image: Buffer, question?: string, mimeType?: string): Promise<AIResponse> {
  const result = await this.runChain(
    this.visionChain,
    (p) => p.understandImage(image, question, mimeType),
    'image understanding',
  );
  if (!result) {
    return this.uncertainResponse('all configured providers failed');
  }
  return result as AIResponse;
}

  /**
   * Tries each provider in order. Within a provider, retries once on
   * transient failure before moving to the next provider in the chain.
   * Returns null (never throws) if every provider in the chain fails —
   * callers are responsible for turning that into an "I'm not sure" response
   * rather than fabricating an answer.
   */
  private async runChain<T>(
    chain: AIProvider[],
    call: (provider: AIProvider) => Promise<T>,
    taskLabel: string,
  ): Promise<(T & { providerUsed?: string }) | null> {
    for (const provider of chain) {
      for (let attempt = 0; attempt <= MAX_RETRIES_PER_PROVIDER; attempt++) {
        try {
          const result = await this.withTimeout(call(provider), DEFAULT_TIMEOUT_MS);
          return result as T & { providerUsed?: string };
        } catch (err) {
          this.logger.warn(
            `${provider.name} failed ${taskLabel} (attempt ${attempt + 1}/${MAX_RETRIES_PER_PROVIDER + 1}): ${
              (err as Error).message
            }`,
          );
        }
      }
    }
    this.logger.error(`All providers exhausted for ${taskLabel}`);
    return null;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('provider call timed out')), ms)),
    ]);
  }

  private resolveChain(configKey: string, fallbackOrder: string[]): AIProvider[] {
    const configured = this.config.get<string>(configKey);
    const order = configured ? configured.split(',').map((s) => s.trim()) : fallbackOrder;
    const byName: Record<string, AIProvider> = { claude: this.claude, groq: this.groq, gemini: this.gemini };
    return order.map((name) => byName[name]).filter(Boolean);
  }

  private uncertainResponse(reason: string): AIResponse {
    return {
      text: "I'm not confident enough in an answer right now — please try again shortly, or rephrase your question.",
      isUncertain: true,
      providerUsed: 'none',
      modelUsed: 'none',
    };
  }
}