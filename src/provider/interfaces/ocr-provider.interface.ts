export interface OCRResult {
  text: string;
  confidence: number; // 0-100, provider-reported or estimated
  layout?: {
    headings?: string[];
    blocks?: Array<{ text: string; boundingBox?: number[] }>;
  };
  providerUsed: string;
}

/**
 * Every OCR provider (Google Vision, Tesseract, ...) implements this contract.
 */
export interface OCRProvider {
  readonly name: string;

  extractText(image: Buffer): Promise<OCRResult>;
}

export const OCR_PROVIDER = Symbol('OCR_PROVIDER');