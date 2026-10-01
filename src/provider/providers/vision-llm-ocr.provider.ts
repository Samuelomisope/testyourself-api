import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { OCRProvider, OCRResult } from '../interfaces/ocr-provider.interface';
import { AIService } from '../services/ai.service';

const OCR_PROMPT = `Transcribe all text in this image exactly as written.
- Keep the original order, line breaks, and question/option numbering.
- Write math in plain text or LaTeX. Do not solve anything.
- Do not summarize, explain, correct spelling, or add commentary.
- If there is no readable text, reply with exactly: [UNREADABLE]`;

@Injectable()
export class VisionLlmOCRProvider implements OCRProvider {
  readonly name = 'vision-llm';
  private readonly logger = new Logger(VisionLlmOCRProvider.name);

  constructor(private readonly ai: AIService) {}

  async extractText(image: Buffer): Promise<OCRResult> {
    // Normalize to PNG and cap size so the mime type is known and the request stays small
    const png = await sharp(image)
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    const res = await this.ai.understandImage(png, OCR_PROMPT, 'image/png');
    const text = res.text?.trim() ?? '';

    if (!text || text.includes('[UNREADABLE]')) {
      this.logger.warn('Vision LLM found no readable text');
      return { text: '', confidence: 0, providerUsed: this.name };
    }
    return { text, confidence: 0.9, providerUsed: this.name };
  }
}