import { Injectable, Logger } from '@nestjs/common';
import { createWorker } from 'tesseract.js';
import { OCRProvider, OCRResult } from '../interfaces/ocr-provider.interface';

/**
 * Self-hosted fallback OCR provider, used when Google Vision is unavailable
 * or over quota (per spec Section 5 resilience strategy).
 */
@Injectable()
export class TesseractOCRProvider implements OCRProvider {
  readonly name = 'tesseract';
  private readonly logger = new Logger(TesseractOCRProvider.name);

  async extractText(image: Buffer): Promise<OCRResult> {
    const worker = await createWorker('eng');
    try {
      const {
        data: { text, confidence },
      } = await worker.recognize(image);

      if (!text) {
        this.logger.warn('Tesseract returned no text for this image');
      }

      return {
        text,
        confidence: Math.round(confidence),
        providerUsed: this.name,
      };
    } finally {
      await worker.terminate();
    }
  }
}