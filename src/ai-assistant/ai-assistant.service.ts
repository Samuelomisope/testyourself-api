import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../provider/services/ai.service';
import { OCRService } from '../provider/services/ocr.service';
import { UploadService } from '../upload/upload.service';
import { ContentTypeClassifierService } from './services/content-type-classifier.service';
import { buildPromptForContentType } from './prompts/content-type-prompts';
import { AskUniLibContentType, AskUniLibQueryStatus } from './enums/content-type.enum';
import { AskUniLibResponseDto } from './dto/ask-unilib-response.dto';

@Injectable()
export class AIAssistantService {
  private readonly logger = new Logger(AIAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
    private readonly ocrService: OCRService,
    private readonly contentTypeClassifier: ContentTypeClassifierService,
    private readonly uploadService: UploadService,
  ) {}

  async askUniLib(
    studentId: string,
    file: Express.Multer.File,
    question?: string,
  ): Promise<AskUniLibResponseDto> {
    // 1. Persist the image first so nothing is lost even if a later step fails.
    // Reuses the existing UploadService — stores an unsigned stable reference,
    // signed fresh on read via getSignedUrlForStoredRef (matches existing pattern).
    const storedUrl = await this.uploadService.uploadFile(file, 'ask-unilib');
    const imageKey = this.uploadService.extractKey(storedUrl);

    const record = await this.prisma.askUniLibQuery.create({
      data: {
        studentId,
        imageKey,
        imageUrl: storedUrl,
        question: question ?? null,
        status: AskUniLibQueryStatus.PROCESSING,
      },
    });

    try {
      const image = file.buffer;

      // 2. OCR — used for grounding the prompt, not for the classification call itself.
      const ocrResult = await this.ocrService.extractText(image);

      // 3. Lightweight classification step BEFORE the real answer generation.
      const detection = await this.contentTypeClassifier.detect(image);

      // 4. Route to the type-specific prompt and get the real answer.
      const prompt = buildPromptForContentType(detection.contentType, ocrResult.text, question);
           const aiResponse = await this.aiService.understandImage(image, prompt, file.mimetype);

      const updated = await this.prisma.askUniLibQuery.update({
        where: { id: record.id },
        data: {
          status: AskUniLibQueryStatus.COMPLETED,
          extractedText: ocrResult.text,
          contentType: detection.contentType,
          contentTypeConfidence: detection.confidence,
          answer: aiResponse.text,
          isUncertain: aiResponse.isUncertain,
          providerUsed: aiResponse.providerUsed,
          modelUsed: aiResponse.modelUsed,
        },
      });

      // Bucket is private (per existing UploadService pattern) — sign a fresh,
      // short-lived URL for the response rather than returning the raw stored ref.
      const signedImageUrl = await this.uploadService.getSignedUrlForStoredRef(updated.imageUrl);

      return this.toResponseDto(updated, signedImageUrl);
    } catch (err) {
      this.logger.error(`Ask UniLib pipeline failed for query ${record.id}: ${(err as Error).message}`);

      await this.prisma.askUniLibQuery.update({
        where: { id: record.id },
        data: { status: AskUniLibQueryStatus.FAILED },
      });

      // Re-throw as a clean, honest message — never fabricate an answer on failure.
      throw new Error(
        "Something went wrong processing your image. Your image was saved — please try asking again in a moment.",
      );
    }
  }

  private toResponseDto(record: any, signedImageUrl: string): AskUniLibResponseDto {
    return {
      queryId: record.id,
      contentType: record.contentType as AskUniLibContentType,
      contentTypeConfidence: record.contentTypeConfidence,
      answer: record.answer,
      isUncertain: record.isUncertain,
      extractedText: record.extractedText,
      imageUrl: signedImageUrl,
      providerUsed: record.providerUsed,
      modelUsed: record.modelUsed,
      createdAt: record.createdAt,
    };
  }
}