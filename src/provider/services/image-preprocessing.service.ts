import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

const SKEW_TEST_THUMBNAIL_WIDTH = 300; // small = fast angle search, doesn't need full resolution
const SKEW_ANGLE_RANGE_DEGREES = 10; // search -10..+10 degrees
const SKEW_ANGLE_STEP_DEGREES = 0.5;
const MIN_USABLE_WIDTH_PX = 1500; // upscale below this so OCR has enough detail to work with
const INK_THRESHOLD = 128; // grayscale value below which a pixel counts as "ink" for skew detection

export interface PreprocessResult {
  buffer: Buffer;
  appliedSkewCorrectionDegrees: number;
  wasUpscaled: boolean;
}

/**
 * Runs a photo through a cleanup pass BEFORE it reaches the OCR provider.
 * Slots into OCRService.extractText() (per the AIAssistantModule README's
 * "intentionally deferred" note). Covers the roadmap's 5 preprocessing items:
 * rotation correction, deskewing, contrast enhancement, resolution
 * improvement, and noise reduction.
 */
@Injectable()
export class ImagePreprocessingService {
  private readonly logger = new Logger(ImagePreprocessingService.name);

  async preprocess(image: Buffer): Promise<PreprocessResult> {
    try {
      // 1. ROTATION CORRECTION — apply EXIF orientation (phone photos taken
      // sideways/upside-down carry this metadata; without .rotate() with no
      // args, sharp ignores it and OCR sees the image "as stored", not as
      // the phone actually displayed it).
      const oriented = sharp(image).rotate();

      // 2. DESKEWING — phone photos are rarely perfectly square-on to the
      // page. Estimate the skew angle on a cheap thumbnail, then apply the
      // correction to the full-resolution image.
      const skewAngle = await this.estimateSkewAngle(image);
      const deskewed =
        Math.abs(skewAngle) > 0.1
          ? oriented.rotate(-skewAngle, { background: '#ffffff' })
          : oriented;

      // 3. CONTRAST ENHANCEMENT — grayscale + normalize spreads pixel
      // values across the full range, which helps OCR separate faint
      // pencil/low-contrast text from the page background.
      const contrastEnhanced = deskewed.grayscale().normalize();

      // 4. NOISE REDUCTION — a light median filter removes speckle/JPEG
      // artifacts without blurring text edges the way a gaussian blur would.
      const denoised = contrastEnhanced.median(3);

      // 5. RESOLUTION IMPROVEMENT — upscale if the image is small enough
      // that OCR would be working with too little detail per character.
      const metadata = await sharp(image).metadata();
      const currentWidth = metadata.width ?? 0;
      const wasUpscaled = currentWidth > 0 && currentWidth < MIN_USABLE_WIDTH_PX;
      const resized = wasUpscaled
        ? denoised.resize({ width: MIN_USABLE_WIDTH_PX, kernel: 'lanczos3' })
        : denoised;

      const buffer = await resized.jpeg({ quality: 92 }).toBuffer();

      return { buffer, appliedSkewCorrectionDegrees: skewAngle, wasUpscaled };
    } catch (err) {
      // Preprocessing is a best-effort quality improvement, never a hard
      // requirement — if anything here fails, fall back to the original
      // image rather than blocking the whole Ask UniLib pipeline.
      this.logger.warn(`Image preprocessing failed, using original image: ${(err as Error).message}`);
      return { buffer: image, appliedSkewCorrectionDegrees: 0, wasUpscaled: false };
    }
  }

  /**
   * Classic projection-profile skew detection: render a small thumbnail at
   * a range of candidate angles, and for each one measure how sharply the
   * amount of "ink" varies row-to-row. Text lines produce alternating
   * dense/sparse rows when the page is level; the angle that maximizes
   * that variance is taken as the (negative of the) skew correction needed.
   */
  private async estimateSkewAngle(image: Buffer): Promise<number> {
    const thumbnail = await sharp(image)
      .rotate()
      .resize({ width: SKEW_TEST_THUMBNAIL_WIDTH })
      .grayscale()
      .toBuffer();

    let bestAngle = 0;
    let bestVariance = -Infinity;

    for (
      let angle = -SKEW_ANGLE_RANGE_DEGREES;
      angle <= SKEW_ANGLE_RANGE_DEGREES;
      angle += SKEW_ANGLE_STEP_DEGREES
    ) {
      try {
        const { data, info } = await sharp(thumbnail)
          .rotate(angle, { background: '#ffffff' })
          .raw()
          .toBuffer({ resolveWithObject: true });

        const variance = this.rowInkVariance(data, info.width, info.height);
        if (variance > bestVariance) {
          bestVariance = variance;
          bestAngle = angle;
        }
      } catch {
        // Skip angles that fail to render; not worth failing the whole
        // detection over one candidate.
        continue;
      }
    }

    return bestAngle;
  }

  private rowInkVariance(pixels: Buffer, width: number, height: number): number {
    const rowInkCounts: number[] = new Array(height).fill(0);

    for (let y = 0; y < height; y++) {
      let count = 0;
      const rowStart = y * width;
      for (let x = 0; x < width; x++) {
        if (pixels[rowStart + x] < INK_THRESHOLD) count++;
      }
      rowInkCounts[y] = count;
    }

    const mean = rowInkCounts.reduce((sum, c) => sum + c, 0) / height;
    const variance = rowInkCounts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / height;
    return variance;
  }
}