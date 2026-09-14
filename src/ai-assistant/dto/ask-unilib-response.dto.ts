import { AskUniLibContentType } from '../enums/content-type.enum';

export class AskUniLibResponseDto {
  queryId: string;
  contentType: AskUniLibContentType;
  contentTypeConfidence: number;
  answer: string;
  isUncertain: boolean;
  extractedText: string;
  imageUrl: string;
  providerUsed: string;
  modelUsed: string;
  createdAt: Date;
}
