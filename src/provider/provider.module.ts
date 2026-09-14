import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeProvider } from './providers/claude.provider';
import { GroqProvider } from './providers/groq.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { GoogleVisionOCRProvider } from './providers/google-vision-ocr.provider';
import { TesseractOCRProvider } from './providers/tesseract-ocr.provider';
import { AIService } from './services/ai.service';
import { OCRService } from './services/ocr.service';
import { ImagePreprocessingService } from './services/image-preprocessing.service';

/**
 * Shared module hosting the AIService/OCRService abstraction and every
 * concrete provider behind it (Section 3 — ProviderModule, "not duplicated").
 *
 * Import this into ClassificationModule, AIAssistantModule, SearchModule,
 * TopicIntelligenceModule, etc. — they should only ever depend on AIService
 * / OCRService, never on a concrete provider class directly.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    ClaudeProvider,
    GroqProvider,
    GeminiProvider,
    GoogleVisionOCRProvider,
    TesseractOCRProvider,
    ImagePreprocessingService,
    AIService,
    OCRService,
  ],
  exports: [AIService, OCRService],
})
export class ProviderModule {}