import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  AIResponse,
  ClassificationInput,
  ClassificationResult,
  RetrievedContext,
} from '../interfaces/ai-provider.interface';

/**
 * Optional future vision provider (per roadmap/spec Section 5).
 * Stubbed now so the provider slot exists and config wiring works;
 * fill in @google/generative-ai calls when this is actually needed.
 */
@Injectable()
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly config: ConfigService) {}

  async classify(_input: ClassificationInput): Promise<ClassificationResult> {
    throw new Error('GeminiProvider.classify not yet implemented');
  }

  async generate(_prompt: string, _context?: RetrievedContext): Promise<AIResponse> {
    throw new Error('GeminiProvider.generate not yet implemented');
  }

  async understandImage(_image: Buffer, _question?: string, _mimeType?: string): Promise<AIResponse> {
  throw new Error('GeminiProvider.understandImage not yet implemented');
}
}