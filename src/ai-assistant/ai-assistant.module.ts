import { Module } from '@nestjs/common';
import { ProviderModule } from '../provider/provider.module';
import { UploadModule } from '../upload/upload.module';
import { AIAssistantController } from './ai-assistant.controller';
import { AIAssistantService } from './ai-assistant.service';
import { ContentTypeClassifierService } from './services/content-type-classifier.service';

@Module({
  imports: [ProviderModule, UploadModule], // brings in AIService, OCRService, and the existing UploadService
  controllers: [AIAssistantController],
  providers: [AIAssistantService, ContentTypeClassifierService],
})
export class AIAssistantModule {}