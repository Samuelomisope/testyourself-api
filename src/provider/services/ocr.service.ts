import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OCRProvider, OCRResult } from '../interfaces/ocr-provider.interface';
import { GoogleVisionOCRProvider } from '../providers/google-vision-ocr.provider';
import { TesseractOCRProvider } from '../providers/tesseract-ocr.provider';
import { ImagePreprocessingService } from './image-preprocessing.service';

// Per-provider timeouts: Vision's failure/success comes back fast (a normal
// API round-trip), but Tesseract's FIRST run on a fresh install downloads
// language data before it can even start recognizing text, so it needs a
// much larger allowance or it looks "broken" when it's just slow once.
const TIMEOUT_MS_BY_PROVIDER: Record<string, number> = {
  'google-vision': 20_000,
  tesseract: 90_000,
};
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Single entry point for OCR. Runs the image through preprocessing first
 * (rotation/deskew/contrast/resolution/noise reduction), then tries Google
 * Vision, falling back to self-hosted Tesseract on failure (Section 5).
 */
@Injectable()
export class OCRService {
  private readonly logger = new Logger(OCRService.name);
  private readonly chain: OCRProvider[];

  constructor(
    private readonly config: ConfigService,
    private readonly googleVision: GoogleVisionOCRProvider,
    private readonly tesseract: TesseractOCRProvider,
    private readonly preprocessing: ImagePreprocessingService,
  ) {
    const configured = this.config.get<string>('OCR_PROVIDER_CHAIN');
    const order = configured ? configured.split(',').map((s) => s.trim()) : ['google-vision', 'tesseract'];
    const byName: Record<string, OCRProvider> = {
      'google-vision': this.googleVision,
      tesseract: this.tesseract,
    };
    this.chain = order.map((name) => byName[name]).filter(Boolean);
  }

  async extractText(image: Buffer): Promise<OCRResult> {
    const preprocessed = await this.preprocessing.preprocess(image);
    if (preprocessed.appliedSkewCorrectionDegrees !== 0 || preprocessed.wasUpscaled) {
      this.logger.log(
        `Preprocessed image: skew correction ${preprocessed.appliedSkewCorrectionDegrees.toFixed(1)}°, upscaled: ${preprocessed.wasUpscaled}`,
      );
    }

    for (const provider of this.chain) {
      const timeoutMs = TIMEOUT_MS_BY_PROVIDER[provider.name] ?? DEFAULT_TIMEOUT_MS;
      try {
        const result = await this.withTimeout(provider.extractText(preprocessed.buffer), timeoutMs);
        if (result.text?.trim()) return result;
        this.logger.warn(`${provider.name} returned empty text, trying next provider`);
      } catch (err) {
        this.logger.warn(`${provider.name} OCR failed: ${(err as Error).message}`);
      }
    }

    this.logger.error('All OCR providers failed or returned empty text');
    return { text: '', confidence: 0, providerUsed: 'none' };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('OCR call timed out')), ms)),
    ]);
  }
}