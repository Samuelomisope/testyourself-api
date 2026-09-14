import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { OCRProvider, OCRResult } from '../interfaces/ocr-provider.interface';

/**
 * Primary OCR provider (per spec Section 5).
 */
@Injectable()
export class GoogleVisionOCRProvider implements OCRProvider {
  readonly name = 'google-vision';
  private readonly logger = new Logger(GoogleVisionOCRProvider.name);
  private readonly client: ImageAnnotatorClient;

  constructor(private readonly config: ConfigService) {
    // Expects GOOGLE_APPLICATION_CREDENTIALS env var (path to service account JSON)
    // or GOOGLE_VISION_CREDENTIALS_JSON (inline JSON) — never committed to the repo.
    const inlineCreds = this.config.get<string>('GOOGLE_VISION_CREDENTIALS_JSON');
    this.client = new ImageAnnotatorClient(
      inlineCreds ? { credentials: JSON.parse(inlineCreds) } : undefined,
    );
  }

  async extractText(image: Buffer): Promise<OCRResult> {
    const [result] = await this.client.documentTextDetection({ image: { content: image } });
    const fullText = result.fullTextAnnotation?.text ?? '';

    const blocks =
      result.fullTextAnnotation?.pages?.[0]?.blocks?.map((b) => ({
        text: (b.paragraphs ?? [])
          .map((p) => (p.words ?? []).map((w) => (w.symbols ?? []).map((s) => s.text).join('')).join(' '))
          .join('\n'),
        boundingBox: b.boundingBox?.vertices?.flatMap((v) => [v.x ?? 0, v.y ?? 0]),
      })) ?? [];

    // Vision doesn't give a single confidence score for document text detection;
    // approximate from per-symbol confidences when available.
    const confidences: number[] = [];
    result.fullTextAnnotation?.pages?.forEach((p) =>
      p.blocks?.forEach((b) =>
        b.paragraphs?.forEach((par) =>
          par.words?.forEach((w) => w.symbols?.forEach((s) => {
            if (typeof s.confidence === 'number') confidences.push(s.confidence);
          })),
        ),
      ),
    );
    const avgConfidence = confidences.length
      ? (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100
      : 0;

    if (!fullText) {
      this.logger.warn('Google Vision returned no text for this image');
    }

    return {
      text: fullText,
      confidence: Math.round(avgConfidence),
      layout: { blocks },
      providerUsed: this.name,
    };
  }
}