import { Injectable, Logger } from '@nestjs/common';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from 'canvas';
import * as mammoth from 'mammoth';
import { OCRService } from '../../provider/services/ocr.service';

export type TextExtractionMethod = 'PDF_TEXT_LAYER' | 'DOCX' | 'OCR' | 'UNSUPPORTED';

export interface TextExtractionResult {
  text: string;
  method: TextExtractionMethod;
  charCount: number;
  likelyScanned: boolean;
}

const SCANNED_PDF_CHAR_THRESHOLD = 20;
const TEXT_PAGE_LIMIT = 20;
const OCR_PAGE_LIMIT = 10; // matches AiService.ocrScannedPdf — OCR is slow per-page

@Injectable()
export class TextExtractionService {
  private readonly logger = new Logger(TextExtractionService.name);

  constructor(private readonly ocrService: OCRService) {}

  async extractText(buffer: Buffer, mimeType: string): Promise<TextExtractionResult> {
    try {
      switch (mimeType) {
        case 'application/pdf':
          return await this.extractFromPdf(buffer);
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          return await this.extractFromDocx(buffer);
        case 'image/jpeg':
        case 'image/png':
        case 'image/webp':
          return await this.extractFromImage(buffer);
        default:
          return { text: '', method: 'UNSUPPORTED', charCount: 0, likelyScanned: false };
      }
    } catch (err) {
      this.logger.warn(`Text extraction failed for ${mimeType}: ${err.message}`);
      return { text: '', method: 'UNSUPPORTED', charCount: 0, likelyScanned: false };
    }
  }

  // Mirrors AiService.extractPdfText/ocrScannedPdf exactly, rather than pulling
  // in pdf-parse@2 — that package bundles its own internal pdfjs-dist, which
  // collided with this project's existing direct pdfjs-dist dependency and
  // broke the already-working quiz/study-plan PDF flows (API/Worker version
  // mismatch). Reusing the proven approach avoids that entirely and gets
  // scanned-PDF OCR for free.
  private async extractFromPdf(buffer: Buffer): Promise<TextExtractionResult> {
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array, useSystemFonts: true });
    const pdf = await loadingTask.promise;

    const pagesToRead = Math.min(pdf.numPages, TEXT_PAGE_LIMIT);
    const textParts: string[] = [];

    for (let i = 1; i <= pagesToRead; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(' ').trim();
      if (pageText) textParts.push(pageText);
    }

    const text = this.sanitize(textParts.join('\n\n'));

    if (text.length >= SCANNED_PDF_CHAR_THRESHOLD) {
      return { text, method: 'PDF_TEXT_LAYER', charCount: text.length, likelyScanned: false };
    }

    // No usable text layer — render pages as images and OCR them.
    const ocrText = await this.ocrPdfPages(pdf);
    return {
      text: ocrText,
      method: ocrText ? 'OCR' : 'PDF_TEXT_LAYER',
      charCount: ocrText.length,
      likelyScanned: ocrText.length < SCANNED_PDF_CHAR_THRESHOLD,
    };
  }

  private async ocrPdfPages(pdf: any): Promise<string> {
    const pagesToRead = Math.min(pdf.numPages, OCR_PAGE_LIMIT);
    const textParts: string[] = [];

    for (let i = 1; i <= pagesToRead; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context as any, viewport, canvas: canvas as any }).promise;
      const imageBuffer = canvas.toBuffer('image/png');

      const ocrResult = await this.ocrService.extractText(imageBuffer);
      if (ocrResult.text?.trim()) textParts.push(ocrResult.text);
    }

    return this.sanitize(textParts.join('\n\n'));
  }

  private async extractFromImage(buffer: Buffer): Promise<TextExtractionResult> {
    const ocrResult = await this.ocrService.extractText(buffer);
    const text = this.sanitize(ocrResult.text ?? '');
    return { text, method: text ? 'OCR' : 'UNSUPPORTED', charCount: text.length, likelyScanned: false };
  }

  private async extractFromDocx(buffer: Buffer): Promise<TextExtractionResult> {
    const result = await mammoth.extractRawText({ buffer });
    const text = this.sanitize(result.value ?? '');
    return { text, method: 'DOCX', charCount: text.length, likelyScanned: false };
  }

  // Postgres text columns reject the null byte (0x00) outright.
  private sanitize(text: string): string {
    return text.replace(/\u0000/g, '').trim();
  }
}